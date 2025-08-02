import type { SyntaxNode } from "@lezer/common";

// Types for solid-js Signal compatibility
export type Accessor<T> = () => T;
export type Setter<T> = {
  (value: T): void;
  (updater: (prev: T) => T): void;
};
// export type Setter<T> =
//   | ((value: T) => void)
//   | ((updater: (prev: T) => T) => void);

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

export interface DOMState {
  // block: number;
  scrollOffset: number;
  target: TargetElement;
  getBlockElement: (block?: number) => Element | undefined;
  addOrReplaceInDOM: (
    newEl: Node,
    oldEl?: Node | null,
    parent?: TargetElement,
  ) => void;
}

export interface RenderState {
  schema: SchemaSpec;
  dom: DOMState;
  text: string;
}

export type BlockRenderer = (
  state: RenderState,
  node: SyntaxNode,
  parent?: Element,
  child?: Element,
) => void;

export interface NodeSpec {
  tag: string;
  class?: string;
  attributes?: Record<string, string>;
  toDOM?: () => DOMOutputSpec;
}

export interface BlockSpec extends NodeSpec {
  scrollOffset?: number;
  render?: BlockRenderer;
  children?: BlockSpec[];
}

export interface SchemaSpec {
  blocks: Record<keyof BlockElements, BlockSpec>;
  marks: Record<string, NodeSpec>;
}

export interface ScrollConfig {
  enabled: boolean;
  offset: number;
}

export interface RendererOptions {
  schema?: SchemaSpec;
  scroll?: Pick<ScrollConfig, "enabled"> & Pick<Partial<ScrollConfig>, "offset">;
}
