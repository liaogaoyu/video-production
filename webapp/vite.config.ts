import { defineConfig } from "vite";
export default defineConfig({
  base: "/ui/",
  server: { proxy: { "/api": "http://127.0.0.1:4320" } },
  build: { chunkSizeWarningLimit: 1100 },
});
