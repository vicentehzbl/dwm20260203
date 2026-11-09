import crypto from 'node:crypto';
import { createServer, error, readBody, requestJson, requireService, send } from '../lib/http.js';
import { nowIso, readStore, updateStore } from '../lib/store.js';

const initial = { orders: [] };
const inventoryBase = process.env.INVENTORY_URL || 'http://127.0.0.1:4101';
const inventoryReadToken = () => process.env.ORDERS_INVENTORY_READ_TOKEN;
const inventoryToken = () => process.env.ORDERS_INVENTORY_TOKEN;
const transitions = {
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['dispatched', 'delivered', 'cancelled'],
  dispatched: ['delivered'],
  delivered: [],
  cancelled: [],
  payment_failed: [],
  pending_payment: ['cancelled']
};

async function inventory(path, options) {
  try {
    const method = options?.method || 'GET';
    const token = path.startsWith('/internal/catalog/') && method === 'GET' ? inventoryReadToken() : inventoryToken();
    return await requestJson(`${inventoryBase}${path}`, { token, ...options });
  }
  catch { return { status: 503, payload: { error: { code: 'INVENTORY_UNAVAILABLE' } } }; }
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://orders.local');
  if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { service: 'orders', status: 'ok' });

  if (url.pathname === '/internal/orders' && req.method === 'GET') {
    if (!requireService(req, res, process.env.GATEWAY_ORDERS_OPERATIONS_TOKEN)) return;
    if (req.headers['x-actor-role'] !== 'operations') return error(res, 403, 'FORBIDDEN', 'Se requiere rol operations.');
    const data = await readStore('orders', initial);
    const items = data.orders.slice(-100).reverse().map(order => ({ id: order.id, status: order.status, fulfillment: order.fulfillment, total: order.total, currency: order.currency, createdAt: order.createdAt }));
    return send(res, 200, { items });
  }

  if (url.pathname === '/internal/orders' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_ORDERS_CREATE_TOKEN)) return;
    const { value } = await readBody(req);
    const clientId = req.headers['x-client-id'];
    const key = req.headers['idempotency-key'];
    if (!clientId || !key || key.length > 100) return error(res, 400, 'MISSING_IDENTITY_OR_IDEMPOTENCY', 'Se requiere cliente autenticado e Idempotency-Key.');
    if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > 30 || value.items.some(item => !Number.isInteger(Number(item.productId)) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 50)) return error(res, 400, 'INVALID_ITEMS', 'El pedido debe tener entre 1 y 30 líneas válidas.');
    if (!['pickup', 'delivery'].includes(value.fulfillment) || !['boleta', 'factura'].includes(value.documentType)) return error(res, 400, 'INVALID_ORDER_OPTIONS', 'Modalidad o documento inválido.');
    if (value.fulfillment === 'delivery' && (!value.deliveryAddress || !value.deliveryAddress.calle || !value.deliveryAddress.numero || !value.deliveryAddress.comuna || !value.deliveryAddress.region)) return error(res, 422, 'DELIVERY_ADDRESS_REQUIRED', 'Se requieren los datos de despacho.');
    if (value.documentType === 'factura' && (!value.billingDetails || !value.billingDetails.rut || !value.billingDetails.razonSocial || !value.billingDetails.giro || !value.billingDetails.direccion)) return error(res, 422, 'BILLING_DETAILS_REQUIRED', 'Se requieren datos tributarios para factura.');
    const fingerprint = JSON.stringify({ items: value.items, fulfillment: value.fulfillment, deliveryAddress: value.deliveryAddress || null, documentType: value.documentType, billingDetails: value.billingDetails || null });
    let dependencyFailure = null;
    let created;
    let reservationOrderId = null;
    try {
      created = await updateStore('orders', initial, async data => {
        const prior = data.orders.find(order => order.clientId === clientId && order.idempotencyKey === key);
        if (prior) return prior.fingerprint === fingerprint ? { order: prior, replay: true } : { failure: 'IDEMPOTENCY_CONFLICT' };
        const catalogRows = await Promise.all(value.items.map(item => inventory(`/internal/catalog/${Number(item.productId)}`)));
        if (catalogRows.some(response => response.status !== 200)) return { failure: 'PRODUCT_NOT_FOUND' };
        const lines = value.items.map((item, index) => ({ productId: Number(item.productId), nombre: catalogRows[index].payload.nombre, unitPrice: catalogRows[index].payload.precio, quantity: Number(item.quantity), lineTotal: catalogRows[index].payload.precio * Number(item.quantity) }));
        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const deliveryFee = 0;
        const id = `ord_${crypto.randomUUID()}`;
        reservationOrderId = id;
        const createdAt = nowIso();
        const paymentExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const reservation = await inventory('/internal/reservations', {
          method: 'POST',
          body: { orderId: id, items: lines.map(line => ({ productId: line.productId, quantity: line.quantity })), expiresAt: paymentExpiresAt }
        });
        if (reservation.status !== 201) {
          dependencyFailure = reservation;
          return { failure: reservation.status === 503 ? 'INVENTORY_UNAVAILABLE' : 'RESERVATION_FAILED' };
        }
        const order = {
          id, clientId, status: 'pending_payment', fulfillment: value.fulfillment, deliveryAddress: value.deliveryAddress || null,
          documentType: value.documentType, billingDetails: value.billingDetails || null, lines, currency: 'CLP', subtotal, deliveryFee,
          total: subtotal + deliveryFee, createdAt, paymentExpiresAt,
          reservations: reservation.payload.reservations.map(item => item.reservationId), idempotencyKey: key, fingerprint,
          paymentIds: [], paymentEvents: [], timeline: [{ status: 'pending_payment', at: createdAt }]
        };
        order.reservations = reservation.payload.reservations.map(item => item.reservationId);
        data.orders.push(order);
        return { order, replay: false };
      });
    } catch {
      if (reservationOrderId) await inventory(`/internal/reservations/${encodeURIComponent(reservationOrderId)}/release`, { method: 'POST' });
      return error(res, 503, 'ORDER_STORAGE_UNAVAILABLE', 'No se pudo guardar el pedido.');
    }
    if (created.failure === 'IDEMPOTENCY_CONFLICT') return error(res, 409, created.failure, 'La clave idempotente ya se usó con otra solicitud.');
    if (created.failure === 'INVENTORY_UNAVAILABLE') return error(res, 503, created.failure, 'Inventario no está disponible; el pedido no se confirmó.');
    if (created.failure === 'RESERVATION_FAILED') return error(res, dependencyFailure?.status === 404 ? 404 : 409, dependencyFailure?.payload?.error?.code || 'INSUFFICIENT_STOCK', 'No fue posible reservar todos los productos.');
    if (created.failure) return error(res, created.failure === 'PRODUCT_NOT_FOUND' ? 404 : 503, created.failure, 'No se pudo completar la creación del pedido.');
    const order = created.order;
    return send(res, created.replay ? 200 : 201, { id: order.id, status: order.status, currency: order.currency, subtotal: order.subtotal, deliveryFee: order.deliveryFee, total: order.total, paymentExpiresAt: order.paymentExpiresAt });
  }

  const orderMatch = url.pathname.match(/^\/internal\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') {
    if (!requireService(req, res, process.env.GATEWAY_ORDERS_READ_TOKEN)) return;
    if (!req.headers['x-client-id']) return error(res, 401, 'CLIENT_IDENTITY_REQUIRED', 'Se requiere identidad de cliente verificada.');
    const data = await readStore('orders', initial);
    const order = data.orders.find(item => item.id === decodeURIComponent(orderMatch[1]));
    if (!order) return error(res, 404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    if (req.headers['x-client-id'] !== order.clientId) return error(res, 404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    return send(res, 200, {
      id: order.id, status: order.status, fulfillment: order.fulfillment, total: order.total, currency: order.currency,
      timeline: order.timeline.map(event => ({ status: event.status, at: event.at })), paymentExpiresAt: order.paymentExpiresAt
    });
  }

  if (url.pathname === '/internal/invoices' && req.method === 'GET') {
    if (!requireService(req, res, process.env.GATEWAY_ORDERS_READ_TOKEN)) return;
    const clientId = req.headers['x-client-id'];
    if (!clientId) return error(res, 401, 'CLIENT_IDENTITY_REQUIRED', 'Se requiere identidad de cliente verificada.');
    const data = await readStore('orders', initial);
    const items = data.orders.filter(order => order.clientId === clientId && ['confirmed', 'preparing', 'ready', 'dispatched', 'delivered'].includes(order.status))
      .map(order => ({ id: `doc_${order.id}`, orderId: order.id, type: order.documentType, date: order.createdAt, total: order.total, currency: order.currency, status: 'emitido', lines: order.lines.map(line => ({ nombre: line.nombre, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal })) }));
    return send(res, 200, { items });
  }

  const paymentContext = url.pathname.match(/^\/internal\/orders\/([^/]+)\/payment-context$/);
  if (paymentContext && req.method === 'GET') {
    if (!requireService(req, res, process.env.PAYMENTS_ORDERS_TOKEN)) return;
    const clientId = req.headers['x-client-id'];
    if (!clientId) return error(res, 401, 'CLIENT_IDENTITY_REQUIRED', 'Se requiere identidad de cliente verificada.');
    const data = await readStore('orders', initial);
    const order = data.orders.find(item => item.id === decodeURIComponent(paymentContext[1]));
    if (!order || order.clientId !== clientId) return error(res, 404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    return send(res, 200, { id: order.id, status: order.status, total: order.total, currency: order.currency, paymentExpiresAt: order.paymentExpiresAt });
  }

  const graphqlSummary = url.pathname.match(/^\/internal\/orders\/([^/]+)\/graphql-summary$/);
  if (graphqlSummary && req.method === 'GET') {
    if (!requireService(req, res, process.env.GRAPHQL_ORDERS_READ_TOKEN)) return;
    const clientId = req.headers['x-client-id'];
    if (!clientId) return error(res, 401, 'CLIENT_IDENTITY_REQUIRED', 'Se requiere identidad de cliente verificada.');
    const data = await readStore('orders', initial);
    const order = data.orders.find(item => item.id === decodeURIComponent(graphqlSummary[1]));
    if (!order || order.clientId !== clientId) return error(res, 404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    return send(res, 200, {
      id: order.id,
      status: order.status,
      fulfillment: order.fulfillment,
      total: order.total,
      currency: order.currency,
      timeline: order.timeline.map(event => ({ status: event.status, at: event.at })),
      items: order.lines.map(line => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal }))
    });
  }

  const registerPayment = url.pathname.match(/^\/internal\/orders\/([^/]+)\/register-payment$/);
  if (registerPayment && req.method === 'POST') {
    if (!requireService(req, res, process.env.PAYMENTS_ORDERS_TOKEN)) return;
    const { value } = await readBody(req);
    const result = await updateStore('orders', initial, data => {
      const order = data.orders.find(item => item.id === decodeURIComponent(registerPayment[1]));
      if (!order) return { failure: 'ORDER_NOT_FOUND' };
      if (order.clientId !== req.headers['x-client-id']) return { failure: 'ORDER_NOT_FOUND' };
      if (order.status !== 'pending_payment' || Date.parse(order.paymentExpiresAt) <= Date.now()) return { failure: 'ORDER_NOT_PAYABLE' };
      if (!value.paymentId || value.amount !== order.total || value.currency !== order.currency) return { failure: 'PAYMENT_MISMATCH' };
      if (!order.paymentIds.includes(value.paymentId)) order.paymentIds.push(value.paymentId);
      return { ok: true };
    });
    if (result.failure) return error(res, result.failure === 'ORDER_NOT_FOUND' ? 404 : 409, result.failure, 'No se pudo vincular el intento de pago.');
    return send(res, 200, { registered: true });
  }

  const paymentResult = url.pathname.match(/^\/internal\/orders\/([^/]+)\/payment-result$/);
  if (paymentResult && req.method === 'POST') {
    if (!requireService(req, res, process.env.PAYMENTS_ORDERS_TOKEN)) return;
    const { value } = await readBody(req);
    if (!value.eventId || !value.paymentId || !['succeeded', 'failed'].includes(value.status)) return error(res, 400, 'INVALID_PAYMENT_EVENT', 'Evento de pago inválido.');
    const result = await updateStore('orders', initial, async data => {
      const order = data.orders.find(item => item.id === decodeURIComponent(paymentResult[1]));
      if (!order) return { failure: 'ORDER_NOT_FOUND' };
      if (!order.paymentIds.includes(value.paymentId)) return { failure: 'PAYMENT_NOT_LINKED' };
      if (order.paymentEvents.includes(value.eventId)) return { duplicate: true, order };
      if (order.status !== 'pending_payment') return { failure: 'ORDER_NOT_PAYABLE' };
      if (Date.parse(order.paymentExpiresAt) <= Date.now()) {
        await inventory(`/internal/reservations/${encodeURIComponent(order.id)}/release`, { method: 'POST' });
        order.status = 'expired';
        order.timeline.push({ status: 'expired', at: nowIso() });
        return { failure: 'ORDER_EXPIRED' };
      }
      const action = value.status === 'succeeded' ? 'consume' : 'release';
      const stock = await inventory(`/internal/reservations/${encodeURIComponent(order.id)}/${action}`, { method: 'POST' });
      if (stock.status !== 200) return { failure: stock.status === 503 ? 'INVENTORY_UNAVAILABLE' : 'RESERVATION_UPDATE_FAILED' };
      order.paymentEvents.push(value.eventId);
      order.status = value.status === 'succeeded' ? 'confirmed' : 'payment_failed';
      order.timeline.push({ status: order.status, at: nowIso() });
      return { order };
    });
    if (result.failure) return error(res, result.failure === 'ORDER_NOT_FOUND' ? 404 : result.failure === 'INVENTORY_UNAVAILABLE' ? 503 : 409, result.failure, 'El resultado de pago no pudo aplicarse.');
    return send(res, 200, { accepted: true, duplicate: Boolean(result.duplicate), orderId: result.order.id, status: result.order.status });
  }

  const statusMatch = url.pathname.match(/^\/internal\/orders\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'PUT') {
    if (!requireService(req, res, process.env.GATEWAY_ORDERS_OPERATIONS_TOKEN)) return;
    const { value } = await readBody(req);
    if (req.headers['x-actor-role'] !== 'operations') return error(res, 403, 'FORBIDDEN', 'Se requiere rol de operaciones.');
    const result = await updateStore('orders', initial, data => {
      const order = data.orders.find(item => item.id === decodeURIComponent(statusMatch[1]));
      if (!order) return { failure: 'ORDER_NOT_FOUND' };
      if (!transitions[order.status]?.includes(value.status)) return { failure: 'INVALID_TRANSITION' };
      order.status = value.status;
      order.timeline.push({ status: value.status, at: nowIso(), actorId: req.headers['x-actor-id'] || 'staff', note: String(value.note || '').slice(0, 250) });
      return { order };
    });
    if (result.failure) return error(res, result.failure === 'ORDER_NOT_FOUND' ? 404 : 409, result.failure, 'La transición no está permitida.');
    return send(res, 200, { id: result.order.id, status: result.order.status, updatedAt: result.order.timeline.at(-1).at });
  }

  return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta privada de orders no encontrada.');
}

createServer(handler, process.env.ORDERS_PORT || 4102);
