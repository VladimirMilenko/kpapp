import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyIfExists, writeRuntimeConfig } from "./runtimeConfig";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(root, "dist");

await mkdir(dist, { recursive: true });
await rm(join(dist, ".DS_Store"), { force: true });
await copyIfExists(join(root, "appinfo.json"), join(dist, "appinfo.json"));
await writeRuntimeConfig(root, dist);
await rewriteModuleScriptsForWebOs4(join(dist, "index.html"));

console.log(`Prepared webOS package assets in ${dist}`);

async function rewriteModuleScriptsForWebOs4(path: string) {
  const html = await readFile(path, "utf8");
  const rewritten = html
    .replace(/\s+type="module"/g, "")
    .replace(/\s+crossorigin(="[^"]*")?/g, "")
    .replace(/<script src=/g, "<script defer src=");

  if (rewritten !== html) {
    await writeFile(path, rewritten);
  }
}
