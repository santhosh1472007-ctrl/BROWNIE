import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [{
        name: 'copy-static-assets',
        closeBundle() {
            cpSync('static', 'dist/static', { recursive: true });
        }
    }],
    build: {
        emptyOutDir: false,
        outDir: 'dist'
    },
    publicDir: false
});