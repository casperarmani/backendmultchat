import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/auth_status': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/login': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/logout': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/chat_history': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/video_analysis_history': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/send_message': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/user/tokens' : {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/conversations' : {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true
      },
      '/api': {
        target: 'http://0.0.0.0:8080',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, '')
      },
    }
  }
})
