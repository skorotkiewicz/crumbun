import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { cp, mkdir, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { compile } from "sass";

const pageFile = /^page\.(ts|js|mjs|tsx|jsx)$/;
const cssFile = /\.css$/;
const scssFile = /\.scss$/;

export function safePath(root: string, pathname: string) {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const path = resolve(root, decoded.replace(/^\/+/, ""));
  return path === root || path.startsWith(`${root}${sep}`) ? path : null;
}

export async function fileResponse(root: string, pathname: string, request?: Request) {
  const path = safePath(root, pathname);
  if (!path) return null;

  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  const headers = new Headers();
  headers.set("content-type", contentType(path));

  const etag = `"${file.size}-${file.lastModified}"`;
  headers.set("etag", etag);
  headers.set("cache-control", "public, max-age=3600");

  if (request && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(file, { headers });
}

export async function viewAssetResponse(viewsDir: string, pathname: string, request?: Request) {
  if (!pathname.startsWith("/_crumbun/") || !cssFile.test(pathname)) return null;

  const cssName = pathname.slice("/_crumbun/".length);
  const cssPath = safePath(viewsDir, cssName);
  if (cssPath && (await Bun.file(cssPath).exists())) return fileResponse(viewsDir, cssName, request);

  const scssPath = safePath(viewsDir, cssName.replace(cssFile, ".scss"));
  if (!scssPath) return null;

  const file = Bun.file(scssPath);
  if (!(await file.exists())) return null;

  const css = compileScss(scssPath);
  const etag = `"scss-${createHash("sha1").update(css).digest("hex")}"`;
  const headers = new Headers({
    "cache-control": "public, max-age=3600",
    "content-type": "text/css; charset=utf-8",
    etag,
  });

  if (request?.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(css, { headers });
}

export async function findFiles(dir: string, matches: (name: string) => boolean): Promise<string[]> {
  let entries: Dirent[];

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

export async function findPages(dir: string) {
  return findFiles(dir, (name) => pageFile.test(name));
}

export async function copyIfExists(from: string, to: string) {
  try {
    await cp(from, to, { recursive: true, force: true });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

export async function copyViewStyles(viewsDir: string, outDir: string) {
  const written = new Set<string>();

  for (const file of await findFiles(viewsDir, (name) => cssFile.test(name))) {
    const name = relative(viewsDir, file);
    const outputPath = join(outDir, name);
    await mkdir(dirname(outputPath), { recursive: true });
    await cp(file, outputPath);
    written.add(name);
  }

  for (const file of await findFiles(viewsDir, (name) => scssFile.test(name))) {
    const name = relative(viewsDir, file).replace(scssFile, ".css");
    if (written.has(name)) continue;

    const outputPath = join(outDir, name);
    await mkdir(dirname(outputPath), { recursive: true });
    await Bun.write(outputPath, compileScss(file));
  }
}

export function staticOutputPath(outDir: string, pathname: string, contentType: string) {
  const cleanPath = pathname.replace(/^\/+/, "");
  const isHtml = contentType.toLowerCase().includes("text/html");
  const outputFile = isHtml && (!cleanPath || cleanPath.endsWith("/") || !extname(cleanPath))
    ? join(cleanPath, "index.html")
    : cleanPath || "index.html";
  const outputPath = safePath(outDir, outputFile);

  if (!outputPath) throw new Error(`Refusing to export unsafe path: ${pathname}`);
  return outputPath;
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

function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function compileScss(file: string) {
  const css = compile(file, { style: "expanded" }).css.trim();
  return css ? `${css}\n` : "";
}
