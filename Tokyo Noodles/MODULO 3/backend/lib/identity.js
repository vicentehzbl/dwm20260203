import crypto from 'node:crypto';

const base64url = value => Buffer.from(value).toString('base64url');

export function createSession({ id, name, role }) {
  const payload = base64url(JSON.stringify({ sub: id, name, role, exp: Date.now() + 60 * 60 * 1000 }));
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest();
  let given;
  try { given = Buffer.from(supplied, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!value.sub || value.exp < Date.now()) return null;
    return { id: value.sub, name: value.name, role: value.role };
  } catch { return null; }
}

export function safeTextEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
