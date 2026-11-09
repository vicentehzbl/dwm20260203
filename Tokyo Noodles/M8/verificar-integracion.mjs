import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.join(projectRoot, 'MODULO 3', 'backend');
const envFile = path.join(backendRoot, '.env');
const gateway = 'http://127.0.0.1:4000';
const query = `query M8Summary($orderId: ID!, $first: Int!, $after: String) {
  myOrderSummary(orderId: $orderId) {
    id status fulfillment total currency catalogStatus
    timeline { status at }
    items(first: $first, after: $after) {
      nodes { productId quantity unitPrice lineTotal product { name category description } }
      totalCount pageInfo { endCursor hasNextPage }
    }
  }
}`;

function readEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  return { response, body };
}

async function check(name, action) {
  await action();
  process.stdout.write(`PASS ${name}\n`);
}

function signedTestSession(clientId, secret) {
  const payload = Buffer.from(JSON.stringify({ sub: clientId, name: 'Cuenta ficticia ajena', role: 'customer', exp: Date.now() + 3600000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (child.exitCode !== null) throw new Error('El proceso GraphQL de prueba terminó antes de iniciar.');
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(250) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('El proceso GraphQL de prueba no inició dentro del plazo.');
}

if (!fs.existsSync(envFile)) {
  process.stderr.write('Falta backend/.env. Configura valores locales desde .env.example y vuelve a ejecutar.\n');
  process.exit(2);
}

const env = readEnv(fs.readFileSync(envFile, 'utf8'));
let temporaryGateway;
let passed = 0;
const evidence = {};

try {
  await check('API Gateway y dependencias están disponibles', async () => {
    const { response, body } = await jsonRequest(`${gateway}/health`);
    assert.equal(response.status, 200, `health devolvió ${response.status}`);
    assert.ok(Object.values(body.dependencies || {}).every(Boolean), 'health muestra una dependencia caída');
    passed += 1;
  });

  await check('GraphQL externo exige sesión y descarta identidad falsificada', async () => {
    const { response } = await jsonRequest(`${gateway}/api/v1/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Verified-Client-Id': 'cli_demo_001', 'X-Verified-Role': 'customer' },
      body: JSON.stringify({ query: '{ myOrderSummary(orderId: "x") { id } }' })
    });
    assert.equal(response.status, 401);
    passed += 1;
  });

  await check('GraphQL, Orders e Inventory privados deniegan acceso directo sin token', async () => {
    const [graph, inventory, orders] = await Promise.all([
      jsonRequest('http://127.0.0.1:4200/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ myOrderSummary(orderId: "x") { id } }' })
      }),
      jsonRequest('http://127.0.0.1:4101/internal/catalog/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [1] })
      }),
      jsonRequest('http://127.0.0.1:4102/internal/orders/example/graphql-summary')
    ]);
    assert.deepEqual([graph.response.status, inventory.response.status, orders.response.status], [401, 401, 401]);
    passed += 1;
  });

  const login = await jsonRequest(`${gateway}/api/v1/auth/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.DEMO_CLIENT_EMAIL, password: env.DEMO_CLIENT_PASSWORD })
  });
  assert.equal(login.response.status, 200, 'falló el acceso de cliente de prueba');
  const customerId = login.body.cliente?.id;
  const cookie = (login.response.headers.get('set-cookie') || '').match(/(?:^|,\s*)tn_session=([^;,]+)/)?.[1];
  assert.ok(customerId && cookie, 'faltan identidad mínima o cookie de sesión');
  const customerCookie = `tn_session=${cookie}`;

  const created = await jsonRequest(`${gateway}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: customerCookie, 'Idempotency-Key': `m8-${crypto.randomUUID()}` },
    body: JSON.stringify({ items: [1, 2, 3, 4, 5, 6].map(productId => ({ productId, quantity: 1 })), fulfillment: 'pickup', documentType: 'boleta' })
  });
  assert.equal(created.response.status, 201, `pedido de prueba devolvió ${created.response.status}`);
  const orderId = created.body.id;
  evidence.orderId = orderId;

  const getSummary = (sessionCookie, first = 5, after = null) => jsonRequest(`${gateway}/api/v1/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ operationName: 'M8Summary', query, variables: { orderId, first, after } })
  });

  let firstPage;
  await check('Seguimiento agrega Orders e Inventory sin devolver datos internos', async () => {
    firstPage = await getSummary(customerCookie);
    const order = firstPage.body.data?.myOrderSummary;
    assert.equal(firstPage.response.status, 200);
    assert.equal(order?.id, orderId);
    assert.equal(order?.status, 'pending_payment');
    assert.equal(order?.currency, 'CLP');
    assert.equal(order?.items.nodes.length, 5);
    assert.equal(order?.items.totalCount, 6);
    assert.equal(order?.items.pageInfo.hasNextPage, true);
    assert.ok(order.items.nodes.every(line => line.product?.name && line.product.category));
    assert.doesNotMatch(JSON.stringify(order), /clientId|deliveryAddress|billingDetails|paymentExpiresAt|onHand|reserved|password|token/i);
    evidence.firstPageLines = order.items.nodes.length;
    evidence.catalogStatus = order.catalogStatus;
    passed += 1;
  });

  await check('La paginación por cursor devuelve la siguiente página', async () => {
    const cursor = firstPage.body.data.myOrderSummary.items.pageInfo.endCursor;
    const { response, body } = await getSummary(customerCookie, 5, cursor);
    const items = body.data?.myOrderSummary?.items;
    assert.equal(response.status, 200);
    assert.equal(items?.nodes.length, 1);
    assert.equal(items?.pageInfo.hasNextPage, false);
    evidence.secondPageLines = items.nodes.length;
    passed += 1;
  });

  await check('Orders oculta un pedido ajeno para la identidad firmada de prueba', async () => {
    const session = signedTestSession('cli_m8_foreign_test', env.SESSION_SECRET);
    const { response, body } = await getSummary(`tn_session=${encodeURIComponent(session)}`);
    assert.equal(response.status, 200);
    assert.equal(body.data?.myOrderSummary, null);
    assert.equal(body.errors?.[0]?.extensions?.code, 'ORDER_NOT_FOUND');
    passed += 1;
  });

  await check('Una identidad de personal no puede consultar la operación de cliente', async () => {
    const staff = await jsonRequest(`${gateway}/api/v1/auth/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.DEMO_INVENTORY_EMAIL, password: env.DEMO_INVENTORY_PASSWORD })
    });
    assert.equal(staff.response.status, 200);
    const staffCookie = (staff.response.headers.get('set-cookie') || '').match(/(?:^|,\s*)tn_session=([^;,]+)/)?.[1];
    assert.ok(staffCookie);
    const { response } = await getSummary(`tn_session=${staffCookie}`);
    assert.equal(response.status, 403);
    passed += 1;
  });

  await check('Schema bloquea campos no definidos, introspección, página mayor a 20 y costo excesivo', async () => {
    const inputs = [
      { query: '{ myOrderSummary(orderId: "x") { clientId deliveryAddress onHand } }' },
      { query: '{ __schema { queryType { name } } }' },
      { operationName: 'M8Summary', query, variables: { orderId, first: 21, after: null } },
      { operationName: 'M8Summary', query, variables: { orderId, first: 20, after: null } }
    ];
    const outputs = await Promise.all(inputs.map(input => jsonRequest(`${gateway}/api/v1/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: customerCookie }, body: JSON.stringify(input)
    })));
    assert.ok(outputs.every(item => item.response.status === 400));
    passed += 1;
  });

  await check('CORS permite Live Server configurado y rechaza otros orígenes', async () => {
    const [accepted, denied] = await Promise.all([
      fetch(`${gateway}/api/v1/graphql`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5500', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }),
      fetch(`${gateway}/api/v1/graphql`, { method: 'OPTIONS', headers: { Origin: 'https://example.invalid', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
    ]);
    assert.equal(accepted.status, 204);
    assert.equal(accepted.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(denied.status, 403);
    passed += 1;
  });

  await check('Si Inventory no responde, el pedido sigue disponible con error parcial', async () => {
    const port = 4201;
    const url = `http://127.0.0.1:${port}`;
    temporaryGateway = spawn(process.execPath, [path.join(backendRoot, 'graphql-gateway', 'server.js')], {
      cwd: backendRoot,
      env: {
        PATH: process.env.PATH || '',
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        NODE_ENV: 'test', GRAPHQL_PORT: String(port), ORDERS_URL: 'http://127.0.0.1:4102', INVENTORY_URL: 'http://127.0.0.1:1',
        GATEWAY_GRAPHQL_TOKEN: env.GATEWAY_GRAPHQL_TOKEN,
        GRAPHQL_ORDERS_READ_TOKEN: env.GRAPHQL_ORDERS_READ_TOKEN,
        GRAPHQL_INVENTORY_READ_TOKEN: env.GRAPHQL_INVENTORY_READ_TOKEN
      },
      stdio: 'ignore'
    });
    await waitForHealth(url, temporaryGateway);
    const { response, body } = await jsonRequest(`${url}/graphql`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Service-Token': env.GATEWAY_GRAPHQL_TOKEN,
        'X-Verified-Client-Id': customerId, 'X-Verified-Role': 'customer'
      },
      body: JSON.stringify({ operationName: 'M8Summary', query, variables: { orderId, first: 5, after: null } })
    });
    const order = body.data?.myOrderSummary;
    assert.equal(response.status, 200);
    assert.equal(order?.id, orderId);
    assert.equal(order?.catalogStatus, null);
    assert.ok(order.items.nodes.every(line => line.product === null));
    assert.ok(body.errors?.some(item => item.extensions?.code === 'CATALOG_PARTIAL'));
    evidence.partialFailure = 'CATALOG_PARTIAL; Orders preserved';
    passed += 1;
  });

  process.stdout.write(`\nResultado: PASS (${passed} comprobaciones). Pedido ficticio: ${orderId}\n`);
  process.stdout.write(`Evidencia: ${JSON.stringify(evidence)}\n`);
} catch (cause) {
  process.stderr.write(`FAIL ${cause.message}\n`);
  process.exitCode = 1;
} finally {
  if (temporaryGateway && temporaryGateway.exitCode === null) {
    temporaryGateway.kill();
    await Promise.race([
      new Promise(resolve => temporaryGateway.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 1500))
    ]);
  }
}
