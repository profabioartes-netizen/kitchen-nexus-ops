import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port + relative paths
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2021", outDir: "dist", emptyOutDir: true },
});
