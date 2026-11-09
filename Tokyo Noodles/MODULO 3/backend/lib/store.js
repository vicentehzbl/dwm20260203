import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const queues = new Map();
const storeSchema = { inventory: ['products', 'reservations', 'adjustments'], orders: ['orders'], payments: ['payments', 'events'], clients: ['users', 'messages'] };

function migrate(name, data) {
  const required = storeSchema[name];
  if (!required || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Unknown or invalid store schema: ${name}`);
  for (const key of required) if (!Array.isArray(data[key])) data[key] = [];
  data.schemaVersion = 1;
  return data;
}

async function load(name, initial) {
  await fs.mkdir(dataDir, { recursive: true });
  const target = path.join(dataDir, `${name}.json`);
  try {
    const stored = JSON.parse(await fs.readFile(target, 'utf8'));
    const priorVersion = stored.schemaVersion;
    const migrated = migrate(name, stored);
    if (priorVersion !== migrated.schemaVersion) await fs.writeFile(target, JSON.stringify(migrated, null, 2), 'utf8');
    return migrated;
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause;
    const data = migrate(name, structuredClone(initial));
    await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf8');
    return data;
  }
}

export async function readStore(name, initial) {
  return load(name, initial);
}

export function updateStore(name, initial, change) {
  const previous = queues.get(name) || Promise.resolve();
  const current = previous.then(async () => {
    const data = await load(name, initial);
    const result = await change(data);
    const target = path.join(dataDir, `${name}.json`);
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(temporary, target);
    return result;
  });
  queues.set(name, current.catch(() => {}));
  return current;
}

export function nowIso() {
  return new Date().toISOString();
}
