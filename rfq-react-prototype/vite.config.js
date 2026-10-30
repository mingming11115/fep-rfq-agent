import { defineConfig } from 'vite';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { proxy: { '/api/office': { target: process.env.RFQ_BACKEND_URL || 'http://127.0.0.1:48081', changeOrigin: true } } },
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
