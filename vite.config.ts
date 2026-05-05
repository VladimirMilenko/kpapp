import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeConfigScript } from "./scripts/runtimeConfig";

const root = dirname(fileURLToPath(new URL("package.json", import.meta.url)));

export default defineConfig({
  base: "./",
  plugins: [react(), runtimeConfigPlugin()],
  publicDir: "public",
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 4173)
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 4173)
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: true,
    target: "chrome120",
    modulePreload: false,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/hls.js")) {
            return "hls";
          }

          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) {
            return "react";
          }

          return undefined;
        }
      }
    }
  }
});

function runtimeConfigPlugin(): Plugin {
  return {
    name: "kino-runtime-config",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];

        if (path !== "/config.js") {
          next();
          return;
        }

        try {
          response.statusCode = 200;
          response.setHeader("content-type", "text/javascript; charset=utf-8");
          response.end(await runtimeConfigScript(root));
        } catch (error) {
          next(error);
        }
      });
    }
  };
}
