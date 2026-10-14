import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
  	host: '0.0.0.0',
    port: 1223,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/llm-api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, '/api'),
      },
    },
    allowedHosts:["a21337217859973120620205-secuplat3web.svc.bitahub.com"]
  },
})
