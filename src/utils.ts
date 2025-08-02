import type { SyntaxNode } from "@lezer/common";
import { getStyleTags, type Tag, tags } from "@lezer/highlight";
import { LezerTagMap } from "./spec";
import type {
  BlockElements,
  BlockSpec,
  NodeSpec,
  RenderState,
  SchemaSpec,
} from "./types";

export const isNil = (val: unknown): val is null | undefined => val == null;

export const scrollParent = (
  el?: HTMLElement | null,
): HTMLElement | undefined => {
  if (!el) return undefined;

  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return el;
    }
    el = el.parentElement;
  }
};

/**
 * Sanitize URLs to prevent XSS
 */
export const sanitizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.href);
    const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];
    return allowedProtocols.includes(parsed.protocol) ? url : "#";
  } catch {
    return "#";
  }
};

export const renderBlock = (
  state: RenderState,
  block: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  if (block.name === "CommentBlock") return;

  const defaultRenderFn = state.schema.blocks.paragraph.render!;
  const nodeName = LezerTagMap[block.name];
  const renderFn = state.schema.blocks[nodeName]?.render || defaultRenderFn;
  renderFn(state, block, parent, child);
};

export const createElement = (
  spec: NodeSpec | BlockSpec,
  tag?: string,
): HTMLElement => {
  const element = document.createElement(tag ?? spec.tag);

  if (spec.class) {
    element.className = spec.class;
  }

  if (spec.attributes) {
    Object.entries(spec.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }

  if ("children" in spec && spec.children) {
    for (const childSpec of spec.children) {
      const child = createElement(childSpec);
      element.appendChild(child);
    }
  }

  return element;
};

export const createBlock = <K extends keyof BlockElements>(
  schema: SchemaSpec,
  name: K,
  level?: number,
): BlockElements[K] => {
  const spec = schema.blocks[name as keyof typeof schema.blocks];
  if (!spec) throw new Error(`Unknown node type: ${name}`);

  let tag: typeof spec.tag | undefined;
  if (name === "heading" && level) {
    tag = `h${level}`;
  }

  return createElement(spec, tag) as BlockElements[K];
};

export const getChildren = (node: SyntaxNode) => {
  const children: SyntaxNode[] = [];
  let child = node.firstChild;
  while (child && child !== children[0]) {
    children.push(child);
    child = child.nextSibling;
  }
  return children;
};

export const getNodesByTag = (
  children: SyntaxNode[],
  include: Tag[] = [],
  exclude: Tag[] = [],
) => {
  return children.filter((c) => {
    const tags = getStyleTags(c)?.tags || [];
    return (
      (include.length === 0 || tags.some((tag) => include.includes(tag))) &&
      (exclude.length === 0 || tags.every((tag) => !exclude.includes(tag)))
    );
  });
};

export const getInstChildren = (
  node?: SyntaxNode,
  children?: SyntaxNode[],
): SyntaxNode[] => {
  if (!node && !children) throw new Error("Neither parent or children provided");

  children = children ?? getChildren(node!);
  return getNodesByTag(children, [tags.processingInstruction]);
};

export const getNonInstChildren = (
  node?: SyntaxNode,
  children?: SyntaxNode[],
): SyntaxNode[] => {
  if (!node && !children) throw new Error("Neither parent or children provided");

  children = children ?? getChildren(node!);
  return getNodesByTag(children, [], [tags.processingInstruction]);
};

export const getInlineChildren = (node: SyntaxNode) => {
  const children = getChildren(node);

  // Handle HardBreak as special case (it's an instruction node)
  return getNonInstChildren(undefined, children)
    .concat(children.filter((c) => c.name === "HardBreak"))
    .sort((n1, n2) => n1.from - n2.from);
};
