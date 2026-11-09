# Módulo 1 — Servicios derivados del frontend

**Proyecto/caso:** Tokyo Noodles, restaurante de ramen y gyozas. Nombre confirmado por el usuario.  
**Número del caso:** incluir solo si el curso asignó un número.  
**Frontend de referencia:** sitio estático responsivo, HTML/CSS/Bootstrap/JavaScript, versión con maquetas de Pedido, Seguimiento e Inventario.  
**Estado:** contratos trazables a la implementación local M10 en `MODULO 3/backend/`; las limitaciones de proveedores externos y emisión fiscal se registran en `M10/README.md`.

## Resumen consolidado

Tokyo Noodles es el caso oficial confirmado por el equipo. Este archivo reúne propósito, pasos, recorrido de pantallas, matriz S01–S14, ejemplos JSON ficticios y control final del Módulo 1. El backend local implementa catálogo, autenticación/registro, contacto, pedidos, pagos de prueba, historial de documentos internos, seguimiento, inventario y operaciones. No incluye emisión DTE/SII, PDF tributario ni proveedor de pago/email real. `docs/` es estático y consume el Gateway cuando se sirve localmente con el backend; GitHub Pages no ejecuta microservicios.

## 1. Propósito

Identificar qué operación necesita cada pantalla y qué datos cruzan entre el navegador y el backend. Una variación visual entre escritorio y móvil no crea un servicio distinto si ambos ejecutan la misma operación.

## 2. Requisitos del caso y decisiones técnicas

La guía pide usar el caso como fuente de requisitos y distinguirlo de las decisiones de arquitectura. El nombre Tokyo Noodles ya está confirmado; las reglas comerciales no presentes en el frontend se mantienen como supuestos hasta validarlas.

| Tipo | Ejemplos en este documento | Estado |
|---|---|---|
| Necesidad funcional observada en las pantallas | Consultar menú y detalle, enviar contacto, consultar facturas. | Derivada del frontend. |
| Flujo propuesto para completar el caso | Pedido, pago, seguimiento, inventario y operación de personal. | Maquetas/propuesta; validar con la pauta o descripción oficial del caso. |
| Decisión técnica | REST /api/v1, cookie segura, cursor, checkout alojado, webhook firmado, DTO mínimos. | Propuesta de arquitectura, no requisito de negocio. |
| Regla comercial aún no confirmada | Zonas/tarifas de despacho, reservas, cancelaciones, integración tributaria. | Configuración o decisión pendiente del restaurante/docente. |

## 3. Pasos a seguir aplicados

1. **Recorrer pantallas:** registrar acciones, formularios, listados, errores y mensajes esperados; comparar móvil/escritorio.
2. **Asignar IDs:** Pxx para pantallas, R-… para requisitos y Sxx para servicios. Reutilizar un servicio si distintas pantallas hacen la misma operación.
3. **Clasificar operaciones:** GET consultar; POST agregar/iniciar; PUT modificar; DELETE eliminar. No se agregan borrados para completar CRUD si el negocio no los necesita.
4. **Definir transporte:** ruta, query, cabeceras y cuerpo; campos, tipos, obligatoriedad, validaciones y clasificación de datos.
5. **Definir respuestas:** salida, códigos/errores y qué valida o calcula el servidor. Cada contrato tiene un ejemplo ficticio en la sección 6.

## 4. Recorrido de pantallas

| Pantalla | Acción y resultado esperado | Servicio o justificación | Estado/prototipo |
|---|---|---|---|
| P01 Inicio | Ver destacados y enlaces al menú. | S01 consulta catálogo; los enlaces son navegación local. | Integrada con el Gateway local. |
| P02 Menú | Listar, buscar/filtrar; mostrar vacío, error o resultados. | Reutiliza S01 de P01. | Integrada con el catálogo real del Gateway local. |
| P03 Detalle | Abrir producto por productoId; volver a categoría/catálogo. | S02 consulta; retorno es navegación del navegador. | Integrada con catálogo del Gateway local. |
| P04 Empresa | Leer historia y valores. | Contenido estático, no requiere servicio si no se administra desde un panel. | Pantalla existente. |
| P05 Contacto | Enviar nombre, email y mensaje; confirmar recepción o informar error. | S04 agrega mensaje con validación y retención local. | Integrada; no envía correo externo. |
| P08 Facturas | Iniciar sesión y consultar documentos propios. | S03/S05; S06 PDF fiscal es brecha. | Login y listado integrados; no hay cursor ni PDF tributario. |
| P09 Pedido | Elegir producto/cantidad, retiro/despacho, documento y crear pedido. | S07 crea pedido pendiente de pago. | Integrada; el backend valida stock y precio. |
| P10 Pago | Abrir checkout y observar resultado aprobado/rechazado de prueba. | S08/S09/S10. | Integrada con adaptador demo; no se cobran tarjetas ni se conecta proveedor real. |
| P11 Seguimiento | Consultar estado e hitos del pedido propio. | S10 y agregado GraphQL G01. | Integrada con GraphQL Gateway privado. |
| P12 Inventario | Personal consulta existencias y registra ajuste con motivo. | S11/S12. | Integrada en consola de inventario con verificación por rol. |
| P13 Operaciones | Revisar cola y avanzar pedidos por estados permitidos. | S13 cambia estado; S14 lista cola. | Vista de operaciones incorporada; solo rol `operations`. |

P06 y P07 no se usan en esta versión; no se agregan para llenar huecos. Cambios visuales en móvil no crean endpoints.

## 5. Matriz de servicios y contratos

Convenciones: HTTPS; rutas REST bajo /api/v1; montos CLP como enteros; cookie de sesión HttpOnly/Secure/SameSite. “Público” describe información divulgable; “restringido” describe información personal/transaccional; “interno” describe operación del restaurante. La API puede ser accesible desde fuera y aun exigir autenticación.

| ID de servicio | Requisito | Pantalla y acción | Propósito | Verbo y ruta propuesta | Entrada | Salida | Reglas y errores | Clasificación de datos | Acceso |
|---|---|---|---|---|---|---|---|---|---|
| S01 | R-CAT-01 consultar catálogo disponible | P01 destacados; P02 listar/buscar/filtrar | Entregar lista pública de productos publicables | GET /api/v1/products?available=true&category={category}&q={text} | Query opcional available:boolean (default true), category enum Ramen/Gyozas/Combos, q:string máx. 80; sin cuerpo. | 200 lista {id,nombre,categoria,descripcion,precio,disponible,imagen}; [] sin coincidencias. | 400 filtro inválido; 429 límite; 500. Devolver solo campos públicos; no costos, proveedor ni stock exacto interno. | Salida de catálogo pública. | Anónimo. |
| S02 | R-CAT-02 consultar detalle | P03 abrir producto | Entregar ficha pública de un producto | GET /api/v1/products/{productId} | Path productId: entero positivo; sin cuerpo. | 200 ficha pública de producto. | 400 ID inválido; 404 inexistente/no publicable; 500. No serializar entidad completa. | Catálogo público. | Anónimo. |
| S03 | R-CLI-01 autenticar/registrar cliente | P08 y P09; iniciar sesión o crear cuenta | Verificar credenciales o registrar cuenta de cliente | POST /api/v1/auth/sessions; POST /api/v1/auth/registrations | Login: email y password; registro: name, email válido y password 12–128 caracteres. HTTPS, sin query. | Perfil mínimo {id,nombre}; cookie segura por Set-Cookie; no token/contraseña en JSON. | 400 formato; 401 credenciales inválidas; 409 correo repetido; 429 límite de intentos; 500. | Email personal restringido; password/cookie credenciales. | Anónimo al ingresar/registrar; luego autenticado. |
| S04 | R-CON-01 recibir consulta | P05 enviar contacto | Registrar mensaje para que el restaurante responda | POST /api/v1/contact-messages | JSON nombre:string 1–100; email:string válido ≤254; mensaje:string 1–3000; obligatorios. | 202 {id,estado:recibido}. | 400 campos inválidos; 413 cuerpo excesivo; 429 antiabuso; 500. 202 confirma recepción, no respuesta enviada. | Nombre/email/mensaje personales restringidos. | Anónimo con controles antiabuso. |
| S05 | R-FAC-01 listar facturas propias | P08 consultar/paginar | Consultar historial de la sesión, más reciente primero | GET /api/v1/me/invoices?limit=10&cursor={cursor} | Cookie; limit:integer opcional, default 10, rango 1–50; cursor:string opaco opcional. No aceptar clientId. | 200 items:[{id,folio,fecha,total,moneda,estado}], nextCursor. | 400 límite/cursor inválido; 401 sin sesión; 410 cursor vencido; 500. Orden estable issuedAt DESC,id DESC. Cursor ligado a sesión/filtro/orden; expira en 24 h; vacío => items=[] y nextCursor=null. | Historial, folios y montos restringidos. | Autenticado; solo documentos propios. |
| S06 | R-FAC-02 descargar documento autorizado | P08 solicitar PDF | Transmitir PDF después de verificar propiedad | GET /api/v1/me/invoices/{invoiceId}/document | Path invoiceId:string; cookie; sin cuerpo. | 200 bytes PDF; Content-Type application/pdf; Content-Disposition attachment; Cache-Control private,no-store. | 400 ID inválido; 401 sin sesión; 404 no existe/ajeno sin revelar existencia; 500. Descarga directa, no URL temporal. | Documento tributario y compra restringidos. | Autenticado y titular. |
| S07 | R-PED-01 crear pedido | P09 confirmar compra | Validar líneas, precio y stock; calcular importes y crear pedido | POST /api/v1/orders | Cookie; Idempotency-Key; JSON items:[{productId:integer>0,quantity:integer>0}], fulfillment:pickup/delivery; deliveryAddress:{calle,numero,comuna,region} obligatoria si delivery; documentType:boleta/factura; billingDetails:{rut,razonSocial,giro,direccion} obligatorio si factura. No precio/total/clientId. | 201 {id,status:pending_payment,currency,subtotal,deliveryFee,total,paymentExpiresAt}. | 400 estructura; 401 sin sesión; 409 sin stock o clave idempotente conflictiva; 422 dirección/zona o datos tributarios incompletos. Servidor calcula precio/total. Reserva propuesta de 15 min, confirmar con negocio. | Compra, dirección y facturación restringidas. | Cliente autenticado; identidad derivada de sesión. |
| S08 | R-PAG-01 iniciar pago | P10 solicitar checkout | Iniciar intento por importe calculado en servidor | POST /api/v1/orders/{orderId}/payments | Cookie; path orderId:string. No enviar monto ni datos de tarjeta. | 201 {paymentId,status:pending,checkoutUrl,expiresAt}; URL HTTPS del proveedor configurado. | 401; 404 pedido inexistente/ajeno; 409 pedido no pagable; 502 proveedor no disponible. Restringir dominio a proveedor autorizado. | Identificador e importe de pago restringidos; tarjeta no pasa por Tokyo Noodles. | Cliente autenticado, dueño del pedido. |
| S09 | R-PAG-02 procesar resultado verificado | P10 resultado; proveedor → backend | Validar notificación firmada y aplicarla una sola vez | POST /api/v1/integrations/payments/{provider}/events | Firma en cabecera; JSON eventId,paymentId,status,occurredAt. | 200 {accepted:true}. | 400 firma/carga inválida; 409 transición incompatible. Verificar firma/fecha y deduplicar evento; retorno del navegador no es prueba. | Evento pago restringido; firma/credencial es secreto. | Proveedor autorizado; no se llama desde el browser. |
| S10 | R-PED-02 consultar pedido propio | P10 resultado y P11 seguimiento | Mostrar estado/hitos del pedido del cliente | GET /api/v1/me/orders/{orderId} | Cookie y path orderId:string; no clientId. | 200 {id,status,fulfillment,total,currency,timeline}. | 400 ID inválido; 401; 404 inexistente/ajeno; 500. No filtrar pedido de terceros. | Pedido e historial restringidos. | Autenticado; dueño del pedido. |
| S11 | R-INV-01 consultar inventario | P12 consultar existencias | Mostrar saldo al personal autorizado | GET /api/v1/staff/inventory?category={category} | Cookie de personal; category enum opcional. | 200 items:[{productId,nombre,onHand,reserved,available}]. | 400 filtro inválido; 401; 403 rol insuficiente; 500. available = onHand - reservas activas. | Inventario interno. | Personal con rol. |
| S12 | R-INV-02 registrar ajuste | P12 ingresar cantidad y motivo | Registrar cambio auditable de stock | POST /api/v1/staff/inventory/{productId}/adjustments | Path productId: entero positivo; JSON delta:integer distinto de 0, reason:string 1–250. Actor se deriva de sesión; no staffId. | 201 {adjustmentId,productId,delta,onHandAfter,recordedAt}. | 400 dato inválido; 401; 403; 404; 409 saldo negativo. No borrar movimientos. | Ajuste/motivo/actor internos y auditados. | Personal con permiso de inventario. |
| S13 | R-PED-03 cambiar estado operativo | P13 preparar/despachar/entregar | Avanzar el pedido por transiciones permitidas | PUT /api/v1/staff/orders/{orderId}/status | Cookie de personal; path orderId:string; JSON status enum permitido, note:string opcional ≤250. Actor desde sesión. | 200 {id,status,updatedAt}. | 400; 401; 403; 404; 409 transición no permitida. Guardar actor, fecha y transición. | Pedido e historial restringidos; nota interna. | Personal autorizado según etapa. |
| S14 | R-OPS-01 listar pedidos para operación | P13 revisar cola de trabajo | Entregar pedidos recientes para operaciones sin datos personales | GET /api/v1/staff/orders | Cookie; sin cuerpo. Máximo 100 pedidos. | 200 items:[{id,status,fulfillment,total,currency,createdAt}]. | 401; 403 sin rol operations; 503; no incluye dirección, cliente ni datos de pago. | Metadatos operativos restringidos. | Rol operations. |

### S14 — cola operativa (respuesta ficticia)

~~~json
{"items":[{"id":"ord_demo_1042","status":"confirmed","fulfillment":"pickup","total":13480,"currency":"CLP","createdAt":"2026-11-09T15:00:00Z"}]}
~~~

## 6. Ejemplos JSON ficticios por contrato

Todos los valores de esta sección son ficticios.

### S01 — catálogo

~~~json
{
  "items": [
    {
      "id": 1,
      "nombre": "Tokyo Shoyu",
      "categoria": "Ramen",
      "descripcion": "Caldo de soya, cerdo chashu, huevo y cebollín.",
      "precio": 8990,
      "disponible": true,
      "imagen": "https://example.test/images/shoyu.jpg"
    }
  ]
}
~~~

### S02 — detalle

~~~json
{
  "id": 1,
  "nombre": "Tokyo Shoyu",
  "categoria": "Ramen",
  "descripcion": "Caldo de soya, cerdo chashu, huevo y cebollín.",
  "precio": 8990,
  "disponible": true,
  "imagen": "https://example.test/images/shoyu.jpg"
}
~~~

### S03 — sesión

~~~json
{ "email": "cliente@example.test", "password": "valor-ficticio-no-reutilizable" }
~~~

~~~json
{ "cliente": { "id": "cli_demo_104", "nombre": "Cliente Demo" } }
~~~

La cookie segura va en Set-Cookie; no se incluye un token de sesión en JSON.

### S04 — contacto

~~~json
{
  "nombre": "Cliente Demo",
  "email": "cliente@example.test",
  "mensaje": "¿Tienen opciones vegetarianas?"
}
~~~

~~~json
{ "id": "msg_demo_701", "estado": "recibido" }
~~~

### S05 — facturas paginadas

~~~json
{
  "items": [
    {
      "id": "fac_demo_208",
      "folio": "DEMO-0208",
      "fecha": "2026-11-07",
      "total": 14480,
      "moneda": "CLP",
      "estado": "emitida"
    }
  ],
  "nextCursor": "cursor-opaco-demo-24h"
}
~~~

### S06 — descarga PDF

La respuesta exitosa es binaria (bytes PDF), no JSON. El ejemplo JSON corresponde al error del mismo contrato:

~~~json
{
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "No se encontró el documento solicitado."
  }
}
~~~

### S07 — crear pedido

~~~json
{
  "items": [
    { "productId": 1, "quantity": 1 },
    { "productId": 6, "quantity": 1 }
  ],
  "fulfillment": "pickup",
  "documentType": "boleta"
}
~~~

~~~json
{
  "id": "ord_demo_1042",
  "status": "pending_payment",
  "currency": "CLP",
  "subtotal": 13480,
  "deliveryFee": 0,
  "total": 13480,
  "paymentExpiresAt": "2026-11-07T18:15:00-03:00"
}
~~~

Ejemplo opcional de compra con despacho/factura:

~~~json
{
  "items": [{ "productId": 1, "quantity": 2 }],
  "fulfillment": "delivery",
  "deliveryAddress": {
    "calle": "Av. Ejemplo",
    "numero": "123",
    "comuna": "Providencia",
    "region": "Metropolitana"
  },
  "documentType": "factura",
  "billingDetails": {
    "rut": "76.123.456-7",
    "razonSocial": "Comercial Demo SpA",
    "giro": "Restaurante",
    "direccion": "Av. Ejemplo 123"
  }
}
~~~

### S08 — iniciar pago

~~~json
{
  "paymentId": "pay_demo_9001",
  "status": "pending",
  "checkoutUrl": "https://payments.example.test/checkout/session-demo",
  "expiresAt": "2026-11-07T18:15:00-03:00"
}
~~~

### S09 — evento del proveedor

~~~json
{
  "eventId": "evt_demo_5008",
  "paymentId": "pay_demo_9001",
  "status": "succeeded",
  "occurredAt": "2026-11-07T18:04:20-03:00"
}
~~~

~~~json
{ "accepted": true }
~~~

La firma del proveedor viaja en una cabecera y se valida en backend.

### S10 — seguimiento

~~~json
{
  "id": "ord_demo_1042",
  "status": "preparing",
  "fulfillment": "pickup",
  "total": 13480,
  "currency": "CLP",
  "timeline": [
    { "status": "confirmed", "at": "2026-11-07T18:02:00-03:00" },
    { "status": "preparing", "at": "2026-11-07T18:08:00-03:00" }
  ]
}
~~~

### S11 — inventario

~~~json
{
  "items": [
    {
      "productId": 1,
      "nombre": "Tokyo Shoyu",
      "onHand": 18,
      "reserved": 3,
      "available": 15
    }
  ]
}
~~~

### S12 — ajuste de inventario

~~~json
{ "delta": -1, "reason": "Merma registrada al cierre" }
~~~

~~~json
{
  "adjustmentId": "adj_demo_3001",
  "productId": 1,
  "delta": -1,
  "onHandAfter": 17,
  "recordedAt": "2026-11-07T22:00:00-03:00"
}
~~~

### S13 — cambiar estado

~~~json
{ "status": "preparing", "note": "Comanda recibida por cocina" }
~~~

~~~json
{
  "id": "ord_demo_1042",
  "status": "preparing",
  "updatedAt": "2026-11-07T18:08:00-03:00"
}
~~~

## 7. Reglas transversales y responsabilidades

- El navegador solicita acciones; el servidor verifica permisos, calcula totales y valida estado/stock.
- S01 reutiliza catálogo entre Inicio y Menú. S03 se reutiliza para iniciar sesión desde pantallas que lo necesiten.
- Direcciones, credenciales, documentos, pedidos y pagos son restringidos; existencias/ajustes son internos. Ningún dato es público solo por aparecer en pantalla.
- S07 recalcula precio vigente, despacho y total. No confía en precio/total/clientId del navegador.
- S07 reserva stock por 15 minutos como decisión propuesta; S08 usa proveedor alojado; S09 confirma solo con evento autenticado/deduplicado.
- Boleta/factura real requiere configuración y proveedor DTE autorizado. Las maquetas/PDF de ejemplo no son documentos tributarios reales.
- S05 usa cursor opaco de 24 horas (default 10, máximo 50); S06 entrega directamente el PDF después de verificar titularidad.
- Las zonas/tarifas de despacho, horarios, cancelaciones/reembolsos, tipo de stock y proveedor siguen pendientes de negocio.

## 8. Control antes de avanzar

| Pregunta de la guía | Resultado | Evidencia |
|---|---|---|
| ¿Cada acción tiene un servicio o una justificación? | Sí, como propuesta. | P01–P13 tienen S01–S13 o justificación estática/local. P10/P13 identifican flujo/vista pendiente. |
| ¿La matriz distingue datos públicos de restringidos? | Sí. | Clasificación en cada fila y reglas transversales: catálogo público; personales/transaccionales restringidos; inventario/auditoría internos; credenciales/firmas secretos. |
| ¿Los contratos explican lo que se transporta sin copiar la base de datos? | Sí. | Entradas/salidas son DTO mínimos; precio/total, identidad y estado pagado se calculan o verifican en backend. S06 exitoso es binario con ejemplo JSON de error. |

**Resultado:** contratos y ejemplos documentan el backend local M10. La descarga PDF y la emisión fiscal siguen fuera de alcance; los demás flujos principales tienen evidencia de ejecución. Tokyo Noodles es el nombre oficial confirmado por el equipo; completar un número solo si la asignación docente efectivamente lo exige.

## 9. Referencia de la guía

Evaluación de la Unidad 2, Módulo 1: propósito, cinco pasos, matriz por operación, ejemplo parcial de S01 y control antes de avanzar. La matriz de este documento sigue esos campos; ejemplos con datos ficticios se proporcionan para S01–S13.



