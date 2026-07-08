import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "crumbun";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const app = await createApp({ root });

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "public"), dist, { recursive: true });
await Bun.write(join(dist, ".nojekyll"), "");

await writeResponse("/", "index.html");
await writeResponse("/_crumbun/style.css", "_crumbun/style.css");

console.log(`Exported ${dist}`);

async function writeResponse(pathname: string, outputFile: string) {
  const response = await app.fetch(new Request(`https://crumbun.local${pathname}`));

  if (!response.ok) {
    throw new Error(`Failed to export ${pathname}: ${response.status}`);
  }

  const outputPath = join(dist, outputFile);
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, await response.arrayBuffer());
}
