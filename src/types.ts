import type { SyntaxNode } from "@lezer/common";
import type { MarkdownParser } from "@lezer/markdown";

// Types for solid-js compatibility
export type Accessor<T> = () => T;
export type Setter<T> = {
  (value: T): void;
  (updater: (prev: T) => T): void;
};

// Copied from prosemirror-model for prosemirror toDOM compatibility
type DOMNode = InstanceType<typeof window.Node>;
export type DOMOutputSpec =
  | string
  | DOMNode
  | { dom: DOMNode; contentDOM?: HTMLElement }
  // biome-ignore lint: as defined upstream
  | [string, ...any[]];

export interface BlockElements {
  [key: string]: HTMLElement;
  heading: HTMLHeadingElement;
  blockquote: HTMLQuoteElement;
  paragraph: HTMLParagraphElement;
  code_block: HTMLPreElement;
  fenced_code: HTMLPreElement;
  ordered_list: HTMLOListElement;
  bullet_list: HTMLUListElement;
  list_item: HTMLLIElement;
  table: HTMLTableElement;
  table_header: HTMLTableSectionElement;
  table_body: HTMLTableSectionElement;
  table_row: HTMLTableRowElement;
  table_cell: HTMLTableCellElement;
  table_header_cell: HTMLTableCellElement;
  horizontal_rule: HTMLHRElement;
}

export type TargetElement = Element | undefined | null;
export type Target = TargetElement | Accessor<TargetElement>;

export interface BlockState {
  index: number;
  name: string;
  from: number;
  to: number;
}

export interface RenderState {
  target?: TargetElement;
  block?: BlockState;
  getINode: (node: SyntaxNode) => InlineNode | undefined;
  setINode: (node: SyntaxNode, iNode: InlineNode) => void;
}

export interface BoundedNode {
  // The start of this node's range in the parent document / tree
  from: number;

  // The end of this node's range in the parent document / tree
  to: number;
}

/**
 * Represents a segment of inline content with potential nested structure
 * This bridges the gap between Lezer's AST and our virtual DOM representation
 */
export interface InlineNode extends BoundedNode {
  // Reference to the SyntaxNode in the original lezer Tree
  node?: BoundedNode;

  // Children of this node flattened, with Text nodes mapping the empty spaces in SyntaxNode
  children: InlineNode[];

  // Set arbitrary attributes
  // biome-ignore lint: valid use case
  attrs?: Record<string, any>;
}

export interface RenderContext {
  schema: SchemaSpec;
  text: string;
  state: RenderState;
  getBlockElement: (block?: number) => TargetElement;
  addOrReplaceInDOM: (
    newEl: Node,
    oldEl?: Node | null,
    parent?: TargetElement,
  ) => void;
}

export type BlockRenderFn = (
  context: RenderContext,
  node: SyntaxNode,
  parent?: Element,
  child?: Element,
) => void;

export type BlockCleanupFn = (
  context: RenderContext,
  node: SyntaxNode,
  element: Element,
) => void;

export interface NodeSpec {
  tag: string;
  class?: string;
  attributes?: Record<string, string>;
  toDOM?: () => DOMOutputSpec;
}

export interface BlockSpec extends NodeSpec {
  render?: BlockRenderFn;
  cleanup?: BlockCleanupFn;
  children?: BlockSpec[];
}

export interface SchemaSpec {
  blocks: Record<keyof BlockElements, BlockSpec>;
  marks: Record<string, NodeSpec>;
}

export interface RendererOptions {
  parser?: MarkdownParser;
  schema?: SchemaSpec;
}
