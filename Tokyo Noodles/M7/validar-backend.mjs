// Verificación local M7. Ejecutar con Node mientras MODULO 3/backend/dev.js está activo.
// La sesión de otro titular se firma solo para comprobar la regla de propiedad; no la uses en producción.
import fs from 'node:fs';
import crypto from 'node:crypto';

const base = process.env.TN_GATEWAY_URL || 'http://127.0.0.1:4000';
const backendRoot = new URL('../MODULO%203/backend/', import.meta.url);
const envPath = new URL('.env', backendRoot);
const envText = fs.readFileSync(envPath, 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  return match ? [match[1], match[2].replace(/^['"]|['"]$/g, '')] : null;
}).filter(Boolean));

function report(name, passed, detail) {
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} | ${name} | ${detail}\n`);
  if (!passed) process.exitCode = 1;
}

async function call(path, { method = 'GET', cookie, body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  return { status: response.status, payload, headers: response.headers };
}

async function login(email, password) {
  const result = await call('/api/v1/auth/sessions', { method: 'POST', body: { email, password } });
  if (result.status !== 200) throw new Error(`No se pudo crear sesión demo (HTTP ${result.status}).`);
  const clientKeys = Object.keys(result.payload.cliente || {}).sort().join(',');
  if (clientKeys !== 'id,nombre' || Object.hasOwn(result.payload, 'session') || Object.hasOwn(result.payload.cliente || {}, 'role')) {
    throw new Error('La respuesta pública del login no coincide con el DTO mínimo {id,nombre}.');
  }
  const setCookie = result.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
}

function signedSession(subject, name = 'Identidad de prueba', role = 'customer') {
  const payload = Buffer.from(JSON.stringify({ sub: subject, name, role, exp: Date.now() + 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
  return `tn_session=${payload}.${signature}`;
}

try {
  const catalog = await call('/api/v1/products');
  const allowedProductKeys = ['categoria', 'descripcion', 'disponible', 'id', 'imagen', 'nombre', 'precio'];
  const productKeysMinimal = Array.isArray(catalog.payload.items) && catalog.payload.items.every(item => Object.keys(item).sort().join(',') === allowedProductKeys.join(','));
  report('1. Catálogo anónimo', catalog.status === 200 && Array.isArray(catalog.payload.items) && productKeysMinimal, `GET /api/v1/products → HTTP ${catalog.status}; lista=${Array.isArray(catalog.payload.items)}; campos públicos mínimos=${productKeysMinimal}`);

  const noSession = await call('/api/v1/me/orders/no-session', { cookie: 'tn_session=invalid' });
  report('2. Operación protegida sin sesión válida', noSession.status === 401, `GET /api/v1/me/orders/no-session → HTTP ${noSession.status}`);

  const ownerCookie = await login(env.DEMO_CLIENT_EMAIL, env.DEMO_CLIENT_PASSWORD);
  const deniedAdjustment = await call('/api/v1/staff/inventory/1/adjustments', {
    method: 'POST', cookie: ownerCookie, body: { delta: 1, reason: 'prueba M7' }
  });
  report('3. Administración desde rol sin permiso', deniedAdjustment.status === 403, `POST ajuste con rol customer → HTTP ${deniedAdjustment.status}`);

  const created = await call('/api/v1/orders', {
    method: 'POST', cookie: ownerCookie,
    headers: { 'Idempotency-Key': `m7-${crypto.randomUUID()}` },
    body: { items: [{ productId: 1, quantity: 1 }], fulfillment: 'pickup', documentType: 'boleta' }
  });
  if (![200, 201].includes(created.status) || !created.payload.id) throw new Error(`No se pudo crear pedido de fixture (HTTP ${created.status}).`);
  const foreignCookie = signedSession('cli_m7_other_owner');
  const foreignRead = await call(`/api/v1/me/orders/${encodeURIComponent(created.payload.id)}`, { cookie: foreignCookie });
  report('4. Consulta de pedido ajeno', foreignRead.status === 404, `Titular alternativo GET pedido → HTTP ${foreignRead.status}; existencia oculta`);

  const directBackend = await fetch('http://127.0.0.1:4101/internal/catalog');
  report('5. Acceso directo al backend sin identidad técnica', directBackend.status === 401, `GET Inventory /internal/catalog sin X-Service-Token → HTTP ${directBackend.status}`);

  const changedPaymentData = await call(`/api/v1/orders/${encodeURIComponent(created.payload.id)}/payments`, {
    method: 'POST', cookie: ownerCookie, body: { status: 'succeeded', amount: 1, currency: 'USD' }
  });
  const eventBody = { eventId: `m7-forged-${crypto.randomUUID()}`, paymentId: 'pay_forged', status: 'succeeded', occurredAt: new Date().toISOString() };
  const forgedWebhook = await call('/api/v1/integrations/payments/demo/events', { method: 'POST', body: eventBody });
  const browserStatusChange = await call(`/api/v1/staff/orders/${encodeURIComponent(created.payload.id)}/status`, {
    method: 'PUT', cookie: ownerCookie, body: { status: 'confirmed' }
  });
  const finalOrder = await call(`/api/v1/me/orders/${encodeURIComponent(created.payload.id)}`, { cookie: ownerCookie });
  const tamperingRejected = changedPaymentData.status === 201 && changedPaymentData.payload.status === 'pending'
    && forgedWebhook.status === 401 && browserStatusChange.status === 403
    && finalOrder.status === 200 && finalOrder.payload.status === 'pending_payment';
  report('6. Intento de confirmar pago con datos manipulados del frontend', tamperingRejected,
    `S08 alteredado → HTTP ${changedPaymentData.status}/${changedPaymentData.payload.status}; S09 firma falsa → HTTP ${forgedWebhook.status}; S13 desde customer → HTTP ${browserStatusChange.status}; estado final=${finalOrder.payload.status || 'sin lectura'}`);

  const projectionOrder = await call('/api/v1/orders', {
    method: 'POST', cookie: ownerCookie,
    headers: { 'Idempotency-Key': `m7-projection-${crypto.randomUUID()}` },
    body: { items: [{ productId: 1, quantity: 1 }], fulfillment: 'pickup', documentType: 'boleta' }
  });
  if (![200, 201].includes(projectionOrder.status) || !projectionOrder.payload.id) throw new Error(`No se pudo crear pedido de proyección (HTTP ${projectionOrder.status}).`);
  const operationsCookie = signedSession('staff_m7_operations', 'Operaciones de prueba', 'operations');
  const internalNote = await call(`/api/v1/staff/orders/${encodeURIComponent(projectionOrder.payload.id)}/status`, {
    method: 'PUT', cookie: operationsCookie, body: { status: 'cancelled', note: 'nota interna solo para historial' }
  });
  const projectedOrder = await call(`/api/v1/me/orders/${encodeURIComponent(projectionOrder.payload.id)}`, { cookie: ownerCookie });
  const timelineMinimal = Array.isArray(projectedOrder.payload.timeline)
    && projectedOrder.payload.timeline.every(event => Object.keys(event).sort().join(',') === 'at,status');

  const inventoryCookie = await login(env.DEMO_INVENTORY_EMAIL, env.DEMO_INVENTORY_PASSWORD);
  const adjustment = await call('/api/v1/staff/inventory/1/adjustments', {
    method: 'POST', cookie: inventoryCookie, body: { delta: 1, reason: 'prueba de proyección M7' }
  });
  const adjustmentKeys = Object.keys(adjustment.payload).sort().join(',');
  const adjustmentMinimal = adjustmentKeys === 'adjustmentId,delta,onHandAfter,productId,recordedAt';
  report('Campos mínimos en sesión, seguimiento y ajuste', internalNote.status === 200 && projectedOrder.status === 200 && timelineMinimal && adjustment.status === 201 && adjustmentMinimal,
    `login publica id/nombre; S10 timeline=status/at; S12 no expone actorId/reason; S13 controlado=${internalNote.status}; S12 HTTP ${adjustment.status}`);
} catch (cause) {
  process.stderr.write(`ERROR | Validación M7 incompleta | ${cause.message}\n`);
  process.exitCode = 1;
}
