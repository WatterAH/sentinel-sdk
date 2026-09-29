import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
  esbuildPlugins: [
    {
      name: "forbid-full-dataset-in-public-bundle",
      setup(build) {
        build.onResolve({ filter: /sentinel_dataset_v3\.json$/ }, () => ({
          errors: [
            {
              text: "The public npm bundle must import sentinel_dataset_v3_seed.json, never the full V3 dataset.",
            },
          ],
        }));
      },
    },
  ],
});
