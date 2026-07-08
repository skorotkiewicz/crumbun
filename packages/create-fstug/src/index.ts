#!/usr/bin/env bun

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const target = resolve(Bun.argv[2] ?? "app");
const appName = packageName(basename(target));
const fstugDependency = "^0.1.0";

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
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "fstug-app";
}

function files(name: string) {
  return {
    "package.json": `${JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: {
          dev: "bun --hot src/server.ts",
          start: "bun src/server.ts",
        },
        dependencies: {
          fstug: fstugDependency,
        },
      },
      null,
      2,
    )}\n`,
    "public/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#111827"/><path fill="#f59e0b" d="M16 17h32v8H26v7h18v8H26v15H16z"/></svg>\n`,
    "src/server.ts": `import { fileURLToPath } from "node:url";
import { serve } from "fstug";

const server = await serve({
  root: fileURLToPath(new URL("..", import.meta.url)),
});

console.log(\`Fstug running at http://\${server.hostname}:\${server.port}\`);
`,
    "src/api/story/[id]/page.ts": `import type { PageContext } from "fstug";
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

block content
  section.intro
    p.kicker Fstug
    h1 Small Bun fullstack app with Pug views.
    p Pick a story route rendered by src/api/story/[id]/page.ts.
    nav.story-links(aria-label="Stories")
      a(href="/story/first-light") First Light
      a(href="/story/quiet-console") Quiet Console
`,
    "src/views/style.css": `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
  background: #eef2f7;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

a {
  color: inherit;
}
`,
    "src/views/layout/layout.pug": `doctype html
html(lang="en")
  head
    meta(charset="utf-8")
    meta(name="viewport" content="width=device-width, initial-scale=1")
    title= title || "Fstug"
    link(rel="icon" href="/favicon.svg")
    link(rel="stylesheet" href="/_fstug/style.css")
    link(rel="stylesheet" href="/_fstug/layout/layout.css")
    block head
  body
    main.shell
      block content
`,
    "src/views/layout/layout.css": `.shell {
  width: min(920px, calc(100% - 32px));
  margin: 0 auto;
  padding: 56px 0;
}

.intro {
  display: grid;
  gap: 18px;
}

.kicker {
  margin: 0;
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  max-width: 760px;
  margin: 0;
  font-size: clamp(2.25rem, 7vw, 5.5rem);
  line-height: 0.95;
}

p {
  max-width: 640px;
  margin: 0;
  color: #516070;
  font-size: 1.08rem;
  line-height: 1.7;
}
`,
    "src/views/story/story.pug": `extends ../layout/layout.pug

block head
  link(rel="stylesheet" href="/_fstug/story/story.css")

block content
  article.story
    a.back(href="/") Back
    p.kicker= story.tag
    h1= story.title
    p.lede= story.lede
    each paragraph in story.body
      p= paragraph
`,
    "src/views/story/story.css": `.story {
  display: grid;
  gap: 18px;
}

.story-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.story-links a,
.back {
  border: 1px solid #cad2df;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 14px;
  text-decoration: none;
  font-weight: 700;
}

.lede {
  color: #172033;
  font-size: 1.22rem;
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
      "Static files come from public, view CSS comes from src/views through /_fstug.",
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
