import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeRuntimeConfig(root: string, outDir: string) {
  await writeFile(join(outDir, "config.js"), await runtimeConfigScript(root));
}

export async function runtimeConfigScript(root: string) {
  const localConfig = join(root, "public/config.local.js");

  if (await exists(localConfig)) {
    return readFile(localConfig, "utf8");
  }

  const config = {
    clientId: process.env.KINOPUB_API_CLIENT_ID ?? process.env.KINO_CLIENT_ID ?? "xbmc",
    clientSecret: process.env.KINOPUB_API_CLIENT_SECRET ?? process.env.KINO_CLIENT_SECRET ?? "cgg3gtifu46urtfp2zp1nqtba0k2ezxh",
    apiBase: process.env.KINOPUB_API_BASE_URL ?? process.env.KINO_API_BASE ?? "https://api.service-kp.com",
    deviceTitle: process.env.KINO_DEVICE_TITLE ?? "LG webOS TV",
    deviceHardware: process.env.KINO_DEVICE_HARDWARE ?? "webOS",
    deviceSoftware: process.env.KINO_DEVICE_SOFTWARE ?? "Kino.pub TV",
    deviceId: process.env.KINO_DEVICE_ID,
    preferredStream: process.env.KINO_PREFERRED_STREAM ?? "hls4"
  };

  return `window.KINO_TV_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
}

export async function copyIfExists(from: string, to: string) {
  if (await exists(from)) {
    await copyFile(from, to);
  }
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
