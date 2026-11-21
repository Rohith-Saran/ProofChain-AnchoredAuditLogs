/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [
    react({
      babel: {
        configFile: false,
        babelrc: false,
      },
    }),
  ],
  css: {
    postcss: {
      plugins: [],
    },
  },
  resolve: {
    // Originkit sections import each other via "@/components/originkit/...".
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
