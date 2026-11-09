# Módulo 3 — Sistemas e integraciones

**Caso:** Tokyo Noodles, restaurante de ramen y gyozas. Nombre confirmado por el usuario.  
**Base de diseño:** contratos S01–S13 del Módulo 1 y clases/relaciones del Módulo 2.  
**Estado:** entregable de diseño completado e implementación local inicial de los cuatro subsistemas mínimos incluida.  
**Límite:** esta entrega no afirma despliegue de producción ni integración del frontend estático con el backend.

## 1. Propósito y alcance

El módulo divide las responsabilidades por capacidades del negocio, deja claro qué sistema es autoridad de cada dato y define cómo colaboran los sistemas. Se implementan cuatro procesos privados: `inventory`, `orders`, `clients` y `payments`. Cada proceso guarda sus propios datos locales y escucha únicamente en `127.0.0.1`; el API Gateway es la entrada de los clientes. M6 reemplaza la credencial técnica compartida inicial por credenciales distintas por consumidor, sistema y alcance.

El backend usa Node.js sin paquetes externos y archivos JSON locales para poder ejecutarse y revisarse en esta etapa. Esa persistencia sirve para la demostración académica local; para la entrega final debe migrarse a almacenamiento de producción con transacciones, control de concurrencia, copias de seguridad y despliegue privado.

## 2. Límites y propiedad de datos

| Sistema | Responsabilidad | Datos bajo su autoridad / estado oficial | Servicios M1 asociados | Dependencias | Identidad requerida | Fallos y respuesta |
|---|---|---|---|---|---|---|
| `inventory` | Catálogo publicable, existencias, reservas temporales, ajustes auditados. Decide si se puede vender y cuánto stock queda. | Producto y precio publicado; saldo físico; reservas activas; ajustes. `available = onHand - reserved`. | S01, S02, S11, S12; participa en S07 al reservar y liberar. | Ninguna para responder catálogo; es consultado por `orders`. | Gateway con token de servicio; ajustes requieren rol `inventory` validado por Gateway. `orders` puede reservar/liberar con identidad de servicio. | Timeout o rechazo: `orders` no crea/acepta pedido; no se confirma sin reserva. Un ajuste que dejaría saldo negativo da `409`. |
| `orders` | Crear pedido, comprobar transición y mantener el historial oficial del pedido. Coordina disponibilidad antes de aceptar. | Pedido, titular, líneas con snapshot de producto/precio, modalidad, documento solicitado, totales, hitos y estado de pedido. | S07, S10, S13; participa en S08/S09 al comprobar o actualizar el pedido según un evento de pago válido. | `inventory` al reservar/liberar; recibe resultado verificado de `payments`; `clients` autentica en el borde. | Gateway autenticado para acciones de cliente; rol separado `operations` para S13; servicio autorizado para evento de pago. | Inventory caído: `503`, no confirmar pedido. Reserva insuficiente: `409`. Idempotency-Key repetida con misma carga devuelve el pedido previo; con distinta carga `409`. |
| `clients` | Autenticar clientes y personal, emitir/verificar sesión y devolver identidad mínima para autorización. | Cuentas, hash de contraseña, rol, estado y sesiones. Decide quién es el titular autenticado. | S03; identifica al titular en S05, S07, S10 y operaciones privadas. | Ninguna para verificar credenciales; Gateway lo consulta antes de rutas privadas. | Inicio de sesión anónimo; introspección interna por token de servicio. | Credenciales incorrectas `401` genérico; exceso de intentos `429`; servicio no disponible `503`, sin acceso a acciones protegidas. |
| `payments` | Iniciar intentos de pago con proveedor alojado, verificar webhook, deduplicar notificaciones. | Intentos, IDs de proveedor, monto asociado, estado de pago y eventos procesados. Es autoridad del estado de pago del intento. | S08, S09; informa resultado a `orders`. | `orders` para leer total/propiedad y registrar resultado; proveedor externo para checkout/webhook. | Cliente titular para iniciar checkout; webhook debe tener firma válida; token de servicio para `orders`. | Proveedor no disponible `502`; evento inválido `400`; duplicado auténtico se confirma sin repetir efecto; `orders` caído deja evento pendiente/no aceptado para reintento. |

### Sistemas complementarios

| Sistema | Tipo y responsabilidad | Datos/decisión | Relación con M1 | Estado en este caso |
|---|---|---|---|---|
| Proveedor de pago alojado | Externo; captura el pago sin que Tokyo Noodles reciba datos de tarjeta. | Autoriza/captura el pago en su plataforma; `payments` registra el estado confirmado del intento tras webhook verificado. | S08/S09. | Adaptador descrito; credenciales y sandbox se configuran en M10. No hay pago real en el backend local. |
| Despacho operativo | Capacidad interna del restaurante, dentro de `orders` y operada por personal. No se separa en otro microservicio mientras no exista un proveedor o flujo independiente que lo justifique. | `orders` conserva modalidad, dirección restringida e hitos oficiales; personal autorizado asigna/prepara y actualiza estados. | S07, S10, S13. | Los estados operativos están en el backend local; no hay courier externo identificado. Una futura integración será un proveedor externo. |
| Emisión DTE / boleta y factura | Servicio externo autorizado tributariamente; el backend de Tokyo Noodles conserva solicitudes y referencias, no pretende sustituir al emisor autorizado. | El proveedor autorizado determina folio y documento tributario emitido; el sistema de documentos deberá conservar la referencia y estado. | S05/S06 y `documentType` en S07. | Frontera y dependencia identificadas; no se simulan documentos como válidos ni se integran credenciales reales. |
| Mensajería | Proveedor externo para correo/SMS y confirmaciones. | Proveedor registra entrega técnica; `orders` conserva el estado del pedido como dato oficial. | S04 y avisos derivados de S07/S09/S13. | Frontera identificada; S04 sigue siendo un flujo por completar en el adaptador. |
| API Gateway | Componente propio de entrada, no microservicio dueño de pedidos o pagos. | No es autoridad de datos; autentica sesión en el borde, aplica rutas y transmite identidad mínima. | Fachada HTTP para S01–S13. | Implementado localmente en `backend/api.js`; no expuesto a Internet. |

## 3. Mapeo de operaciones M1 a sistemas

| ID M1 | Operación | Sistema dueño/ejecutor | Colaboración |
|---|---|---|---|
| S01, S02 | Consultar catálogo y detalle | `inventory` | Gateway publica DTO con campos permitidos; nunca expone saldo físico ni reservas. |
| S03 | Crear sesión | `clients` | Gateway entrega cookie segura y consulta identidad para cada acción privada. |
| S04 | Recibir mensaje | Proveedor de mensajería externo + adaptador propio | No modifica pedido ni cuenta; debe aplicar límites antiabuso y evitar registrar secretos. |
| S05, S06 | Listar documentos propios y descargar PDF | Sistema de documentos/DTE complementario | Autenticación por `clients`; filtrar por titular. PDF binario protegido. Pendiente de implementar con el proveedor. |
| S07 | Crear pedido | `orders` | Consulta `inventory`, reserva stock y calcula el total con precio autoritativo. |
| S08 | Iniciar checkout | `payments` | Comprueba titular/estado/importe con `orders`; retorna URL de proveedor permitido. |
| S09 | Procesar evento de pago | `payments` | Verifica firma, deduplica `eventId` y envía una orden interna autenticada a `orders`. |
| S10 | Consultar seguimiento propio | `orders` | `clients` establece titular; `orders` filtra dueño y entrega DTO. |
| S11, S12 | Consultar inventario y ajustar | `inventory` | Gateway exige rol de personal autorizado; ajustes son movimientos con auditoría, no borrado. |
| S13 | Cambiar estado operativo del pedido | `orders` | Gateway exige personal; transición se valida y registra con actor/hora. |

## 4. Contratos entre componentes

Rutas internas privadas bajo `/internal`; llamadas de Gateway y entre servicios usan `X-Service-Token` con referencias distintas por consumidor y alcance, definidas en M6. El cliente nunca recibe ni conoce esas credenciales. Los servicios privados se enlazan a loopback en desarrollo; en despliegue deben estar en red privada y aceptar solo identidades de servicio. El Gateway verifica una sesión con `clients` y transmite `clientId`/rol derivado, nunca confía en esos campos enviados por el navegador.

| Origen → destino | Operación/evento | Datos mínimos | Autenticación | Timeout / error / consistencia |
|---|---|---|---|---|
| Gateway → clients | Verificar sesión | Cookie de sesión | `GATEWAY_CLIENTS_TOKEN`; firma de sesión interna | 2 s; si no responde, denegar ruta protegida. |
| orders → inventory | Reservar unidades para pedido | `orderId`, `productId`, `quantity`, `expiresAt` | `ORDERS_INVENTORY_TOKEN` | 2 s por llamada; compensar reservas anteriores si una línea falla; no aceptar pedido incompleto. |
| orders → inventory | Liberar/consumir reserva | `reservationId`, acción, pedido | `ORDERS_INVENTORY_TOKEN` | Repetible de forma idempotente; conflicto se audita y reintenta. |
| payments → orders | Leer importe y titular | `orderId`, `clientId` | `PAYMENTS_ORDERS_TOKEN` | 2 s; rechazar pedido ajeno o no pagable. |
| proveedor → Gateway → payments | Aviso de pago | `eventId`, `paymentId`, estado, fecha | HMAC sobre cuerpo original, secreto del proveedor | Firma inválida `400`; evento repetido `200` sin repetir cambio; dependencia orders caída: no aceptar y permitir reintento. |
| payments → orders | Comunicar resultado validado | `eventId`, `paymentId`, estado | `PAYMENTS_ORDERS_TOKEN` | El receptor deduplica por `eventId`; solo `orders` decide el estado oficial del pedido tras pago. |
| orders → mensajería / DTE | Evento posterior de pedido | ID de pedido y referencia mínima | Credencial del proveedor, aislada en adaptador | Fallo externo no revierte un pedido pagado; reintento/cola en etapa de producción. |

## 5. Reglas para consistencia y fallos

1. `orders` solo acepta la creación si `inventory` reservó todas las líneas; si una operación falla, libera las reservas obtenidas antes.
2. La clave `Idempotency-Key` evita pedidos duplicados ante reintento del navegador. El servidor compara también la carga original.
3. `payments` valida firma, ventana temporal y `eventId`; un evento ya aplicado no vuelve a cambiar ni cobrar un pedido.
4. El navegador nunca marca el pago ni el pedido como pagados. El proveedor informa a `payments`; `orders` valida el resultado autenticado y controla su transición.
5. Un timeout de una dependencia no equivale a éxito: se responde con error recuperable y se deja el recurso en estado no confirmado.
6. La coordinación de stock/pedido/pago es una saga sencilla con compensación de reserva. Esta implementación local no garantiza transacciones distribuidas; los reintentos y conciliación robusta se completan en M10.

## 6. Implementación entregada

En `backend/` hay cinco procesos Node.js sin paquetes externos: API Gateway y los cuatro microservicios privados. Datos JSON separados en `backend/data/` permiten conservar el estado entre reinicios locales. El Gateway ofrece estas rutas de demostración:

| Ruta local | Uso |
|---|---|
| `GET /health` | Estado del Gateway y verificación de servicios. |
| `GET /api/v1/products?available=true` | S01, catálogo público permitido. |
| `GET /api/v1/products/{id}` | S02, detalle público. |
| `POST /api/v1/auth/sessions` | S03, iniciar sesión y emitir cookie HttpOnly. |
| `POST /api/v1/orders` | S07, pedido autenticado, reserva, total de servidor e idempotencia. |
| `GET /api/v1/me/orders/{id}` | S10, seguimiento del pedido propio. |
| `POST /api/v1/orders/{id}/payments` | S08, intento y checkout de proveedor simulado/local. |
| `POST /api/v1/integrations/payments/demo/events` | S09, webhook HMAC de entorno de demostración. |
| `GET /api/v1/staff/inventory` / `POST /api/v1/staff/inventory/{id}/adjustments` | S11/S12, personal autorizado. |
| `PUT /api/v1/staff/orders/{id}/status` | S13, transición operativa con auditoría. |

La configuración de prueba y el comando para iniciar se describen en `backend/README.md`. No se incluyen contraseñas ni claves válidas en el repositorio. Para uso de desarrollo se deben definir secretos locales siguiendo `.env.example`.

### Límites explícitos del incremento

- La persistencia local es un archivo JSON por servicio, no una base transaccional de producción.
- El proveedor de pagos queda como adaptador simulado; no procesa fondos reales.
- El emisor DTE/boleta/factura y el proveedor de mensajería se definen como externos, aún sin integración real.
- S04, S05 y S06 permanecen como contratos de M1 pendientes de integración en los complementos indicados.
- El frontend de GitHub Pages sigue usando datos de muestra y no contiene secretos ni apunta al backend local.
- HTTPS, almacenamiento secreto de producción, rate limiting distribuido, observabilidad, backups, reconciliación y pruebas de carga/permisos corresponden al Módulo 10.

## 7. Mapa de componentes y secuencia

- Diagrama: `MAPA-COMPONENTES.mmd`.
- Flujo representativo: `SECUENCIA-PEDIDO-PAGO.mmd`.
- En la secuencia, `orders` consulta/reserva `inventory`, y el evento del proveedor se verifica en `payments`; la respuesta del navegador jamás decide el estado de pago.

## 8. Control de cierre del módulo

| Control | Resultado | Evidencia |
|---|---|---|
| ¿Están presentes inventory, orders, clients y payments como sistemas con funciones reales? | Sí, con alcance local demostrable. | Cuatro procesos independientes y carpetas de datos separadas en `backend/services/`. |
| ¿Cada dato tiene un sistema que decide su estado oficial? | Sí. | Tabla de autoridad en la sección 2. |
| ¿Los servicios de M1 se mapearon a sus dueños? | Sí. | Tabla de mapeo S01–S13 en la sección 3. |
| ¿Las integraciones indican payload mínimo, identidad y fallos? | Sí. | Tabla de contratos y reglas de consistencia. |
| ¿Se añadieron sistemas complementarios y se separaron proveedores externos? | Sí. | Pago, DTE y mensajería identificados por separado, con estado de integración real. |
| ¿Hay mapa y secuencia de un flujo? | Sí. | Archivos `.mmd` incluidos. |

**Resultado:** Módulo 3 queda organizado en documentación, diagramas e implementación local inicial. La implementación no debe describirse como el backend final de la evaluación: M10 completa integración del frontend, almacenamiento de producción, servicios externos, despliegue, seguridad operativa y evidencia de validación.

## 9. Pendientes de negocio que no se inventan

El curso/negocio debe confirmar zona y tarifas de despacho, vigencia exacta de reserva, reglas de cancelación y reembolso, proveedor de pago, proveedor DTE y datos requeridos para factura. En el incremento local se usan supuestos técnicos explícitos para permitir recorrido; no son políticas comerciales confirmadas.
