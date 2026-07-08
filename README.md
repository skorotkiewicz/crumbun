# crumbun

A tiny Bun fullstack engine with file routes, Pug templates, and static export.

## Layout

```txt
packages/crumbun          engine
packages/create-crumbun   scaffold CLI
```

## Install

```bash
bun install
```

## Create an app

```bash
bun run create my-app
```

Or:

```bash
bunx create-crumbun my-app
```

The engine maps `src/api/**/page.ts` to routes. A folder named `[id]` becomes a URL param, so `src/api/story/[id]/page.ts` handles `/story/:id`.

Views live in `src/views`. Use `render("story/story", locals)` from a page module to render `src/views/story/story.pug`.

## Website

```bash
bun run site
```

Build the static website:

```bash
bun run --cwd site build
```
