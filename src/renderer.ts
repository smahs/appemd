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
  BlockCheckpoint,
  Checkpoint,
  DOMState,
  RendererOptions,
  RenderState,
  SchemaSpec,
  ScrollConfig,
  Setter,
  Target,
  TargetElement,
} from "./types.ts";
import { getChildren, renderBlock } from "./utils.ts";

const defaultParser = (): MarkdownParser => {
  return cmParser.configure([GFM, Subscript, Superscript, Emoji, Autolink]);
};

const defaultScrollConfig: ScrollConfig = { enabled: false, offset: 48 };

const scrollParent = (el?: HTMLElement | null): HTMLElement | undefined => {
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
 * Provides DOM interactions, including holding reference to the target element,
 * adding or replacing block-level elements and scrolling behavior (if configured).
 */
class DOMTargetState implements DOMState {
  /**
   * The index of the current block being rendered.
   */
  // block: number = 0;

  /**
   * Any additional offset to be used for determining whether to
   * scroll after an append operation.
   */
  scrollOffset = 0;

  private _target: Target;
  private scrollParent: TargetElement;
  private scrollConfig: ScrollConfig;

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
   * Sets the target element or Accessor and sets the scroll parent.
   */
  set target(target: Target | undefined | null) {
    this._target = target;
    if (target instanceof HTMLElement) this.scrollParent = scrollParent(target);
  }

  /**
   * Initializes a new DOMTargetState with optional scroll configuration.
   *
   * @param scroll - Optional scroll configuration object
   */
  constructor(scroll?: RendererOptions["scroll"]) {
    this.scrollConfig = Object.assign(defaultScrollConfig, scroll);
  }

  /**
   * Adds or replaces an element in the DOM.
   *
   * @param newEl - The new element to add or replace with
   * @param oldEl - The existing element to replace, if any
   * @param parent - The parent element to append to
   */
  addOrReplaceInDOM(
    newEl: Node,
    oldEl?: Node | null,
    parent: TargetElement = this.target,
  ) {
    let target: TargetElement;
    if (oldEl?.parentElement) target = oldEl.parentElement;
    else target = parent;
    if (!target) throw new Error("A suitable parent element could not be found");

    oldEl ? target.replaceChild(newEl, oldEl) : target.appendChild(newEl);
  }

  scroll() {
    if (!this.scrollConfig.enabled) return;

    const el = this.scrollParent;
    if (!el) return;

    const top = el.scrollHeight;
    const fromBottom = top - (el.scrollTop + el.clientHeight);
    if (fromBottom <= this.scrollOffset + this.scrollConfig.offset)
      el?.scrollTo({ top, behavior: "instant" });
  }
}

export class RendererCheckpoint implements Checkpoint {
  block?: BlockCheckpoint;
  position: number;

  constructor() {
    this.position = 0;
  }

  setBlock(block: BlockCheckpoint) {
    this.block = block;
  }
}

/**
 * A Markdown renderer that generates DOM elements from a parsed AST tree.
 */
export class MarkdownRenderer {
  private parser: MarkdownParser;
  private schema: SchemaSpec;
  private domState: DOMTargetState;
  private checkpoint: RendererCheckpoint;

  private tree: Tree;
  private fragments: readonly TreeFragment[];
  private _text: string | Accessor<string>;
  private setText?: Setter<string>;

  get text(): string {
    return this._text instanceof Function ? this._text() : this._text;
  }

  get state(): RenderState {
    return {
      schema: this.schema,
      dom: this.domState,
      text: this.text,
      checkpoint: this.checkpoint,
      getBlockElement: this.getBlockElement,
    };
  }

  set target(target: Target) {
    this.domState.target = target;
    this.renderDOM();
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
    this.domState = new DOMTargetState(options?.scroll);
    this.checkpoint = new RendererCheckpoint();
    this.getBlockElement = this.getBlockElement.bind(this);
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
    renderer.domState.target = target;
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

    if (this.domState.target) {
      this.renderDOM();
      this.domState.scroll();
      this.domState.scrollOffset = 0;
    }
  }

  private renderDOM(): void {
    if (!this.domState.target) return;

    const children = getChildren(this.tree.cursor().node);
    if (!children.length) return;

    let blockIndex = this.checkpoint.block?.index ?? -1;

    // console.log(blockIndex, children.length, { ...this.checkpoint.block });
    while (blockIndex > children.length) {
      const el = this.getBlockElement(blockIndex);
      if (el) this.domState.target.removeChild(el);
      blockIndex -= 1;
    }

    if (blockIndex < 0) blockIndex = 0;

    for (let i = blockIndex; i < children.length; i++) {
      const block = children[i];
      this.checkpoint.setBlock(this.checkpointBlock(i, block));
      renderBlock(this.state, block);
    }
  }

  private checkpointBlock(index: number, node: SyntaxNode): BlockCheckpoint {
    return { index, from: node.from, to: node.to, name: node.name };
  }

  /**
   * Gets the child element by index from the target element.
   *
   * @param index - The index of the block element to retrieve
   * @returns The block element or undefined
   */
  getBlockElement(index?: number): Element | undefined {
    index = index ?? this.checkpoint.block?.index ?? 0;
    const existingEl = this.domState.target?.children[index];
    if (existingEl && !(existingEl instanceof Element))
      throw new Error("The block element type mismatch");

    return existingEl;
  }
}
