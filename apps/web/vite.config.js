import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  publicDir: '.generated-public',
  esbuild: { jsx: 'automatic' },
  server: {
    fs: { allow: [fileURLToPath(new URL('../..',import.meta.url))] },
    proxy: {
      '/api/rfq': { target: process.env.RFQ_API_TARGET || 'http://127.0.0.1:48083', changeOrigin: true },
      '/api/craft': { target: process.env.RFQ_CRAFT_API_TARGET || 'http://127.0.0.1:48083', changeOrigin: true },
      '/api/office': { target: process.env.RFQ_BACKEND_URL || 'http://127.0.0.1:48081', changeOrigin: true },
    },
  },
  optimizeDeps: { include: ['antd', '@ant-design/pro-components', '@ant-design/icons', '@ant-design/v5-patch-for-react-19'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (/node_modules\/@ant-design\/pro-/.test(id)) return 'pro-components';
          if (/node_modules\/(antd|@ant-design|@rc-component|rc-[^/]+|dayjs)\//.test(id)) return 'ant-design';
        },
      },
    },
  },
});
