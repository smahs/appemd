import type { Tree } from "@lezer/common";
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
  DOMState,
  RendererOptions,
  RenderState,
  SchemaSpec,
  ScrollConfig,
  Setter,
  Target,
  TargetElement,
} from "./types.ts";
import { getChildren, renderBlock, scrollParent } from "./utils.ts";

const defaultParser = (): MarkdownParser => {
  return cmParser.configure([GFM, Subscript, Superscript, Emoji, Autolink]);
};

const defaultScrollConfig: ScrollConfig = { enabled: false, offset: 48 };

/**
 * Provides DOM interactions, including holding reference to the target element,
 * adding or replacing block-level elements and scrolling behavior (if configured).
 */
class DOMTargetState implements DOMState {
  /**
   * The index of the current block being rendered.
   */
  block: number = 0;

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

  /**
   * Gets the element by index from the target element.
   *
   * @param index - The index of the block element to retrieve
   * @returns The block element or undefined
   */
  getBlockElement(index: number = this.block): Element | undefined {
    const existingEl = this.target?.children[index];
    if (existingEl && !(existingEl instanceof Element))
      throw new Error("The block element type mismatch");
    return existingEl;
  }
}

/**
 * A Markdown renderer that generates DOM elements from a parsed AST tree.
 */
export class MarkdownRenderer {
  private parser: MarkdownParser;
  private schema: SchemaSpec;
  private domState: DOMTargetState;

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
    this.domState = new DOMTargetState(options?.scroll);
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

    if (target) {
      renderer.domState.target = target;
      renderer.renderDOM();
    }

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

    if (this.domState.block >= children.length) {
      const el = this.domState.getBlockElement();
      if (el) this.domState.target.removeChild(el);
      this.domState.block = children.length - 1;
    }

    for (let i = this.domState.block; i < children.length; i++) {
      const block = children[i];
      this.domState.block = i;
      renderBlock(this.state, block);
    }
  }
}
