import { beforeEach, describe, it } from "vitest";
import { falsy, setupMarkdownRendererTests, truthy } from "./setup";

describe("MarkdownRenderer Headings", () => {
  const { before, render, expects } = setupMarkdownRendererTests();

  beforeEach(before);

  it("heading level 1", () => {
    render("# heading 1");
    expects(truthy, "tagName", undefined, "h1");
  });

  it("heading level 6", () => {
    render("###### heading 1");
    expects(truthy, "tagName", undefined, "h6");
  });

  it("inline formatting", () => {
    render("# **heading 1**");
    expects(truthy, "tagName", undefined, "h1 > strong");
  });

  it("no block formatting", () => {
    render("# 1. heading");
    expects(falsy, "tagName", undefined, "h1 > ol");
    expects(falsy, "tagName", undefined, "h1 > li");
  });
});
