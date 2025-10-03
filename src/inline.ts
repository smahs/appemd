import type { SyntaxNode } from "@lezer/common";
import { LezerMarksMap, LezerTagMap, schemaSpec } from "./spec";
import type { RenderState, SchemaSpec } from "./types";
import {
  createElement,
  getChildren,
  getInlineChildren,
  getInstChildren,
} from "./utils";

export const renderInline = (
  state: RenderState,
  node: SyntaxNode,
  element: HTMLElement,
  content?: string,
  offset: number = 0,
) => {
  const fulltext = content ?? state.text;
  let from = state.checkpoint.position - offset;
  let to = node.to - offset;

  // Content has been truncated and moved to the newly created next block
  if (from > to) {
    truncateElement(element, from, to);
    state.checkpoint.position = to;
    return;
  }

  const allMarkNodes = getInlineChildren(node);

  let markAtFrom: SyntaxNode | undefined;
  for (const mark of allMarkNodes.reverse()) {
    if (mark.from <= from && mark.to > from) {
      markAtFrom = mark;
      break;
    }

    if (mark.to < from) break;
  }

  const lastDOMChild = Array.from(element.childNodes).at(-1);
  const areSame = compareDOMNodes(markAtFrom, lastDOMChild);
  if (lastDOMChild && markAtFrom && !areSame) {
    from = markAtFrom.from;
    truncateNode(lastDOMChild, from);
  }

  const markNodes = allMarkNodes.filter((n) => n.from >= from);
  let textNode = isTextNode(lastDOMChild)
    ? lastDOMChild
    : createTextNode(element);

  // Add text content before any mark node
  const textBefore = (!lastDOMChild || isTextNode(lastDOMChild)) && !markAtFrom;
  if (textBefore) {
    to = markNodes[0] ? markNodes[0].from - offset : to;
    addText(textNode, fulltext, from, to);
    from = to;
  }

  for (const mark of markNodes) {
    // Add any text between the previous and this node
    if (from <= mark.from - offset) {
      to = mark.from - offset;
      addText(textNode, fulltext, from, to);
    }

    element.appendChild(renderMark(state, mark));
    from = mark.to - offset;
    textNode = createTextNode(element);
  }

  // Add remaining text content after the last mark node
  to = node.to - offset;
  if (from < to) addText(textNode, fulltext, from, to);

  state.checkpoint.position = to;
};

/**
 * Render individual inline nodes
 */
const renderMark = (state: RenderState, node: SyntaxNode): HTMLElement | Text => {
  let el: HTMLElement | undefined;

  switch (node.name) {
    case "StrongEmphasis":
    case "Emphasis":
    case "Strikethrough":
    case "Subscript":
    case "Superscript": {
      const markType = LezerTagMap[node.name];
      el = createMark(state.schema, markType);
      break;
    }
    case "InlineCode": {
      el = createMark(state.schema, "code");
      const { content } = getContent(state, node);
      const textContent = createTextNode(el);
      textContent.nodeValue = content;
      state.checkpoint.position = node.to;
      return el;
    }
    case "HardBreak":
      return createMark(state.schema, "hard_break");
    case "Escape":
      // TODO to be handled
      return document.createTextNode(
        state.text.substring(node.from + 1, node.to),
      );
    case "Link":
      return renderLinkMark(state, node);
    case "HTMLTag": {
      // Safely handle HTML tags by treating them as text
      const span = document.createElement("span");
      span.textContent = state.text.substring(node.from, node.to);
      return span;
    }
    default:
      throw new Error(`Unknown mark node: ${node.name}`);
    // default: {
    //   return document.createTextNode(state.text.substring(node.from, node.to));
    // }
  }

  const { content, markLength } = getContent(state, node);

  state.checkpoint.position = 0;
  renderInline(state, node, el, content, markLength);
  state.checkpoint.position = node.to;

  return el;
};

/**
 * Safely render link elements
 */
const renderLinkMark = (state: RenderState, node: SyntaxNode): HTMLElement => {
  const children = getChildren(node);
  const urlNode = children.find((n) => n.name === "URL");

  if (!urlNode || children.length < 3) {
    // Fallback to text if link is malformed
    const span = document.createElement("span");
    span.textContent = state.text.substring(node.from, node.to);
    return span;
  }

  const url = state.text.substring(urlNode.from, urlNode.to);
  const label =
    children[1].name === "URL"
      ? state.text.substring(children[1].from, children[1].to) // [URL]
      : state.text.substring(children[0].to, children[1].from); // [label](URL)

  const link = createMark(state.schema, "link");
  link.setAttribute("href", sanitizeUrl(url));
  link.textContent = label;

  const titleNode = children.find((n) => n.name === "LinkTitle");
  if (titleNode) {
    const title = state.text.substring(titleNode.from, titleNode.to);
    link.setAttribute("title", title.replace(/"/g, ""));
  }

  return link;
};

const getContent = (state: RenderState, node: SyntaxNode) => {
  const marks = getInstChildren(node);

  let start = node.from,
    end = node.to,
    markLength = 0;
  if (marks.length > 0) {
    start = marks[0].to;
    markLength = marks[0].to - marks[0].from;
  }
  if (marks.length > 1) end = marks[marks.length - 1].from;

  const content = state.text.substring(start, end);
  return { content, start, end, markLength };
};

// --- Type guards/utils ---

const isTextNode = (node: Node | ChildNode | null | undefined): node is Text => {
  return node?.nodeType === Node.TEXT_NODE;
};

const getNodeType = (node: Node): string => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return (node as Element).tagName.toLowerCase();
  }
  if (isTextNode(node)) {
    return "#text";
  }
  return node.nodeName;
};

const compareDOMNodes = (node?: SyntaxNode, mark?: Node): boolean => {
  if (!node || !mark) return false;

  const nodeIdentifier = LezerMarksMap[node.name];
  if (!nodeIdentifier) {
    return false;
  }

  const markSpec = schemaSpec.marks[nodeIdentifier];
  if (!markSpec) {
    return false;
  }

  const expectedTag = markSpec.tag;
  const actualTag = getNodeType(mark);

  return expectedTag === actualTag;
};

const addText = (textNode: Text, content: string, from: number, to: number) => {
  const sub = content.substring(from, to);
  if (sub) textNode.nodeValue += sub;
};

const createTextNode = (el?: HTMLElement) => {
  const textNode = document.createTextNode("");
  if (el) el.appendChild(textNode);
  return textNode;
};

const createMark = (schema: SchemaSpec, markType: string): HTMLElement => {
  const spec = schema.marks[markType];
  if (!spec) throw new Error(`Unknown mark type: ${markType}`);

  return createElement(spec);
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

const truncateNode = (domNode: Node, from: number) => {
  const parent = domNode?.parentNode;
  if (isTextNode(domNode) && (domNode.nodeValue?.length ?? -1) > from) {
    const toRemove = domNode.splitText(from);
    parent?.removeChild(toRemove);
  } else {
    parent?.removeChild(domNode);
  }
};

const truncateElement = (element: HTMLElement, from: number, to: number) => {
  let lastChild = element.lastChild;
  if (lastChild?.nodeType === Node.ELEMENT_NODE) lastChild = lastChild.lastChild;

  if (!isTextNode(lastChild))
    throw new Error(`Unknow node type: ${lastChild?.nodeType}`);

  const lastChildLen = lastChild.nodeValue?.length;
  const offset = from - to;
  if (!lastChildLen || lastChildLen < offset)
    throw new Error(`Text mismatch error: ${lastChildLen} | ${offset}`);

  const toDelete = lastChild.splitText(lastChildLen - offset);
  element.removeChild(toDelete);
};
