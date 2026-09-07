import { defineConfig } from 'astro/config';
import localEditor from './scripts/local-editor';
export default defineConfig({ output: 'static', devToolbar: { enabled: false }, integrations: [localEditor(new URL('./', import.meta.url))] });
