import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    target: "es2020",
    rollupOptions: {
      input: "index.html",
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    // Reverse-Proxy / externe Hostnamen (z.B. Apache, Plesk, VPS)
    allowedHosts: true,
  },
  preview: {
    port: 4173,
    host: true,
    strictPort: true,
    // WICHTIG: Bei Reverse-Proxy vor Vite Preview (Apache/Plesk)
    // kann der Hostname von außen hereingereicht werden.
    // Für statische Apps ist hier ein offener Host-Check praktikabel.
    allowedHosts: true,
  },
});
