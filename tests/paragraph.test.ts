import { beforeEach, describe, it } from "vitest";
import {
  contains,
  equals,
  setupMarkdownRendererTests,
  startsWith,
} from "./setup";

describe("MarkdownRenderer Paragraph", () => {
  const { before, render, expects } = setupMarkdownRendererTests();

  beforeEach(before);

  it("doesn't break on empty content", () => {
    const text = "";
    render(text);
    expects(equals, "innerHTML", "");
  });

  it("single paragraph", () => {
    const text = "This is a single paragraph.";
    render(text);
    // expects(truthy, "tagName", undefined, "p");
    expects(contains, "textContent", "single paragraph", "p");
  });

  it("multiple paragraphs", () => {
    const text = "This is the first paragraph.\n\nThis is the second paragraph.";
    render(text);
    expects(equals, "children.length", 2);
    expects(contains, "children.0.textContent", "first");
    expects(contains, "children.1.textContent", "second");
  });

  it("leading spaces in paragraphs", () => {
    const text = "  This paragraph has leading spaces.";
    render(text);
    expects(startsWith, "textContent", "This", "p");
  });

  it("special characters", () => {
    const text = "Special characters: @#$%^&*()";
    render(text);
    expects(contains, "textContent", "@#$%^&*()");
  });

  it("paragraphs with hard breaks", () => {
    const text = "This paragraph contains new lines  \nwith 2 spaces before.";
    render(text);
    expects(contains, "innerHTML", "br");
  });
});
