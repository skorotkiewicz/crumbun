# crumbun

Tiny Bun fullstack engine with file routes, Pug templates, and static export.

## Install

```bash
bun add crumbun
```

## Use

```ts
import { fileURLToPath } from "node:url";
import { serve } from "crumbun";

const server = await serve({
  root: fileURLToPath(new URL("..", import.meta.url)),
});

console.log(`Crumbun running at http://${server.hostname}:${server.port}`);
```

Routes live in `src/api/**/page.ts`. A folder named `[id]` becomes a URL param, so `src/api/story/[id]/page.ts` handles `/story/:id`.

```ts
import type { PageContext } from "crumbun";

export function GET({ params, render }: PageContext) {
  return render("story/story", {
    title: `Story ${params.id}`,
  });
}
```

Views live in `src/views`. `render("story/story")` renders `src/views/story/story.pug`.

CSS in `src/views` is served from `/_crumbun`, so `src/views/story/story.css` is available at `/_crumbun/story/story.css`.

## Syntax Highlighting

`highlightCode(source, language)` is available inside Pug views and can also be imported from `crumbun`.

```pug
pre
  code.language-ts!= highlightCode("export const app = serve()", "ts")
```

It returns escaped HTML with `cb-keyword`, `cb-builtin`, `cb-string`, `cb-number`, and `cb-comment` spans for styling.

## Static Export

```ts
import { fileURLToPath } from "node:url";
import { exportStatic } from "crumbun";

await exportStatic({
  root: fileURLToPath(new URL("..", import.meta.url)),
  paths: ["/", "/story/first-light"],
});
```

`exportStatic` writes to `dist` by default. It renders the listed paths, copies `public`, copies `src/views/**/*.css` to `/_crumbun`, and writes `.nojekyll` for GitHub Pages.
