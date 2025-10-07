import type { SyntaxNode } from "@lezer/common";
import { renderInline } from "./inline";
import type { BlockRenderer, RenderContext } from "./types";
import {
  createBlock,
  getChildren,
  getNonInstChildren,
  renderBlock,
} from "./utils";

export const HorizontalRuleRenderer = (context: RenderContext) => {
  const hr = createBlock(context.schema, "horizontal_rule");
  context.addOrReplaceInDOM(hr, context.getBlockElement());
};

export const ParagraphRenderer: BlockRenderer = (
  context: RenderContext,
  node: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  const createP = () => {
    p = createBlock(context.schema, "paragraph");
    context.addOrReplaceInDOM(p, child, parent);
    return p;
  };

  const block = context.getBlockElement();
  let p: HTMLParagraphElement | undefined;

  if (parent && child instanceof HTMLParagraphElement) p = child;
  else if (block instanceof HTMLParagraphElement) p = block;
  else p = createP();

  renderInline(context, node, p);
};

export const HeadingsRenderer = (context: RenderContext, block: SyntaxNode) => {
  const nlevel = Number.parseInt(block.name.slice(-1), 10);
  const el = context.getBlockElement();
  const elevel = el ? Number.parseInt(el.tagName.slice(-1), 10) : -1;

  let h: HTMLHeadingElement | undefined;
  if (el instanceof HTMLHeadingElement && elevel === nlevel) {
    h = el;
  } else {
    h = createBlock(context.schema, "heading", nlevel);
    context.addOrReplaceInDOM(h, el);
  }

  renderInline(context, block, h);
};

export const QuoteRenderer = (context: RenderContext, block: SyntaxNode) => {
  const children = getNonInstChildren(block);

  let quote: HTMLQuoteElement | undefined;
  const blockEl = context.getBlockElement();
  if (blockEl instanceof HTMLQuoteElement) {
    quote = blockEl;
  } else {
    quote = createBlock(context.schema, "blockquote");
    context.addOrReplaceInDOM(quote, blockEl);
  }

  const lastDOMIndex = (quote.children.length || 1) - 1;
  for (let i = lastDOMIndex; i < children.length; i++) {
    renderBlock(context, children[i], quote, quote.children[i]);
  }
};

export const CodeBlockRenderer = (
  context: RenderContext,
  block: SyntaxNode,
  parent?: Element,
  child?: Element,
) => {
  const children = getChildren(block);

  const infoNode = children.find((n) => n.type.name === "CodeInfo");
  const info = infoNode
    ? context.text.substring(infoNode.from, infoNode.to)
    : undefined;

  const codeNodes = children.filter((n) => n.type.name === "CodeText");
  if (codeNodes.length === 0) return;

  let pre: HTMLPreElement;
  const current = context.getBlockElement();
  const el = parent ? child : current;
  if (el instanceof HTMLPreElement) {
    pre = el as HTMLPreElement;
  } else {
    pre = createBlock(context.schema, "code_block");
    if (info) pre.classList.add(`language-${info}`);

    if (parent) context.addOrReplaceInDOM(pre, child, parent);
    else context.addOrReplaceInDOM(pre, current);

    // context.scrollOffset = 48;
  }

  const codeEl = pre.querySelector("code");
  if (codeEl) {
    const lastDOMIndex = (codeEl?.childNodes.length || 1) - 1;
    for (let i = lastDOMIndex; i < codeNodes.length; i++) {
      const codeNode = codeNodes[i];
      const code = context.text.substring(codeNode.from, codeNode.to);
      const text = document.createTextNode(code);
      context.addOrReplaceInDOM(text, codeEl.childNodes[i], codeEl);
    }
  }
};

export const ListRenderer = {
  renderListItem: (
    context: RenderContext,
    node: SyntaxNode,
    el: HTMLLIElement,
  ) => {
    const children = getNonInstChildren(node);
    const lastDOMIndex = (el?.children.length || 1) - 1;
    for (let i = lastDOMIndex; i < children.length; i++) {
      renderBlock(context, children[i], el, el?.children[i]);
    }
  },
  render: (
    context: RenderContext,
    block: SyntaxNode,
    parent?: Element,
    child?: Element,
  ) => {
    const isOrdered = block.name === "OrderedList";

    let list: HTMLOListElement | HTMLUListElement;
    const current = context.getBlockElement();
    const el = parent ? child : current;
    if (el instanceof HTMLOListElement || el instanceof HTMLUListElement) {
      list = el as HTMLOListElement | HTMLUListElement;
    } else {
      list = createBlock(
        context.schema,
        isOrdered ? "ordered_list" : "bullet_list",
      );
      if (parent) context.addOrReplaceInDOM(list, child, parent);
      else context.addOrReplaceInDOM(list, current);
    }

    const children = getNonInstChildren(block);

    const start = list.getAttribute("start");
    if (list instanceof HTMLOListElement && !start) {
      const leaf = children[0];
      if (leaf) {
        const leafText = context.text.substring(leaf.from, leaf.to);
        const numbers = leafText.match(/^\d+/);
        list.setAttribute("start", numbers?.[0] ?? "1");
      }
    }

    const domIndex = (list.children.length || 1) - 1;
    for (let i = domIndex; i < children.length; i++) {
      const leaf = children[i];
      let liEl = list.children.item(i);
      if (!(liEl instanceof HTMLLIElement)) {
        const newLi = createBlock(context.schema, "list_item");
        context.addOrReplaceInDOM(newLi, liEl, list);
        liEl = newLi;
      }
      ListRenderer.renderListItem(context, leaf, liEl as HTMLLIElement);
    }
  },
};

export const TableRenderer = {
  renderRow: (
    context: RenderContext,
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
          context.schema,
          isHeader ? "table_header_cell" : "table_cell",
        );
        context.addOrReplaceInDOM(cellEl, iChild, el);
      }

      // GFM Table Extension: table cell can only contain inline text
      // cellEl.innerHTML = "";
      renderInline(context, cell, cellEl);
    }
  },

  render: (
    context: RenderContext,
    block: SyntaxNode,
    parent?: Element,
    child?: Element,
  ) => {
    let table: HTMLTableElement;
    const blockEl = context.getBlockElement();
    const el = parent ? child : blockEl;
    if (el instanceof HTMLTableElement) {
      table = el as HTMLTableElement;
    } else {
      table = createBlock(context.schema, "table");
      if (parent) context.addOrReplaceInDOM(table, child, parent);
      else context.addOrReplaceInDOM(table, blockEl);
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
        headEl = createBlock(context.schema, "table_header");
        context.addOrReplaceInDOM(headEl, undefined, table);
      }

      rowEl = headEl.querySelector("tr");
      if (!rowEl) {
        rowEl = createBlock(context.schema, "table_row");
        context.addOrReplaceInDOM(rowEl, undefined, headEl);
      }

      TableRenderer.renderRow(context, header, rowEl, true);
      if (rows.length === 0) return;
    }

    if (!bodyEl) {
      bodyEl = createBlock(context.schema, "table_body");
      context.addOrReplaceInDOM(bodyEl, undefined, table);
    }

    const lastRowIndex = (bodyEl.children.length || 1) - 1;
    for (let i = lastRowIndex; i < rows.length; i++) {
      const el = bodyEl.children.item(i);
      if (el instanceof HTMLTableRowElement) {
        rowEl = el;
      } else {
        const newRow = createBlock(context.schema, "table_row");
        context.addOrReplaceInDOM(newRow, el, bodyEl);
        rowEl = newRow;
      }

      TableRenderer.renderRow(context, rows[i], rowEl);
    }
  },
};
