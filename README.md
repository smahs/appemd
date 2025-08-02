## `appemd`

An incremental DOM renderer for markdown using @lezer/markdown AST.

It does not render characters or words in a true streaming manner—this is not possible due to the syntax of Markdown. Instead, it rerenders only the last leaf node's inline text content, which for larger documents can consume significantly fewer resources than rerendering the entire document on every update.

## Installation

```bash
npm install appemd
```

## Usage

Markdown content can be rendered either entirely in one pass or appended incrementally. The latter is particularly useful for efficiently rendering chunks of text instead of parsing and rendering the entire document repeatedly. An example use case is an SSE stream response from a language model server to a generation request.

### Single Pass Rendering

The simplest way to render a complete Markdown document:

```js
// el: a DOM element (usually a <div>)
// content: markdown content string; can be string or () => string
MarkdownRenderer.render(el, content);
```

### Incremental Rendering

Initialize an instance of MarkdownRenderer and use the append method to update the AST and render to the DOM:

```js
// el: a DOM element (usually a <div>)
// content: initially available text managed by the consumer, must be () => string
// setContent: optional callback to update content with chunks after DOM updates
renderer = MarkdownRenderer.init(el, content, setContent);
renderer.append(chunk);
```

## Scrolling Behavior

As new content is appended to the DOM, the library can optionally scroll down to ensure the new content remains visible. To allow users to manually control scrolling, an offset from the bottom of the scroll container can be configured. The default offset is 48 pixels.

**Note**: Certain block elements (like headings) may interfere with auto-scrolling if the sum of their margin-top and line-height exceeds the configured threshold. Future versions will support per-block scrolling configuration.

```js
// offset: pixels from the bottom of scrolling container beyond which auto scrolling will stop
renderer = MarkdownRenderer.init(el, content, setContent, { scroll: true, offset: 48 });
```

## Schema

A core design principle of this module is to separate CSS and DOM configuration from the JavaScript logic. An example schema is provided via the schemaSpec export. Defining CSS classes and DOM attributes should suffice for most common use cases.

Customization may be required in some scenarios:

1. Custom Block Rendering: To render a supported block node differently (e.g., add a "copy code" button to code blocks), implement the `BlockRenderer` type and replace the render prop of `code_block` in the schema.

2. Extended Syntax Support: By default, `commonmark` and `gfm` syntax are supported by @lezer/markdown. To extend syntax support, write a plugin for @lezer/markdown along with a custom block renderer.

## Limitations

The library renders what `@lezer/markdown` can parse (with a few exceptions such as `setext` headings and HTML blocks). HTML blocks with nested markdown content would require a custom plugin for `@lezer/markdown` and a custom renderer for `appemd`.

## Contributing

Feel free to submit issues and pull requests on the [repository](https://github.com/smahs/appemd/issues).
