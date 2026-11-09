import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.join(root, 'MODULO 3', 'backend', '.env'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map(line => line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const base = process.env.TN_GATEWAY_URL || 'http://127.0.0.1:4000';
const passed = [];
async function call(route, { method = 'GET', cookie, body, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let payload = {}; try { payload = text ? JSON.parse(text) : {}; } catch {}
  return { response, payload };
}
async function test(name, fn) { await fn(); passed.push(name); process.stdout.write(`PASS | ${name}\n`); }
async function login(email = env.DEMO_CLIENT_EMAIL, password = env.DEMO_CLIENT_PASSWORD) {
  const { response, payload } = await call('/api/v1/auth/sessions', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
}
function session(subject) { const payload = Buffer.from(JSON.stringify({ sub: subject, name: 'Cuenta ficticia ajena', role: 'customer', exp: Date.now() + 3600000 })).toString('base64url'); const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url'); return `tn_session=${payload}.${sig}`; }

const owner = await login();
let orderId;
await test('catálogo anónimo usa inventory persistente', async () => { const { response, payload } = await call('/api/v1/products'); assert.equal(response.status, 200); assert.ok(payload.items.length >= 6); assert.ok(payload.items.every(x => !Object.hasOwn(x, 'onHand'))); });
await test('CORS permite headers de compra requeridos y deniega headers arbitrarios', async () => {
  const allowed = await fetch(`${base}/api/v1/orders`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5500', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,idempotency-key' } });
  assert.equal(allowed.status, 204); assert.match(allowed.headers.get('access-control-allow-headers'), /idempotency-key/i);
  const denied = await fetch(`${base}/api/v1/orders`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5500', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-evil' } }); assert.equal(denied.status, 403);
});
await test('contacto valida y persiste mensajes con retención de 90 días', async () => {
  const result = await call('/api/v1/contact-messages', { method: 'POST', body: { name: 'Visitante de prueba', email: 'visitante@tokyonoodles.test', message: 'Consulta ficticia de integración.' } });
  assert.equal(result.response.status, 201); assert.equal(result.payload.status, 'received');
  const invalid = await call('/api/v1/contact-messages', { method: 'POST', body: { name: 'x', email: 'mal', message: 'x' } }); assert.equal(invalid.response.status, 400);
});
await test('registro, hash de contraseña y sesión HttpOnly', async () => {
  const email = `m10-${crypto.randomUUID()}@tokyonoodles.test`;
  const created = await call('/api/v1/auth/registrations', { method: 'POST', body: { name: 'Cliente M10', email, password: 'TokyoM10!Password2026' } });
  assert.equal(created.response.status, 201); assert.match(created.response.headers.get('set-cookie'), /HttpOnly/);
  const stored = JSON.parse(fs.readFileSync(path.join(root, 'MODULO 3', 'backend', 'data', 'clients.json'), 'utf8'));
  const record = stored.users.find(user => user.email === email); assert.match(record.passwordHash, /^scrypt\$/); assert.ok(!record.passwordHash.includes('TokyoM10'));
  const duplicate = await call('/api/v1/auth/registrations', { method: 'POST', body: { name: 'Otro', email, password: 'TokyoM10!Password2026' } }); assert.equal(duplicate.response.status, 409);
});
await test('pedido calcula precio del servidor e idempotencia', async () => {
  const options = { method: 'POST', cookie: owner, headers: { 'Idempotency-Key': `m10-${crypto.randomUUID()}` }, body: { items: [{ productId: 1, quantity: 1 }], fulfillment: 'pickup', documentType: 'boleta' } };
  const first = await call('/api/v1/orders', options); assert.equal(first.response.status, 201); orderId = first.payload.id; assert.equal(first.payload.total, first.payload.subtotal);
  const replay = await call('/api/v1/orders', options); assert.equal(replay.response.status, 200); assert.equal(replay.payload.id, orderId);
  const conflict = await call('/api/v1/orders', { ...options, body: { ...options.body, items: [{ productId: 1, quantity: 2 }] } }); assert.equal(conflict.response.status, 409);
});
await test('propiedad de pedido y rechazo de acceso directo', async () => {
  const foreign = await call(`/api/v1/me/orders/${orderId}`, { cookie: session('cli_m10_foreign') }); assert.equal(foreign.response.status, 404);
  const direct = await fetch(`http://127.0.0.1:4102/internal/orders/${orderId}`); assert.equal(direct.status, 401);
});
await test('operaciones lista datos mínimos y aplica transiciones válidas', async () => {
  const operations = await login(env.DEMO_OPERATIONS_EMAIL, env.DEMO_OPERATIONS_PASSWORD);
  const list = await call('/api/v1/staff/orders', { cookie: operations }); assert.equal(list.response.status, 200); const row = list.payload.items.find(item => item.id === orderId); assert.ok(row); assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'currency', 'fulfillment', 'id', 'status', 'total']);
  const customerDenied = await call('/api/v1/staff/orders', { cookie: owner }); assert.equal(customerDenied.response.status, 403);
  const changed = await call(`/api/v1/staff/orders/${orderId}/status`, { method: 'PUT', cookie: operations, body: { status: 'cancelled' } }); assert.equal(changed.response.status, 200);
  const invalid = await call(`/api/v1/staff/orders/${orderId}/status`, { method: 'PUT', cookie: operations, body: { status: 'delivered' } }); assert.equal(invalid.response.status, 409);
});
let failedOrder;
await test('reserva y recuperación de stock tras pago fallido', async () => {
  const staff = await login(env.DEMO_INVENTORY_EMAIL, env.DEMO_INVENTORY_PASSWORD);
  const before = await call('/api/v1/staff/inventory', { cookie: staff }); assert.equal(before.response.status, 200);
  const create = await call('/api/v1/orders', { method: 'POST', cookie: owner, headers: { 'Idempotency-Key': `m10-fail-${crypto.randomUUID()}` }, body: { items: [{ productId: 1, quantity: 1 }], fulfillment: 'pickup', documentType: 'boleta' } }); assert.equal(create.response.status, 201); failedOrder = create.payload.id;
  const payment = await call(`/api/v1/orders/${failedOrder}/payments`, { method: 'POST', cookie: owner, body: { status: 'succeeded', amount: 1, currency: 'USD' } }); assert.equal(payment.response.status, 201); assert.equal(payment.payload.status, 'pending');
  const event = await call(`/api/v1/demo/payments/${payment.payload.paymentId}`, { method: 'POST', body: { status: 'failed' } }); assert.equal(event.response.status, 200);
  const after = await call('/api/v1/staff/inventory', { cookie: staff });
  const getAvailable = result => result.payload.items.find(item => item.productId === 1).available;
  assert.equal(getAvailable(after), getAvailable(before));
  const order = await call(`/api/v1/me/orders/${failedOrder}`, { cookie: owner }); assert.equal(order.payload.status, 'payment_failed');
});
let paidOrder;
await test('pago aprobado se verifica por evento firmado; webhook duplicado es idempotente', async () => {
  const create = await call('/api/v1/orders', { method: 'POST', cookie: owner, headers: { 'Idempotency-Key': `m10-paid-${crypto.randomUUID()}` }, body: { items: [{ productId: 2, quantity: 1 }], fulfillment: 'pickup', documentType: 'boleta' } }); assert.equal(create.response.status, 201); paidOrder = create.payload.id;
  const payment = await call(`/api/v1/orders/${paidOrder}/payments`, { method: 'POST', cookie: owner }); assert.equal(payment.response.status, 201);
  const event = { eventId: `evt_m10_${crypto.randomUUID()}`, paymentId: payment.payload.paymentId, status: 'succeeded', occurredAt: new Date().toISOString() };
  const body = JSON.stringify(event); const signature = `sha256=${crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(body).digest('hex')}`;
  const one = await fetch(`${base}/api/v1/integrations/payments/demo/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': signature }, body }); assert.equal(one.status, 200);
  const two = await fetch(`${base}/api/v1/integrations/payments/demo/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Signature': signature }, body }); assert.equal(two.status, 200); assert.equal((await two.json()).duplicate, true);
  const order = await call(`/api/v1/me/orders/${paidOrder}`, { cookie: owner }); assert.equal(order.payload.status, 'confirmed');
});
await test('boleta queda limitada al historial propio', async () => {
  const own = await call('/api/v1/me/invoices', { cookie: owner }); assert.equal(own.response.status, 200); assert.ok(own.payload.items.some(item => item.orderId === paidOrder));
  const foreign = await call('/api/v1/me/invoices', { cookie: session('cli_m10_other') }); assert.equal(foreign.response.status, 200); assert.equal(foreign.payload.items.length, 0);
});
process.stdout.write(`\n${passed.length} verificaciones M10 completadas.\n`);
