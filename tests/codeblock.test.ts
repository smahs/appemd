import { beforeEach, describe, it } from "vitest";
import { contains, setupMarkdownRendererTests, truthy } from "./setup";

describe("MarkdownRenderer Codeblock", () => {
  const { before, render, expects } = setupMarkdownRendererTests();

  beforeEach(before);

  it("indented code block", () => {
    render("    code\n    text");
    expects(truthy, "tagName", undefined, "code");
  });

  it("fenced code block", () => {
    render("```\ntext\n```");
    expects(contains, "textContent", "text", "code");
  });

  it("fenced code block on same line", () => {
    render("```text```");
    expects(contains, "textContent", "text", "p > code");
  });

  it("fenced code block with info", () => {
    render("```js\ntext\n```");
    expects(contains, "className", "language-js", "pre");
    expects(contains, "textContent", "text");
  });
});
