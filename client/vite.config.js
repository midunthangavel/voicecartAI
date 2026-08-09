import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listens on 0.0.0.0 for local network mobile access
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/voice': 'http://localhost:3001',
      '/pin': 'http://localhost:3001',
      '/web-stream': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/dashboard-ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});
