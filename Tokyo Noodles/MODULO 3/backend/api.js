import crypto from 'node:crypto';
import http from 'node:http';
import { cookieValue, error, readBody, requestJson, send } from './lib/http.js';
import { consumeRateLimit, findRoute } from './gateway-policy.js';
import { secretProvider } from './lib/secret-provider.js';

const base = {
  inventory: process.env.INVENTORY_URL || 'http://127.0.0.1:4101',
  orders: process.env.ORDERS_URL || 'http://127.0.0.1:4102',
  clients: process.env.CLIENTS_URL || 'http://127.0.0.1:4103',
  payments: process.env.PAYMENTS_URL || 'http://127.0.0.1:4104',
  graphql: process.env.GRAPHQL_URL || 'http://127.0.0.1:4200'
};
const serviceCredentials = {
  inventory: { read: 'GATEWAY_INVENTORY_READ_TOKEN', write: 'GATEWAY_INVENTORY_WRITE_TOKEN' },
  clients: { auth: 'GATEWAY_CLIENTS_TOKEN' },
  orders: { create: 'GATEWAY_ORDERS_CREATE_TOKEN', read: 'GATEWAY_ORDERS_READ_TOKEN', operations: 'GATEWAY_ORDERS_OPERATIONS_TOKEN' },
  payments: { api: 'GATEWAY_PAYMENTS_API_TOKEN', event: 'GATEWAY_PAYMENTS_EVENT_TOKEN' },
  graphql: { gateway: 'GATEWAY_GRAPHQL_TOKEN' }
};
const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(origin => origin.trim()).filter(Boolean));

function handleCors(req, res, pathname) {
  const origin = String(req.headers.origin || '');
  if (!origin) return false;
  if (!allowedOrigins.has(origin)) {
    error(res, 403, 'CORS_ORIGIN_DENIED', 'El origen no está autorizado.');
    return true;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  if (req.method !== 'OPTIONS') return false;

  const route = findRoute(pathname);
  const routeMethods = route?.methods || [];
  const requestedMethod = String(req.headers['access-control-request-method'] || '').toUpperCase();
  const requestedHeaders = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  const allowedHeaders = new Set(['content-type', ...(route?.id === 'S07-create-order' ? ['idempotency-key'] : [])]);
  if (!routeMethods.includes(requestedMethod) || requestedHeaders.some(header => !allowedHeaders.has(header))) {
    error(res, 403, 'CORS_PREFLIGHT_DENIED', 'El método o las cabeceras no están autorizados para este origen.');
    return true;
  }
  res.writeHead(204, {
    'Access-Control-Allow-Methods': routeMethods.join(', '),
    'Access-Control-Allow-Headers': requestedHeaders.join(', '),
    'Access-Control-Max-Age': '600'
  });
  res.end();
  return true;
}

async function call(service, path, { credential = 'read', ...options } = {}) {
  try {
    const secretReference = serviceCredentials[service]?.[credential];
    if (!secretReference) throw new Error('Unknown service credential scope');
    return await requestJson(`${base[service]}${path}`, { token: secretProvider.getSecret(secretReference), ...options });
  }
  catch { return { status: 503, payload: { error: { code: `${service.toUpperCase()}_UNAVAILABLE`, message: 'Servicio temporalmente no disponible.' } } }; }
}

function downstream(res, result) {
  return send(res, result.status, result.payload || {});
}

async function identity(req, res) {
  const session = cookieValue(req, 'tn_session');
  if (!session) { error(res, 401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.'); return null; }
  const result = await call('clients', '/internal/sessions/verify', { credential: 'auth', method: 'POST', body: { session } });
  if (result.status === 503) { error(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'No se pudo comprobar la sesión temporalmente.'); return null; }
  if (result.status !== 200) { error(res, 401, 'SESSION_INVALID', 'La sesión expiró o no es válida.'); return null; }
  return result.payload.client;
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://gateway.local');
  if (handleCors(req, res, url.pathname)) return;
  const route = findRoute(url.pathname);
  if (!route) return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta del API no encontrada.');
  if (!route.methods.includes(req.method)) {
    return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido para esta ruta.' } }, { Allow: route.methods.join(', ') });
  }
  const clientKey = req.socket.remoteAddress || 'unknown';
  const limit = consumeRateLimit(route, clientKey);
  if (!limit.allowed) {
    return send(res, 429, { error: { code: 'RATE_LIMITED', message: 'Se alcanzó el límite de solicitudes. Intenta más tarde.' } }, { 'Retry-After': String(limit.retryAfter) });
  }
  if (route.access === 'session' || route.access.startsWith('role:')) {
    req.authenticatedUser = await identity(req, res);
    if (!req.authenticatedUser) return;
    if (route.access.startsWith('role:')) {
      const allowedRoles = route.access.slice('role:'.length).split('|');
      if (!allowedRoles.includes(req.authenticatedUser.role)) return error(res, 403, 'FORBIDDEN', 'El rol autenticado no tiene permiso para esta ruta.');
    }
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    const health = await Promise.all(Object.entries(base).map(async ([name, endpoint]) => {
      try { const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) }); return [name, response.ok]; }
      catch { return [name, false]; }
    }));
    return send(res, health.every(([, ok]) => ok) ? 200 : 503, { service: 'gateway', dependencies: Object.fromEntries(health) });
  }

  if (url.pathname === '/api/v1/products' && req.method === 'GET') {
    const query = new URLSearchParams();
    for (const key of ['available', 'category', 'q']) if (url.searchParams.has(key)) query.set(key, url.searchParams.get(key));
    return downstream(res, await call('inventory', `/internal/catalog${query.size ? `?${query}` : ''}`));
  }

  const product = url.pathname.match(/^\/api\/v1\/products\/(\d+)$/);
  if (product && req.method === 'GET') return downstream(res, await call('inventory', `/internal/catalog/${product[1]}`));

  if (url.pathname === '/api/v1/auth/sessions' && req.method === 'POST') {
    const { value } = await readBody(req);
    const result = await call('clients', '/internal/sessions', { credential: 'auth', method: 'POST', body: value });
    if (result.status !== 200) return downstream(res, result);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookie = `tn_session=${encodeURIComponent(result.payload.session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure}`;
    const client = result.payload.client;
    return send(res, 200, { cliente: { id: client.id, nombre: client.nombre } }, { 'Set-Cookie': cookie });
  }

  if (url.pathname === '/api/v1/auth/registrations' && req.method === 'POST') {
    const { value } = await readBody(req, 16 * 1024);
    const result = await call('clients', '/internal/registrations', { credential: 'auth', method: 'POST', body: value });
    if (result.status !== 201) return downstream(res, result);
    const login = await call('clients', '/internal/sessions', { credential: 'auth', method: 'POST', body: { email: value.email, password: value.password } });
    if (login.status !== 200) return downstream(res, login);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookie = `tn_session=${encodeURIComponent(login.payload.session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure}`;
    return send(res, 201, { cliente: { id: login.payload.client.id, nombre: login.payload.client.nombre } }, { 'Set-Cookie': cookie });
  }

  if (url.pathname === '/api/v1/contact-messages' && req.method === 'POST') {
    const { value } = await readBody(req, 12 * 1024);
    return downstream(res, await call('clients', '/internal/messages', { credential: 'auth', method: 'POST', body: value }));
  }

  if (url.pathname === '/api/v1/auth/sessions/current' && req.method === 'DELETE') {
    return send(res, 204, {}, { 'Set-Cookie': 'tn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }

  if (url.pathname === '/api/v1/graphql' && req.method === 'POST') {
    const { value } = await readBody(req, 16 * 1024);
    const user = req.authenticatedUser;
    return downstream(res, await call('graphql', '/graphql', {
      credential: 'gateway',
      method: 'POST',
      timeout: 3500,
      headers: { 'X-Verified-Client-Id': user.id, 'X-Verified-Role': user.role },
      body: value
    }));
  }

  if (url.pathname === '/api/v1/orders' && req.method === 'POST') {
    const user = req.authenticatedUser;
    const { value } = await readBody(req);
    const result = await call('orders', '/internal/orders', {
      credential: 'create',
      method: 'POST', headers: { 'X-Client-Id': user.id, 'Idempotency-Key': String(req.headers['idempotency-key'] || '') }, body: value
    });
    return downstream(res, result);
  }

  const ownOrder = url.pathname.match(/^\/api\/v1\/me\/orders\/([^/]+)$/);
  if (ownOrder && req.method === 'GET') {
    const user = req.authenticatedUser;
    return downstream(res, await call('orders', `/internal/orders/${encodeURIComponent(ownOrder[1])}`, { credential: 'read', headers: { 'X-Client-Id': user.id } }));
  }

  if (url.pathname === '/api/v1/me/invoices' && req.method === 'GET') {
    const user = req.authenticatedUser;
    return downstream(res, await call('orders', '/internal/invoices', { credential: 'read', headers: { 'X-Client-Id': user.id } }));
  }

  const checkout = url.pathname.match(/^\/api\/v1\/orders\/([^/]+)\/payments$/);
  if (checkout && req.method === 'POST') {
    const user = req.authenticatedUser;
    return downstream(res, await call('payments', `/internal/orders/${encodeURIComponent(checkout[1])}/payments`, { credential: 'api', method: 'POST', headers: { 'X-Client-Id': user.id } }));
  }

  if (url.pathname === '/api/v1/integrations/payments/demo/events' && req.method === 'POST') {
    const { raw } = await readBody(req);
    const response = await fetch(`${base.payments}/internal/provider-events/demo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': secretProvider.getSecret(serviceCredentials.payments.event), 'X-Payment-Signature': String(req.headers['x-payment-signature'] || '') },
      body: raw, signal: AbortSignal.timeout(3000)
    }).catch(() => null);
    if (!response) return error(res, 503, 'PAYMENTS_UNAVAILABLE', 'Servicio de pago no disponible.');
    const payload = await response.json().catch(() => ({}));
    return send(res, response.status, payload);
  }

  const demoResult = url.pathname.match(/^\/api\/v1\/demo\/payments\/(pay_[a-f0-9-]+)$/i);
  if (demoResult && req.method === 'POST') {
    const { value } = await readBody(req, 4096);
    if (!['succeeded', 'failed'].includes(value.status)) return error(res, 400, 'INVALID_DEMO_RESULT', 'El resultado debe ser succeeded o failed.');
    const event = { eventId: `evt_${crypto.randomUUID()}`, paymentId: demoResult[1], status: value.status, occurredAt: new Date().toISOString() };
    const raw = JSON.stringify(event);
    const signature = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET || '').update(raw).digest('hex');
    try {
      const response = await fetch(`${base.payments}/internal/provider-events/demo`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': secretProvider.getSecret(serviceCredentials.payments.event), 'X-Payment-Signature': `sha256=${signature}` }, body: raw, signal: AbortSignal.timeout(3000) });
      const payload = await response.json().catch(() => ({}));
      return send(res, response.status, { ...payload, adapter: 'demo' });
    } catch { return error(res, 503, 'PAYMENTS_UNAVAILABLE', 'Servicio de pago no disponible.'); }
  }

  if (url.pathname === '/api/v1/staff/inventory' && req.method === 'GET') {
    return downstream(res, await call('inventory', '/internal/inventory'));
  }

  if (url.pathname === '/api/v1/staff/orders' && req.method === 'GET') {
    const user = req.authenticatedUser;
    return downstream(res, await call('orders', '/internal/orders', { credential: 'operations', headers: { 'X-Actor-Role': user.role } }));
  }

  const adjust = url.pathname.match(/^\/api\/v1\/staff\/inventory\/(\d+)\/adjustments$/);
  if (adjust && req.method === 'POST') {
    const user = req.authenticatedUser;
    const { value } = await readBody(req);
    return downstream(res, await call('inventory', `/internal/inventory/${adjust[1]}/adjustments`, { credential: 'write', method: 'POST', headers: { 'X-Actor-Role': user.role, 'X-Actor-Id': user.id }, body: value }));
  }

  const changeOrder = url.pathname.match(/^\/api\/v1\/staff\/orders\/([^/]+)\/status$/);
  if (changeOrder && req.method === 'PUT') {
    const user = req.authenticatedUser;
    const { value } = await readBody(req);
    return downstream(res, await call('orders', `/internal/orders/${encodeURIComponent(changeOrder[1])}/status`, { credential: 'operations', method: 'PUT', headers: { 'X-Actor-Role': user.role, 'X-Actor-Id': user.id }, body: value }));
  }

  const demoCheckout = url.pathname.match(/^\/demo-checkout\/(pay_[a-f0-9-]+)$/i);
  if (demoCheckout && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pago de prueba · Tokyo Noodles</title><body style="font:16px system-ui;max-width:34rem;margin:3rem auto;padding:1rem"><h1>Checkout de prueba</h1><p>Adaptador académico. No se procesan tarjetas ni cargos reales.</p><p>Intento: <code>${demoCheckout[1]}</code></p><button data-status="succeeded">Simular pago aprobado</button> <button data-status="failed">Simular pago rechazado</button><p id="result" aria-live="polite"></p><script>document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{const r=await fetch('/api/v1/demo/payments/${demoCheckout[1]}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:b.dataset.status})});const d=await r.json();document.querySelector('#result').textContent=r.ok?'Resultado aplicado: '+b.dataset.status:(d.error?.message||'Error de pago')})</script></body></html>`);
  }

  return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta del API no encontrada.');
}

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const pathname = new URL(req.url, 'http://gateway.local').pathname;
  const route = findRoute(pathname);
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    process.stdout.write(`${JSON.stringify({ event: 'gateway_request', requestId, routeId: route?.id || 'unmatched', method: req.method, status: res.statusCode, durationMs: Date.now() - startedAt })}\n`);
  });
  try { await handler(req, res); }
  catch (cause) {
    const status = cause.status || 500;
    error(res, status, status === 500 ? 'INTERNAL_ERROR' : cause.message, status === 500 ? 'Error interno.' : cause.message);
  }
});
server.listen(Number(process.env.GATEWAY_PORT || 4000), '127.0.0.1', () => {
  process.stdout.write(`${server.address().port} API Gateway listening on 127.0.0.1\n`);
});
