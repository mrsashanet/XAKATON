import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), args.includes('--dist') ? 'dist' : '.');
const host = option('--host', process.env.HOST || '127.0.0.1');
const port = Number(option('--port', process.env.PORT || '5173'));
const target = new URL(process.env.API_TARGET || 'http://127.0.0.1:8000');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  if (req.url === '/api' || req.url?.startsWith('/api/')) {
    const upstream = http.request({ hostname: target.hostname, port: target.port || 80, path: req.url.slice(4) || '/', method: req.method,
      headers: { ...req.headers, host: target.host } }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Backend недоступен. Запустите FastAPI на порту 8000.' }));
    });
    upstream.setTimeout(20000, () => upstream.destroy(new Error('Backend timeout')));
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('\0') || pathname.split('/').some((part) => part.startsWith('.'))) throw new Error('Forbidden');
    let filename = path.resolve(root, '.' + pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) throw new Error('Forbidden');
    try { if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html'); }
    catch { if (!path.extname(pathname)) filename = path.join(root, 'index.html'); }
    const content = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Страница не найдена'); }
});
server.listen(port, host, () => console.log(`Universe Voicee: http://localhost:${port}\nAPI proxy: ${target.origin}`));
server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Порт ${port} уже занят. Укажите --port 5174.` : error.message); process.exitCode = 1; });
