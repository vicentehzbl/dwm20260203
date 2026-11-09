// Rutas externas permitidas. No se construyen destinos a partir de la URL del cliente.
export const routeDefinitions = [
  { id: 'health', pattern: /^\/health$/, methods: ['GET'], access: 'anonymous', target: 'gateway', policy: 'health', rate: { limit: 30, windowMs: 60_000 } },
  { id: 'demo-checkout', pattern: /^\/demo-checkout\/pay_[a-f0-9-]+$/i, methods: ['GET'], access: 'anonymous', target: 'payments-demo', policy: 'demo-only', rate: { limit: 30, windowMs: 60_000 } },
  { id: 'S01-catalog', pattern: /^\/api\/v1\/products$/, methods: ['GET'], access: 'anonymous', target: 'inventory', policy: 'public-catalog', rate: { limit: 60, windowMs: 60_000 } },
  { id: 'S02-product-detail', pattern: /^\/api\/v1\/products\/\d+$/, methods: ['GET'], access: 'anonymous', target: 'inventory', policy: 'public-product', rate: { limit: 60, windowMs: 60_000 } },
  { id: 'S03-login', pattern: /^\/api\/v1\/auth\/sessions$/, methods: ['POST'], access: 'anonymous', target: 'clients', policy: 'authenticate', rate: { limit: 8, windowMs: 60_000 } },
  { id: 'S03-register', pattern: /^\/api\/v1\/auth\/registrations$/, methods: ['POST'], access: 'anonymous', target: 'clients', policy: 'register-customer', rate: { limit: 5, windowMs: 60_000 } },
  { id: 'S04-contact', pattern: /^\/api\/v1\/contact-messages$/, methods: ['POST'], access: 'anonymous', target: 'clients', policy: 'validated-message', rate: { limit: 4, windowMs: 60_000 } },
  { id: 'S03-logout', pattern: /^\/api\/v1\/auth\/sessions\/current$/, methods: ['DELETE'], access: 'session', target: 'clients', policy: 'logout', rate: { limit: 20, windowMs: 60_000 } },
  { id: 'S07-create-order', pattern: /^\/api\/v1\/orders$/, methods: ['POST'], access: 'role:customer', target: 'orders', policy: 'create-order', rate: { limit: 20, windowMs: 60_000 } },
  { id: 'S10-own-order', pattern: /^\/api\/v1\/me\/orders\/[^/]+$/, methods: ['GET'], access: 'role:customer', target: 'orders', policy: 'owner-only', rate: { limit: 60, windowMs: 60_000 } },
  { id: 'S10-own-invoices', pattern: /^\/api\/v1\/me\/invoices$/, methods: ['GET'], access: 'role:customer', target: 'orders', policy: 'owner-only', rate: { limit: 30, windowMs: 60_000 } },
  { id: 'M8-order-summary-graphql', pattern: /^\/api\/v1\/graphql$/, methods: ['POST'], access: 'role:customer', target: 'graphql-gateway', policy: 'customer-own-order-summary', rate: { limit: 30, windowMs: 60_000 } },
  { id: 'S08-init-payment', pattern: /^\/api\/v1\/orders\/[^/]+\/payments$/, methods: ['POST'], access: 'role:customer', target: 'payments', policy: 'owner-and-payable', rate: { limit: 15, windowMs: 60_000 } },
  { id: 'S09-provider-event', pattern: /^\/api\/v1\/integrations\/payments\/demo\/events$/, methods: ['POST'], access: 'provider-signature', target: 'payments', policy: 'hmac-and-deduplicate', rate: { limit: 60, windowMs: 60_000 } },
  { id: 'S09-demo-result', pattern: /^\/api\/v1\/demo\/payments\/pay_[a-f0-9-]+$/, methods: ['POST'], access: 'anonymous', target: 'payments-demo', policy: 'demo-adapter', rate: { limit: 20, windowMs: 60_000 } },
  { id: 'S11-staff-inventory', pattern: /^\/api\/v1\/staff\/inventory$/, methods: ['GET'], access: 'role:inventory|operations', target: 'inventory', policy: 'staff-read', rate: { limit: 60, windowMs: 60_000 } },
  { id: 'S12-stock-adjustment', pattern: /^\/api\/v1\/staff\/inventory\/\d+\/adjustments$/, methods: ['POST'], access: 'role:inventory', target: 'inventory', policy: 'inventory-write', rate: { limit: 30, windowMs: 60_000 } },
  { id: 'S13-order-status', pattern: /^\/api\/v1\/staff\/orders\/[^/]+\/status$/, methods: ['PUT'], access: 'role:operations', target: 'orders', policy: 'operations-transition', rate: { limit: 30, windowMs: 60_000 } },
  { id: 'S14-staff-orders', pattern: /^\/api\/v1\/staff\/orders$/, methods: ['GET'], access: 'role:operations', target: 'orders', policy: 'operations-list-minimal', rate: { limit: 30, windowMs: 60_000 } }
];

const buckets = new Map();
let requestCount = 0;

export function findRoute(pathname) {
  return routeDefinitions.find(route => route.pattern.test(pathname)) || null;
}

export function consumeRateLimit(route, clientKey, now = Date.now()) {
  const key = `${route.id}:${clientKey}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + route.rate.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  requestCount += 1;
  if (requestCount % 256 === 0) {
    for (const [storedKey, value] of buckets) if (value.resetAt <= now) buckets.delete(storedKey);
  }
  return { allowed: bucket.count <= route.rate.limit, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}
