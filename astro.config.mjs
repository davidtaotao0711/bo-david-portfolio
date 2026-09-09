import { defineConfig } from 'astro/config';
import localEditor from './scripts/local-editor';
export default defineConfig({ output: 'static', base: process.env.VERCEL === '1' ? '/Zine' : '/', devToolbar: { enabled: false }, integrations: [localEditor(new URL('./', import.meta.url))] });
