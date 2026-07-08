# fstug

Tiny Bun fullstack engine with file routes and Pug templates.

## Install

```bash
bun add fstug
```

## Use

```ts
import { fileURLToPath } from "node:url";
import { serve } from "fstug";

const server = await serve({
  root: fileURLToPath(new URL("..", import.meta.url)),
});

console.log(`Fstug running at http://${server.hostname}:${server.port}`);
```

Routes live in `src/api/**/page.ts`. A folder named `[id]` becomes a URL param, so `src/api/story/[id]/page.ts` handles `/story/:id`.

```ts
import type { PageContext } from "fstug";

export function GET({ params, render }: PageContext) {
  return render("story/story", {
    title: `Story ${params.id}`,
  });
}
```

Views live in `src/views`. `render("story/story")` renders `src/views/story/story.pug`.

CSS in `src/views` is served from `/_fstug`, so `src/views/story/story.css` is available at `/_fstug/story/story.css`.
