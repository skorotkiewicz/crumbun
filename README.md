# fstug

A tiny Bun fullstack engine with file routes and Pug templates.

## Layout

```txt
packages/fstug          engine
packages/create-fstug   scaffold CLI
app                     example app
```

## Install

```bash
bun install
```

## Run the example

```bash
bun run dev
```

## Create an app

```bash
bun run create my-app
```

The engine maps `src/api/**/page.ts` to routes. A folder named `[id]` becomes a URL param, so `src/api/story/[id]/page.ts` handles `/story/:id`.

Views live in `src/views`. Use `render("story/story", locals)` from a page module to render `src/views/story/story.pug`.
