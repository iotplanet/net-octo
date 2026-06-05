import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/** Ensure boot-theme.js runs before @vite/client in dev and build. */
function themeBootFirst(): Plugin {
  return {
    name: "netocto-theme-boot-first",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes("boot-theme.js")) return html;
        return [
          {
            tag: "script",
            attrs: { src: "/boot-theme.js" },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [themeBootFirst(), react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  // 优化桌面应用构建
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          heroui: ['@heroui/react', '@heroui/styles'],
          tauri: ['@tauri-apps/api'],
        },
      }
    }
  },
  
  // 解决路径别名（如果使用 monorepo）
  resolve: {
    alias: {
      '@': '/src',
    },
  },
}));
