import crypto from 'node:crypto';
import { createServer, error, readBody, requestJson, requireService, send } from '../lib/http.js';
import { nowIso, readStore, updateStore } from '../lib/store.js';

const initial = { payments: [], events: [] };
const ordersBase = process.env.ORDERS_URL || 'http://127.0.0.1:4102';
const ordersToken = () => process.env.PAYMENTS_ORDERS_TOKEN;

async function handler(req, res) {
  const url = new URL(req.url, 'http://payments.local');
  if (url.pathname === '/health' && req.method === 'GET') return send(res, 200, { service: 'payments', status: 'ok' });

  const start = url.pathname.match(/^\/internal\/orders\/([^/]+)\/payments$/);
  if (start && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_PAYMENTS_API_TOKEN)) return;
    const clientId = req.headers['x-client-id'];
    if (!clientId) return error(res, 401, 'CLIENT_REQUIRED', 'Se requiere identidad de cliente.');
    let order;
    try {
      order = await requestJson(`${ordersBase}/internal/orders/${encodeURIComponent(start[1])}/payment-context`, { token: ordersToken(), headers: { 'X-Client-Id': clientId } });
    } catch {
      return error(res, 503, 'ORDERS_UNAVAILABLE', 'Servicio de pedidos no disponible.');
    }
    if (order.status !== 200) return error(res, order.status, order.payload?.error?.code || 'ORDER_UNAVAILABLE', 'No se pudo validar el pedido.');
    if (order.payload.status !== 'pending_payment' || Date.parse(order.payload.paymentExpiresAt) <= Date.now()) return error(res, 409, 'ORDER_NOT_PAYABLE', 'El pedido no está pendiente de pago o su reserva expiró.');
    const payment = { paymentId: `pay_${crypto.randomUUID()}`, orderId: order.payload.id, clientId, amount: order.payload.total, currency: order.payload.currency, status: 'pending', provider: 'demo', createdAt: nowIso(), expiresAt: order.payload.paymentExpiresAt };
    let registered;
    try {
      registered = await requestJson(`${ordersBase}/internal/orders/${encodeURIComponent(payment.orderId)}/register-payment`, {
        method: 'POST', token: ordersToken(), headers: { 'X-Client-Id': clientId }, body: { paymentId: payment.paymentId, amount: payment.amount, currency: payment.currency }
      });
    } catch {
      return error(res, 503, 'ORDERS_UNAVAILABLE', 'No se pudo registrar el intento; vuelve a intentar.');
    }
    if (registered.status !== 200) return error(res, registered.status, registered.payload?.error?.code || 'PAYMENT_REGISTRATION_FAILED', 'No se pudo vincular el pago con el pedido.');
    await updateStore('payments', initial, data => { data.payments.push(payment); return null; });
    return send(res, 201, { paymentId: payment.paymentId, status: payment.status, checkoutUrl: `http://localhost:${process.env.GATEWAY_PORT || 4000}/demo-checkout/${payment.paymentId}`, expiresAt: payment.expiresAt });
  }

  if (url.pathname === '/internal/provider-events/demo' && req.method === 'POST') {
    if (!requireService(req, res, process.env.GATEWAY_PAYMENTS_EVENT_TOKEN)) return;
    const { raw, value } = await readBody(req);
    const secret = process.env.PAYMENT_WEBHOOK_SECRET || '';
    const signature = String(req.headers['x-payment-signature'] || '').replace(/^sha256=/, '');
    if (!secret || !signature) return error(res, 401, 'INVALID_SIGNATURE', 'Firma de proveedor ausente.');
    const expected = crypto.createHmac('sha256', secret).update(raw).digest();
    let supplied;
    try { supplied = Buffer.from(signature, 'hex'); } catch { supplied = Buffer.alloc(0); }
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return error(res, 401, 'INVALID_SIGNATURE', 'Firma de proveedor inválida.');
    if (!value.eventId || !value.paymentId || !['succeeded', 'failed'].includes(value.status) || !value.occurredAt) return error(res, 400, 'INVALID_EVENT', 'Evento de proveedor incompleto.');
    const timestamp = Date.parse(value.occurredAt);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return error(res, 400, 'STALE_EVENT', 'El evento está fuera de la ventana temporal permitida.');
    const data = await readStore('payments', initial);
    if (data.events.some(event => event.eventId === value.eventId)) return send(res, 200, { accepted: true, duplicate: true });
    const payment = data.payments.find(item => item.paymentId === value.paymentId);
    if (!payment) return error(res, 404, 'PAYMENT_NOT_FOUND', 'No se encontró el intento de pago.');
    if (payment.status !== 'pending') return error(res, 409, 'PAYMENT_ALREADY_FINAL', 'El intento ya tiene resultado final.');
    let applied;
    try {
      applied = await requestJson(`${ordersBase}/internal/orders/${encodeURIComponent(payment.orderId)}/payment-result`, {
        method: 'POST', token: ordersToken(), body: { eventId: value.eventId, paymentId: payment.paymentId, status: value.status }
      });
    } catch {
      return error(res, 503, 'ORDERS_UNAVAILABLE', 'No se pudo registrar el resultado; el proveedor debe reintentar.');
    }
    if (applied.status !== 200) return error(res, applied.status === 503 ? 503 : 409, applied.payload?.error?.code || 'ORDER_UPDATE_FAILED', 'El sistema de pedidos no aceptó el resultado.');
    await updateStore('payments', initial, current => {
      const stored = current.payments.find(item => item.paymentId === value.paymentId);
      if (!current.events.some(event => event.eventId === value.eventId)) current.events.push({ eventId: value.eventId, paymentId: value.paymentId, receivedAt: nowIso() });
      if (stored) { stored.status = value.status; stored.updatedAt = nowIso(); }
      return null;
    });
    return send(res, 200, { accepted: true, duplicate: false });
  }

  return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta privada de payments no encontrada.');
}

createServer(handler, process.env.PAYMENTS_PORT || 4104);
