import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'MODULO 3', 'backend');
const target = path.join(backend, '.env');
if (fs.existsSync(target)) throw new Error('backend/.env ya existe; no se sobrescribió.');
let env = fs.readFileSync(path.join(backend, '.env.example'), 'utf8');
env = env.replace(/^(\w+)=replace-[^\r\n]*$/gm, (_, key) => `${key}=${crypto.randomBytes(32).toString('base64url')}`);
env = env.replace(/^DEMO_CLIENT_PASSWORD=.*$/m, 'DEMO_CLIENT_PASSWORD=TokyoDemo!Cliente2026')
  .replace(/^DEMO_INVENTORY_PASSWORD=.*$/m, 'DEMO_INVENTORY_PASSWORD=TokyoDemo!Inventario2026')
  .replace(/^DEMO_OPERATIONS_PASSWORD=.*$/m, 'DEMO_OPERATIONS_PASSWORD=TokyoDemo!Operaciones2026');
fs.writeFileSync(target, env, { flag: 'wx', mode: 0o600 });
process.stdout.write('Configuración local creada en backend/.env (no se sobrescribe).\n');
