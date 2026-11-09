import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.resolve(projectRoot, 'docs');
const port = Number(process.env.STATIC_PORT || 5500);
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon']
]);

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).end();
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://static.local').pathname); }
  catch { response.writeHead(400, { 'Cache-Control': 'no-store' }).end(); return; }

  const relative = pathname.replace(/^[/\\]+/, '');
  if (relative.split(/[\\/]/).some(segment => segment.startsWith('.'))) {
    response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  let target = path.resolve(publicRoot, relative || 'index.html');
  if (target !== publicRoot && !target.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  try {
    if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    const extension = path.extname(target).toLowerCase();
    if (!mimeTypes.has(extension) || !fs.statSync(target).isFile()) throw new Error('not public');
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(extension),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(target).pipe(response);
  } catch {
    if (!response.headersSent) response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Static docs root: ${publicRoot}\nOpen http://127.0.0.1:${server.address().port}/seguimiento.html\n`);
});
