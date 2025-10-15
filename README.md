# `appemd`

Rendering a continuously updating Markdown document in the browser can be inefficient. Traditional parsers often re-parse and/or re-render the entire document on every change, leading to poor performance and high resource usage. This is especially problematic when dealing with high-throughput streaming data, such as text generations served by LLM servers.

appemd leverages the [`@lezer/markdown`](https://github.com/lezer-parser/markdown) parser to incrementally build an AST of the document. The renderer tracks changes at the block level to avoid re-rendering large portions of the document, and optimizes inline DOM updates to prevent unnecessary reflows and repaints.

### Key Features

- **Streaming & Incremental:** Appends and parses new content efficiently, without re-processing the entire document.
- **DOM-Aware Rendering:** Applies minimal patches to the DOM, avoiding Element re-creation as much as possible.
- **High Performance:** Optimized for scenarios with high token per second (TPS) rates, such as LLM streaming.
- **Styling Agnostic:** Externally controlled styling via a declarative schema, allowing for seamless integration with any CSS framework or design system.
- **Extensible:** Easily customize rendering for specific Markdown blocks or extend the parser with custom syntax.

## Installation

Add to with your project with your favorite package manager:

```bash
npm install appemd
```

## Usage

### Rendering a Complete Document

For a one-time rendering of a Markdown document, use the static `render` method.

```ts
import { MarkdownRenderer } from 'appemd';

// 'target' can be a DOM element or a function that returns one.
const target = () => document.getElementById('target');

// 'text' is the full Markdown string, or a function that returns one.
const text = () => "# Welcome to appemd";

// Render the entire document into the 'el' element.
MarkdownRenderer.render(target, text);
```

### Incremental Rendering

To avoid duplicating memory, the document text state must be managed externally and provided to the `init` method via a getter function. The renderer will use this function to access the current text on demand.

The text state must be updated before calling the `append` method or the renderer can udpate it was initialized with a setter function argument.

```ts
import { MarkdownRenderer } from 'appemd';

// 'target' can be a DOM element or a function that returns one.
const target = () => document.getElementById('target');

// 'text' is the full Markdown string, or a function that returns one.
const text = () => "# Welcome to ";

const chunk = "appemd";

// 'setText' is an optional setter to update the text
const setText = (prev: string) => prev + chunk;

// Intantiate the renderer
const renderer = MarkdownRenderer.init(target, text, setText);

// Append the new chunk
renderer.append(chunk);
```

## Styling

A core design principle of appemd is to separate rendering logic from styling. The library uses a `SchemaSpec` to define how Markdown blocks and format marks are mapped to DOM elements, classes and attributes. This allows you to integrate appemd with your existing CSS and design system without modifying the library code.

An example schema is provided via the schemaSpec export. You can extend or replace this object to customize the output. The below code show how to replace the default code block renderer and apply custom classes to both the `pre` and `code` elements.

```ts
import type { BlockRenderFn, RendererOptions, SchemaSpec } from "appemd";
import { schemaSpec } from "appemd";

const CodeBlockRenderer: BlockRenderFn = (state, block) => {
  // ...
};

const { blocks, marks } = schemaSpec;
const mySpec: SchemaSpec = {
  blocks: {
    ...blocks,
    code_block: {
      ...schemaSpec.blocks.code_block,
      class: "my-pre-class",
      children: [{ tag: "code", class: "my-code-class" }],
      render: CodeBlockRenderer,
    },
  }
};

const options: RendererOptions = { schema: mySpec };
const renderer = MarkdownRenderer.init(target, text, setText, options);
```

## Extensibility
Customization may be required in some scenarios:

1. **Custom Block Rendering**: To render a supported block node differently (e.g., add a "copy code" button to code blocks), implement the `BlockRenderFn` type and replace the render prop of `code_block` in the schema.

2. **Extending Syntax Support**: By default, the CommonMark and GFM parsers are used from `@lezer/markdown`. To extend the syntax (e.g., custom directives like `:::note`), you need to:
* Create a custom plugin for `@lezer/markdown` by extending `MarkdownParser`.
* Provide this parser to the renderer constructor using `RendererOptions.parser`.
* Update the `SchemaSpec` to define a renderer for your new syntax node.

## Contributing

Feel free to submit issues and pull requests on the [repository](https://github.com/smahs/appemd/issues).
