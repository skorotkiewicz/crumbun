import { createRequire } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cp, mkdir, readdir, rm } from "node:fs/promises";

const require = createRequire(import.meta.url);
const pug = require("pug") as {
  renderFile: (file: string, locals?: Record<string, unknown>) => string;
};

const pageFile = /^page\.(ts|js|mjs|tsx|jsx)$/;
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;

type HttpMethod = (typeof methods)[number];
type PageResult = Response | string | Record<string, unknown> | undefined | null;

export type PageHandler = (context: PageContext) => PageResult | Promise<PageResult>;

export type PageContext = {
  request: Request;
  params: Record<string, string>;
  url: URL;
  render: (view: string, locals?: Record<string, unknown>, init?: ResponseInit) => Promise<Response>;
  json: (value: unknown, init?: ResponseInit) => Response;
  highlightCode: (source: string, language?: string) => string;
};

export type CrumbunOptions = {
  root?: string;
  port?: number;
  hostname?: string;
  development?: boolean;
};

export type StaticExportOptions = CrumbunOptions & {
  outDir?: string;
  paths?: string[];
  clean?: boolean;
};

export type StaticExportResult = {
  outDir: string;
};

type PageModule = Partial<Record<HttpMethod, PageHandler>> & {
  default?: PageHandler;
};

type Route = {
  pattern: string;
  module: PageModule;
  dynamicCount: number;
};

type CrumbunApp = {
  root: string;
  fetch: (request: Request) => Promise<Response>;
};

export async function serve(options: CrumbunOptions = {}) {
  const app = await createApp(options);

  return Bun.serve({
    port: options.port ?? Number(Bun.env.PORT ?? 3000),
    hostname: options.hostname,
    fetch: app.fetch,
  });
}

export async function createApp(options: CrumbunOptions = {}): Promise<CrumbunApp> {
  const root = resolve(options.root ?? process.cwd());
  const publicDir = resolve(root, "public");
  const srcDir = resolve(root, "src");
  const apiDir = resolve(srcDir, "api");
  const viewsDir = resolve(srcDir, "views");
  const routes = await loadRoutes(apiDir, Boolean(options.development));

  async function render(
    view: string,
    locals: Record<string, unknown> = {},
    init: ResponseInit = {},
  ) {
    const viewPath = safePath(viewsDir, view.endsWith(".pug") ? view : `${view}.pug`);

    if (!viewPath || !(await Bun.file(viewPath).exists())) {
      return new Response("View not found", { status: 404 });
    }

    const headers = new Headers(init.headers);
    headers.set("content-type", "text/html; charset=utf-8");

    return new Response(pug.renderFile(viewPath, { ...locals, basedir: viewsDir, highlightCode }), {
      ...init,
      headers,
    });
  }

  async function fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "GET" || request.method === "HEAD") {
      const viewAsset = await viewAssetResponse(viewsDir, url.pathname);
      if (viewAsset) return viewAsset;

      if (url.pathname !== "/") {
        const publicFile = await fileResponse(publicDir, url.pathname);
        if (publicFile) return publicFile;
      }
    }

    const route = routes.find((candidate) => matchPattern(candidate.pattern, url.pathname));

    if (route) {
      const params = matchPattern(route.pattern, url.pathname) ?? {};
      const method = request.method === "HEAD" ? "GET" : (request.method as HttpMethod);
      const handler = route.module[method] ?? route.module.default;

      if (!handler) {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: allowedMethods(route.module).join(", ") },
        });
      }

      const context: PageContext = {
        request,
        params,
        url,
        render,
        json,
        highlightCode,
      };

      return toResponse(await handler(context));
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/") {
      return render("index");
    }

    return new Response("Not found", { status: 404 });
  }

  return { root, fetch };
}

export function highlightCode(source: string, language = "text") {
  const lang = language.toLowerCase();
  const isShell = lang === "sh" || lang === "bash" || lang === "shell";
  const tokenPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|`(?:\\[\s\S]|[^`\\])*`|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;
  let html = "";
  let index = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    const className = highlightClass(token, isShell);

    html += escapeHtml(source.slice(index, start));
    html += className ? `<span class="${className}">${escapeHtml(token)}</span>` : escapeHtml(token);
    index = start + token.length;
  }

  return html + escapeHtml(source.slice(index));
}

export async function exportStatic(options: StaticExportOptions = {}): Promise<StaticExportResult> {
  const root = resolve(options.root ?? process.cwd());
  const outDir = resolve(root, options.outDir ?? "dist");

  if (outDir === root) throw new Error("Refusing to export into the app root");
  if (options.clean !== false) await rm(outDir, { recursive: true, force: true });

  const app = await createApp({ root, development: options.development });
  await mkdir(outDir, { recursive: true });
  await copyIfExists(resolve(root, "public"), outDir);
  await copyViewStyles(resolve(root, "src/views"), join(outDir, "_crumbun"));
  await Bun.write(join(outDir, ".nojekyll"), "");

  for (const path of options.paths ?? ["/"]) {
    const url = new URL(path, "https://crumbun.local");
    const response = await app.fetch(new Request(url.href));

    if (!response.ok) {
      throw new Error(`Failed to export ${url.pathname}: ${response.status}`);
    }

    const outputPath = staticOutputPath(outDir, url.pathname, response.headers.get("content-type") ?? "");
    await mkdir(dirname(outputPath), { recursive: true });
    await Bun.write(outputPath, await response.arrayBuffer());
  }

  return { outDir };
}

export function routePatternFromPageFile(apiDir: string, file: string) {
  const parts = relative(apiDir, dirname(file))
    .split(sep)
    .filter(Boolean)
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? `:${part.slice(1, -1)}` : part));

  return `/${parts.join("/")}`;
}

export function matchPattern(pattern: string, pathname: string) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};

  if (patternParts.length !== pathParts.length) return null;

  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

async function loadRoutes(apiDir: string, development: boolean) {
  const files = await findPages(apiDir);
  const routes: Route[] = [];

  for (const file of files) {
    const pattern = routePatternFromPageFile(apiDir, file);
    const url = pathToFileURL(file);

    if (development) url.searchParams.set("t", String(Date.now()));

    routes.push({
      pattern,
      module: (await import(url.href)) as PageModule,
      dynamicCount: pattern.split("/").filter((part) => part.startsWith(":")).length,
    });
  }

  return routes.sort((a, b) => a.dynamicCount - b.dynamicCount || b.pattern.length - a.pattern.length);
}

async function findPages(dir: string) {
  return findFiles(dir, (name) => pageFile.test(name));
}

async function findFiles(dir: string, matches: (name: string) => boolean): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findFiles(path, matches)));
    } else if (entry.isFile() && matches(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

async function copyIfExists(from: string, to: string) {
  try {
    await cp(from, to, { recursive: true, force: true });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function copyViewStyles(viewsDir: string, outDir: string) {
  for (const file of await findFiles(viewsDir, (name) => name.endsWith(".css"))) {
    const outputPath = join(outDir, relative(viewsDir, file));
    await mkdir(dirname(outputPath), { recursive: true });
    await cp(file, outputPath);
  }
}

function staticOutputPath(outDir: string, pathname: string, contentType: string) {
  const cleanPath = pathname.replace(/^\/+/, "");
  const isHtml = contentType.toLowerCase().includes("text/html");
  const outputFile = isHtml && (!cleanPath || cleanPath.endsWith("/") || !extname(cleanPath))
    ? join(cleanPath, "index.html")
    : cleanPath || "index.html";
  const outputPath = safePath(outDir, outputFile);

  if (!outputPath) throw new Error(`Refusing to export unsafe path: ${pathname}`);
  return outputPath;
}

async function viewAssetResponse(viewsDir: string, pathname: string) {
  if (!pathname.startsWith("/_crumbun/") || !pathname.endsWith(".css")) return null;
  return fileResponse(viewsDir, pathname.slice("/_crumbun/".length));
}

async function fileResponse(root: string, pathname: string) {
  const path = safePath(root, pathname);
  if (!path) return null;

  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  return new Response(file, {
    headers: { "content-type": contentType(path) },
  });
}

function safePath(root: string, pathname: string) {
  let decoded;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const path = resolve(root, decoded.replace(/^\/+/, ""));
  return path === root || path.startsWith(`${root}${sep}`) ? path : null;
}

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(value), { ...init, headers });
}

function toResponse(result: PageResult) {
  if (result instanceof Response) return result;
  if (result == null) return new Response(null, { status: 204 });
  if (typeof result === "string") {
    return new Response(result, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return json(result);
}

function allowedMethods(module: PageModule) {
  return methods.filter((method) => module[method]);
}

function contentType(path: string) {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

const highlightKeywords = new Set([
  "as",
  "async",
  "await",
  "const",
  "default",
  "else",
  "export",
  "extends",
  "false",
  "from",
  "function",
  "if",
  "import",
  "let",
  "new",
  "null",
  "return",
  "true",
  "type",
]);

const highlightBuiltins = new Set([
  "Bun",
  "PageContext",
  "Request",
  "Response",
  "URL",
  "createApp",
  "exportStatic",
  "highlightCode",
  "json",
  "render",
  "serve",
]);

function highlightClass(token: string, isShell: boolean) {
  if (token.startsWith("//") || token.startsWith("/*") || (isShell && token.startsWith("#"))) return "cb-comment";
  if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) return "cb-string";
  if (/^\d/.test(token)) return "cb-number";
  if (highlightKeywords.has(token)) return "cb-keyword";
  if (highlightBuiltins.has(token)) return "cb-builtin";
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
