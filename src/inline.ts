import type { SyntaxNode } from "@lezer/common";
import { attributesModule, h, init, propsModule, type VNode } from "snabbdom";

import { LezerMarksMap } from "./nodemap.ts";
import type { BoundedNode, InlineNode, RenderContext } from "./types.ts";
import {
  getChildren,
  getInstChildren,
  getNodeSpec,
  getNonInstChildren,
} from "./utils.ts";

// Initialize snabbdom with the modules we need
const patch = init([propsModule, attributesModule]);

/*
 * Build the new virtual tree and patch with the DOM element
 */
export const renderInline = (
  context: RenderContext,
  node: SyntaxNode,
  element: HTMLElement,
) => {
  const tree = buildInlineTree(context, node);
  const segments = tree.children?.map((iNode) => iNodeToVNode(context, iNode));

  const newVNode = h(element.tagName, {}, segments);
  const prevVNode = context.state.getVNode(node);
  if (prevVNode) patch(prevVNode, newVNode);
  else patch(element, newVNode);

  context.state.setVNode(node, newVNode);
};

// Build inline segments from a SyntaxNode
function buildInlineTree(
  context: RenderContext,
  node: BoundedNode,
  children?: SyntaxNode[],
): InlineNode {
  if (!children) {
    if (isSyntaxNode(node)) children = getNonInstChildren(node);
    else throw new Error("Either SyntaxNode or children array is required");
  }

  children.sort((a, b) => a.from - b.from);

  const root: InlineNode = inlineNode(node);
  if (children.length === 0) {
    root.children.push(textNode(node));
    return skipMarks(root);
  }

  let { from, to } = node;

  for (const child of children) {
    // Add any plain text from `from` to the start of this child
    if (from < child.from) root.children.push(textNodeFT(from, child.from));

    // Add the marked text
    switch (child.type.name) {
      case "Link":
        root.children.push(buildLinkInlineTree(context, child));
        break;
      default: {
        const knownMarkType = LezerMarksMap[child.type.name];
        if (knownMarkType) {
          root.children.push(buildInlineTree(context, child));
        } else {
          root.children.push(textNode(child));
        }
      }
    }

    // Move the cursor to the end of child node
    from = child.to;
  }

  // If there's remaining text after the last child, add it as plain text
  if (from < to) {
    root.children?.push(textNodeFT(from, to));
  }

  return skipMarks(root);
}

const buildLinkInlineTree = (
  context: RenderContext,
  node: SyntaxNode,
): InlineNode => {
  // const node = iNode.node;
  if (!node || !isSyntaxNode(node) || node.name !== "Link")
    throw new Error("SyntaxNode with name Link expected");

  const iNode = inlineNode(node);
  const children = getChildren(node);
  const instructions = getInstChildren(node, children);

  const urlNode = children.find((n) => n.name === "URL");
  if (!urlNode || children.length < 3) {
    // Fallback to text if link is malformed
    iNode.children.push(textNode(node));
    return iNode;
  }

  const href = sanitizeUrl(context.text.substring(urlNode.from, urlNode.to));
  iNode.attrs = { ...(iNode.attrs ?? {}), href };

  const titleNode = children.find((n) => n.name === "LinkTitle");
  if (titleNode) {
    const title = context.text.substring(titleNode.from, titleNode.to);
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
      const subTree = buildInlineTree(context, synNode, contentChildren);
      iNode.children.push(...subTree.children);
    }
  }

  return iNode;
};

const skipMarks = (iNode: InlineNode): InlineNode => {
  const node = iNode.node;
  if (!node || !isSyntaxNode(node)) return iNode;

  const marks = markLengths(node);
  if (marks) {
    iNode.children[0].from += marks.start;
    if (marks.end) {
      iNode.children[iNode.children.length - 1].to -= marks.end;
    }
  }

  return iNode;
};

const iNodeToVNode = (
  context: RenderContext,
  iNode: InlineNode,
): VNode | undefined => {
  const node = iNode.node;
  const nodeName = node && isSyntaxNode(node) ? node.name : undefined;

  switch (nodeName) {
    case "StrongEmphasis":
    case "Emphasis":
    case "Strikethrough":
    case "Subscript":
    case "Superscript":
      return markVNode(context, iNode);
    case "InlineCode": {
      const vNode = markVNode(context, iNode, false) as VNode;
      vNode.text = "";
      iNode.children.forEach(
        (content) =>
          (vNode.text += context.text.substring(content.from, content.to)),
      );
      return vNode;
    }
    case "HardBreak":
      return h(context.schema.marks.hard_break.tag, {});
    case "Escape":
      return textVNode(context, iNode.from + 1, iNode.to);
    case "Link":
      return linkVNode(context, iNode);
    case "HTMLTag": {
      // Safely handle HTML tags by treating them as text
      return h("span", {}, context.text.substring(iNode.from, iNode.to));
    }
    case "URL":
      // URLs are handled in the Link nodes
      return;
    default: {
      return textVNode(context, iNode.from, iNode.to);
    }
  }
};

const markVNode = (
  context: RenderContext,
  iNode: InlineNode,
  nest = true,
): VNode => {
  const node = iNode.node;
  if (!node || !isSyntaxNode(node))
    return textVNode(context, iNode.from, iNode.to);

  const spec = getNodeSpec(context.schema, node);
  const vNode = h(spec.tag, {
    attrs: spec.attributes || {},
    props: { className: spec.class },
  });

  if (!nest) return vNode;

  if (iNode.children.length > 0)
    vNode.children = iNode.children
      .map((child) => iNodeToVNode(context, child))
      .filter((n) => n != null);

  return vNode;
};

const linkVNode = (context: RenderContext, iNode: InlineNode): VNode => {
  const childVNodes = iNode.children?.map((iNode) =>
    iNodeToVNode(context, iNode),
  );
  const linkProps = {
    props: { className: context.schema.marks.link.class },
    attrs: {
      ...context.schema.marks.link.attributes,
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

const textVNode = (context: RenderContext, from: number, to: number) =>
  h("", {}, context.text.substring(from, to));

const markLengths = (
  node: SyntaxNode,
): { start: number; end?: number } | undefined => {
  const marks = getInstChildren(node);
  if (marks.length === 0) return;

  const start = marks[0].to - marks[0].from;
  if (marks.length === 1) return { start };

  const endInst = marks[marks.length - 1];
  const end = endInst.to - endInst.from;

  return { start, end };
};

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
