import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    define: {
        'process.env': process.env
    },
    server: {
        host: '0.0.0.0',
        port: parseInt(process.env.PORT || '3000'),
    },
    preview: {
        host: '0.0.0.0',
        port: parseInt(process.env.PORT || '3000'),
    }
});
