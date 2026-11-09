import http from 'node:http';
import crypto from 'node:crypto';

export function send(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

export function error(res, status, code, message) {
  send(res, status, { error: { code, message } });
}

export async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const issue = new Error('BODY_TOO_LARGE');
      issue.status = 413;
      throw issue;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return { raw, value: {} };
  try {
    return { raw, value: JSON.parse(raw) };
  } catch {
    const issue = new Error('INVALID_JSON');
    issue.status = 400;
    throw issue;
  }
}

export function requireService(req, res, expected = '') {
  const supplied = req.headers['x-service-token'] || '';
  const accepted = (Array.isArray(expected) ? expected : [expected]).filter(Boolean);
  if (!accepted.length) {
    error(res, 503, 'SERVICE_IDENTITY_NOT_CONFIGURED', 'La identidad técnica no está configurada.');
    return false;
  }
  const suppliedBytes = Buffer.from(String(supplied));
  const valid = accepted.some(value => {
    const expectedBytes = Buffer.from(value);
    return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
  });
  if (!valid) {
    error(res, 401, 'SERVICE_UNAUTHORIZED', 'Identidad de servicio inválida.');
    return false;
  }
  return true;
}

export function createServer(handler, port) {
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (cause) {
      const status = cause.status || 500;
      error(res, status, status === 500 ? 'INTERNAL_ERROR' : cause.message, status === 500 ? 'Error interno.' : cause.message);
    }
  });
  server.listen(Number(port), '127.0.0.1', () => {
    process.stdout.write(`${server.address().port} listening on 127.0.0.1\n`);
  });
  return server;
}

export async function requestJson(url, { method = 'GET', token, headers = {}, body, timeout = 2000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        ...(token ? { 'X-Service-Token': token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

export function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}
