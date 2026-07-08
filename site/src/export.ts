import { fileURLToPath } from "node:url";
import { exportStatic } from "crumbun";

const root = fileURLToPath(new URL("..", import.meta.url));
const result = await exportStatic({ root });

console.log(`Exported ${result.outDir}`);
