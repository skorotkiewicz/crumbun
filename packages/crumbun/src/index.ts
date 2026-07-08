import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { highlightCode, highlightCss } from "./highlight";
import {
  copyIfExists,
  copyViewStyles,
  fileResponse,
  safePath,
  staticOutputPath,
  viewAssetResponse,
} from "./files";
import { loadRoutes, matchPattern, routePatternFromPageFile } from "./routes";
import { parseCookies, serializeCookie, type Cookies, type CookieOptions } from "./cookies";
import { methods, type CrumbunOptions, type HttpMethod, type PageContext, type PageHandler, type PageResult, type StaticExportOptions, type StaticExportResult } from "./types";

type CrumbunApp = {
  root: string;
  fetch: (request: Request) => Promise<Response>;
};

const require = createRequire(import.meta.url);
const pug = require("pug") as {
  renderFile: (file: string, locals?: Record<string, unknown>) => string;
};

export type {
  CrumbunOptions,
  PageContext,
  PageHandler,
  StaticExportOptions,
  StaticExportResult,
  Cookies,
  CookieOptions,
};
export { highlightCode, matchPattern, routePatternFromPageFile };

export function env(key: string): string | undefined;
export function env(key: string, fallback: string): string;
export function env(key: string, fallback?: string): string | undefined {
  return Bun.env[key] ?? fallback;
}

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

  async function renderView(view: string, locals: Record<string, unknown>): Promise<string | null> {
    const viewPath = safePath(viewsDir, view.endsWith(".pug") ? view : `${view}.pug`);
    if (!viewPath || !(await Bun.file(viewPath).exists())) return null;
    return pug.renderFile(viewPath, { ...locals, basedir: viewsDir, highlightCode });
  }

  async function hasLayout(view: string): Promise<boolean> {
    const layoutPath = safePath(viewsDir, "_layout.pug");
    if (!layoutPath || !(await Bun.file(layoutPath).exists())) return false;

    const viewPath = safePath(viewsDir, view.endsWith(".pug") ? view : `${view}.pug`);
    if (!viewPath) return true;
    const source = await Bun.file(viewPath).text();
    const firstMeaningful = source
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("//"));
    return firstMeaningful ? !firstMeaningful.startsWith("extends") : true;
  }

  async function render(
    view: string,
    locals: Record<string, unknown> = {},
    init: ResponseInit = {},
  ): Promise<Response> {
    const inner = await renderView(view, locals);
    if (inner == null) return new Response("View not found", { status: 404 });

    let html = inner;
    const layoutOpt = locals.layout;
    const layoutView =
      layoutOpt === false ? null : typeof layoutOpt === "string" ? layoutOpt : (await hasLayout(view) ? "_layout" : null);

    if (layoutView) {
      const wrapped = await renderView(layoutView, { ...locals, content: inner });
      if (wrapped != null) html = wrapped;
    }

    const headers = new Headers(init.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(html, { ...init, headers });
  }

  async function errorResponse(
    status: number,
    message: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const view = await renderView("_error", { status, message });
    if (view != null) {
      const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
      for (const [key, value] of Object.entries(extra)) headers.set(key, value);
      return new Response(view, { status, headers });
    }
    return new Response(message, {
      status,
      headers: { ...extra, "content-type": "text/plain; charset=utf-8" },
    });
  }

  async function fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "GET" || request.method === "HEAD") {
      const viewAsset = await viewAssetResponse(viewsDir, url.pathname, request);
      if (viewAsset) return viewAsset;

      if (url.pathname === "/_crumbun/highlight.css") {
        return new Response(highlightCss, {
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      }

      if (url.pathname !== "/") {
        const publicFile = await fileResponse(publicDir, url.pathname, request);
        if (publicFile) return publicFile;
      }
    }

    const route = routes.find((candidate) => matchPattern(candidate.pattern, url.pathname));

    if (route) {
      const params = matchPattern(route.pattern, url.pathname) ?? {};
      const method = request.method === "HEAD" ? "GET" : (request.method as HttpMethod);
      const handler = route.module[method] ?? route.module.default;

      if (!handler) {
        return errorResponse(405, "Method not allowed", {
          allow: allowedMethods(route.module).join(", "),
        });
      }

      const parsed = parseCookies(request.headers.get("cookie") ?? "");
      const pendingCookies: string[] = [];
      const cookies: Cookies = {
        get: (name) => parsed[name],
        set: (name, value, opts) => {
          pendingCookies.push(serializeCookie(name, value, opts));
        },
        delete: (name, opts) => {
          pendingCookies.push(serializeCookie(name, "", { ...opts, maxAge: 0 }));
        },
        all: parsed,
      };

      const context: PageContext = {
        request,
        params,
        url,
        render,
        json,
        highlightCode,
        redirect: (path, status = 302) => new Response(null, { status, headers: { location: path } }),
        cookies,
      };

      const response = toResponse(await handler(context));
      for (const cookie of pendingCookies) response.headers.append("Set-Cookie", cookie);
      return response;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/" || options.spa) return render("index", { active: "start" });
    }

    return errorResponse(404, "Not found");
  }

  return { root, fetch };
}

export async function exportStatic(options: StaticExportOptions = {}): Promise<StaticExportResult> {
  const root = resolve(options.root ?? process.cwd());
  const outDir = resolve(root, options.outDir ?? "dist");

  if (outDir === root) throw new Error("Refusing to export into the app root");
  if (options.clean !== false) await rm(outDir, { recursive: true, force: true });

  const app = await createApp({ root, development: options.development });
  await mkdir(outDir, { recursive: true });
  await copyIfExists(resolve(root, "public"), outDir);
  await Bun.write(join(outDir, "_crumbun/highlight.css"), highlightCss);
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

function allowedMethods(module: import("./types").PageModule) {
  return methods.filter((method) => module[method]);
}
