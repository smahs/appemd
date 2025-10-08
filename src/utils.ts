import type { SyntaxNode } from "@lezer/common";
import { getStyleTags, type Tag, tags } from "@lezer/highlight";

import { LezerTagMap } from "./nodemap.ts";
import type {
  BlockElements,
  BlockSpec,
  NodeSpec,
  RenderContext,
  SchemaSpec,
} from "./types.ts";

export const nodeKey = (node: SyntaxNode) => `${node.name}-${node.from}`;

export const getNodeSpec = (schema: SchemaSpec, node: SyntaxNode) => {
  let name = node.name,
    headingLevel: string | undefined;

  if (name.startsWith("ATXHeading") || name.startsWith("SetextHeading"))
    headingLevel = name.slice(-1);

  const type = LezerTagMap[name];
  const spec = schema.marks[type] ?? schema.blocks[type];

  if (headingLevel) spec.tag = `h${headingLevel}`;
  return spec;
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

export const getInlineChildren = (node: SyntaxNode, from: number = 0) => {
  const children = getChildren(node).filter((n) => n.from >= from);

  // Handle HardBreak as special case (it's an instruction node)
  return getNonInstChildren(undefined, children)
    .concat(children.filter((c) => c.name === "HardBreak"))
    .sort((n1, n2) => n1.from - n2.from);
};

export const lastTextNode = (node: Node): Text | undefined => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    let current = node.lastChild;
    while (current) {
      const last = lastTextNode(current);
      if (last) return last;
      current = current.previousSibling;
    }
  }
};

// --- Below block utils are here to avoid circular imports

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

export const renderBlock = (
  context: RenderContext,
  block: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  if (block.name === "CommentBlock") return;

  const defaultRenderFn = context.schema.blocks.paragraph.render!;
  const nodeName = LezerTagMap[block.name];
  const renderFn = context.schema.blocks[nodeName]?.render || defaultRenderFn;
  renderFn(context, block, parent, child);
};
