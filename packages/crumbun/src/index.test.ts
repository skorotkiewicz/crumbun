import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { createApp, env, exportStatic, highlightCode, matchPattern, routePatternFromPageFile } from "./index";

test("turns file routes into URL patterns", () => {
  expect(routePatternFromPageFile("/app/src/api", "/app/src/api/story/[id]/page.ts")).toBe("/story/:id");
  expect(matchPattern("/story/:id", "/story/42")).toEqual({ id: "42" });
});

test("malformed route params do not throw", () => {
  expect(matchPattern("/story/:id", "/story/%E0%A4%A")).toBeNull();
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

test("highlights type hints, object keys, regexes, and shell tokens", () => {
  const ts = highlightCode('const out = { title: /story\\/[a-z]+/i }; const cast = value as localType; console.log(out);', "ts");
  const sh = highlightCode("bun run dev --hot $PORT # run", "sh");

  expect(ts).toContain('<span class="cb-property">title</span>');
  expect(ts).toContain('<span class="cb-regex">/story\\/[a-z]+/i</span>');
  expect(ts).toContain('<span class="cb-type">localType</span>');
  expect(ts).toContain('<span class="cb-property">log</span>');
  expect(sh).toContain('<span class="cb-builtin">bun</span>');
  expect(sh).toContain('<span class="cb-property">--hot</span>');
  expect(sh).toContain('<span class="cb-variable">$PORT</span>');
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

test("ignores route groups in URLs", () => {
  expect(routePatternFromPageFile("/app/src/api", "/app/src/api/(marketing)/about/page.ts")).toBe("/about");
  expect(routePatternFromPageFile("/app/src/api", "/app/src/api/blog/(v2)/[slug]/page.ts")).toBe("/blog/:slug");
});

test("env reads Bun.env with fallback", () => {
  Bun.env.CRUMBUN_TEST_VAR = "present";
  expect(env("CRUMBUN_TEST_VAR")).toBe("present");
  expect(env("CRUMBUN_MISSING_VAR", "fallback")).toBe("fallback");
  expect(env("CRUMBUN_MISSING_VAR")).toBeUndefined();
  delete Bun.env.CRUMBUN_TEST_VAR;
});

test("redirect returns a location response", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-redirect-"));
  await mkdir(join(root, "src/api/go"), { recursive: true });
  await writeFile(join(root, "src/api/go/page.ts"), 'export function GET({ redirect }) { return redirect("/done", 307); }\n');

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/go"));

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/done");
});

test("cookies parse incoming and set outgoing", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-cookies-"));
  await mkdir(join(root, "src/api/whoami"), { recursive: true });
  await writeFile(
    join(root, "src/api/whoami/page.ts"),
    'export function GET({ cookies, json }) { cookies.set("seen", "1"); return json({ had: cookies.get("token"), all: cookies.all }); }\n',
  );

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/whoami", { headers: { cookie: "token=abc; bad=%E0%A4%A" } }));
  const body = (await response.json()) as { had: string; all: Record<string, string> };

  expect(body.had).toBe("abc");
  expect(body.all.token).toBe("abc");
  expect(body.all.bad).toBe("%E0%A4%A");
  expect(response.headers.get("set-cookie")).toContain("seen=1");
});

test("renders custom error page when present", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-error-"));
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), "h1 Home\n");
  await writeFile(join(root, "src/views/_error.pug"), 'p.error= message + " (" + status + ")"\n');

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/missing"));

  expect(response.status).toBe(404);
  expect(await response.text()).toContain("Not found (404)");
});

test("renders custom error page for thrown handlers", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-error-"));
  await mkdir(join(root, "src/api/boom"), { recursive: true });
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/api/boom/page.ts"), 'export function GET() { throw new Error("boom"); }\n');
  await writeFile(join(root, "src/views/_error.pug"), 'p.error= message + " (" + status + ")"\n');

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/boom"));

  expect(response.status).toBe(500);
  expect(await response.text()).toContain("Internal server error (500)");
});

test("wraps views in _layout.pug unless opted out", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-layout-"));
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), 'span.page content\n');
  await writeFile(join(root, "src/views/_layout.pug"), 'body!= content\n');
  await mkdir(join(root, "src/api/raw"), { recursive: true });
  await writeFile(join(root, "src/api/raw/page.ts"), 'export function GET({ render }) { return render("bare", { layout: false }); }\n');
  await writeFile(join(root, "src/views/bare.pug"), 'span.bare text\n');

  const app = await createApp({ root });
  const wrappedText = await (await app.fetch(new Request("http://crumbun.test/"))).text();
  expect(wrappedText).toContain("<body>");
  expect(wrappedText).toContain('<span class="page">');

  const optedOutText = await (await app.fetch(new Request("http://crumbun.test/raw"))).text();
  expect(optedOutText).toContain('<span class="bare">');
  expect(optedOutText).not.toContain("<body>");
});

test("serves static assets with etag and 304", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-etag-"));
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "public/hello.txt"), "hi");

  const app = await createApp({ root });
  const first = await app.fetch(new Request("http://crumbun.test/hello.txt"));
  const etag = first.headers.get("etag") ?? "";

  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toContain("max-age");
  expect(etag).not.toBe("");

  const second = await app.fetch(new Request("http://crumbun.test/hello.txt", { headers: { "if-none-match": etag } }));
  expect(second.status).toBe(304);
});

test("serves and exports view scss as css", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-scss-"));
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), "h1 Home\n");
  await writeFile(join(root, "src/views/vars.scss"), "$accent: #c33;\n");
  await writeFile(
    join(root, "src/views/_layout.scss"),
    '@use "vars" as *;\n.card {\n  color: $accent;\n  &:hover { color: white; }\n}\n',
  );

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/_crumbun/_layout.css"));
  const etag = response.headers.get("etag") ?? "";
  const css = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/css");
  expect(css).toContain(".card {");
  expect(css).toContain("color: #c33;");
  expect(css).toContain(".card:hover {");
  expect(etag).not.toBe("");
  expect((await app.fetch(new Request("http://crumbun.test/_crumbun/_layout.css", { headers: { "if-none-match": etag } }))).status).toBe(304);

  await exportStatic({ root, paths: ["/"] });

  expect(await Bun.file(join(root, "dist/_crumbun/_layout.css")).text()).toContain(".card:hover");
});

test("plain css wins when css and scss share a view asset path", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-css-wins-"));
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), "h1 Home\n");
  await writeFile(join(root, "src/views/theme.css"), "body { color: red; }\n");
  await writeFile(join(root, "src/views/theme.scss"), "body { color: blue; }\n");

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/_crumbun/theme.css"));

  expect(await response.text()).toBe("body { color: red; }\n");

  await exportStatic({ root, paths: ["/"] });

  expect(await Bun.file(join(root, "dist/_crumbun/theme.css")).text()).toBe("body { color: red; }\n");
});

test("HEAD responses keep headers without bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-head-"));
  await mkdir(join(root, "src/api/ping"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "src/api/ping/page.ts"), 'export function GET() { return new Response("pong", { headers: { "x-ping": "1" } }); }\n');
  await writeFile(join(root, "public/hello.txt"), "hi");

  const app = await createApp({ root });
  const route = await app.fetch(new Request("http://crumbun.test/ping", { method: "HEAD" }));
  const file = await app.fetch(new Request("http://crumbun.test/hello.txt", { method: "HEAD" }));

  expect(route.status).toBe(200);
  expect(route.headers.get("x-ping")).toBe("1");
  expect(await route.text()).toBe("");
  expect(file.status).toBe(200);
  expect(file.headers.get("etag")).not.toBeNull();
  expect(await file.text()).toBe("");
});

test("Allow includes HEAD when GET exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-allow-"));
  await mkdir(join(root, "src/api/get-only"), { recursive: true });
  await writeFile(join(root, "src/api/get-only/page.ts"), 'export function GET() { return "ok"; }\n');

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/get-only", { method: "POST" }));

  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET, HEAD");
});

test("spa fallback renders index for unknown GETs", async () => {
  const root = await mkdtemp(join(tmpdir(), "crumbun-spa-"));
  await mkdir(join(root, "src/views"), { recursive: true });
  await writeFile(join(root, "src/views/index.pug"), "h1 App\n");

  const app = await createApp({ root, spa: true });
  const response = await app.fetch(new Request("http://crumbun.test/dashboard"));

  expect(response.status).toBe(200);
  expect(await response.text()).toContain("App");
});
