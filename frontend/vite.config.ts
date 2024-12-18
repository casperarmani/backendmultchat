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
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/login': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/logout': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/signup': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/chat_history': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/video_analysis_history': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/send_message': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/user/tokens': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/conversations': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
