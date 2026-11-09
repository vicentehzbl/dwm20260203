import crypto from 'node:crypto';
import http from 'node:http';
import {
  execute,
  getOperationAST,
  GraphQLError,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate
} from 'graphql';
import { error, readBody, requestJson, requireService, send } from '../lib/http.js';
import { schema } from './schema.js';

const ordersBase = process.env.ORDERS_URL || 'http://127.0.0.1:4102';
const inventoryBase = process.env.INVENTORY_URL || 'http://127.0.0.1:4101';
const maxBodyBytes = 16 * 1024;
const maxQueryChars = 8 * 1024;
const maxDepth = 6;
const maxCost = 250;
const maxPageSize = 20;

function graphError(message, code) {
  return { message, extensions: { code } };
}

function getIntegerArgument(field, argumentName, variables, fallback) {
  const argument = field.arguments?.find(item => item.name.value === argumentName);
  if (!argument) return fallback;
  if (argument.value.kind === 'IntValue') return Number(argument.value.value);
  if (argument.value.kind === 'Variable') return variables?.[argument.value.name.value] ?? fallback;
  return fallback;
}

function measureSelection(selectionSet, variables, depth = 1, multiplier = 1) {
  if (!selectionSet) return { depth, cost: 0, fieldCount: 0, issue: null };
  let cost = 0;
  let fieldCount = 0;
  let deepest = depth;
  for (const selection of selectionSet.selections) {
    if (selection.kind !== 'Field') return { depth: deepest, cost, fieldCount, issue: 'Fragments no están habilitados para esta consulta.' };
    fieldCount += multiplier;
    cost += multiplier;
    const nestedMultiplier = selection.name.value === 'items'
      ? getIntegerArgument(selection, 'first', variables, 10)
      : multiplier;
    if (selection.name.value === 'items' && (!Number.isInteger(nestedMultiplier) || nestedMultiplier < 1 || nestedMultiplier > maxPageSize)) {
      return { depth: deepest, cost, fieldCount, issue: `El tamaño de página debe estar entre 1 y ${maxPageSize}.` };
    }
    const nested = measureSelection(selection.selectionSet, variables, depth + 1, nestedMultiplier);
    deepest = Math.max(deepest, nested.depth);
    cost += nested.cost;
    fieldCount += nested.fieldCount;
    if (nested.issue) return { depth: deepest, cost, fieldCount, issue: nested.issue };
  }
  return { depth: deepest, cost, fieldCount, issue: null };
}

function publicErrors(errors) {
  return errors.map(cause => ({
    message: cause.message,
    ...(cause.locations ? { locations: cause.locations } : {}),
    ...(cause.path ? { path: cause.path } : {}),
    extensions: { code: cause.extensions?.code || 'GRAPHQL_ERROR' }
  }));
}

async function loadOwnOrder(orderId, identity) {
  let result;
  try {
    result = await requestJson(`${ordersBase}/internal/orders/${encodeURIComponent(orderId)}/graphql-summary`, {
      token: process.env.GRAPHQL_ORDERS_READ_TOKEN,
      headers: { 'X-Client-Id': identity.clientId },
      timeout: 1500
    });
  } catch {
    throw new GraphQLError('No se pudo consultar el pedido temporalmente.', { extensions: { code: 'ORDERS_UNAVAILABLE' } });
  }
  if (result.status === 404) {
    throw new GraphQLError('No encontramos ese pedido para la cuenta actual.', { extensions: { code: 'ORDER_NOT_FOUND' } });
  }
  if (result.status !== 200) {
    throw new GraphQLError('No se pudo consultar el pedido temporalmente.', { extensions: { code: 'ORDERS_UNAVAILABLE' } });
  }

  const order = result.payload;
  const ids = [...new Set((order.items || []).map(line => Number(line.productId)).filter(Number.isInteger))];
  let products = [];
  let catalogUnavailable = false;
  if (ids.length) {
    try {
      const catalog = await requestJson(`${inventoryBase}/internal/catalog/batch`, {
        method: 'POST',
        token: process.env.GRAPHQL_INVENTORY_READ_TOKEN,
        body: { ids },
        timeout: 1500
      });
      if (catalog.status !== 200 || !Array.isArray(catalog.payload.items)) catalogUnavailable = true;
      else {
        products = catalog.payload.items;
        const returnedIds = new Set(products.map(product => Number(product.id)));
        catalogUnavailable = ids.some(id => !returnedIds.has(id));
      }
    } catch {
      catalogUnavailable = true;
    }
  }

  const catalogProductMap = new Map(products.map(product => [String(product.id), {
    id: product.id,
    name: product.nombre,
    category: product.categoria,
    description: product.descripcion
  }]));
  return {
    ...order,
    catalogUnavailable,
    items: (order.items || []).map(line => ({ ...line, catalogProductMap }))
  };
}

async function executeRequest(request, res) {
  const { value } = await readBody(request, maxBodyBytes);
  if (!value || typeof value.query !== 'string' || value.query.length > maxQueryChars) {
    return send(res, 400, { errors: [graphError('La consulta GraphQL es obligatoria y debe ser menor a 8 KB.', 'BAD_REQUEST')] });
  }
  if (value.variables !== undefined && (!value.variables || typeof value.variables !== 'object' || Array.isArray(value.variables))) {
    return send(res, 400, { errors: [graphError('variables debe ser un objeto JSON.', 'BAD_REQUEST')] });
  }
  if (typeof value.operationName === 'string' && value.operationName.length > 100) {
    return send(res, 400, { errors: [graphError('operationName excede el máximo permitido.', 'BAD_REQUEST')] });
  }

  let document;
  try {
    document = parse(value.query, { maxTokens: 1000 });
  } catch (cause) {
    return send(res, 400, { errors: publicErrors([cause]) });
  }
  const validationErrors = validate(schema, document, [...specifiedRules, NoSchemaIntrospectionCustomRule]);
  if (validationErrors.length) return send(res, 400, { errors: publicErrors(validationErrors) });

  const operation = getOperationAST(document, value.operationName);
  if (!operation || operation.operation !== 'query' || operation.selectionSet.selections.length !== 1
      || operation.selectionSet.selections[0].kind !== 'Field'
      || operation.selectionSet.selections[0].name.value !== 'myOrderSummary') {
    return send(res, 400, { errors: [graphError('Solo se permite una consulta myOrderSummary por solicitud.', 'OPERATION_NOT_ALLOWED')] });
  }

  const metrics = measureSelection(operation.selectionSet, value.variables || {});
  if (metrics.issue) return send(res, 400, { errors: [graphError(metrics.issue, 'QUERY_LIMIT_EXCEEDED')] });
  if (metrics.depth > maxDepth || metrics.cost > maxCost) {
    return send(res, 400, { errors: [graphError('La consulta supera el límite de profundidad o costo.', 'QUERY_LIMIT_EXCEEDED')] });
  }

  const identity = {
    clientId: String(request.headers['x-verified-client-id'] || ''),
    role: String(request.headers['x-verified-role'] || '')
  };
  if (!identity.clientId || identity.role !== 'customer') {
    return send(res, 403, { errors: [graphError('La identidad verificada no puede consultar este recurso.', 'FORBIDDEN')] });
  }

  const result = await execute({
    schema,
    document,
    operationName: value.operationName,
    variableValues: value.variables || {},
    contextValue: { identity, loadOwnOrder: orderId => loadOwnOrder(orderId, identity) }
  });
  const payload = {
    data: result.data,
    ...(result.errors?.length ? { errors: publicErrors(result.errors) } : {})
  };
  return send(res, 200, payload);
}

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  res.setHeader('X-Request-Id', requestId);
  if (req.url === '/health' && req.method === 'GET') return send(res, 200, { service: 'graphql-gateway', status: 'ok' });
  if (req.url !== '/graphql' || req.method !== 'POST') return error(res, 404, 'ROUTE_NOT_FOUND', 'Ruta privada GraphQL no encontrada.');
  if (!requireService(req, res, process.env.GATEWAY_GRAPHQL_TOKEN)) return;
  try {
    await executeRequest(req, res);
  } catch (cause) {
    const status = cause.status || 400;
    error(res, status, status === 413 ? 'BODY_TOO_LARGE' : 'BAD_GRAPHQL_REQUEST', status === 413 ? 'La consulta supera el tamaño permitido.' : 'No se pudo procesar la consulta.');
  } finally {
    process.stdout.write(`${JSON.stringify({ event: 'graphql_request', requestId, status: res.statusCode, durationMs: Date.now() - startedAt })}\n`);
  }
});

server.listen(Number(process.env.GRAPHQL_PORT || 4200), '127.0.0.1', () => {
  process.stdout.write(`${server.address().port} private GraphQL Gateway listening on 127.0.0.1\n`);
});
