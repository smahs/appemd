import {
  CodeBlockRenderer,
  HeadingsRenderer,
  HorizontalRuleRenderer,
  ListRenderer,
  ParagraphRenderer,
  QuoteRenderer,
  TableRenderer,
} from "./blocks.ts";
import type { SchemaSpec } from "./types.ts";

export const LezerTagMap: Record<string, string> = {
  Paragraph: "paragraph",
  ATXHeading1: "heading",
  ATXHeading2: "heading",
  ATXHeading3: "heading",
  ATXHeading4: "heading",
  ATXHeading5: "heading",
  ATXHeading6: "heading",
  SetextHeading1: "heading",
  SetextHeading2: "heading",
  CodeBlock: "code_block",
  FencedCode: "code_block",
  Blockquote: "block_quote",
  HorizontalRule: "horizontal_rule",
  BulletList: "bullet_list",
  OrderedList: "ordered_list",
  StrongEmphasis: "strong",
  Emphasis: "em",
  Strikethrough: "strikethrough",
  Subscript: "subscript",
  Superscript: "superscript",
  InlineCode: "code",
  Hardbreak: "hard_break",
  Link: "link",
};

export const schemaSpec: SchemaSpec = {
  blocks: {
    // Block nodes
    paragraph: {
      tag: "p",
      render: ParagraphRenderer,
    },
    heading: {
      tag: "h1",
      render: HeadingsRenderer,
    },
    blockquote: {
      tag: "blockquote",
      render: QuoteRenderer,
    },
    code_block: {
      tag: "pre",
      children: [{ tag: "code" }],
      render: CodeBlockRenderer,
    },
    horizontal_rule: {
      tag: "hr",
      render: HorizontalRuleRenderer,
    },
    ordered_list: {
      tag: "ol",
      class: "list-desc",
      render: ListRenderer.render,
    },
    bullet_list: {
      tag: "ul",
      render: ListRenderer.render,
    },
    list_item: {
      tag: "li",
    },
    table: {
      tag: "table",
      render: TableRenderer.render,
    },
    table_header: {
      tag: "thead",
    },
    table_body: {
      tag: "tbody",
    },
    table_row: {
      tag: "tr",
    },
    table_header_cell: {
      tag: "th",
    },
    table_cell: {
      tag: "td",
    },
  },
  marks: {
    strong: {
      tag: "strong",
    },
    em: {
      tag: "em",
    },
    strikethrough: {
      tag: "s",
    },
    subscript: {
      tag: "sub",
    },
    superscript: {
      tag: "sup",
    },
    code: {
      tag: "code",
    },
    link: {
      tag: "a",
      attributes: { rel: "noopener noreferrer", target: "_blank" },
    },
    hard_break: { tag: "br" },
  },
};
