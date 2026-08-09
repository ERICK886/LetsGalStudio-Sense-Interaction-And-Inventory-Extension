/**
 * vite.config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 扩展库构建：单文件 dist/index.mjs，动态 import 内联，避免 Studio 只加载入口而丢 chunk。
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      fileName: () => "index.mjs",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@avg-studio/sdk",
      ],
      output: {
        // App 壳用动态 import 降首屏同步求值；必须内联进 index.mjs，Studio 不加载附属 chunk
        inlineDynamicImports: true,
      },
    },
    outDir: "dist",
    // 避免 emptyOutDir 清空瞬间 Studio 同步读不到 dist/index.mjs
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
  },
});
