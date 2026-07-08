import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { createApp, exportStatic, highlightCode, matchPattern, routePatternFromPageFile } from "./index";

test("turns file routes into URL patterns", () => {
  expect(routePatternFromPageFile("/app/src/api", "/app/src/api/story/[id]/page.ts")).toBe("/story/:id");
  expect(matchPattern("/story/:id", "/story/42")).toEqual({ id: "42" });
});

test("serves dynamic page modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-"));
  const routeDir = join(root, "src/api/story/[id]");

  await mkdir(routeDir, { recursive: true });
  await writeFile(
    join(routeDir, "page.ts"),
    `export function GET({ params }) { return new Response(\`story:\${params.id}\`); }\n`,
  );

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/story/abc"));

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("story:abc");
});

test("highlights and escapes code", () => {
  const html = highlightCode('const tag = "<script>"; // safe', "ts");

  expect(html).toContain('<span class="cb-keyword">const</span>');
  expect(html).toContain('<span class="cb-string">"&lt;script&gt;"</span>');
  expect(html).toContain('<span class="cb-comment">// safe</span>');
  expect(html).not.toContain("<script>");
});

test("highlights rich token categories", () => {
  const html = highlightCode('const ok = GET({ id }: Story);', "ts");

  expect(html).toContain('<span class="cb-keyword">const</span>');
  expect(html).toContain('<span class="cb-function">GET</span>');
  expect(html).toContain('<span class="cb-type">Story</span>');
  expect(html).toContain('<span class="cb-operator">:</span>');
  expect(html).toContain('<span class="cb-punct">;</span>');
});

test("highlights booleans and shell comments", () => {
  expect(highlightCode("return true;", "ts")).toContain('<span class="cb-boolean">true</span>');
  expect(highlightCode("echo hi # run", "sh")).toContain('<span class="cb-comment"># run</span>');
});

test("serves builtin highlight stylesheet", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-theme-"));
  const app = await createApp({ root });

  const response = await app.fetch(new Request("http://crumbun.test/_crumbun/highlight.css"));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/css");
  expect(await response.text()).toContain(".cb-type");
});

test("exports builtin highlight stylesheet", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-static-"));
  await mkdir(join(root, "public"), { recursive: true });
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), "h1 Home\n");

  await exportStatic({ root, paths: ["/"] });

  expect(await Bun.file(join(root, "dist/_crumbun/highlight.css")).text()).toContain(".cb-type");
});

test("exposes code highlighting to views", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-highlight-"));

  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), 'pre\n  code!= highlightCode("export const app = serve()", "ts")\n');

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/"));

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<span class="cb-keyword">export</span>');
});

test("exports static pages and assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-static-"));

  await mkdir(join(root, "public"), { recursive: true });
  await mkdir(join(root, "src/api/story/[id]"), { recursive: true });
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "public/favicon.svg"), "<svg />\n");
  await writeFile(join(root, "src/views/index.pug"), "h1 Home\n");
  await writeFile(join(root, "src/views/style.css"), "body { color: red; }\n");
  await writeFile(
    join(root, "src/api/story/[id]/page.ts"),
    `export function GET({ params }) { return \`story:\${params.id}\`; }\n`,
  );

  const result = await exportStatic({ root, paths: ["/", "/story/abc"] });

  expect(result.outDir).toBe(join(root, "dist"));
  expect(await Bun.file(join(root, "dist/index.html")).text()).toContain("<h1>Home</h1>");
  expect(await Bun.file(join(root, "dist/story/abc/index.html")).text()).toBe("story:abc");
  expect(await Bun.file(join(root, "dist/favicon.svg")).text()).toBe("<svg />\n");
  expect(await Bun.file(join(root, "dist/_crumbun/style.css")).text()).toBe("body { color: red; }\n");
  expect(await Bun.file(join(root, "dist/.nojekyll")).exists()).toBe(true);
});
