import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  mode: "production",
  plugins: [
    react(),
  ],
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    rollupOptions: {
      input: "./client/index.html"
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
});