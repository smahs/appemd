import type { SyntaxNode } from "@lezer/common";

import { LezerMarksMap } from "./nodemap.ts";
import type { BoundedNode, InlineNode, RenderContext } from "./types.ts";
import {
  createElement,
  getChildren,
  getInlineChildren,
  getInstChildren,
  getNodeSpec,
} from "./utils.ts";

/*
 * Build the new virtual tree and patch with the DOM element
 */
export const renderInline = (
  context: RenderContext,
  node: SyntaxNode,
  element: HTMLElement,
) => {
  const tree = buildInlineTree(context, node);
  if (contentMatch(tree, element)) return;

  patchDOM(context, tree.children, element);
  setAttributes(tree, element);
};

// Build inline segments from a SyntaxNode
const buildInlineTree = (
  context: RenderContext,
  node: BoundedNode,
  children?: SyntaxNode[],
): InlineNode => {
  if (!children) {
    if (isSyntaxNode(node)) children = getInlineChildren(node);
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
      case "Escape":
        root.children.push(textNodeFT(child.from + 1, child.to));
        break;
      default: {
        const knownMark = LezerMarksMap[child.type.name];
        if (knownMark) {
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
};

const buildLinkInlineTree = (
  context: RenderContext,
  node: SyntaxNode,
): InlineNode => {
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

  const href = sanitizeUrl(extractText(context, urlNode));
  iNode.attrs = { ...(iNode.attrs ?? {}), href };

  const titleNode = children.find((n) => n.name === "LinkTitle");
  if (titleNode) {
    const title = extractText(context, titleNode);
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
    const content = children.slice(fromIndex + 1, toIndex);
    const from = labelInst[0].to;
    const to = labelInst[1].from;

    if (content.length === 0) iNode.children.push(textNodeFT(from, to));
    else {
      // Add children InlineNodes
      const syntheticNode = { from, to };
      const subTree = buildInlineTree(context, syntheticNode, content);
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

const patchDOM = (
  context: RenderContext,
  targetChildren: InlineNode[],
  parentElement: HTMLElement,
) => {
  const domChildren = Array.from(parentElement.childNodes);
  let domIndex = 0;
  let targetIndex = 0;

  while (targetIndex < targetChildren.length || domIndex < domChildren.length) {
    const targetNode = targetChildren[targetIndex];
    const domNode = domChildren[domIndex];

    // No more target nodes - remove remaining DOM nodes
    if (!targetNode) {
      domNode.remove();
      domIndex++;
      continue;
    }

    // No more DOM nodes - append remaining target nodes
    if (!domNode) {
      const newNode = createDOMNode(context, targetNode);
      parentElement.appendChild(newNode);
      targetIndex++;
      continue;
    }

    // Both exist - check if they match
    if (nodesMatch(context, targetNode, domNode)) {
      // Nodes match - update content if needed
      updateNode(context, targetNode, domNode);
      domIndex++;
      targetIndex++;
    } else {
      // Nodes don't match - check if we should replace or insert
      const targetMatchesNextDOM =
        domChildren[domIndex + 1] &&
        nodesMatch(context, targetNode, domChildren[domIndex + 1]);

      if (targetMatchesNextDOM) {
        // Current DOM node was removed - delete it
        domNode.remove();
        domIndex++;
      } else {
        // Replace the DOM node with the target
        const newNode = createDOMNode(context, targetNode);
        parentElement.replaceChild(newNode, domNode);
        domIndex++;
        targetIndex++;
      }
    }
  }
};

/**
 * Updates an existing DOM node to match the target InlineNode.
 */
const updateNode = (
  context: RenderContext,
  iNode: InlineNode,
  domNode: ChildNode,
) => {
  const node = iNode.node;
  if (!node || !isSyntaxNode(node)) {
    const textNode = domNode as Text;
    const newText = extractText(context, iNode);

    if (textNode.nodeValue !== newText) {
      textNode.nodeValue = newText;
    }
    return;
  }

  // Element node - return if the length has not changed
  const element = domNode as HTMLElement;
  if (contentMatch(iNode, element)) return;

  if (node.name === "InlineCode") {
    // InlineCode: treat as plain text within code element, no formatting
    const newText = extractText(context, iNode.children[0]);

    if (element.textContent !== newText) {
      element.textContent = newText;
    }
  } else {
    // Recursively patch children
    patchDOM(context, iNode.children, element);

    // Link nodes set URL and title attributes in InlineNode.attrs
    if (iNode.attrs)
      Object.entries(iNode.attrs).forEach(([key, value]) => {
        if (value) element.setAttribute(key, value);
      });
  }
};

const createDOMNode = (context: RenderContext, iNode: InlineNode): ChildNode => {
  const node = iNode.node;

  if (!node || !isSyntaxNode(node)) {
    // Create text node
    const text = extractText(context, iNode);
    return document.createTextNode(text);
  }

  if (node.name === "InlineCode") {
    // Create code element with plain text content
    const codeElement = document.createElement("code");
    const text = extractText(context, iNode.children[0]);
    codeElement.textContent = text;
    return setAttributes(iNode, codeElement);
  }

  // Create element node and recursively render children
  const spec = getNodeSpec(context.schema, node);
  const element = createElement(spec, spec.tag, iNode.attrs);

  for (const child of iNode.children) {
    const childNode = createDOMNode(context, child);
    element.appendChild(childNode);
  }

  return setAttributes(iNode, element);
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

const setAttributes = (iNode: InlineNode, element: HTMLElement) => {
  element.setAttribute("data-inode-from", iNode.from.toString());
  element.setAttribute("data-inode-to", iNode.to.toString());
  return element;
};

const markLengths = (
  node: SyntaxNode,
): { start: number; end?: number } | undefined => {
  const marks = getInstChildren(node).filter((m) => m.name !== "HardBreak");
  if (marks.length === 0) return;

  const start = marks[0].to - marks[0].from;
  if (marks.length === 1) return { start };

  const endInst = marks[marks.length - 1];
  const end = endInst.to - endInst.from;

  return { start, end };
};

/**
 * Checks if a DOM node matches an InlineNode structurally.
 */
const nodesMatch = (
  context: RenderContext,
  iNode: InlineNode,
  domNode: ChildNode,
): boolean => {
  const node = iNode.node;
  if (!node || !isSyntaxNode(node)) {
    return domNode.nodeType === Node.TEXT_NODE;
  }

  if (domNode.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = domNode as HTMLElement;
  const spec = getNodeSpec(context.schema, node);
  return element.tagName.toLowerCase() === spec.tag.toLowerCase();
};

/**
 * Gets previously set from/to data attributes from the dom ChildNode
 * and compares with the iNode value to check if the content length is same.
 */
const contentMatch = (iNode: InlineNode, domNode: ChildNode): boolean => {
  // Text Node cannot have attributes, so fallback to reprocessing
  if (domNode.nodeType === Node.TEXT_NODE) return false;

  const element = domNode as HTMLElement,
    elFrom = element.getAttribute("data-inode-from"),
    elTo = element.getAttribute("data-inode-to");

  if (elFrom && elTo) {
    const fromInt = Number.parseInt(elFrom, 10),
      toInt = Number.parseInt(elTo, 10);
    if (fromInt === iNode.from && toInt === iNode.to) return true;
  }

  // Data attributes not set on the dom Node, fallback to reprocessing
  return false;
};

/**
 * Extracts text content from an InlineNode based on its from/to positions.
 */
const extractText = (context: RenderContext, node: BoundedNode): string => {
  const { from, to } = node;
  return context.text.substring(from, to);
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
