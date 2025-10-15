import { beforeEach, describe, it } from "vitest";

import { contains, equals, setupMarkdownRendererTests } from "./setup";

describe("MarkdownRenderer Inline", () => {
  const { before, render, expects } = setupMarkdownRendererTests();

  beforeEach(before);

  it("bold inline text", () => {
    render("**bold text**");
    expects(equals, "textContent", "bold text", "strong");
  });

  it("emphasis inline text", () => {
    render("*emphasized text*");
    expects(equals, "textContent", "emphasized text", "em");
  });

  it("strikethrough inline text", () => {
    render("~~strikethrough text~~");
    expects(equals, "textContent", "strikethrough text", "s");
  });

  it("subscript inline text", () => {
    render("H~2~O");
    expects(equals, "textContent", "2", "sub");
  });

  it("superscript inline text", () => {
    render("E=mc^2^");
    expects(equals, "textContent", "2", "sup");
  });

  it("link inline text without title and label", () => {
    const url = "https://example.com";
    render(`[${url}]`);
    expects(contains, "href", url, "a");
    expects(equals, "textContent", url, "a");
  });

  it("link inline text without title", () => {
    const url = "https://example.com";
    render(`[link](${url})`);
    expects(contains, "href", url, "a");
    expects(equals, "textContent", "link", "a");
  });

  it("link inline text with title", () => {
    render('[link](https://example.com "Title")');
    expects(equals, "title", "Title", "a");
  });

  it("link inline text with formatted title", () => {
    render('[**link** _one_](https://example.com "Title")');
    expects(equals, "title", "Title", "a");
    expects(equals, "textContent", "link", "strong");
  });

  it("inline code", () => {
    render("`inline code`");
    expects(equals, "textContent", "inline code", "code");
  });

  it("empty marks", () => {
    render("^^");
    expects(equals, "textContent", "^^");
  });

  it("incomplete marks", () => {
    const text = "_unclosed emphasis";
    render(text);
    expects(contains, "innerHTML", text);
  });

  it("nested inline markup", () => {
    render("**bold ^sup^ bold**");
    expects(equals, "textContent", "sup", "sup");
    expects(equals, "textContent", "bold sup bold", "strong");
  });

  it("escaped characters", () => {
    const text = "*not emphasized*";
    render(`\\${text}`);
    expects(contains, "innerHTML", text);
  });

  it("hard breaks", () => {
    const text = "bold  \nthis too";
    render(`**${text}**`);
    expects(equals, "children.0.tagName", "BR", "strong");
  });

  it("mixed and nested inline markup", () => {
    render("*emphasized* _**bold _emphasized_ bold**_");
    expects(equals, "textContent", "emphasized", "em");
    expects(equals, "textContent", "bold emphasized bold", "strong");
  });

  it("very long inline markup", () => {
    const longText = "a".repeat(1000);
    const text = `**${longText}**`;
    render(text);
    expects(contains, "innerHTML", longText);
  });

  it("special characters within inline markup", () => {
    const text = "**bold & < > text**";
    render(text);
    expects(equals, "textContent", "bold & < > text", "strong");
  });

  it("complex inline text", () => {
    const text =
      "This is **bold**, *emphasized*, ~~strikethrough~~, H~2~O, E=mc^2^, [link](https://example.com), and `inline code`.";
    render(text);
    const expected = {
      strong: "bold",
      em: "emphasized",
      s: "strikethrough",
      sub: "2",
      sup: "2",
    };
    for (const [tag, content] of Object.entries(expected))
      expects(equals, "textContent", content, tag);
    expects(contains, "href", "https://example.com", "a");
  });
});
