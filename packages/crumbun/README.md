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

CSS in `src/views` is served from `/_crumbun`, so `src/views/story/story.css` is available at `/_crumbun/story/story.css`. crumbun also serves a default highlight theme at `/_crumbun/highlight.css`.

## Layouts and error pages

Create `src/views/_layout.pug` to wrap every rendered view. The engine injects the
view HTML as `content`, so emit it with `!= content`. Views that already use `extends`
are left alone, and any view can opt out with `render("view", { layout: false })` or
choose another layout with `render("view", { layout: "other/layout" })`.

Create `src/views/_error.pug` to render 404 and other error responses. It receives
`status` and `message` locals. Without it, crumbun returns plain text.

## Handler context

Handlers receive a small context. Alongside `request`, `params`, `url`, and `render`,
it includes:

- `json(value, init?)` — return JSON.
- `redirect(path, status = 302)` — return a redirect `Response`.
- `cookies` — parsed incoming cookies plus `get`/`set`/`delete`/`all`. Set cookies are attached to the response automatically.

crumbun also exports `env(key, fallback?)` to read `Bun.env` safely (Bun loads `.env` automatically).

```ts
export function POST({ request, json, cookies, redirect }) {
  cookies.set("session", "abc", { httpOnly: true });
  if (request.headers.get("authorization") !== "Bearer x") return redirect("/login");
  return json({ ok: true });
}
```

## Syntax Highlighting

`highlightCode(source, language)` is available inside Pug views and can also be imported from `crumbun`.

```pug
pre
  code.language-ts!= highlightCode("export const app = serve()", "ts")
```

It returns escaped HTML with `cb-keyword`, `cb-builtin`, `cb-string`, `cb-number`, `cb-boolean`, `cb-function`, `cb-type`, `cb-property`, `cb-operator`, `cb-punct`, `cb-decorator`, and `cb-comment` spans for styling. Link `/_crumbun/highlight.css` for the default theme.

## Static Export

```ts
import { fileURLToPath } from "node:url";
import { exportStatic } from "crumbun";

await exportStatic({
  root: fileURLToPath(new URL("..", import.meta.url)),
  paths: ["/", "/story/first-light"],
});
```

`exportStatic` writes to `dist` by default. It renders the listed paths, copies `public`, copies `src/views/**/*.css` to `/_crumbun`, copies the default highlight theme to `/_crumbun/highlight.css`, and writes `.nojekyll` for GitHub Pages.

## Route groups

Wrap route folders in parentheses to keep them out of the URL. `src/api/(marketing)/about/page.ts` maps to `/about`, and `src/api/blog/(v2)/[slug]/page.ts` maps to `/blog/:slug`.

## SPA mode

Pass `spa: true` to `serve` or `createApp` to render the root view for any unknown GET request, so a client-side router can take over. Assets and API routes still win.

## Static assets

Public files and `/_crumbun` CSS are served with `Cache-Control: public, max-age=3600` and an `ETag`. Requests with a matching `If-None-Match` header get a `304` response.
