import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App, createRuntimeConfig } from "./App";
import { queryClient } from "./queryClient";
import "./styles.css";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Missing #app root.");
}

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App config={createRuntimeConfig()} />
  </QueryClientProvider>
);
