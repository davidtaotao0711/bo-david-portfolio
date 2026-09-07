import type { AstroIntegration } from 'astro';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { EditorStore, EditorError } from './editor-store';
import { GitHubSync } from './github-sync';

async function body(request: IncomingMessage, maximum: number) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximum) throw new EditorError('文件过大，单张照片请控制在 40 MB 以内。', 413);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export default function localEditor(root: URL): AstroIntegration {
  const store = new EditorStore(fileURLToPath(root));
  const sync = new GitHubSync(fileURLToPath(root), store);
  return {
    name: 'bo-david-local-editor',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((request, response, next) => {
          const pathname = request.url?.split('?')[0];
          if (pathname !== '/editor' && pathname !== '/editor/' && !pathname?.startsWith('/__editor/')) return next();
          const send = (status: number, data: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
          void (async () => {
            const host = request.headers.host ?? '';
            if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new EditorError('编辑器只允许本机访问。', 403);
            if (request.headers.origin && request.headers.origin !== `http://${host}`) throw new EditorError('不允许跨站编辑请求。', 403);
            if (request.headers['sec-fetch-site'] === 'cross-site') throw new EditorError('不允许跨站编辑请求。', 403);
            const url = new URL(request.url!, `http://${host}`);
            // Serve a plain page, without the Vite client: content updates must not
            // reload this window in the middle of a multi-file upload.
            const assets: Record<string, [string, string]> = {
              '/editor': ['src/editor/index.html', 'text/html; charset=utf-8'],
              '/editor/': ['src/editor/index.html', 'text/html; charset=utf-8'],
              '/__editor/assets/style.css': ['src/editor/editor.css', 'text/css; charset=utf-8'],
              '/__editor/assets/editor.js': ['src/editor/editor.ts', 'text/javascript; charset=utf-8'],
            };
            const asset = assets[url.pathname];
            if (request.method === 'GET' && asset) {
              let content = await readFile(new URL(asset[0], root), 'utf8');
              if (asset[0].endsWith('.ts')) content = transpileModule(content, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext } }).outputText;
              response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' }); response.end(content); return;
            }
            if (request.method === 'GET' && url.pathname === '/__editor/state') return send(200, await store.snapshot());
            if (request.method === 'GET' && url.pathname === '/__editor/github-sync') return send(200, sync.status);
            if (request.method !== 'POST' || request.headers['x-bo-editor'] !== 'local') throw new EditorError('无效的编辑请求。', 403);
            const revision = request.headers['if-match'] as string | undefined;
            if (url.pathname === '/__editor/github-sync') return send(202, await sync.start(revision));
            if (sync.status.state === 'running') throw new EditorError('正在从 GitHub 同步，请完成后再编辑。', 409);
            const slug = url.searchParams.get('project') ?? '';
            if (url.pathname === '/__editor/upload') {
              const filename = decodeURIComponent(String(request.headers['x-file-name'] ?? 'Photograph'));
              const buffer = await body(request, 40 * 1024 * 1024);
              return send(200, await store.upload(revision, slug, buffer, filename));
            }
            if (!request.headers['content-type']?.startsWith('application/json')) throw new EditorError('需要 JSON 请求。');
            const raw = await body(request, 100_000);
            let data;
            try { data = JSON.parse(raw.toString()); } catch { throw new EditorError('请求数据不正确。'); }
            if (url.pathname === '/__editor/order') return send(200, await store.saveOrder(revision, slug, data.ids, data.cover));
            if (url.pathname === '/__editor/projects-order') return send(200, await store.saveProjectOrder(revision, data.ids));
            if (url.pathname === '/__editor/clear-placeholders') return send(200, await store.clearPlaceholders(revision, slug));
            throw new EditorError('未找到此操作。', 404);
          })().catch(error => { console.error('[local-editor]', error.message); send(error instanceof EditorError ? error.status : 500, { error: error instanceof EditorError ? error.message : '保存失败，现有项目内容未被覆盖。请重试。' }); });
        });
      },
    },
  };
}
