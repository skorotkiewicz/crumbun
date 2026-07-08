import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { cp, mkdir, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";

const pageFile = /^page\.(ts|js|mjs|tsx|jsx)$/;

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

export async function fileResponse(root: string, pathname: string) {
  const path = safePath(root, pathname);
  if (!path) return null;

  const file = Bun.file(path);
  if (!(await file.exists())) return null;

  return new Response(file, {
    headers: { "content-type": contentType(path) },
  });
}

export async function viewAssetResponse(viewsDir: string, pathname: string) {
  if (!pathname.startsWith("/_crumbun/") || !pathname.endsWith(".css")) return null;
  return fileResponse(viewsDir, pathname.slice("/_crumbun/".length));
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
  for (const file of await findFiles(viewsDir, (name) => name.endsWith(".css"))) {
    const outputPath = join(outDir, relative(viewsDir, file));
    await mkdir(dirname(outputPath), { recursive: true });
    await cp(file, outputPath);
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
