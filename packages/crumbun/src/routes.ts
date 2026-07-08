import { pathToFileURL } from "node:url";
import { dirname, relative, sep } from "node:path";
import { findPages } from "./files";
import type { PageModule, Route } from "./types";

export function routePatternFromPageFile(apiDir: string, file: string) {
  const parts = relative(apiDir, dirname(file))
    .split(sep)
    .filter(Boolean)
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => (part.startsWith("[") && part.endsWith("]") ? `:${part.slice(1, -1)}` : part));

  return `/${parts.join("/")}`;
}

export function matchPattern(pattern: string, pathname: string) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};

  if (patternParts.length !== pathParts.length) return null;

  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];
    if (patternPart === undefined || pathPart === undefined) return null;

    if (patternPart.startsWith(":")) {
      try {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      } catch {
        return null;
      }
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

export async function loadRoutes(apiDir: string, development: boolean) {
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
