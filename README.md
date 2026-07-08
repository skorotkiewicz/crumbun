# crumbun

Tiny Bun fullstack engine.
File routes. Pug views. Static export.

## Start

```bash
bunx create-crumbun@latest my-app
cd my-app
bun install
bun run dev
```

Open `http://localhost:3000`.

Build a static site:

```bash
bun run build
```

## From Scratch

```bash
bun add crumbun
```

```ts
import { fileURLToPath } from "node:url";
import { serve } from "crumbun";

const server = await serve({
  root: fileURLToPath(new URL("..", import.meta.url)),
});

console.log(`Crumbun running at http://${server.hostname}:${server.port}`);
```

Expected app shape:

```txt
public/
src/
  api/
  views/
  export.ts
  server.ts
```

## How It Works

- `src/api/**/page.ts` becomes routes.
- `src/api/story/[id]/page.ts` handles `/story/:id`.
- `src/views/index.pug` renders `GET /` when no page route matches.
- `render("story/story")` renders `src/views/story/story.pug`.
- `public/` is served from `/`.
- `src/views/**/*.css` and `src/views/**/*.scss` are served from `/_crumbun`.
- `exportStatic({ paths })` writes prerendered files to `dist/`.

## Workspace

```txt
packages/crumbun          runtime engine
packages/create-crumbun   scaffold CLI
site                      docs/demo app
```

Useful commands:

```bash
bun install
bun run check
bun run create my-app
bun run site
```
