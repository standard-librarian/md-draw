# md-draw

`md-draw` is a standalone `tldraw` SDK app for importing structured text into editable native canvas content.

It supports:

- Mermaid flowcharts
- Mermaid gantt charts
- Markdown tables
- Markdown text

Imported content lands on slide-shaped canvases inside the app, so you can organize diagrams and notes as a lightweight deck instead of a single infinite board.

## Why this repo exists

This project is intentionally separate from the `tldraw` monorepo. It uses the public SDK and keeps the importer logic in a reusable local package, so it can evolve independently and be pushed, shared, or published without carrying a fork of `tldraw`.

## Features

- Standalone slide-based `tldraw` app built with Vite, React, TypeScript, and `pnpm`
- Reusable importer package under `packages/importer`
- Multiline Mermaid flowchart parsing
- Mermaid gantt layout with measured spacing and bound dependency arrows
- Markdown tables rendered as one frame with divider lines and editable text
- Markdown text imported as grouped editable text blocks
- Slide-aware placement, including section-based Markdown text imports

## Workspace layout

- `apps/web`
  - the runnable SDK app
  - import dialog
  - slide shapes and slide navigation
- `packages/importer`
  - format detection
  - parsers
  - layout helpers
  - native `tldraw` rendering helpers

## Local development

Requirements:

- Node.js 20+
- `pnpm`

Install dependencies:

```bash
pnpm install
```

Run the app:

```bash
pnpm dev
```

Run tests:

```bash
pnpm test
```

Build everything:

```bash
pnpm build
```

## Import behavior

The app uses slides as the primary import destination:

- Mermaid diagrams import into the current slide
- Markdown tables import into the current slide as grouped native shapes
- Markdown text imports into the current slide by default
- If Markdown text contains multiple top-level `#` sections, the app can distribute those sections across slides

## Package API

The importer package exposes:

- `parseStructuredImport(input)`
- `importStructuredContent(editor, input, options?)`
- `parseMarkdownText(input)`
- `importMarkdownTextModel(editor, model, options?)`

## Status

This is an early standalone implementation focused on import quality and editability, not on full Mermaid or Markdown fidelity.
