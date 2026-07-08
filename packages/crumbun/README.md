# crumbun

Tiny Bun fullstack engine with file routes, Pug views, and static export.

## Fastest Start

```bash
bunx create-crumbun@latest my-app
```

## Install

```bash
bun add crumbun
```

## Smallest App

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

Add `src/views/index.pug`:

```pug
h1 Hello from crumbun
```

Run it:

```bash
bun --hot src/server.ts
```

## First Route

`src/api/story/[id]/page.ts`

```ts
import type { PageContext } from "crumbun";

export function GET({ params, render }: PageContext) {
  return render("story/story", {
    title: `Story ${params.id}`,
  });
}
```

`src/views/story/story.pug`

```pug
h1= title
```

## Static Export

```ts
import { fileURLToPath } from "node:url";
import { exportStatic } from "crumbun";

const result = await exportStatic({
  root: fileURLToPath(new URL("..", import.meta.url)),
  paths: ["/", "/story/first-light"],
});

console.log(`Exported ${result.outDir}`);
```

## Conventions

- `src/api/**/page.ts` creates routes.
- `[id]` becomes `params.id`.
- `(group)` keeps a folder out of the URL.
- `src/views/index.pug` renders `GET /` when no page route matches.
- `render("story/story")` renders `src/views/story/story.pug`.
- `public/` is served from `/`.
- `src/views/**/*.css` and `src/views/**/*.scss` are served from `/_crumbun`.
- `src/views/_layout.pug` can wrap rendered views.
- `src/views/_error.pug` can render 404 and 500 pages.

## Handler Helpers

- `json(value, init?)` returns JSON.
- `redirect(path, status?)` returns a redirect response.
- `cookies.get/set/delete/all` reads and writes cookies.
- `highlightCode(source, language?)` is available in Pug views and from `crumbun`.
- `env(key, fallback?)` reads `Bun.env`.
- `spa: true` makes unknown `GET` requests fall back to `index.pug`.
