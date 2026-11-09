const gateway = process.env.TN_GATEWAY_URL || 'http://127.0.0.1:4000';
const response = await fetch(`${gateway}/api/v1/products`);
if (!response.ok) throw new Error(`Gateway no disponible o catálogo no inicializado (HTTP ${response.status}).`);
const { items } = await response.json();
process.stdout.write(`Catálogo ficticio inicializado: ${items.length} productos. Los pedidos, pagos, clientes e inventario se persisten en backend/data/ al ejecutarse sus primeras operaciones.\n`);
