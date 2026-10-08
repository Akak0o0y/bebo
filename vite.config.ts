import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
const cursorFiles = ['cursor.html', 'cursor.css', 'cursor-renderer.js', 'cursor-demo.js', 'cursor-demo.css', 'control-cancel.css'];
export default defineConfig({ plugins: [react(), {
  name: 'bebo-cursor-playground',
  configureServer(server) {
    server.middlewares.use('/cursor-preview', (request, response, next) => {
      const name = (request.url || '').split('?')[0].slice(1);
      if (!cursorFiles.includes(name)) return next();
      response.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/javascript');
      response.end(fs.readFileSync(path.resolve('electron', name)));
    });
  },
  generateBundle() {
    for (const name of cursorFiles) this.emitFile({ type: 'asset', fileName: `cursor-preview/${name}`, source: fs.readFileSync(path.resolve('electron', name)) });
  },
}], base: './', server: { host: '127.0.0.1', port: 5173, strictPort: true } });
