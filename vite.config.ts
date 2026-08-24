import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    watch: {
      ignored: [
        "**/work/**",
        "**/dist/**",
        "**/.npm-cache/**",
        "**/.vite/**",
        "**/.wrangler/**",
        "**/.next/**",
      ],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
