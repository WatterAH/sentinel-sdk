import { defineConfig } from "vite";

export default defineConfig({
  // Assets relativos: funciona tanto en localhost como bajo /sentinel-sdk/ en Pages.
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
