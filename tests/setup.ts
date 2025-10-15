import get from "just-safe-get";
import { expect, vi } from "vitest";
import { MarkdownRenderer } from "../src";
import type { Getter, Setter } from "../src/types.ts";

type Assertion = (el: HTMLElement, prop: string, value?: unknown) => void;

export const contains: Assertion = (el, prop, value) =>
  expect(get(el, prop)).toContain(value);

export const equals: Assertion = (el, prop, value) =>
  expect(get(el, prop)).toEqual(value);

export const startsWith: Assertion = (el, prop, value) =>
  expect(get(el, prop).startsWith(value)).toBeTruthy();

export const truthy: Assertion = (el, prop) => expect(get(el, prop)).toBeTruthy();

export const falsy: Assertion = (el, prop) => expect(get(el, prop)).toBeFalsy();

vi.mock(import("../src/utils"), async (importOriginal) => {
  const utils = await importOriginal();
  return {
    ...utils,

    // Disable scrolling for testing
    scrollParent: () => undefined,
  };
});

export const setupMarkdownRendererTests = () => {
  let _text = "";
  const text: Getter<string> = () => _text;
  const setText: Setter<string> = (
    value: string | ((prev: string) => string),
  ) => {
    if (typeof value === "function") {
      _text = value(_text);
    } else {
      _text = value;
    }
  };

  let _target = document.createElement("div");
  const target: Getter<HTMLDivElement> = () => _target;
  const setTarget: Setter<HTMLDivElement> = (
    value: HTMLDivElement | ((_: HTMLDivElement) => HTMLDivElement),
  ) => {
    if (typeof value === "function") {
      _target = value(_target);
    } else {
      _target = value;
    }
  };
  const render = (s: string) => {
    setText(s);
    MarkdownRenderer.render(target, text);
  };

  const before = () => {
    setText("");
    setTarget(document.createElement("div"));
  };

  const expects = (
    assert: Assertion,
    prop: string,
    value?: unknown,
    tag?: string,
  ) => {
    const el = tag ? (target().querySelector(tag) as HTMLElement) : target();
    assert(el, prop, value);
  };

  return { expects, render, before };
};
