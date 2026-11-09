import crypto from 'node:crypto';
import { createServer, error, readBody, requireService, send } from '../lib/http.js';
import { nowIso, readStore, updateStore } from '../lib/store.js';

const products = [
  { id: 1, nombre: 'Tokyo Shoyu', categoria: 'Ramen', descripcion: 'Caldo de soya, cerdo chashu, huevo y cebollín.', precio: 8990, imagen: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80', onHand: 18 },
  { id: 2, nombre: 'Miso Ramen', categoria: 'Ramen', descripcion: 'Miso, maíz, chashu, nori y cebollín fresco.', precio: 9490, imagen: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80', onHand: 16 },
  { id: 3, nombre: 'Tonkotsu', categoria: 'Ramen', descripcion: 'Caldo cremoso de cerdo, chashu, huevo y nori.', precio: 9990, imagen: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80', onHand: 14 },
  { id: 4, nombre: 'Gyozas Clásicas', categoria: 'Gyozas', descripcion: 'Masa dorada rellena de cerdo, repollo y cebollín.', precio: 5490, imagen: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80', onHand: 30 },
  { id: 5, nombre: 'Gyozas Vegetales', categoria: 'Gyozas', descripcion: 'Relleno de verduras, hongos y especias japonesas.', precio: 4990, imagen: 'https://images.unsplash.com/photo-1625938144755-652e08e359b7?auto=format&fit=crop&w=800&q=80', onHand: 24 },
  { id: 6, nombre: 'Combo Tokyo', categoria: 'Combos', descripcion: 'Ramen a elección + 5 gyozas + bebida.', precio: 12990, imagen: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80', onHand: 12 }
];

const initial = { products, reservations: [], adjustments: [] };
const available = (data, productId) => {
  const product = data.products.find(item => item.id === Number(productId));
  if (!product) return null;
  const reserved = data.reservations
    .filter(item => item.productId === product.id && item.status === 'active' && Date.parse(item.expiresAt) > Date.now())
    .reduce((sum, item) => sum + item.quantity, 0);
  return { product, reserved, available: product.onHand - reserved };
};

async function handler(req, res) {
  const url = new URL(req.url, 'http://inventory.local');
  if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { service: 'inventory', status: 'ok' });

  if (url.pathname === '/internal/catalog' && req.method === 'GET') {
    if (!requireService(req, res, [process.env.GATEWAY_INVENTORY_READ_TOKEN, process.env.ORDERS_INVENTORY_READ_TOKEN])) return;
    const data = await readStore('inventory', initial);
    const category = url.searchParams.get('category');
    const query = (url.searchParams.get('q') || '').toLocaleLowerCase('es');
    const availableFilter = url.searchParams.get('available');
    if (availableFilter !== null && !['true', 'false'].includes(availableFilter)) return error(res, 400, 'INVALID_FILTER', 'El filtro available debe ser true o false.');
    if (query.length > 80 || (category && !['Ramen', 'Gyozas', 'Combos'].includes(category))) return error(res, 400, 'INVALID_FILTER', 'Categoría o búsqueda inválida.');
    const items = data.products
      .filter(item => item.active !== false)
      .filter(item => !category || item.categoria === category)
      .filter(item => !query || `${item.nombre} ${item.categoria} ${item.descripcion}`.toLocaleLowerCase('es').includes(query))
      .filter(item => availableFilter === 'false' || available(data, item.id).available > 0)
      .map(item => ({ id: item.id, nombre: item.nombre, categoria: item.categoria, descripcion: item.descripcion, precio: item.precio, disponible: available(data, item.id).available > 0, imagen: item.imagen }));
    return send(res, 200, { items });
  }

  if (url.pathname === '/internal/catalog/batch' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GRAPHQL_INVENTORY_READ_TOKEN)) return;
    const { value } = await readBody(req, 8 * 1024);
    if (!Array.isArray(value.ids) || value.ids.length < 1 || value.ids.length > 30
        || value.ids.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) {
      return error(res, 400, 'INVALID_PRODUCT_IDS', 'Se requiere una lista de 1 a 30 IDs de producto válidos.');
    }
    const ids = new Set(value.ids.map(Number));
    const data = await readStore('inventory', initial);
    const items = data.products
      .filter(product => ids.has(product.id) && product.active !== false)
      .map(product => ({ id: product.id, nombre: product.nombre, categoria: product.categoria, descripcion: product.descripcion }));
    return send(res, 200, { items });
  }

  const productMatch = url.pathname.match(/^\/internal\/catalog\/(\d+)$/);
  if (productMatch && req.method === 'GET') {
    if (!requireService(req, res, [process.env.GATEWAY_INVENTORY_READ_TOKEN, process.env.ORDERS_INVENTORY_READ_TOKEN])) return;
    const data = await readStore('inventory', initial);
    const entry = available(data, productMatch[1]);
    if (!entry || entry.product.active === false) return error(res, 404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto.');
    const { product } = entry;
    return send(res, 200, { id: product.id, nombre: product.nombre, categoria: product.categoria, descripcion: product.descripcion, precio: product.precio, disponible: entry.available > 0, imagen: product.imagen });
  }

  if (url.pathname === '/internal/inventory' && req.method === 'GET') {
    if (!requireService(req, res, process.env.GATEWAY_INVENTORY_READ_TOKEN)) return;
    const data = await readStore('inventory', initial);
    return send(res, 200, { items: data.products.map(item => {
      const entry = available(data, item.id);
      return { productId: item.id, nombre: item.nombre, onHand: item.onHand, reserved: entry.reserved, available: entry.available };
    }) });
  }

  if (url.pathname === '/internal/reservations' && req.method === 'POST') {
    if (!requireService(req, res, process.env.ORDERS_INVENTORY_TOKEN)) return;
    const { value } = await readBody(req);
    const { orderId, items, expiresAt } = value;
    if (!orderId || !Array.isArray(items) || items.length === 0 || items.some(item => !Number.isInteger(Number(item.productId)) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) {
      return error(res, 400, 'INVALID_RESERVATION', 'Pedido o líneas de reserva inválidos.');
    }
    const result = await updateStore('inventory', initial, data => {
      const grouped = new Map();
      for (const item of items) grouped.set(Number(item.productId), (grouped.get(Number(item.productId)) || 0) + Number(item.quantity));
      for (const [productId, quantity] of grouped) {
        const entry = available(data, productId);
        if (!entry || entry.product.active === false) return { failure: 'PRODUCT_NOT_FOUND' };
        if (entry.available < quantity) return { failure: 'INSUFFICIENT_STOCK', productId };
      }
      const until = new Date(expiresAt || Date.now() + 15 * 60 * 1000);
      if (!Number.isFinite(until.valueOf()) || until.valueOf() <= Date.now()) return { failure: 'INVALID_EXPIRY' };
      const reservations = [];
      for (const [productId, quantity] of grouped) {
        const reservation = { reservationId: crypto.randomUUID(), orderId: String(orderId), productId, quantity, status: 'active', expiresAt: until.toISOString(), createdAt: nowIso() };
        data.reservations.push(reservation);
        reservations.push(reservation);
      }
      return { reservations };
    });
    if (result.failure === 'INSUFFICIENT_STOCK') return error(res, 409, 'INSUFFICIENT_STOCK', `Stock insuficiente para el producto ${result.productId}.`);
    if (result.failure) return error(res, result.failure === 'INVALID_EXPIRY' ? 400 : 404, result.failure, 'No se pudo reservar el inventario solicitado.');
    return send(res, 201, { reservations: result.reservations });
  }

  const reservationAction = url.pathname.match(/^\/internal\/reservations\/([^/]+)\/(release|consume)$/);
  if (reservationAction && req.method === 'POST') {
    if (!requireService(req, res, process.env.ORDERS_INVENTORY_TOKEN)) return;
    const [, orderId, action] = reservationAction;
    const result = await updateStore('inventory', initial, data => {
      const found = data.reservations.filter(item => item.orderId === decodeURIComponent(orderId));
      if (!found.length) return { failure: 'RESERVATION_NOT_FOUND' };
      for (const item of found) {
        if (item.status !== 'active') continue;
        if (Date.parse(item.expiresAt) <= Date.now()) item.status = 'expired';
        else if (action === 'consume') {
          const product = data.products.find(entry => entry.id === item.productId);
          if (!product || product.onHand < item.quantity) return { failure: 'STOCK_CHANGED' };
          product.onHand -= item.quantity;
          item.status = 'consumed';
        } else item.status = 'released';
        item.updatedAt = nowIso();
      }
      return { ok: true };
    });
    if (result.failure) return error(res, result.failure === 'STOCK_CHANGED' ? 409 : 404, result.failure, 'La reserva no pudo actualizarse.');
    return send(res, 200, { orderId: decodeURIComponent(orderId), status: action === 'consume' ? 'consumed' : 'released' });
  }

  const adjustment = url.pathname.match(/^\/internal\/inventory\/(\d+)\/adjustments$/);
  if (adjustment && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_INVENTORY_WRITE_TOKEN)) return;
    const { value } = await readBody(req);
    if (req.headers['x-actor-role'] !== 'inventory') return error(res, 403, 'FORBIDDEN', 'Se requiere el rol inventory.');
    if (!Number.isInteger(value.delta) || value.delta === 0 || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 250) return error(res, 400, 'INVALID_ADJUSTMENT', 'Ajuste o motivo inválido.');
    const result = await updateStore('inventory', initial, data => {
      const product = data.products.find(item => item.id === Number(adjustment[1]));
      if (!product) return { failure: 'PRODUCT_NOT_FOUND' };
      const entry = available(data, product.id);
      if (product.onHand + value.delta < entry.reserved) return { failure: 'NEGATIVE_AVAILABLE' };
      product.onHand += value.delta;
      const item = { adjustmentId: crypto.randomUUID(), productId: product.id, delta: value.delta, reason: value.reason.trim(), actorId: req.headers['x-actor-id'] || 'staff', onHandAfter: product.onHand, recordedAt: nowIso() };
      data.adjustments.push(item);
      return item;
    });
    if (result.failure) return error(res, result.failure === 'NEGATIVE_AVAILABLE' ? 409 : 404, result.failure, 'El ajuste no se puede aplicar.');
    return send(res, 201, {
      adjustmentId: result.adjustmentId,
      productId: result.productId,
      delta: result.delta,
      onHandAfter: result.onHandAfter,
      recordedAt: result.recordedAt
    });
  }

  return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta privada de inventory no encontrada.');
}

createServer(handler, process.env.INVENTORY_PORT || 4101);
