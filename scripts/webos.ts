import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyIfExists, writeRuntimeConfig } from "./runtimeConfig";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(root, "dist");

await mkdir(dist, { recursive: true });
await copyIfExists(join(root, "appinfo.json"), join(dist, "appinfo.json"));
await writeRuntimeConfig(root, dist);

console.log(`Prepared webOS package assets in ${dist}`);
