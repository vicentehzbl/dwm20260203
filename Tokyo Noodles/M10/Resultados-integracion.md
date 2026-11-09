# Resultados de integración M10

Ejecución local en Windows 10, Node.js v24.22.1, 9 de noviembre de 2026. Se ejecutó contra los servicios iniciados por `MODULO 3/backend/dev.js`; son datos ficticios persistidos localmente.

| Suite | Resultado |
|---|---|
| `M7/validar-backend.mjs` | PASS: 7 controles, incluido catálogo anónimo, sesión, rol, propiedad, rechazo de servicio privado y manipulación de pago. |
| `M8/verificar-integracion.mjs` | PASS: 10 comprobaciones, incluidas GraphQL, acceso privado, paginación, propiedad, rol, límites, CORS y falla parcial por indisponibilidad de Inventory. |
| `M10/verificar-integracion.mjs` | PASS: 10 pruebas, incluidas registro persistido y scrypt, contacto, CORS, idempotencia de pedido, propiedad, acceso directo, vista de operaciones por rol, reserva/restitución de stock, pago HMAC duplicado e historial propio. |
| `M9/medir-carga.ps1` | PASS: 20/20 consultas `200`, concurrencia 4, 0 errores GraphQL/HTTP, p95 82,16 ms, throughput 124,11 req/s. CPU 0,6406 s; uso medio 11,31% relativo a 12 procesadores; working set máximo muestreado 348,48 MB. |

La prueba M10 crea pedidos de estado pendiente, pago fallido y pago confirmado. Un pago fallido restaura la disponibilidad reservada; un pago confirmado consume la reserva y habilita el documento interno. Repetir exactamente el mismo evento firmado devuelve `duplicate: true`. El registro evita correos repetidos y no persiste la contraseña en texto plano. CORS permite `Idempotency-Key` para POST de pedidos y deniega headers no incluidos en la política.

La muestra de carga incluye 20 solicitudes y cuatro procesos concurrentes en loopback. CPU/memoria se muestrearon durante aproximadamente 0,46 s con tres observaciones. Estos valores acreditan ejecución reproducible de este caso pequeño; no predicen capacidad productiva.
