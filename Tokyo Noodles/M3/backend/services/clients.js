import { createServer, error, readBody, requireService, send } from '../lib/http.js';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { createSession, safeTextEqual, verifySession } from '../lib/identity.js';
import { readStore, updateStore } from '../lib/store.js';

const scrypt = promisify(crypto.scrypt);
const initial = { users: [], messages: [] };

async function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}
async function passwordMatches(password, encoded) {
  if (!String(encoded).startsWith('scrypt$')) return safeTextEqual(password, encoded);
  const [, salt, expected] = encoded.split('$');
  const actual = Buffer.from(await scrypt(password, Buffer.from(salt, 'base64url'), 64));
  const wanted = Buffer.from(expected, 'base64url');
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

function configuredAccounts() {
  return [
    { id: 'cli_demo_001', name: 'Cliente Demo', role: 'customer', email: process.env.DEMO_CLIENT_EMAIL, password: process.env.DEMO_CLIENT_PASSWORD },
    { id: 'staff_inventory_demo', name: 'Personal de Inventario Demo', role: 'inventory', email: process.env.DEMO_INVENTORY_EMAIL, password: process.env.DEMO_INVENTORY_PASSWORD },
    { id: 'staff_operations_demo', name: 'Personal de Operaciones Demo', role: 'operations', email: process.env.DEMO_OPERATIONS_EMAIL, password: process.env.DEMO_OPERATIONS_PASSWORD }
  ].filter(account => account.email && account.password);
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://clients.local');
  if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { service: 'clients', status: 'ok' });

  if (url.pathname === '/internal/messages' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_CLIENTS_TOKEN)) return;
    const { value } = await readBody(req, 12 * 1024);
    const name = String(value.name || '').trim();
    const email = String(value.email || '').trim().toLowerCase();
    const message = String(value.message || '').trim();
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5 || message.length > 2000) return error(res, 400, 'INVALID_CONTACT_MESSAGE', 'Completa nombre, correo válido y un mensaje de 5 a 2.000 caracteres.');
    const record = await updateStore('clients', initial, data => {
      data.messages = data.messages.filter(item => Date.parse(item.createdAt) > Date.now() - 90 * 24 * 60 * 60 * 1000);
      const item = { id: `msg_${crypto.randomUUID()}`, name, email, message, status: 'received', createdAt: new Date().toISOString() };
      data.messages.push(item);
      return { id: item.id, status: item.status, createdAt: item.createdAt };
    });
    return send(res, 201, record);
  }

  if (url.pathname === '/internal/registrations' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_CLIENTS_TOKEN)) return;
    const { value } = await readBody(req);
    const email = String(value.email || '').trim().toLowerCase();
    const name = String(value.name || '').trim();
    const password = String(value.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || name.length > 80 || password.length < 12 || password.length > 128) return error(res, 400, 'INVALID_REGISTRATION', 'Ingresa nombre, correo válido y contraseña de 12 a 128 caracteres.');
    const encoded = await passwordHash(password);
    const result = await updateStore('clients', initial, data => {
      if (data.users.some(user => user.email === email)) return { failure: 'EMAIL_EXISTS' };
      const user = { id: `cli_${crypto.randomUUID()}`, name, role: 'customer', email, passwordHash: encoded, createdAt: new Date().toISOString() };
      data.users.push(user);
      return { user };
    });
    if (result.failure) return error(res, 409, result.failure, 'Ese correo ya tiene una cuenta.');
    return send(res, 201, { registered: true, client: { id: result.user.id, nombre: result.user.name } });
  }

  if (url.pathname === '/internal/sessions' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_CLIENTS_TOKEN)) return;
    const { value } = await readBody(req);
    if (typeof value.email !== 'string' || typeof value.password !== 'string') return error(res, 400, 'INVALID_CREDENTIALS', 'Correo o contraseña inválidos.');
    const stored = await readStore('clients', initial);
    const accounts = [...configuredAccounts().map(item => ({ ...item, passwordHash: item.password })), ...stored.users];
    const account = accounts.find(item => item.email.toLowerCase() === value.email.toLowerCase());
    if (!account || !(await passwordMatches(value.password, account.passwordHash))) return error(res, 401, 'INVALID_CREDENTIALS', 'Correo o contraseña inválidos.');
    const session = createSession({ id: account.id, name: account.name, role: account.role });
    return send(res, 200, { session, client: { id: account.id, nombre: account.name, role: account.role }, expiresIn: 3600 });
  }

  if (url.pathname === '/internal/sessions/verify' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_CLIENTS_TOKEN)) return;
    const { value } = await readBody(req);
    const identity = verifySession(value.session);
    if (!identity) return error(res, 401, 'SESSION_INVALID', 'La sesión no es válida o expiró.');
    return send(res, 200, { client: identity });
  }

  return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta privada de clients no encontrada.');
}

createServer(handler, process.env.CLIENTS_PORT || 4103);
