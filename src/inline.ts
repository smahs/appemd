import type { SyntaxNode } from "@lezer/common";
import { attributesModule, h, init, propsModule, type VNode } from "snabbdom";
import { LezerMarksMap, LezerTagMap } from "./consts";
import type { BoundedNode, InlineNode, RenderState } from "./types.ts";
import { getChildren, getInstChildren, getNonInstChildren } from "./utils.ts";

// Initialize snabbdom with the modules we need
const patch = init([propsModule, attributesModule]);

// Cache for the previous VNode to enable efficient diffing
const elementVNodeCache = new WeakMap<HTMLElement, VNode>();

/*
 * Build the new virtual tree and patch with the DOM element
 */
export const renderInline = (
  state: RenderState,
  node: SyntaxNode,
  element: HTMLElement,
  skip = 0,
) => {
  const tree = buildInlineNodeTree(state, node);

  if (skip > 0) {
    tree.from += skip;
    const firstChild = tree.children[0]!;
    firstChild.from += skip;
    tree.children[0] = firstChild;
  }

  const childVNodes = tree.children?.map((iNode) => iNodeToVNode(state, iNode));

  const newVNode = h(element.tagName, {}, childVNodes);
  const prevVNode = elementVNodeCache.get(element);
  if (prevVNode) {
    patch(prevVNode, newVNode);
  } else {
    patch(element, newVNode);
  }

  elementVNodeCache.set(element, newVNode);
};

// Build inline segments from a SyntaxNode
function buildInlineNodeTree(
  state: RenderState,
  node: BoundedNode,
  children?: SyntaxNode[],
): InlineNode {
  if (!children) {
    if (isSyntaxNode(node)) children = getNonInstChildren(node);
    else throw new Error("Either full SyntaxNode or children array expected");
  }

  children.sort((a, b) => a.from - b.from);

  const root: InlineNode = inlineNode(node);
  if (children.length === 0) {
    root.children.push(textNode(node));
    return root;
  }

  let { from, to } = node;

  for (const child of children) {
    // Add any plain text from `from` to the start of this child
    if (from < child.from) root.children.push(textNodeFT(from, child.from));

    // Add the marked text
    const childNode: InlineNode = inlineNode(child);
    switch (child.type.name) {
      case "Link":
        buildLinkInlineNode(state, childNode);
        break;
      default: {
        const markType = LezerMarksMap[child.type.name];
        if (markType) {
          const grandChildren = getNonInstChildren(child);
          grandChildren.forEach((gc) => {
            childNode.children.push(buildInlineNodeTree(state, gc));
          });
        } else {
          childNode.children.push(textNode(child));
        }
      }
    }
    root.children.push(childNode);

    // Move the position
    from = child.to;
  }

  // If there's remaining text after the last child, add it as plain text
  if (from < to) {
    root.children?.push(textNodeFT(from, to));
  }

  return root;
}

const buildLinkInlineNode = (state: RenderState, iNode: InlineNode) => {
  const node = iNode.node;
  if (!node || !isSyntaxNode(node) || node.name !== "Link")
    throw new Error("SyntaxNode with name Link expected");

  const children = getChildren(node);
  const instructions = getInstChildren(node, children);

  const urlNode = children.find((n) => n.name === "URL");
  if (!urlNode || children.length < 3) {
    // Fallback to text if link is malformed
    iNode.children.push(textNode(node));
    return;
  }

  const href = sanitizeUrl(state.text.substring(urlNode.from, urlNode.to));
  iNode.attrs = { ...(iNode.attrs ?? {}), href };

  const titleNode = children.find((n) => n.name === "LinkTitle");
  if (titleNode) {
    const title = state.text.substring(titleNode.from, titleNode.to);
    iNode.attrs.title = title.replace(/"/g, "");
  }

  const urlIndex = children.indexOf(urlNode);

  if (urlIndex === 1) {
    // Case [URL]: render as plain text
    iNode.children.push(textNode(children[1]));
  } else {
    // Case [label](URL): render as formatted inline text
    const labelInst = [0, 1].map(
      (i) => children.find((n) => n === instructions[i])!,
    );
    const [fromIndex, toIndex] = labelInst.map((i) => children.indexOf(i));
    const contentChildren = children.slice(fromIndex + 1, toIndex);
    const from = labelInst[0].to;
    const to = labelInst[1].from;

    if (contentChildren.length === 0) iNode.children.push(textNodeFT(from, to));
    else {
      // Add children InlineNodes
      const synNode = { from, to };
      const subTree = buildInlineNodeTree(state, synNode, contentChildren);
      iNode.children.push(...subTree.children);
    }
  }
};

const iNodeToVNode = (state: RenderState, iNode: InlineNode): VNode | string => {
  let vNode: VNode | undefined;
  const node = iNode.node;
  const nodeName = node && isSyntaxNode(node) ? node.name : undefined;

  switch (nodeName) {
    case "StrongEmphasis":
    case "Emphasis":
    case "Strikethrough":
    case "Subscript":
    case "Superscript":
    case "InlineCode": {
      vNode = nestableMark(state, iNode);
      break;
    }
    case "HardBreak":
      return h(state.schema.marks.hard_break.tag, {});
    case "Escape":
      return state.text.substring(iNode.from + 1, iNode.to);
    case "Link":
      return linkVNode(state, iNode);
    case "HTMLTag": {
      // Safely handle HTML tags by treating them as text
      return h("span", {}, state.text.substring(iNode.from, iNode.to));
    }
    case "URL":
      // URLs are handled in the Link nodes
      return "";
    default: {
      return state.text.substring(iNode.from, iNode.to);
    }
  }

  return vNode;
};

const nestableMark = (state: RenderState, iNode: InlineNode): VNode => {
  const node = iNode.node;
  if (!node || !isSyntaxNode(node)) throw new Error("Full SyntaxNode expected");

  const markType = LezerTagMap[node.name];
  const spec = state.schema.marks[markType];

  let start = node.from;
  let end = node.to;

  // Shift the content positions to remove any mark delimiters
  const marks = getInstChildren(node);
  if (marks.length > 0) start = marks[0].to;
  if (marks.length > 1) end = marks[marks.length - 1].from;

  const content = state.text.substring(start, end);

  const vNode = h(
    spec.tag,
    { attrs: spec.attributes || {}, className: spec.class },
    content,
  );

  if (iNode.children && iNode.children.length > 0) {
    vNode.children = [];
    iNode.children.forEach((childSegment) => {
      const childNode = iNodeToVNode(state, childSegment);
      vNode.children?.push(childNode);
    });
  }

  return vNode;
};

const linkVNode = (state: RenderState, iNode: InlineNode): VNode => {
  const childVNodes = iNode.children?.map((iNode) => iNodeToVNode(state, iNode));
  const linkProps = {
    props: { className: state.schema.marks.link.class },
    attrs: {
      ...state.schema.marks.link.attributes,
      ...iNode.attrs,
    },
  };

  return h("a", linkProps, childVNodes);
};

// --- Type guards and utilities

const isSyntaxNode = (node: BoundedNode | SyntaxNode): node is SyntaxNode =>
  (node as SyntaxNode).parent != null;

const inlineNode = (node: BoundedNode): InlineNode => ({
  node,
  from: node.from,
  to: node.to,
  children: [],
});

const textNodeFT = (from: number, to: number) => ({
  from: from,
  to: to,
  children: [],
});

const textNode = (node: BoundedNode): InlineNode =>
  textNodeFT(node.from, node.to);

/**
 * Sanitize URLs to prevent XSS
 */
const sanitizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.href);
    const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];
    return allowedProtocols.includes(parsed.protocol) ? url : "#";
  } catch {
    return "#";
  }
};
