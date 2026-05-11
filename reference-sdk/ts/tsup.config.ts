import { defineConfig } from "tsup";

export default defineConfig([
  // Primary dual-format build (ESM + CJS)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: "dist",
  },
  // Vendor single-file ESM bundle (no splitting, minified)
  {
    entry: {
      "eidolons-ecl-sdk.bundle": "src/index.ts",
    },
    format: ["esm"],
    noSplitting: true,
    minify: true,
    sourcemap: true,
    outDir: "dist",
  },
]);
