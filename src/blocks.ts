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
  block: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  const rendered = renderInline(state, block);
  if (parent && child instanceof HTMLParagraphElement) {
    child.innerHTML = "";
    child.appendChild(rendered);
    return;
  }

  let p = state.dom.getBlockElement();
  if (p && p instanceof HTMLParagraphElement) {
    p.innerHTML = "";
    p.appendChild(rendered);
    return;
  }

  p = createBlock(state.schema, "paragraph");
  p.appendChild(rendered);

  if (parent) {
    state.dom.addOrReplaceInDOM(p, child, parent);
    return;
  }

  state.dom.addOrReplaceInDOM(p, state.dom.getBlockElement());
};

export const HeadingsRenderer = (state: RenderState, block: SyntaxNode) => {
  const level = Number.parseInt(block.name.at(-1)!, 10);

  let h: HTMLHeadingElement | undefined;
  const el = state.dom.getBlockElement();
  if (el instanceof HTMLHeadingElement) {
    h = el;
  } else {
    h = createBlock(state.schema, "heading", level);
    state.dom.addOrReplaceInDOM(h, el);
  }

  h.innerHTML = "";
  const offset = block.from + level + 1;
  const text = state.text.substring(offset, block.to);
  h.appendChild(renderInline(state, block, text, offset));
};

export const QuoteRenderer = (state: RenderState, block: SyntaxNode) => {
  const children = getNonInstChildren(block);

  let quote: HTMLQuoteElement | undefined;
  const el = state.dom.getBlockElement();
  if (el instanceof HTMLQuoteElement) {
    quote = el;
  } else {
    quote = createBlock(state.schema, "blockquote");
    state.dom.addOrReplaceInDOM(quote, el);
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
  const current = state.dom.getBlockElement();
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
      renderBlock(state, children[i], el, el?.children[i]);
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
    const current = state.dom.getBlockElement();
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
      const leaf = createBlock(
        state.schema,
        isHeader ? "table_header_cell" : "table_cell",
      ) as HTMLTableCellElement;
      el.appendChild(leaf);

      renderBlock(state, cells[i], leaf);
    }
  },
  render: (
    state: RenderState,
    block: SyntaxNode,
    parent?: Element,
    child?: Element,
  ) => {
    let table: HTMLTableElement;
    const current = state.dom.getBlockElement();
    const el = parent ? child : current;
    if (el instanceof HTMLTableElement) {
      table = el as HTMLTableElement;
    } else {
      table = createBlock(state.schema, "table");
      if (parent) state.dom.addOrReplaceInDOM(table, child, parent);
      else state.dom.addOrReplaceInDOM(table, current);
    }

    const children = getNonInstChildren(block);
    if (children.length === 0) return table;

    const header = children.find((n) => n.name === "TableHeader");
    const rows = children.filter((n) => n.name === "TableRow");

    let rowEl: HTMLTableRowElement | undefined | null;

    if (header) {
      let headEl = table.querySelector("thead");
      if (!headEl) {
        headEl = createBlock(state.schema, "table_header");
        state.dom.addOrReplaceInDOM(headEl, undefined, table);
        //table.prepend(thead);
      }

      rowEl = headEl.querySelector("tr");
      if (!rowEl) {
        rowEl = createBlock(state.schema, "table_row");
        state.dom.addOrReplaceInDOM(rowEl, undefined, headEl);
      }

      TableRenderer.renderRow(state, header, rowEl as HTMLTableRowElement, true);
    }

    let bodyEl: HTMLTableSectionElement | undefined | null;
    if (!bodyEl) {
      bodyEl = table.querySelector("tbody")!;
      if (!bodyEl) {
        bodyEl = createBlock(state.schema, "table_body");
        state.dom.addOrReplaceInDOM(bodyEl, undefined, table);
      }
    }

    const lastRowDOMIndex = (rows.length || 1) - 1;
    for (let i = lastRowDOMIndex; i < rows.length; i++) {
      const el = bodyEl.children.item(i);
      if (el instanceof HTMLTableRowElement) {
        rowEl = el;
      } else {
        const newRow = createBlock(state.schema, "table_row");
        state.dom.addOrReplaceInDOM(newRow, el, table);
        rowEl = newRow;
      }

      TableRenderer.renderRow(state, rows[i], rowEl);
    }
  },
};
