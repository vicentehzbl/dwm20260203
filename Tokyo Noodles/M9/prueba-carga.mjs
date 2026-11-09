import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(projectRoot, 'MODULO 3', 'backend', '.env');
const gateway = process.env.GATEWAY_URL || 'http://127.0.0.1:4000';
const concurrency = 4;
const requestsPlanned = 20;
const pageSize = 5;
const query = `query M9Load($orderId: ID!, $first: Int!) {
  myOrderSummary(orderId: $orderId) {
    id status
    items(first: $first) {
      totalCount
      nodes { productId product { name category } }
    }
  }
}`;

function loadEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^['"]|['"]$/g, '')]));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), ...options });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  return { response, body, bytes: Buffer.byteLength(raw) };
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(fraction * ordered.length) - 1)];
}

async function main() {
  if (!fs.existsSync(envPath)) throw new Error('Falta backend/.env; configúralo desde .env.example.');
  const env = loadEnv(fs.readFileSync(envPath, 'utf8'));
  const startedAt = new Date();
  const login = await jsonRequest(`${gateway}/api/v1/auth/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.DEMO_CLIENT_EMAIL, password: env.DEMO_CLIENT_PASSWORD })
  });
  if (login.response.status !== 200) throw new Error(`El login local falló con HTTP ${login.response.status}.`);
  const cookie = (login.response.headers.get('set-cookie') || '').match(/(?:^|,\s*)tn_session=([^;,]+)/)?.[1];
  if (!cookie) throw new Error('El Gateway no devolvió la cookie de sesión de prueba.');

  const created = await jsonRequest(`${gateway}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `tn_session=${cookie}`, 'Idempotency-Key': `m9-load-${crypto.randomUUID()}` },
    body: JSON.stringify({ items: [{ productId: 1, quantity: 1 }], fulfillment: 'pickup', documentType: 'boleta' })
  });
  if (created.response.status !== 201) throw new Error(`No se pudo crear el pedido ficticio (HTTP ${created.response.status}).`);
  const orderId = created.body.id;

  const latenciesMs = [];
  const requestBytes = [];
  const responseBytes = [];
  const statusCounts = {};
  let graphErrors = 0;
  let otherErrors = 0;
  let nextRequest = 0;
  const runStarted = performance.now();

  async function worker() {
    while (true) {
      const index = nextRequest++;
      if (index >= requestsPlanned) return;
      const started = performance.now();
      try {
        const requestBody = JSON.stringify({ operationName: 'M9Load', query, variables: { orderId, first: pageSize } });
        const result = await jsonRequest(`${gateway}/api/v1/graphql`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `tn_session=${cookie}` },
          body: requestBody
        });
        const latency = performance.now() - started;
        latenciesMs.push(latency);
        requestBytes.push(Buffer.byteLength(requestBody));
        responseBytes.push(result.bytes);
        statusCounts[result.response.status] = (statusCounts[result.response.status] || 0) + 1;
        if (!result.response.ok || result.body.errors?.length || result.body.data?.myOrderSummary?.id !== orderId) {
          if (result.body.errors?.length) graphErrors += 1;
          else otherErrors += 1;
        }
      } catch {
        latenciesMs.push(performance.now() - started);
        otherErrors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durationSeconds = (performance.now() - runStarted) / 1000;
  const totalErrors = graphErrors + otherErrors;
  const result = {
    scenario: 'M9: GraphQL own-order summary through public API Gateway',
    startedAt: startedAt.toISOString(),
    nodeVersion: process.version,
    requestsPlanned,
    requestsCompleted: latenciesMs.length,
    concurrency,
    durationSeconds: Number(durationSeconds.toFixed(4)),
    throughputRequestsPerSecond: Number((latenciesMs.length / durationSeconds).toFixed(2)),
    latencyMs: {
      min: Number(Math.min(...latenciesMs).toFixed(2)),
      p50: Number(percentile(latenciesMs, 0.50).toFixed(2)),
      p95: Number(percentile(latenciesMs, 0.95).toFixed(2)),
      p99: Number(percentile(latenciesMs, 0.99).toFixed(2)),
      max: Number(Math.max(...latenciesMs).toFixed(2))
    },
    requestBytesMean: Math.round(requestBytes.reduce((sum, value) => sum + value, 0) / Math.max(requestBytes.length, 1)),
    requestBytesMax: Math.max(...requestBytes),
    responseBytesMean: Math.round(responseBytes.reduce((sum, value) => sum + value, 0) / Math.max(responseBytes.length, 1)),
    httpStatusCounts: statusCounts,
    graphQLErrorRequests: graphErrors,
    otherErrorRequests: otherErrors,
    errorRate: Number((totalErrors / Math.max(latenciesMs.length, 1)).toFixed(4)),
    orderId
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (latenciesMs.length !== requestsPlanned || totalErrors > 0) process.exitCode = 1;
}

main().catch(cause => {
  process.stderr.write(`${cause.message}\n`);
  process.exitCode = 1;
});
