import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite config for local development, production builds, and local production previews.
export default defineConfig({
  // React plugin enables JSX, fast refresh in development, and React-specific build transforms.
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // React and Supabase change less often than recipes and screens. Keeping
        // them in a separate hashed file lets returning devices reuse that cache.
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
  server: {
    // Binding to localhost keeps the dev server private to this Mac unless the user changes it.
    host: "127.0.0.1",
    port: 3000,
    watch: {
      // Generated or dependency-heavy folders are ignored so Vite does not restart repeatedly while
      // tools, build output, or caches are changing.
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
    // Preview serves the built dist/ folder and is useful for testing PWA-like production behavior.
    host: "127.0.0.1",
    port: 4173,
  },
});
