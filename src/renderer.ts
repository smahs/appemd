import type { SyntaxNode, Tree } from "@lezer/common";
import { TreeFragment } from "@lezer/common";
import {
  Autolink,
  parser as cmParser,
  Emoji,
  GFM,
  type MarkdownParser,
  Subscript,
  Superscript,
} from "@lezer/markdown";

import { schemaSpec } from "./spec.ts";
import type {
  Accessor,
  BlockSpec,
  BlockState,
  InlineNode,
  RenderContext,
  RendererOptions,
  RenderState,
  SchemaSpec,
  Setter,
  Target,
  TargetElement,
} from "./types.ts";
import { getChildren, getNodeSpec, nodeKey, renderBlock } from "./utils.ts";

const defaultParser = (): MarkdownParser => {
  return cmParser.configure([GFM, Subscript, Superscript, Emoji, Autolink]);
};

export class RendererState implements RenderState {
  private _target: Target;
  block?: BlockState;
  iNodeCache: Map<string, InlineNode | undefined>;

  constructor() {
    this.iNodeCache = new Map();
  }

  /**
   * Gets the target element, resolving an Accessor function if necessary.
   */
  get target(): TargetElement {
    if (typeof this._target === "function") {
      return this._target();
    }
    return this._target;
  }

  /**
   * Sets the target element or Accessor.
   */
  set target(target: Target | undefined | null) {
    this._target = target;
  }

  setBlockState(block: BlockState) {
    this.block = block;
  }

  clearInlineNodeCache() {
    this.iNodeCache.clear();
  }

  getParentBlockElement(el: HTMLElement | null) {
    if (!el || !this.target) return;

    let blockEl: HTMLElement | null = el;
    while (blockEl && blockEl.parentElement !== this.target) {
      blockEl = blockEl.parentElement;
    }

    return blockEl;
  }

  getINode(node: SyntaxNode): InlineNode | undefined {
    return this.iNodeCache.get(nodeKey(node));
  }

  setINode(node: SyntaxNode, iNode: InlineNode) {
    this.iNodeCache.set(nodeKey(node), iNode);
  }
}

/**
 * A Markdown renderer that generates DOM elements from a parsed AST tree.
 */
export class MarkdownRenderer {
  private parser: MarkdownParser;
  private schema: SchemaSpec;
  private state: RendererState;

  private tree: Tree;
  private fragments: readonly TreeFragment[];
  private _text: string | Accessor<string>;
  private setText?: Setter<string>;

  get text(): string {
    return this._text instanceof Function ? this._text() : this._text;
  }

  get context(): RenderContext {
    return {
      schema: this.schema,
      text: this.text,
      state: this.state,
      getBlockElement: this.getBlockElement,
      addOrReplaceInDOM: this.addOrReplaceInDOM,
    };
  }

  constructor(
    parser: MarkdownParser,
    tree: Tree,
    fragments: readonly TreeFragment[],
    text: string | Accessor<string>,
    setText?: Setter<string>,
    options?: RendererOptions,
  ) {
    this.parser = parser;
    this._text = text;
    this.setText = setText;
    this.tree = tree;
    this.fragments = fragments;
    this.schema = options?.schema ?? schemaSpec;
    this.state = new RendererState();

    this.getBlockElement = this.getBlockElement.bind(this);
    this.addOrReplaceInDOM = this.addOrReplaceInDOM.bind(this);
  }

  static init(
    target: Target,
    text: Accessor<string>,
    setText?: Setter<string>,
    options?: RendererOptions,
  ): MarkdownRenderer {
    const parser = options?.parser ?? defaultParser();
    const tree = parser.parse(text());
    const renderer = new MarkdownRenderer(
      parser,
      tree,
      TreeFragment.addTree(tree),
      text,
      setText,
      options,
    );

    if (target) renderer.target = target;

    return renderer;
  }

  static render(
    target: Target,
    text: string | Accessor<string>,
    options?: RendererOptions,
  ) {
    const parser = options?.parser ?? defaultParser();
    const tree = parser.parse(text instanceof Function ? text() : text);
    const renderer = new MarkdownRenderer(
      parser,
      tree,
      TreeFragment.addTree(tree),
      text,
      undefined,
      options,
    );
    renderer.target = target;
    renderer.renderDOM();
  }

  append(chunk: string) {
    if (!this.fragments.length) {
      throw new Error("AST is not instantiated");
    }

    const from = this.fragments.at(-1)!.to;
    const to = from + chunk.length;
    const changed = [
      {
        fromA: from,
        toA: to,
        fromB: from,
        toB: from + chunk.length,
      },
    ];

    if (this.setText)
      this.setText((text) => text.slice(0, from) + chunk + text.slice(to));

    const fragments = TreeFragment.applyChanges(this.fragments, changed, 1);
    this.tree = this.parser.parse(this.text, fragments);
    this.fragments = TreeFragment.addTree(this.tree, fragments);

    if (this.target) this.renderDOM();
  }

  private renderDOM(): void {
    if (!this.target) return;

    const lastBlockId = this.state.block?.index;
    const children = getChildren(this.tree.cursor().node);
    if (!children.length) return;

    let index = Math.max(this.target.children.length - 1, 0);
    if (index !== children.length - 1) {
      this.syncDOM(children);
      index = this.target.children.length;
    }

    // Iteratively render starting from the current block node
    while (index < children.length) {
      const block = children[index];
      this.state.setBlockState(this.blockState(index, block));
      renderBlock(this.context, block);
      index += 1;
    }

    // If we have changed the block node, then cleanup the previous node
    if (lastBlockId && lastBlockId < index - 1) {
      const lastBlock = children[lastBlockId];
      const spec = getNodeSpec(this.schema, lastBlock) as BlockSpec;
      if (spec.cleanup) {
        const el = this.target.children.item(lastBlockId);
        if (el) spec.cleanup(this.context, lastBlock, el);
      }
    }
  }

  private blockState(index: number, node: SyntaxNode): BlockState {
    return { index, from: node.from, to: node.to, name: node.name };
  }

  private syncDOM(nodes?: SyntaxNode[], parent: TargetElement = this.target) {
    if (!parent) return;

    nodes = nodes ?? getChildren(this.tree.cursor().node);

    // Remove elements which don't match the corresponding SyntaxNode
    // This should also remove any lingering tail elements
    const mismatches = nodes.map((node, i) => {
      const spec = getNodeSpec(this.schema, node);
      const el = parent?.children.item(i);
      return el?.tagName.toLowerCase() !== spec.tag;
    });
    const firstMismatch = mismatches.indexOf(true);
    const nodesToRemove = Array.from(parent?.children).splice(firstMismatch);
    nodesToRemove.forEach((el) => {
      parent.removeChild(el);
    });
  }

  /**
   * Adds or replaces an element in the DOM.
   *
   * @param newEl - The new element to add or replace with
   * @param oldEl - The existing element to replace, if any
   * @param parent - The parent element to append to
   */
  addOrReplaceInDOM(
    newChild: Node,
    oldChild?: Node | null,
    parent: TargetElement = this.target,
  ) {
    let target: TargetElement;
    if (oldChild?.parentElement) target = oldChild.parentElement;
    else target = parent;
    if (!target) throw new Error("A suitable parent element could not be found");

    oldChild
      ? target.replaceChild(newChild, oldChild)
      : target.appendChild(newChild);

    // Clear VNode cache if we're changing into a new block node
    if (newChild instanceof HTMLElement && parent === this.target) {
      this.state.clearInlineNodeCache();
    }
  }

  /**
   * Gets the child element by index from the target element.
   *
   * @param index - The index of the block element to retrieve
   * @returns The block element or undefined
   */
  getBlockElement(index?: number): TargetElement {
    index = index ?? this.state.block?.index ?? 0;
    const existingEl = this.target?.children.item(index);
    if (existingEl && !(existingEl instanceof Element))
      throw new Error("The block element type mismatch");

    return existingEl;
  }

  /**
   * Gets the target element, resolving an Accessor function if necessary.
   */
  get target(): TargetElement {
    return this.state.target;
  }

  /**
   * Sets the target element or Accessor in the RenderState instance.
   * Also performs the initial render when the target is first set.
   */
  set target(target: Target | undefined | null) {
    this.state.target = target;
    if (this.target) this.renderDOM();
  }
}
