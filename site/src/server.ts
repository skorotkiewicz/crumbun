import { fileURLToPath } from "node:url";
import { serve } from "crumbun";

const server = await serve({
  root: fileURLToPath(new URL("..", import.meta.url)),
});

console.log(`Crumbun site running at http://${server.hostname}:${server.port}`);
