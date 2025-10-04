import type { SyntaxNode } from "@lezer/common";
import { renderInline } from "./inline";
import type { BlockRenderer, RenderState } from "./types";
import {
  createBlock,
  getChildren,
  getNonInstChildren,
  renderBlock,
} from "./utils";

export const HorizontalRuleRenderer = (state: RenderState) => {
  return state.dom.target?.appendChild(
    createBlock(state.schema, "horizontal_rule"),
  );
};

export const ParagraphRenderer: BlockRenderer = (
  state: RenderState,
  node: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  const createP = () => {
    p = createBlock(state.schema, "paragraph");
    state.dom.addOrReplaceInDOM(p, child, parent);
    return p;
  };

  const block = state.getBlockElement();
  let p: HTMLParagraphElement | undefined;
  if (parent) {
    if (child instanceof HTMLParagraphElement) p = child;
    else {
      p = createP();
      state.dom.addOrReplaceInDOM(p, child, parent);
    }
  } else {
    if (block instanceof HTMLParagraphElement) p = block;
    else {
      p = createP();
      state.dom.addOrReplaceInDOM(p, block);
    }
  }

  renderInline(state, node, p);
};

export const HeadingsRenderer = (state: RenderState, block: SyntaxNode) => {
  const level = Number.parseInt(block.name.at(-1)!, 10);

  let h: HTMLHeadingElement | undefined;
  const blockEl = state.getBlockElement();
  if (blockEl instanceof HTMLHeadingElement) {
    h = blockEl;
  } else {
    h = createBlock(state.schema, "heading", level);
    state.dom.addOrReplaceInDOM(h, blockEl);
  }

  renderInline(state, block, h, level + 1);
};

export const QuoteRenderer = (state: RenderState, block: SyntaxNode) => {
  const children = getNonInstChildren(block);

  let quote: HTMLQuoteElement | undefined;
  const blockEl = state.getBlockElement();
  if (blockEl instanceof HTMLQuoteElement) {
    quote = blockEl;
  } else {
    quote = createBlock(state.schema, "blockquote");
    state.dom.addOrReplaceInDOM(quote, blockEl);
  }

  const lastDOMIndex = (quote.children.length || 1) - 1;
  for (let i = lastDOMIndex; i < children.length; i++) {
    renderBlock(state, children[i], quote, quote.children[i]);
  }
};

export const CodeBlockRenderer = (
  state: RenderState,
  block: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  const children = getChildren(block);

  const infoNode = children.find((n) => n.type.name === "CodeInfo");
  const info = infoNode
    ? state.text.substring(infoNode.from, infoNode.to)
    : undefined;

  const codeNodes = children.filter((n) => n.type.name === "CodeText");
  // const code = codeNodes.reduce((acc, node) => {
  //   const code = state.text.substring(node.from, node.to);
  //   return acc + code;
  // }, "");

  if (codeNodes.length === 0) return;

  let pre: HTMLPreElement;
  const current = state.getBlockElement();
  const el = parent ? child : current;
  if (el instanceof HTMLPreElement) {
    pre = el as HTMLPreElement;
  } else {
    pre = createBlock(state.schema, "code_block");
    if (info) pre.classList.add(`language-${info}`);

    if (parent) state.dom.addOrReplaceInDOM(pre, child, parent);
    else state.dom.addOrReplaceInDOM(pre, current);

    state.dom.scrollOffset = 48;
  }

  const codeEl = pre.querySelector("code");
  if (codeEl) {
    const lastDOMIndex = (codeEl?.childNodes.length || 1) - 1;
    for (let i = lastDOMIndex; i < codeNodes.length; i++) {
      const codeNode = codeNodes[i];
      const code = state.text.substring(codeNode.from, codeNode.to);
      const text = document.createTextNode(code);
      state.dom.addOrReplaceInDOM(text, codeEl.childNodes[i], codeEl);
    }
  }
};

export const ListRenderer = {
  renderListItem: (state: RenderState, node: SyntaxNode, el: HTMLLIElement) => {
    const children = getNonInstChildren(node);
    const lastDOMIndex = (el?.children.length || 1) - 1;
    for (let i = lastDOMIndex; i < children.length; i++) {
      const node = children[i];

      // Move position forward to remove the markers, if at the start of a list item
      state.checkpoint.position = Math.max(state.checkpoint.position, node.from);

      renderBlock(state, node, el, el?.children[i]);
    }
  },
  render: (
    state: RenderState,
    block: SyntaxNode,
    parent?: Element,
    child?: Element,
  ) => {
    const isOrdered = block.name === "OrderedList";

    let list: HTMLOListElement | HTMLUListElement;
    const current = state.getBlockElement();
    const el = parent ? child : current;
    if (el instanceof HTMLOListElement || el instanceof HTMLUListElement) {
      list = el as HTMLOListElement | HTMLUListElement;
    } else {
      list = createBlock(
        state.schema,
        isOrdered ? "ordered_list" : "bullet_list",
      );
      if (parent) state.dom.addOrReplaceInDOM(list, child, parent);
      else state.dom.addOrReplaceInDOM(list, current);
    }

    const children = getNonInstChildren(block);

    const start = list.getAttribute("start");
    if (list instanceof HTMLOListElement && !start) {
      const leaf = children.at(0);
      if (leaf) {
        const leafText = state.text.substring(leaf.from, leaf.to);
        const numbers = leafText.match(/^\d+/);
        list.setAttribute("start", numbers?.at(0) ?? "1");
      }
    }

    const lastDOMIndex = (list.children.length || 1) - 1;
    for (let i = lastDOMIndex; i < children.length; i++) {
      const leaf = children[i];
      let liEl = list.children.item(i);
      if (!(liEl instanceof HTMLLIElement)) {
        const newLi = createBlock(state.schema, "list_item");
        state.dom.addOrReplaceInDOM(newLi, liEl, list);
        liEl = newLi;
      }
      ListRenderer.renderListItem(state, leaf, liEl as HTMLLIElement);
    }
  },
};

export const TableRenderer = {
  renderRow: (
    state: RenderState,
    node: SyntaxNode,
    el: HTMLTableRowElement,
    isHeader = false,
  ) => {
    const children = getNonInstChildren(node);
    if (children.length === 0) return;

    const cells = children.filter((n) => n.name === "TableCell");

    const lastDOMIndex = (el?.children.length || 1) - 1;
    for (let i = lastDOMIndex; i < cells.length; i++) {
      const cell = cells[i];
      const iChild = el.children[i];

      let cellEl: HTMLTableCellElement | undefined;
      if (iChild instanceof HTMLTableCellElement) {
        cellEl = iChild;
      } else {
        cellEl = createBlock(
          state.schema,
          isHeader ? "table_header_cell" : "table_cell",
        );
        state.dom.addOrReplaceInDOM(cellEl, iChild, el);
      }

      // GFM Table Extension: table cell can only contain inline text
      // cellEl.innerHTML = "";
      renderInline(state, cell, cellEl);
    }
  },

  render: (
    state: RenderState,
    block: SyntaxNode,
    parent?: Element,
    child?: Element,
  ) => {
    let table: HTMLTableElement;
    const blockEl = state.getBlockElement();
    const el = parent ? child : blockEl;
    if (el instanceof HTMLTableElement) {
      table = el as HTMLTableElement;
    } else {
      table = createBlock(state.schema, "table");
      if (parent) state.dom.addOrReplaceInDOM(table, child, parent);
      else state.dom.addOrReplaceInDOM(table, blockEl);
    }

    const children = getNonInstChildren(block);
    const rows = children.filter((n) => n.name === "TableRow");

    let bodyEl = table.querySelector("tbody");
    let rowEl: HTMLTableRowElement | undefined | null;

    // Table header appears before any table body rows start
    if (!bodyEl) {
      const header = children.find((n) => n.name === "TableHeader");
      if (!header) return;

      let headEl = table.querySelector("thead");
      if (!headEl) {
        headEl = createBlock(state.schema, "table_header");
        state.dom.addOrReplaceInDOM(headEl, undefined, table);
      }

      rowEl = headEl.querySelector("tr");
      if (!rowEl) {
        rowEl = createBlock(state.schema, "table_row");
        state.dom.addOrReplaceInDOM(rowEl, undefined, headEl);
      }

      TableRenderer.renderRow(state, header, rowEl, true);
      if (rows.length === 0) return;
    }

    if (!bodyEl) {
      bodyEl = createBlock(state.schema, "table_body");
      state.dom.addOrReplaceInDOM(bodyEl, undefined, table);
    }

    const lastRowIndex = (bodyEl.children.length || 1) - 1;
    for (let i = lastRowIndex; i < rows.length; i++) {
      const el = bodyEl.children.item(i);
      if (el instanceof HTMLTableRowElement) {
        rowEl = el;
      } else {
        const newRow = createBlock(state.schema, "table_row");
        state.dom.addOrReplaceInDOM(newRow, el, bodyEl);
        rowEl = newRow;
      }

      TableRenderer.renderRow(state, rows[i], rowEl);
    }
  },
};
