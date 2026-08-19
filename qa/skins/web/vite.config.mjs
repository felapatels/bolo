// Task #1117, vite config for the web skin mock.
//
// Copied into artifacts/gujarati-coach/src/<temp>/ next to the harness, so it
// resolves the artifact's own plugins, deps and `@` alias, and Tailwind's
// source scan (rooted at src/) already covers the harness. Mirrors the
// artifact's vite.config.ts minus the app-only bits (base path, dev banner,
// cartographer, runtime error overlay).
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const here = import.meta.dirname; // src/<temp>
const src = path.resolve(here, "..");
const artifact = path.resolve(src, "..");
const repo = path.resolve(artifact, "..", "..");

export default defineConfig({
  root: here,
  base: "/",
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: {
    alias: {
      "@": src,
      "@assets": path.resolve(repo, "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: Number(process.env.SKIN_MOCK_PORT ?? 5599),
    strictPort: true,
    host: "127.0.0.1",
    fs: { allow: [repo] },
  },
});
