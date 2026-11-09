# Módulo 4 — Stakeholders, roles y permisos HTTP

**Caso:** Tokyo Noodles, restaurante de ramen y gyozas.  
**Base:** Módulo 1 (servicios S01–S13), Módulo 2 (dominio/servicios UML), Módulo 3 (inventory, orders, clients, payments).  
**Estado:** modelo de acceso documentado; separación local de roles de inventario y operaciones aplicada al backend.  
**Alcance:** este módulo define quién puede solicitar cada servicio, qué recurso usa y bajo qué condición. Un permiso en un método HTTP no concede acceso a cualquier ruta que use ese método.

## 1. Propósito y conceptos

- **Stakeholder / parte interesada:** persona u organización interesada en el sistema. Puede recibir información sin tener acceso operativo.
- **Rol de usuario:** conjunto de permisos que el backend asigna a una identidad autenticada, como cliente, inventory u operations.
- **Identidad técnica:** proceso o proveedor que llama a otro sistema, autenticado mediante credencial de servicio o firma.
- **Autenticación:** comprobar quién llama. **Autorización:** comprobar qué puede hacer esa identidad con ese recurso.
- La autorización se deniega por defecto. Ocultar un botón solo ayuda a la interfaz y nunca reemplaza la verificación del servidor.

## 2. Registro de stakeholders

| Stakeholder (categoría) | Interés | Rol asociado | Uso de información / cómo la recibe | Acceso operativo |
|---|---|---|---|---|
| Visitantes y potenciales comensales | Revisar menú, disponibilidad de venta, precios y contacto. | Visitante anónimo. | Consultan el catálogo público y la página estática; contactan mediante S04 cuando esté integrado. | Solo S01/S02 y S04 según sus condiciones. |
| Clientes | Comprar, pagar, seguir pedidos y obtener documentos tributarios propios. | Cliente autenticado. | Reciben resumen e historial de sus propios pedidos/documentos; no reciben datos internos de stock ni de otros clientes. | S01/S02, S05–S08 y S10 según titularidad; S03 para iniciar sesión. |
| Personal de inventario | Conocer existencias y registrar reposición/merma. | `inventory`. | Consulta saldos internos y movimientos que registra. | S11 GET y S12 POST; no puede operar pedidos mediante S13. |
| Cocina, despacho y personal de operaciones | Preparar pedidos y actualizar hitos operativos. | `operations`. | Consulta pedidos asignados en la interfaz operativa; actualiza estados permitidos y comunica cambios al cliente por el canal de atención. | S13 PUT; puede consultar stock S11 si la política lo requiere. |
| Administración/dueño del restaurante | Supervisar ventas, operación, costos y cumplimiento. | Stakeholder; el cargo por sí solo no concede un rol. | Recibe informes autorizados por roles explícitos y agregados; no debe consultar credenciales o datos personales sin necesidad. | Sin permisos operativos por defecto. Si necesita operar, se le asigna rol y alcance concretos con auditoría. |
| Atención al cliente | Responder consultas y resolver incidencias. | Stakeholder operativo; no dispone de acceso a la consola en esta versión. | Los mensajes S04 se persisten por 90 días; no hay integración de correo ni acceso de soporte a pedidos. | Sin permisos operativos. |
| Contabilidad/administración tributaria | Conciliar ventas y documentos emitidos. | Stakeholder; no es por sí mismo un usuario del sistema. | Recibe exportación o reporte autorizado y documentos tributarios emitidos; no necesita contraseña ni datos de tarjeta. | Sin permisos operativos directos por defecto. S05/S06 son para el titular cliente; acceso interno requiere una regla/servicio separado que aún no se define. |
| Proveedor de pago | Procesar el checkout y comunicar su resultado. | Identidad externa `payment-provider`. | Envía webhooks firmados con IDs mínimos del evento y pago; no consulta pedidos por API pública. | Solo POST S09 en la ruta de integración, con firma vigente y válida. |
| Emisor DTE / proveedor tributario | Emitir boletas/facturas y devolver folio/documento. | Identidad externa `dte-provider`, futura. | Recibe solicitud tributaria mínima y retorna referencia/estado/documento. | Sin acceso directo implementado; futuro adaptador propio autenticará la llamada y limitará los datos. |
| Proveedor de mensajería | Entregar correo/SMS de contacto o avisos. | Identidad externa `messaging-provider`, futura. | Recibe destinatario y mensaje mínimo; devuelve estado técnico de entrega. | Sin permisos operativos directos a pedidos, clientes o inventario. Se invoca desde un adaptador propio. |
| Docente/equipo del curso | Revisar cumplimiento y evidencia del diseño. | Stakeholder académico. | Recibe los documentos, diagramas y evidencia de ejecución preparados por el equipo. | Sin permisos operativos sobre el backend. |

## 3. Roles e identidades definidos

| Identidad/rol | Clase | Cómo se autentica | Ámbito inicial |
|---|---|---|---|
| `anonymous` | Usuario | No inicia sesión. | Solo datos públicos y envío antiabuso de contacto. |
| `customer` | Usuario | Cuenta verificada por `clients`; cookie de sesión HttpOnly. | Sus propios pedidos y documentos; identidad se deriva de sesión, nunca de un `clientId` del navegador. |
| `inventory` | Usuario de personal | Sesión emitida por `clients`. | Lectura de inventario y registro de ajustes auditados. |
| `operations` | Usuario de personal | Sesión emitida por `clients`. | Cambios de estado del pedido según transición/etapa. |
| `support` | Rol previsto, no habilitado | Requeriría sesión y permiso explícito. | Sin permisos efectivos hasta definir caso, interfaz y alcance. |
| `api-gateway` | Identidad técnica propia | Credencial servicio-a-servicio en M3; en producción, identidad segregada y gestionada. | Única entrada desde navegador; valida sesión y transmite identidad/rol verificados. |
| `orders-service` | Identidad técnica propia | Credencial de servicio. | Consulta catálogo y reserva/libera/consume stock en `inventory` para un pedido. |
| `payments-service` | Identidad técnica propia | Credencial de servicio. | Lee importe/propiedad del pedido y comunica a `orders` un evento validado/deduplicado. |
| `payment-provider` | Identidad externa | Firma HMAC y secreto del proveedor por entorno. | Emite solo el evento S09; no decide el estado del pedido en el navegador. |
| `dte-provider`, `messaging-provider` | Identidades externas futuras | Credencial específica almacenada en el backend/adaptador. | Sin llamada entrante directa al API público; sin permisos implementados todavía. |

**Nota de implementación (actualizada en M6):** el backend académico local autentica sesiones y roles y ahora usa credenciales técnicas separadas por consumidor y alcance, validadas en el proceso receptor. Se mantienen pendientes el gestor de secretos productivo y la rotación automatizada. El HMAC del proveedor de pago se verifica por separado de los tokens técnicos para S09.

## 4. Regla de métodos HTTP

`Permitido` solo aplica al endpoint y condiciones indicados en la fila. `Denegado` significa que el rol no puede ejecutar ese método en ese recurso (incluye métodos de escritura no autorizados, como DELETE de producto/pedido/documento). `No aplicable (N/A)` significa que M1 no define esa combinación de ruta/método como operación; el servidor no debe inventarla. Ante método no soportado, responder 405/404 sin mutar datos.

| Servicio | Ruta concreta | GET | POST | PUT | DELETE | Condición/alcance | Verificador autorizado |
|---|---|---:|---:|---:|---:|---|---|
| S01 catálogo | `/api/v1/products` | Permitido | Denegado | Denegado | Denegado | GET solo campos públicos; filtros validados. | Gateway enruta; `inventory` filtra y proyecta DTO público. |
| S02 detalle | `/api/v1/products/{productId}` | Permitido | Denegado | Denegado | Denegado | Producto activo/publicable; no devolver costo ni saldo exacto. | Gateway y `inventory`. |
| S03 sesión/registro | `/api/v1/auth/sessions`, `/api/v1/auth/registrations` | N/A | Permitido | N/A | N/A | Anónimo; credenciales inválidas genéricas; registro valida correo y contraseña. | Gateway; `clients` autentica/crea cliente. |
| S04 contacto | `/api/v1/contact-messages` | N/A | Permitido | N/A | N/A | Anónimo; validación, tamaño, límite 4/min y retención de 90 días. No equivale a que el mensaje haya sido respondido. | Gateway y `clients`; sin proveedor de email. |
| S05 documentos propios | `/api/v1/me/invoices` | Permitido | N/A | N/A | Denegado | Cliente autenticado; titular se deriva de sesión; solo campos de lista; sin cursor todavía. | Gateway autentica; `orders` filtra por dueño. |
| S06 PDF propio | `/api/v1/me/invoices/{invoiceId}/document` | Permitido | N/A | N/A | Denegado | Cliente autenticado propietario; transmitir bytes PDF; no borrar ni alterar una factura emitida. | Gateway autentica; servicio de documentos verifica titular (pendiente). |
| S07 crear pedido | `/api/v1/orders` | N/A | Permitido | N/A | N/A | Cliente autenticado; crea pedido solo al reservar stock; total y titular calculados por backend; `Idempotency-Key`. | Gateway deriva cliente; `orders` valida; `inventory` confirma reserva. |
| S08 iniciar pago | `/api/v1/orders/{orderId}/payments` | N/A | Permitido | N/A | N/A | Cliente autenticado dueño del pedido y pedido pagable; el cliente no envía monto ni tarjeta. | Gateway autentica/titular; `payments` consulta `orders`. |
| S09 evento proveedor | `/api/v1/integrations/payments/{provider}/events` | N/A | Permitido | N/A | N/A | Solo identidad `payment-provider`; firma y antigüedad válidas; `eventId` deduplicado; nunca invocable como confirmación desde UI. | Gateway aplica ruta; `payments` verifica HMAC y deduplica; `orders` valida transición oficial. |
| S10 seguimiento | `/api/v1/me/orders/{orderId}` | Permitido | N/A | N/A | Denegado | Cliente autenticado propietario; solo su resumen, total, estado e hitos. | Gateway autentica; `orders` verifica titular y proyecta DTO. |
| M8-A01 agregado de seguimiento (extiende S10) | `POST /api/v1/graphql` → solo Query `myOrderSummary` | N/A | Permitido | N/A | N/A | Solo rol `customer`; cada pedido debe pertenecer a la sesión. La operación GraphQL es de lectura aunque transporte la query por POST; no hay Mutation. Solo estado, hitos, importes y descripciones públicas de sus líneas. | Gateway autentica y limita ruta/rol; GraphQL valida operación/campos; `orders` vuelve a comprobar titular e `inventory` entrega DTO público. |
| S11 inventario | `/api/v1/staff/inventory` | Permitido | N/A | N/A | Denegado | Roles `inventory` y `operations` (lectura operativa); información interna, nunca pública. | Gateway valida rol; `inventory` solo devuelve vista de inventario. |
| S12 ajuste stock | `/api/v1/staff/inventory/{productId}/adjustments` | N/A | Permitido | N/A | Denegado | Solo `inventory`; `delta` distinto de cero, motivo requerido; no dejar stock bajo reservas; guardar actor e historial. | Gateway valida rol; `inventory` valida saldo y registra ajuste. |
| S13 estado de pedido | `/api/v1/staff/orders/{orderId}/status` | N/A | N/A | Permitido | Denegado | Solo `operations`; transición permitida según estado; conservar estado previo, actor, hora y nota. No se elimina el pedido. | Gateway valida rol; `orders` valida titularidad interna, transición y auditoría. |
| S14 cola de operaciones | `/api/v1/staff/orders` | Permitido | N/A | N/A | Denegado | Solo `operations`; máximo 100 pedidos; DTO sin datos del cliente ni dirección. | Gateway valida rol; `orders` proyecta campos operativos mínimos. |

`DELETE` se deniega explícitamente para catálogo, pedidos, facturas e historial operativo. Desactivar un producto, cancelar/anular un pedido o emitir una nota de crédito son operaciones distintas de borrar: requieren reglas, estados y endpoints propios. No se crea DELETE para “completar CRUD”. La anulación de pedido se conserva como transición con responsable y fecha; en el modelo actual no se elimina el registro.

### Denegación por defecto por rol

| Rol | Permisos M1 concedidos | Denegado explícitamente |
|---|---|---|
| `anonymous` | GET S01/S02; POST S03/S04. | Facturas, pedidos privados, inventario interno, ajustes, cambios de estado, pago proveedor y cualquier DELETE. |
| `customer` | GET S01/S02/S05/S06/S10; POST S03/S04/S07/S08 y M8-A01 (solo Query `myOrderSummary` para pedido propio). | S09, S11–S13 y datos de pedidos/documentos de otras personas; cualquier DELETE. |
| `inventory` | GET S01/S02/S11; POST S12. | Crear pedido/pago, leer pedido de cliente sin una pantalla/caso autorizado, S13 y todo DELETE. |
| `operations` | GET S01/S02/S11/S14; PUT S13. | Ajustar inventario S12 (requiere rol `inventory`), crear pagos/pedidos como cliente, leer documentos de clientes y todo DELETE. |
| `payment-provider` | POST S09 por firma. | Cualquier GET de catálogo privado/documentos/inventario, creación de pedido, cambios de S13 y DELETE. |
| `dte-provider` / `messaging-provider` | Ningún permiso de API en la versión actual. | Todas las rutas hasta implementar adaptadores con credenciales y alcance mínimos. |
| `owner`, `support`, `accounting`, docente | Ningún permiso automático por cargo/interés. | Sin permisos operativos; deben recibir informes/documentos a través de procesos autorizados o tener rol nuevo aprobado y auditado. |

## 5. Matriz de permisos por identidad técnica

Las llamadas privadas son distintas de las solicitudes de roles humanos. El token de servicio prueba el componente; no reemplaza la comprobación de que el actor humano tiene permiso sobre el pedido o ajuste.

| Identidad técnica | ID/operación | Método y ruta interna | Decisión | Ámbito/condición | Lugar de verificación |
|---|---|---|---|---|---|
| `api-gateway` | S01/S02 | GET `/internal/catalog[/{id}]` en inventory | Permitido | Catálogo público y campos permitidos. | `inventory` valida identidad de servicio; Gateway no altera precios. |
| `api-gateway` | S03 | POST `/internal/sessions`; POST `/internal/sessions/verify` | Permitido | Crear o verificar sesión; nunca devolver password/hash. | `clients`. |
| `api-gateway` | S07 | POST `/internal/orders` | Permitido | Solo después de sesión `customer`; pasa ID derivado de clients y clave idempotente. | Gateway y `orders`; `inventory` hace reserva. |
| `api-gateway` | S08/S10 | POST pagos y GET pedido interno | Permitido | Identidad de cliente se deriva de sesión y se manda como contexto; servicio compara titular. | Gateway, `payments`, `orders`. |
| `api-gateway` | S09 | POST `/internal/provider-events/demo` | Permitido como transporte | Reenvía el cuerpo original y cabecera de firma; no declara evento válido por sí solo. | `payments` valida HMAC, fecha y duplicado. |
| `api-gateway` | S11/S12 | GET inventario; POST ajuste | Permitido por ruta | El primero requiere `inventory` u `operations`; el POST exige `inventory`. Actor humano se deriva de sesión. | Gateway y `inventory`. |
| `api-gateway` | S13 | PUT cambio de estado | Permitido por ruta | Requiere `operations`; no basta con estar autenticado. | Gateway y `orders`. |
| `orders-service` | S01/S02 | GET `/internal/catalog[/{id}]` | Permitido | Solo para validar producto activo, precio vigente y cálculo de pedido. | `inventory`. |
| `orders-service` | S07 | POST `/internal/reservations`; POST `.../{orderId}/release|consume` | Permitido | Solo IDs/cantidades de líneas del pedido que está creando o cuyo resultado autorizado procesa. | `inventory` valida disponibilidad y reserva; `orders` valida evento/estado. |
| `payments-service` | S08/S09 | GET `/internal/orders/{id}` | Permitido | Verificar titular, estado pagable, importe y moneda; no modificar datos del pedido. | `orders`. |
| `payments-service` | S09 | POST `.../register-payment`; POST `.../payment-result` | Permitido condicionado | Iniciar con dueño verificado; resultado solo después de firma válida y deduplicación. | `orders` comprueba importe, pago asociado, transición y titular. |
| `payment-provider` | S09 | POST integración de eventos | Permitido por evento | HMAC del proveedor, ventana temporal y pago reconocido. No tiene token de staff. | `payments`; Gateway reenvía sin reinterpretar. |
| `dte-provider` / `messaging-provider` | S04–S06, avisos | Ninguna ruta actual | No aplicable / no concedido | Integraciones pendientes; implementar adaptadores antes de conceder acceso. | Servicio propietario y gestor de secretos al integrarse. |

## 6. Autorización, propiedad y estados

1. **Público no significa modificable:** los GET de S01/S02 publican DTO limitados. POST/PUT/DELETE sobre productos no se permiten mediante esos permisos.
2. **La identidad del cliente no viaja como autoridad desde el navegador:** el backend la obtiene de la sesión. Un `clientId` enviado en JSON o query se ignora/rechaza.
3. **Propiedad:** S05/S06/S10 responden solo para recursos del titular. Para un recurso ajeno se recomienda 404 indistinguible del inexistente, sin confirmar que pertenece a otra persona.
4. **Pedido:** `orders` permite S08 solo en pedido propio y pendiente de pago. Un pago aprobado puede llevarlo a confirmado; el retorno del browser no tiene permiso para esa transición. S13 requiere transiciones compatibles con el estado vigente.
5. **Stock:** solo `inventory` decide saldo y reservas. El cliente no cambia stock; `orders` llama a inventory con identidad técnica para reservar y procesar compensaciones.
6. **Pago:** solo `payments` acepta eventos del proveedor autenticados. `orders` es dueño del estado del pedido y lo cambia tras recibir el resultado validado por la integración.
7. **Auditoría:** para ajustes y estados se conserva actor, recurso, transición, fecha y motivo. No se ofrece eliminación del historial.
8. **Proveedor:** proveedor externo no recibe una sesión de cliente o token de staff. Su firma se limita a un evento de pago y el backend la valida por ambiente.

## 7. Estado de implementación y cambios de código

La carpeta `MODULO 3/backend/` valida sesión y rol para las rutas operativas en el Gateway local. En S10 el Gateway deriva el ID de la sesión y `orders` exige ese contexto y lo compara con el titular guardado; una identidad ausente da 401 y un pedido ajeno da 404 indistinguible del inexistente. S12 solo acepta inventory; S13 y S14 solo operations. `.env.example` requiere credenciales independientes de demostración y `dev.js` comprueba ambas configuraciones. El usuario no puede adquirir el rol modificando el HTML.

S04 y S05 ya tienen rutas implementadas: contacto persiste mensajes ficticios con retención de 90 días y S05 muestra documentos internos de pedidos pagados propios. No hay emisión fiscal DTE/SII ni descarga PDF S06. El frontend no sustituye las comprobaciones del Gateway y los servicios.

## 8. Control antes de avanzar

| Pregunta | Resultado | Evidencia |
|---|---|---|
| ¿Se distinguen stakeholders, roles de usuario e identidades técnicas? | Sí. | Registro de stakeholders (sección 2), roles (sección 3) e identidades (sección 5). |
| ¿Cada rol operativo se vincula a servicios de M1? | Sí. | S01–S13 en la matriz HTTP y denegación por defecto. |
| ¿Para cada servicio se indica GET/POST/PUT/DELETE? | Sí. | Matriz por ruta con los cuatro verbos y decisión explícita. |
| ¿Se explican propiedad, ámbito, estado, autenticación y quién verifica? | Sí. | Columnas de condiciones/verificador más reglas de la sección 6. |
| ¿Los stakeholders sin acceso directo indican “sin permisos operativos” y reciben explicación? | Sí. | Dueño/administración, soporte aún no habilitado, contabilidad, docente y proveedores no integrados indican alcance y canal de información. |
| ¿Se diferencia anular de borrar y se conserva historial? | Sí. | DELETE denegado para recursos transaccionales; cancelación se modela como transición auditada. |
| ¿El código aplica la separación humana principal? | Sí, en entorno local. | S12 exige inventory; S13 exige operations; S07/S08/S10 exigen sesión cliente; S09 exige firma. |

**Resultado:** el diseño documental del Módulo 4 queda completo y alineado con M1–M3. La API local aplica el núcleo de autorización humana, aunque no sustituye pruebas funcionales ni las credenciales de servicio con privilegio mínimo que se establecerán antes de producción.
