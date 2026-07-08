import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { highlightCode } from "./highlight";
import {
  copyIfExists,
  copyViewStyles,
  fileResponse,
  safePath,
  staticOutputPath,
  viewAssetResponse,
} from "./files";
import { loadRoutes, matchPattern, routePatternFromPageFile } from "./routes";
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
};
export { highlightCode, matchPattern, routePatternFromPageFile };

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
