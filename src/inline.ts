import type { SyntaxNode } from "@lezer/common";
import { LezerTagMap } from "./spec";
import type { RenderState, SchemaSpec } from "./types";
import {
  createElement,
  getChildren,
  getInlineChildren,
  getInstChildren,
  sanitizeUrl,
} from "./utils";

export const renderInline = (
  state: RenderState,
  node: SyntaxNode,
  content?: string,
  offset: number = 0,
): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  const children = getInlineChildren(node);

  const addText = (start: number, end: number) => {
    const sub = (content ?? state.text).substring(start, end);
    if (sub) fragment.appendChild(document.createTextNode(sub));
  };

  let startPos = node.from - offset;
  let endPos = (children[0]?.from ?? node.to) - offset;

  // Add text content before any mark node
  addText(startPos, endPos);
  startPos = endPos;

  for (const child of children) {
    // Add any text between the previous and this node
    if (startPos < child.from - offset) addText(startPos, child.from - offset);
    fragment.appendChild(renderMark(state, child));
    startPos = child.to - offset;
  }

  // Add remaining text content after the last mark node
  endPos = node.to - offset;
  if (startPos < endPos) addText(startPos, endPos);

  return fragment;
};

/**
 * Render individual inline nodes
 */
export const renderMark = (
  state: RenderState,
  node: SyntaxNode,
): HTMLElement | Text => {
  let el: HTMLElement | undefined, content: string | undefined, start: number;

  switch (node.name) {
    case "StrongEmphasis":
    case "Emphasis":
    case "Strikethrough":
    case "Subscript":
    case "Superscript":
    case "InlineCode": {
      ({ el, content, start } = nestableMark(state, node));
      break;
    }
    case "HardBreak":
      return createMark(state.schema, "hard_break");
    case "Escape":
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
    default: {
      return document.createTextNode(state.text.substring(node.from, node.to));
    }
  }

  el.append(renderInline(state, node, content, start));
  return el;
};

/**
 * Create mark elements using the schema adapter
 */
export const nestableMark = (
  state: RenderState,
  node: SyntaxNode,
): {
  el: HTMLElement;
  content: string;
  start: number;
} => {
  const markType = LezerTagMap[node.name];
  const el = createMark(state.schema, markType);

  let start = node.from;
  let end = node.to;

  // Shift the content positions to remove any mark delimiters
  const marks = getInstChildren(node);
  if (marks.length > 0) start = marks[0].to;
  if (marks.length > 1) end = marks[marks.length - 1].from;

  const content = state.text.substring(start, end);
  return { el, content, start };
};

/**
 * Safely render link elements
 */
export const renderLinkMark = (
  state: RenderState,
  node: SyntaxNode,
): HTMLElement => {
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

export const createMark = (schema: SchemaSpec, markType: string): HTMLElement => {
  const spec = schema.marks[markType];
  if (!spec) throw new Error(`Unknown mark type: ${markType}`);

  return createElement(spec);
};
