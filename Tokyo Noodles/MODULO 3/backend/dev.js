import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const serviceSecretKeys = [
  'GATEWAY_INVENTORY_READ_TOKEN', 'GATEWAY_INVENTORY_WRITE_TOKEN', 'ORDERS_INVENTORY_READ_TOKEN', 'ORDERS_INVENTORY_TOKEN',
  'GATEWAY_GRAPHQL_TOKEN', 'GRAPHQL_ORDERS_READ_TOKEN', 'GRAPHQL_INVENTORY_READ_TOKEN',
  'GATEWAY_CLIENTS_TOKEN', 'GATEWAY_ORDERS_CREATE_TOKEN', 'GATEWAY_ORDERS_READ_TOKEN',
  'GATEWAY_ORDERS_OPERATIONS_TOKEN', 'PAYMENTS_ORDERS_TOKEN', 'GATEWAY_PAYMENTS_API_TOKEN',
  'GATEWAY_PAYMENTS_EVENT_TOKEN'
];
for (const key of [...serviceSecretKeys, 'SESSION_SECRET', 'PAYMENT_WEBHOOK_SECRET', 'DEMO_CLIENT_EMAIL', 'DEMO_CLIENT_PASSWORD', 'DEMO_INVENTORY_EMAIL', 'DEMO_INVENTORY_PASSWORD', 'DEMO_OPERATIONS_EMAIL', 'DEMO_OPERATIONS_PASSWORD']) {
  if (!process.env[key] || process.env[key].startsWith('replace-') || process.env[key].startsWith('change-this')) {
    process.stderr.write(`Configura ${key} en backend/.env antes de iniciar.\n`);
    process.exit(1);
  }
}
const allSecretKeys = [...serviceSecretKeys, 'SESSION_SECRET', 'PAYMENT_WEBHOOK_SECRET'];
const configuredSecrets = allSecretKeys.map(key => process.env[key]);
if (new Set(configuredSecrets).size !== configuredSecrets.length) {
  process.stderr.write('Cada secreto debe tener un valor único; no reutilices valores entre servicios, sesiones o pagos.\n');
  process.exit(1);
}

const children = [];
const platformEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].includes(key)));
const launch = (file, label, permittedKeys) => {
  const permittedEnvironment = Object.fromEntries(permittedKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const child = spawn(process.execPath, [file], { cwd: root, env: { ...platformEnvironment, ...permittedEnvironment }, stdio: 'inherit' });
  child.on('exit', code => {
    if (code && !stopping) {
      process.stderr.write(`${label} terminó con código ${code}.\n`);
      stop();
    }
  });
  children.push(child);
};

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(), 250).unref();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
launch(path.join(root, 'services', 'clients.js'), 'clients', [
  'NODE_ENV', 'CLIENTS_PORT', 'GATEWAY_CLIENTS_TOKEN', 'SESSION_SECRET',
  'DEMO_CLIENT_EMAIL', 'DEMO_CLIENT_PASSWORD', 'DEMO_INVENTORY_EMAIL', 'DEMO_INVENTORY_PASSWORD',
  'DEMO_OPERATIONS_EMAIL', 'DEMO_OPERATIONS_PASSWORD'
]);
launch(path.join(root, 'services', 'inventory.js'), 'inventory', [
  'NODE_ENV', 'INVENTORY_PORT', 'GATEWAY_INVENTORY_READ_TOKEN', 'GATEWAY_INVENTORY_WRITE_TOKEN', 'ORDERS_INVENTORY_READ_TOKEN', 'ORDERS_INVENTORY_TOKEN', 'GRAPHQL_INVENTORY_READ_TOKEN'
]);
launch(path.join(root, 'services', 'orders.js'), 'orders', [
  'NODE_ENV', 'ORDERS_PORT', 'INVENTORY_URL', 'GATEWAY_ORDERS_CREATE_TOKEN', 'GATEWAY_ORDERS_READ_TOKEN',
  'GATEWAY_ORDERS_OPERATIONS_TOKEN', 'ORDERS_INVENTORY_READ_TOKEN', 'ORDERS_INVENTORY_TOKEN', 'PAYMENTS_ORDERS_TOKEN', 'GRAPHQL_ORDERS_READ_TOKEN'
]);
launch(path.join(root, 'services', 'payments.js'), 'payments', [
  'NODE_ENV', 'PAYMENTS_PORT', 'ORDERS_URL', 'GATEWAY_PORT', 'GATEWAY_PAYMENTS_API_TOKEN',
  'GATEWAY_PAYMENTS_EVENT_TOKEN', 'PAYMENTS_ORDERS_TOKEN', 'PAYMENT_WEBHOOK_SECRET'
]);
setTimeout(() => launch(path.join(root, 'api.js'), 'gateway', [
  'NODE_ENV', 'GATEWAY_PORT', 'INVENTORY_URL', 'ORDERS_URL', 'CLIENTS_URL', 'PAYMENTS_URL', 'GRAPHQL_URL', 'CORS_ALLOWED_ORIGINS',
  'GATEWAY_INVENTORY_READ_TOKEN', 'GATEWAY_INVENTORY_WRITE_TOKEN', 'GATEWAY_CLIENTS_TOKEN',
  'GATEWAY_ORDERS_CREATE_TOKEN', 'GATEWAY_ORDERS_READ_TOKEN', 'GATEWAY_ORDERS_OPERATIONS_TOKEN',
  'GATEWAY_PAYMENTS_API_TOKEN', 'GATEWAY_PAYMENTS_EVENT_TOKEN', 'GATEWAY_GRAPHQL_TOKEN', 'PAYMENT_WEBHOOK_SECRET'
]), 300);
setTimeout(() => launch(path.join(root, 'graphql-gateway', 'server.js'), 'graphql-gateway', [
  'NODE_ENV', 'GRAPHQL_PORT', 'ORDERS_URL', 'INVENTORY_URL', 'GATEWAY_GRAPHQL_TOKEN',
  'GRAPHQL_ORDERS_READ_TOKEN', 'GRAPHQL_INVENTORY_READ_TOKEN'
]), 300);
