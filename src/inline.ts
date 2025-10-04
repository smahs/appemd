import type { SyntaxNode } from "@lezer/common";
import {
  attributesModule,
  classModule,
  h,
  init,
  propsModule,
  styleModule,
  type VNode,
} from "snabbdom";
import { LezerMarksMap, LezerTagMap } from "./consts";
import type { InlineNode, RenderState } from "./types.ts";
import { getInstChildren, getNonInstChildren } from "./utils.ts";

// Initialize snabbdom with the modules we need
const patch = init([classModule, propsModule, attributesModule, styleModule]);

// Cache for the previous VNode to enable efficient diffing
const elementVNodeCache = new WeakMap<HTMLElement, VNode>();

export const renderInline = (
  state: RenderState,
  node: SyntaxNode,
  element: HTMLElement,
  skip = 0,
) => {
  // Build inline segments from the node
  const tree = buildInlineNodeTree(node, skip);
  console.log(tree, state.text.substring(tree.from, tree.to));

  // Create VNodes from the segments
  const childVNodes = tree.children?.map((iNode) => iNodeToVNode(state, iNode));

  // Create the new VNode
  const newVNode = h(element.tagName, {}, childVNodes);

  // Get the previous VNode from cache or create a new one
  const previousVNode = elementVNodeCache.get(element);

  // If we have a previous VNode, patch it with the new one
  if (previousVNode) {
    patch(previousVNode, newVNode);
  } else {
    // First time rendering, just patch the element
    patch(element, newVNode);
  }

  // Store the current VNode for the next render
  elementVNodeCache.set(element, newVNode);
};

// Build inline segments from a SyntaxNode
function buildInlineNodeTree(node: SyntaxNode, skip: number): InlineNode {
  const children = getNonInstChildren(node);
  children.sort((a, b) => a.from - b.from);

  const root: InlineNode = inlineNode(node, skip);

  if (children.length === 0) {
    root.children.push(textNode(node, skip));
    return root;
  }

  let { from, to } = node;

  // Skip is reset after the first Text node is inserted
  for (const child of children) {
    // Add any plain text from `from` to the start of this child
    if (from < child.from) {
      root.children.push(textNodeFT(from, child.from, skip));
      skip = 0;
    }

    // Add the marked text
    const childNode: InlineNode = inlineNode(child, skip);
    skip = 0;
    const markType = LezerMarksMap[child.type.name];
    if (markType) {
      const grandChildren = getNonInstChildren(child);
      grandChildren.forEach((gc) => {
        childNode.children.push(buildInlineNodeTree(gc, skip));
      });
    } else {
      childNode.children.push(textNode(child, skip));
    }
    root.children.push(childNode);

    // Move the position
    from = child.to;
  }

  // If there's remaining text after the last child, add it as plain text
  if (from < to) {
    console.log(from, to);
    root.children?.push(textNodeFT(from, to, skip));
  }

  return root;
}

const iNodeToVNode = (state: RenderState, iNode: InlineNode): VNode | string => {
  let vn: VNode | undefined;

  switch (iNode.node?.name) {
    case "StrongEmphasis":
    case "Emphasis":
    case "Strikethrough":
    case "Subscript":
    case "Superscript":
    case "InlineCode": {
      vn = nestableMark(state, iNode);
      break;
    }
    case "HardBreak":
      return h(state.schema.marks.hard_break.tag, {});
    case "Escape":
      return state.text.substring(iNode.from + 1, iNode.to);
    // case "Link":
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

  return vn;
};

const nestableMark = (state: RenderState, iNode: InlineNode): VNode => {
  const node = iNode.node;
  if (!node) throw new Error("Wrong node type used");

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

// const linkInlineNode = (state: RenderState, node: SyntaxNode): VNode => {
//   const children = getChildren(node);
//   const instructions = getInstChildren(node, children);

//   const urlNode = children.find((n) => n.name === "URL");
//   if (!urlNode || children.length < 3) {
//     // Fallback to text if link is malformed
//     return h('a', {}, state.text.substring(node.from, node.to));
//   }

//   const urlIndex = children.indexOf(urlNode);
//   const url = state.text.substring(urlNode.from, urlNode.to);

//   let content: VNode | string | undefined;
//   if (urlIndex === 1) {
//     // Case [URL]: render as plain text
//     content = state.text.substring(children[1].from, children[1].to);
//   } else {
//     // Case [label](URL): render as markdown inline text
//     // const contentNode: SyntaxNode = {
//     //       ...node,
//     //   name: "Paragraph",
//     //       from: instructions[0].to,
//     //       to:       instructions[1].from,
//     //     };
//     const labelInst = [0, 1].map(i => children.find(n => n === instructions[i]));
//     const [fromIndex, toIndex] = labelInst.map(i => children.indexOf(i!))
//     const contentChildren = children.slice(fromIndex + 1, toIndex);
//     grandChildren.forEach(gc => { childNode.children?.push(buildInlineNodeTree(gc)) });
//     const contentTree = contentChildren.
//     content = renderInline(state, node);
//   }

//   const linkProps = {
//     attrs: {
//       href: sanitizeUrl(url),
//       ...state.schema.marks.link.attributes
//     }
//   };

//   const titleNode = children.find((n) => n.name === "LinkTitle");
//   if (titleNode) {
//     const title = state.text.substring(titleNode.from, titleNode.to);
//     linkProps.attrs.title = title.replace(/"/g, "");
//   }

//   return h('a', linkProps, content);
// };

/**
 * Sanitize URLs to prevent XSS
 */
// const sanitizeUrl = (url: string): string => {
//   try {
//     const parsed = new URL(url, window.location.href);
//     const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];
//     return allowedProtocols.includes(parsed.protocol) ? url : "#";
//   } catch {
//     return "#";
//   }
// };

const inlineNode = (node: SyntaxNode, skip: number): InlineNode => ({
  node,
  from: node.from + skip,
  to: node.to,
  children: [],
});

const textNodeFT = (from: number, to: number, skip: number) => ({
  from: from + skip,
  to: to,
  children: [],
});

const textNode = (node: SyntaxNode, skip: number): InlineNode =>
  textNodeFT(node.from, node.to, skip);
