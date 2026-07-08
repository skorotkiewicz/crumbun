#!/usr/bin/env bun

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const target = resolve(Bun.argv[2] ?? "app");
const appName = packageName(basename(target));
const ownPackage = await Bun.file(new URL("../package.json", import.meta.url)).json() as { version: string };
const crumbunDependency = `^${ownPackage.version}`;

if (await isNonEmptyDir(target)) {
  console.error(`Refusing to overwrite non-empty directory: ${target}`);
  process.exit(1);
}

for (const [file, contents] of Object.entries(files(appName))) {
  const path = join(target, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

console.log(`Created ${appName} in ${target}`);
console.log(`Next: cd ${target} && bun install && bun run dev`);

async function isNonEmptyDir(path: string) {
  try {
    return (await readdir(path)).length > 0;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function packageName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "crumbun-app";
}

function files(name: string) {
  return {
    "package.json": `${JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: {
          build: "bun src/export.ts",
          dev: "bun --hot src/server.ts",
          start: "bun src/server.ts",
        },
        dependencies: {
          crumbun: crumbunDependency,
        },
      },
      null,
      2,
    )}\n`,
    "AGENTS.md": `# Agent Instructions

This is a crumbun app. crumbun is a tiny Bun fullstack engine with file routes and Pug templates.

## Create A New App

Use this command when starting another crumbun app:

    bunx create-crumbun my-app

Then:

    cd my-app
    bun install
    bun run dev

To export static HTML:

    bun run build

## Use Bun

- Use bun, not node.
- Use bun install for dependencies.
- Use bun run dev during local development.
- Use bun run build to export static pages into dist/.
- Use Bun.serve through crumbun; do not add Express.
- Do not add Vite, webpack, Jest, Vitest, or dotenv unless explicitly needed.

## App Shape

- public/ contains static files served from /.
- src/server.ts starts crumbun.
- src/export.ts exports static pages with crumbun.
- src/api/**/page.ts creates routes.
- src/views/**/*.pug contains Pug views.
- src/views/**/*.css is served from /_crumbun.
- src/utils/ is for local app helpers and data.

## Routing

- A folder in brackets becomes a route param.
- src/api/story/[id]/page.ts handles /story/:id.
- Page files export HTTP handlers such as GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD.
- A default export can be used as the fallback handler.

Handler context:

- request: incoming Request.
- url: parsed URL.
- params: route params from bracket folders.
- render(view, locals, init): renders src/views/<view>.pug.
- json(value, init): returns JSON with the right content type.

Return values:

- Response for full control.
- string for HTML.
- object for JSON.
- null or undefined for 204.

## Views

- render("story/story") renders src/views/story/story.pug.
- Link global CSS with /_crumbun/style.css.
- Link nested view CSS with /_crumbun/story/story.css.
- Keep layout markup in src/views/layout/layout.pug.

## Static Export

- bun run build writes static files to dist/.
- Keep paths in src/export.ts in sync with routes that should be pre-rendered.
- Static export copies public/ and src/views/**/*.css automatically.

## Working Here

- Read the existing route and view before editing.
- Prefer small changes that keep the file-route convention obvious.
- Add shared app logic under src/utils instead of hiding it in views.
- Verify route changes by running bun run dev and opening the changed route.
`,
    "public/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#111827"/><path fill="#f59e0b" d="M16 17h32v8H26v7h18v8H26v15H16z"/></svg>\n`,
    "src/server.ts": `import { fileURLToPath } from "node:url";
import { serve } from "crumbun";

const server = await serve({
  root: fileURLToPath(new URL("..", import.meta.url)),
});

console.log(\`Crumbun running at http://\${server.hostname}:\${server.port}\`);
`,
    "src/export.ts": `import { fileURLToPath } from "node:url";
import { exportStatic } from "crumbun";

const result = await exportStatic({
  root: fileURLToPath(new URL("..", import.meta.url)),
  paths: ["/", "/story/first-light", "/story/quiet-console"],
});

console.log(\`Crumbun static site exported to \${result.outDir}\`);
`,
    "src/api/story/[id]/page.ts": `import type { PageContext } from "crumbun";
import { getStory } from "./getstory";

export async function GET({ params, render }: PageContext) {
  const story = getStory(params.id);

  if (!story) return new Response("Story not found", { status: 404 });

  return render("story/story", {
    title: story.title,
    story,
  });
}
`,
    "src/api/story/[id]/getstory.ts": `import { stories } from "../../../utils/corpus.js";

export function getStory(id: string) {
  return stories.find((story) => story.id === id);
}
`,
    "src/views/index.pug": `extends layout/layout.pug

block nav
  a.active(href="/") Start
  a(href="/story/first-light") First Light
  a(href="/story/quiet-console") Quiet Console

block content
  section.panel.active
    h2 Start
    p.hint This page is rendered from src/views/index.pug. Story pages are handled by src/api/story/[id]/page.ts.
    label Command
    pre
      code.
        bun run dev
        bun run build
        open /story/first-light
    div.out
      div.row
        span.rank 01
        span.lbl engine
        code crumbun
      div.row
        span.rank 02
        span.lbl routes
        code src/api/**/page.ts
      div.row
        span.rank 03
        span.lbl static
        code exportStatic()
      div.row
        span.rank 04
        span.lbl views
        code src/views/**/*.pug

  section.panel.active
    h2 Stories
    p.hint Pick a route rendered by a page handler and a Pug view.
    div.out
      a.row.link-row(href="/story/first-light")
        span.rank GET
        span.lbl /story/first-light
        code First Light
      a.row.link-row(href="/story/quiet-console")
        span.rank GET
        span.lbl /story/quiet-console
        code Quiet Console
`,
    "src/views/style.css": `:root {
  --bg: #0c0c0e;
  --fg: #c9c9c9;
  --mut: #6f6f78;
  --line: #232329;
  --acc: #9ece6a;
  --bar: #1a1a1f;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

a {
  color: var(--acc);
  text-decoration: none;
}

a:hover,
a:focus-visible {
  text-decoration: underline;
}

code {
  overflow-wrap: anywhere;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #141417;
  padding: 1px 5px;
  font-size: 12px;
}
`,
    "src/views/layout/layout.pug": `doctype html
html(lang="en")
  head
    meta(charset="utf-8")
    meta(name="viewport" content="width=device-width, initial-scale=1")
    title= title || "Crumbun"
    link(rel="icon" href="/favicon.svg")
    link(rel="stylesheet" href="/_crumbun/style.css")
    link(rel="stylesheet" href="/_crumbun/layout/layout.css")
    block head
  body
    header.shell-head
      h1 crumbun
      p tiny Bun app · file routes · Pug views
    nav.shell-nav(aria-label="App")
      block nav
        a(href="/") Start
    main.shell
      block content
`,
    "src/views/layout/layout.css": `.shell,
.shell-head,
.shell-nav {
  max-width: 760px;
  margin: 0 auto;
}

.shell-head {
  padding: 52px 20px 10px;
}

.shell-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.shell-head h1::before {
  content: "~/ ";
  color: var(--mut);
}

.shell-head p {
  margin: 8px 0 0;
  color: var(--mut);
  font-size: 13px;
}

.shell-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  border-bottom: 1px solid var(--line);
  padding: 16px 20px;
}

.shell-nav a {
  color: var(--mut);
  font-size: 13px;
}

.shell-nav a:hover,
.shell-nav a:focus-visible,
.shell-nav a.active {
  color: var(--fg);
}

.shell-nav a.active {
  border-bottom: 1px solid var(--acc);
  text-decoration: none;
}

.shell {
  padding: 26px 20px 80px;
}

.panel {
  margin-bottom: 34px;
}

h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

h2::before {
  content: "# ";
  color: var(--acc);
}

.hint {
  margin: 0 0 18px;
  color: var(--mut);
  font-size: 12.5px;
}

label {
  display: block;
  margin: 16px 0 6px;
  color: var(--mut);
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

pre {
  overflow: auto;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #111114;
  padding: 9px 11px;
  color: var(--fg);
  font: inherit;
}

pre code {
  display: block;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
}

.out {
  margin-top: 20px;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  padding: 6px 0;
}

.row:last-child {
  border-bottom: 0;
}

.link-row {
  color: var(--fg);
}

.rank {
  width: 42px;
  color: var(--acc);
  font-weight: 600;
}

.lbl {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 620px) {
  .shell-head {
    padding-top: 34px;
  }

  .shell-nav {
    gap: 14px;
  }

  .row {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .rank {
    width: auto;
  }

  .lbl {
    white-space: normal;
  }
}
`,
    "src/views/story/story.pug": `extends ../layout/layout.pug

block nav
  a(href="/") Start
  a(class=story.id === "first-light" ? "active" : "" href="/story/first-light") First Light
  a(class=story.id === "quiet-console" ? "active" : "" href="/story/quiet-console") Quiet Console

block head
  link(rel="stylesheet" href="/_crumbun/story/story.css")

block content
  article.panel.story
    h2= story.title
    p.hint= story.lede
    label Route
    pre
      code= "/story/" + story.id
    div.out
      div.row
        span.rank tag
        span.lbl= story.tag
        code story
      div.row
        span.rank view
        span.lbl src/views/story/story.pug
        code render()
      div.row
        span.rank css
        span.lbl /_crumbun/story/story.css
        code static
    div.copy
      each paragraph in story.body
        p= paragraph
`,
    "src/views/story/story.css": `.story .copy {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #111114;
  padding: 14px;
}

.story .copy p {
  margin: 0;
  color: var(--fg);
}
`,
    "src/utils/corpus.js": `export const stories = [
  {
    id: "first-light",
    tag: "Field Note",
    title: "First Light",
    lede: "A tiny route renders a Pug template with data from a local corpus.",
    body: [
      "The page module owns the request. The view owns the markup.",
      "Static files come from public, view CSS comes from src/views through /_crumbun.",
    ],
  },
  {
    id: "quiet-console",
    tag: "Runtime",
    title: "Quiet Console",
    lede: "Bun serves the app directly without Express, Vite, or a second build tool.",
    body: [
      "The engine scans src/api for page files and maps [id] folders to URL params.",
      "Pug keeps layouts boring, explicit, and easy to replace later.",
    ],
  },
];
`,
  };
}
