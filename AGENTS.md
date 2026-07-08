# Agent Instructions

## Project Context

crumbun is a tiny Bun fullstack engine with file routes and Pug templates.

Workspace packages:

- `packages/crumbun`: runtime engine published as `crumbun`.
- `packages/create-crumbun`: scaffold CLI published as `create-crumbun`.

The engine is intentionally small. Prefer direct Bun APIs, Pug, Web `Request`/`Response`, and simple file conventions over framework layers.

## Use Bun

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`.
- Use `bun test` for tests.
- Use `bun install` for dependency changes.
- Use `bun run <script>` for package scripts.
- Use `bunx <package>` instead of `npx`.
- Do not add Express, Vite, webpack, dotenv, Jest, or Vitest unless the user explicitly asks.

## Common Commands

- Install: `bun install`
- Test all packages: `bun run check`
- Test engine only: `cd packages/crumbun && bun test`
- Scaffold locally: `bun run create my-app`
- Check engine package: `cd packages/crumbun && npm pack --dry-run`
- Check CLI package: `cd packages/create-crumbun && npm pack --dry-run`

## How crumbun Apps Work

Minimal server:

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
  favicon.svg
src/
  api/
    story/
      [id]/
        page.ts
        getstory.ts
  views/
    layout/
      layout.pug
      layout.css
    story/
      story.pug
      story.css
    index.pug
    style.css
```

Routing rules:

- `src/api/**/page.ts` creates routes.
- Folder names in brackets become params: `[id]` maps to `params.id`.
- `src/api/story/[id]/page.ts` handles `/story/:id`.
- Page files may export HTTP method handlers such as `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`.
- A `default` export can be used as the fallback handler.
- Root `GET /` renders `src/views/index.pug` when no page route matches.

Page handler example:

```ts
import type { PageContext } from "crumbun";

export async function GET({ params, render }: PageContext) {
  return render("story/story", {
    title: `Story ${params.id}`,
  });
}
```

Handler context:

- `request`: incoming `Request`.
- `url`: parsed `URL`.
- `params`: route params from bracket folders.
- `render(view, locals?, init?)`: renders `src/views/<view>.pug`.
- `json(value, init?)`: returns JSON with the correct content type.

Response rules:

- Return a `Response` for full control.
- Return a string for HTML.
- Return an object for JSON.
- Return `null` or `undefined` for `204`.

Views and assets:

- Pug views live under `src/views`.
- `render("story/story")` renders `src/views/story/story.pug`.
- Pug receives `basedir: src/views`.
- Public static files live under `public` and are served from `/`.
- CSS in `src/views` is served from `/_crumbun`.
- `src/views/story/story.css` is available at `/_crumbun/story/story.css`.

Static export:

- Use `exportStatic({ root, paths })` from `crumbun` to write static pages.
- Static export writes to `dist` by default, copies `public`, copies `src/views/**/*.css` to `/_crumbun`, and writes `.nojekyll`.
- Keep `paths` explicit for dynamic routes that should be pre-rendered.

## Working On The Engine

- Keep `packages/crumbun/src/index.ts` small and direct.
- Use standard Web APIs and Bun APIs before adding dependencies.
- Preserve safe path handling for public files and view CSS.
- Add or update focused `bun:test` coverage for route matching, rendering behavior, and static file behavior.
- If changing package names, update package metadata, README files, CLI templates, and `bun.lock`.

## Working On The CLI

- `packages/create-crumbun/src/index.ts` embeds the starter app as strings.
- Generated apps should depend on the current published `crumbun` version unless deliberately preparing a local-only dev flow.
- Keep the scaffold boring: `public`, `src/api`, `src/views`, and `src/utils`.
- Keep the generated `src/export.ts` path list in sync with starter routes.
- Verify CLI changes by scaffolding into `/tmp` and inspecting the generated `package.json` and imports.

## Publishing

Publish order matters:

```bash
cd packages/crumbun
bun test
npm pack --dry-run
npm publish

cd ../create-crumbun
npm pack --dry-run
npm publish
```

Do not publish, tag, or bump versions without explicit user approval.

## Guardrails

Always:

- Read existing code before changing behavior.
- Keep changes small and reviewable.
- Use `rg` for search.
- Report commands run and checks skipped.

Ask first:

- Installing new dependencies.
- Renaming packages or public APIs.
- Publishing to npm.
- Starting long-running servers outside the sandbox.
- Deleting files, generated apps, or lockfiles.

Never:

- Replace Bun with Node-oriented tooling.
- Add a framework layer around `Bun.serve()` without a concrete need.
- Commit, tag, publish, deploy, or run destructive git commands unless the user explicitly asks.
- Mutate unrelated user changes.

## Approval Boundary

Do not edit files, install packages, run migrations, commit, deploy, publish, delete data, or perform other mutating work without explicit written approval.
