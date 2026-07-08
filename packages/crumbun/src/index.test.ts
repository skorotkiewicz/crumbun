import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { createApp, matchPattern, routePatternFromPageFile } from "./index";

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
    'export function GET({ params }) { return new Response(`story:${params.id}`); }\n',
  );

  const app = await createApp({ root });
  const response = await app.fetch(new Request("http://crumbun.test/story/abc"));

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("story:abc");
});
