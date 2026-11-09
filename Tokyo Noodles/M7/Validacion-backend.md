# Módulo 7 — Resultados de validación del backend

**Fecha de ejecución:** 2026-11-09.  
**Entorno:** backend local de `MODULO 3/backend`, Gateway `127.0.0.1:4000`, servicios privados `127.0.0.1:4101–4104`, Node.js.  
**Configuración:** `.env` temporal con valores aleatorios únicos y cuentas demo ficticias; los valores no se detallan en este informe. El paquete académico incluye un `.env` local para facilitar la ejecución. Datos JSON creados por la prueba son temporales.  
**Ejecutor reproducible:** desde la raíz del proyecto, inicia `node 'MODULO 3/backend/dev.js'` en una terminal; en otra ejecuta `node M7/validar-backend.mjs`. Configura antes las referencias de `MODULO 3/backend/.env` a partir de `.env.example`. El script imprime PASS/FAIL y no imprime credenciales. Se añadieron comprobaciones extra de proyección mínima de campos.

## Resultados observados

| Caso | Entrada e identidad | Resultado esperado | Resultado observado | Componente que verifica | Estado |
|---|---|---|---|---|---|
| Catálogo anónimo | `GET /api/v1/products`, sin cookie/token de usuario | HTTP 200 con lista pública | HTTP **200**, `items` es una lista | Gateway permite S01 anónimo; Inventory proyecta catálogo | PASS |
| Servicio protegido sin sesión válida | `GET /api/v1/me/orders/no-session`, cookie `tn_session=invalid` | HTTP 401, sin llamada útil al recurso | HTTP **401** | Gateway consulta Clients y deniega sesión inválida | PASS |
| Administración con rol no autorizado | Login demo como `customer`; `POST /api/v1/staff/inventory/1/adjustments` | HTTP 403; no alterar stock | HTTP **403** | Gateway verifica rol; Inventory vuelve a exigir permiso si se alcanza | PASS |
| Pedido ajeno | Se creó un pedido como cliente demo; se hizo GET S10 con una sesión firmada válida de prueba para otro ID de cliente | HTTP 404 indistinguible del pedido inexistente | HTTP **404**; respuesta no confirma titular ni entrega pedido | Gateway conserva identidad firmada; Orders compara `clientId` con titular | PASS |
| Acceso directo a servicio interno | `GET http://127.0.0.1:4101/internal/catalog`, sin `X-Service-Token` | Rechazo sin identidad técnica autorizada | HTTP **401**, `SERVICE_UNAUTHORIZED` | Inventory valida token interno antes de catálogo | PASS |
| Intento de confirmar pago con datos frontend manipulados | Cliente envía S08 con `status=succeeded`, importe `1`, moneda `USD`; además intenta S13 con `confirmed` y envía un evento S09 sin firma HMAC válida | Los datos de S08 no fijan el estado; S13 debe denegar al cliente; S09 inválido no cambia pedido | S08 HTTP **201**, intento queda `pending`; S13 HTTP **403**; S09 HTTP **401**; consulta final S10 HTTP **200** y el pedido sigue `pending_payment` | Payments calcula desde Orders; Gateway limita rol; Payments valida HMAC y Orders conserva estado oficial | PASS |

## Comprobación adicional de campos mínimos

El script comprueba además que:

- La respuesta externa de login contiene solo `cliente.id` y `cliente.nombre`; no contiene rol ni el token de sesión en JSON (la sesión viaja solo como cookie HttpOnly).
- El catálogo devuelve únicamente `id`, `nombre`, `categoria`, `descripcion`, `precio`, `disponible` e `imagen`; no incluye `onHand` ni reservas.
- El historial S10 incluye `status` y `at` por hito, pero no `actorId` ni la nota interna de operaciones.
- La respuesta S12 de un ajuste devuelve `adjustmentId`, `productId`, `delta`, `onHandAfter` y `recordedAt`; no revela `actorId` ni el motivo guardado para auditoría.

Las cuatro comprobaciones adicionales pasaron en la misma ejecución que los seis casos de la tabla.

### Interpretación de la prueba de titularidad

Para reproducir “pedido ajeno” se creó una sesión HMAC válida de laboratorio con otro identificador, utilizando solo el secreto efímero del entorno de prueba. Esto comprueba de forma directa la regla de propiedad en Orders: aunque el Gateway acepte la sesión como autenticada, el servicio dueño responde 404 cuando el ID de la sesión no coincide con el titular persistido. La sesión artificial no pertenece a una cuenta real ni es un procedimiento de acceso de usuario.

### Hallazgo y corrección durante la ejecución

La primera ejecución detectó que Orders usaba la credencial de reserva al consultar detalles del catálogo. Inventory correctamente rechazaba esa credencial para lectura, por lo que el pedido de prueba no avanzó. Se agregó `ORDERS_INVENTORY_READ_TOKEN`, de solo lectura, se autorizó específicamente en las rutas internas de catálogo y se mantuvo `ORDERS_INVENTORY_TOKEN` para reservas/consumo/liberación. Tras la corrección se reinició el backend y los seis casos de la tabla pasaron.

## Alcance y límites

- Son pruebas de integración local, no un pentest ni evidencia de despliegue HTTPS/red privada.
- El catálogo, Auth, Orders, Inventory y Payments actuales sí fueron recorridos. Contacto y facturas S04–S06 no tienen backend activo y no se presentan como probados.
- El test de pago comprueba rechazo de alteración de frontend y webhook no firmado; no realiza una transacción con proveedor real.
- Los servicios de prueba se iniciaron en loopback; no se intentó acceso desde otra máquina.
- La sesión de producción necesita revocación persistente; el prototipo solo verifica firma/expiración de 1 hora y logout borra la cookie del navegador.
