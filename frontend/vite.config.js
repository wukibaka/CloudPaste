import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), "");

  // 打印环境变量，帮助调试
  console.log("Vite环境变量:", {
    VITE_BACKEND_URL: env.VITE_BACKEND_URL || "未设置",
    VITE_APP_ENV: env.VITE_APP_ENV || "未设置",
    MODE: mode,
    COMMAND: command,
  });

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    // 将环境变量作为定义注入到应用中
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_APP_ENV || "production"),
      // 使用动态import.meta.env来支持运行时环境变量
      __BACKEND_URL__: "import.meta.env.VITE_BACKEND_URL",
    },
    server: {
      port: 3000,
      open: true,
      // 设置代理 - 仅在本地开发模式下使用
      proxy: {
        // 当 VITE_BACKEND_URL 为本地地址时，将请求代理到本地worker
        "/api": {
          target: env.VITE_BACKEND_URL || "http://localhost:8787",
          changeOrigin: true,
          secure: false,
          // 打印代理日志
          configure: (proxy, _options) => {
            proxy.on("error", (err, _req, _res) => {
              console.log("代理错误", err);
            });
            proxy.on("proxyReq", (proxyReq, req, _res) => {
              console.log("代理请求:", req.method, req.url);
            });
            proxy.on("proxyRes", (proxyRes, req, _res) => {
              console.log("代理响应:", req.method, req.url, proxyRes.statusCode);
            });
          },
        },
      },
    },
    optimizeDeps: {
      include: ["vue-i18n"],
    },
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          // 生产环境保留console.warn和console.error，方便调试环境变量问题
          pure_funcs: ["console.log", "console.info", "console.debug"],
        },
      },
    },
  };
});
