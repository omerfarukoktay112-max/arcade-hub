// Bağımlılıksız statik sunucu (yalnızca yerel geliştirme/test için).
// Kullanım: node tests/serve.mjs [port]   →   http://localhost:8000/
// Alt dizin yayınını taklit etmek için: http://localhost:8000/arcade-hub/ de çalışır.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function startServer(port = 8000) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // GitHub Pages alt dizinini taklit et: /arcade-hub/... → /...
      if (path === '/arcade-hub') {
        res.writeHead(301, { Location: '/arcade-hub/' }).end();
        return;
      }
      if (path.startsWith('/arcade-hub/')) path = path.slice('/arcade-hub'.length);
      let file = normalize(join(ROOT, path));
      if (file !== ROOT && !file.startsWith(ROOT + sep)) throw new Error('forbidden');
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8000;
  startServer(port).then(() => console.log(`Arcade Hub: http://localhost:${port}/`));
}
