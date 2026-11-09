# Módulo 2 — Clases y cardinalidades del dominio

**Caso:** Tokyo Noodles (nombre confirmado por el usuario).  
**Número oficial:** completar si la asignación del curso le asigna uno.  
**Base:** matriz M1 S01–S13 y frontend de ramen/gyozas.  
**Estado:** entregable de diseño UML del Módulo 2, alineado con S01–S13 y el backend privado inicial del Módulo 3. El diagrama expresa el modelo y los contratos; no significa que todas las integraciones de M1 estén implementadas.

## 1. Propósito y entregables

El módulo representa las entidades del dominio y los servicios que operan sobre ellas, con relaciones coherentes con el caso. La guía pide:

1. Clases del dominio con identificadores, atributos y tipos.
2. Servicios públicos como clases/interfases con estereotipo «service» y operaciones vinculadas a IDs M1.
3. Asociaciones, composiciones/agregaciones y multiplicidades en ambos extremos.
4. Dependencias UML de servicios a clases que usan; esas dependencias no son relaciones entre registros.
5. Justificación de cada cardinalidad y separación entre modelo interno y DTO de salida.

**Entregables de este archivo:** dos diagramas de clase editables, leyenda UML, tabla de relaciones y justificaciones, tabla de trazabilidad de operaciones S01–S13, decisiones de negocio, DTOs y control previo.

## 2. Decisiones del dominio

| Pregunta | Decisión |
|---|---|
| ¿Carrito y pedido son clases distintas? | Conceptualmente, sí. El carrito es selección preliminar; el pedido es la compra creada al confirmar. En esta versión el carrito no se persiste: vive temporalmente en el navegador y S07 crea el Pedido. Si se necesita guardar carritos entre sesiones, agregar Carrito e ItemCarrito, separados de Pedido. |
| ¿Qué ocurre si un producto deja de estar disponible? | Se marca Producto.activo=false y se oculta del catálogo; no se elimina físicamente si tiene historial. DetallePedido conserva productoId, nombre y precio unitario como snapshot. |
| ¿Qué datos se mantienen internos y cuáles salen? | Las entidades guardan el estado del negocio; los servicios devuelven DTO mínimos por operación. passwordHash, secretos, auditoría y stock detallado no se exponen al visitante. |
| ¿Cómo se mantiene el total histórico? | Producto.precioActualCLP es vigente; DetallePedido.precioUnitarioSnapshotCLP y los totales de Pedido conservan el precio aplicado a esa compra. |
| ¿Cómo se calcula la disponibilidad? | Disponible = unidades físicas menos reservas activas. El saldo y las reservas detalladas son internos; el catálogo público muestra solo disponibilidad de venta. |
| ¿Se elimina un producto de ventas anteriores? | No. Se desactiva para nuevas ventas y se conserva referenciado por las líneas y documentos históricos. |

## 3. Diagrama UML de clases del dominio

El diagrama editable separado se entrega en UML-Dominio-Tokyo-Noodles.mmd.

~~~mermaid
classDiagram
direction LR

class Cliente {
  +UUID clienteId
  +string nombre
  +string email
  +EstadoCliente estado
}
class CredencialCliente {
  +UUID credencialId
  +string passwordHash
  +Instant actualizadaEn
  +boolean bloqueada
}
class Personal {
  +UUID personalId
  +string email
  +RolPersonal rol
  +boolean activo
}
class Producto {
  +UUID productoId
  +string nombre
  +Categoria categoria
  +string descripcion
  +int precioActualCLP
  +URI imagenUrl
  +boolean activo
}
class StockProducto {
  +UUID productoId
  +int unidadesFisicas
  +Instant actualizadoEn
}
class ReservaStock {
  +UUID reservaId
  +int cantidad
  +EstadoReserva estado
  +Instant venceEn
}
class AjusteInventario {
  +UUID ajusteId
  +int delta
  +string motivo
  +Instant registradoEn
}
class Pedido {
  +UUID pedidoId
  +EstadoPedido estado
  +ModalidadEntrega modalidad
  +string moneda
  +int subtotalCLP
  +int despachoCLP
  +int totalCLP
  +Instant creadoEn
  +Instant pagoVenceEn
}
class DetallePedido {
  +UUID detalleId
  +UUID productoId
  +string nombreProductoSnapshot
  +int precioUnitarioSnapshotCLP
  +int cantidad
  +int totalLineaCLP
}
class DatosDespacho {
  +string calle
  +string numero
  +string comuna
  +string region
  +int tarifaCLP
  +Instant eta
}
class CambioEstadoPedido {
  +UUID cambioId
  +EstadoPedido estadoAnterior
  +EstadoPedido estadoNuevo
  +Instant ocurridoEn
  +string nota
}
class IntentoPago {
  +UUID intentoPagoId
  +string proveedor
  +string referenciaProveedor
  +int montoCLP
  +EstadoPago estado
  +Instant creadoEn
}
class EventoPago {
  +UUID eventoId
  +string idEventoProveedor
  +EstadoPago estadoInformado
  +Instant ocurridoEn
  +boolean firmaVerificada
  +Instant procesadoEn
}
class DocumentoTributario {
  +UUID documentoId
  +TipoDocumento tipo
  +string folio
  +Instant emitidoEn
  +EstadoDocumento estado
  +int totalCLP
  +string rutReceptor
  +string razonSocial
  +string giro
  +string direccionTributaria
  +string referenciaDocumento
}
class LineaDocumento {
  +UUID lineaId
  +string nombreSnapshot
  +int cantidad
  +int precioUnitarioCLP
  +int totalLineaCLP
}
class MensajeContacto {
  +UUID mensajeId
  +string nombre
  +string email
  +string texto
  +Instant recibidoEn
  +EstadoContacto estado
}

Cliente "1" *-- "1" CredencialCliente : posee
Cliente "1" --> "0..*" Pedido : realiza
Pedido "1" *-- "1..*" DetallePedido : contiene
Producto "1" --> "0..*" DetallePedido : producto historico
Producto "1" *-- "1" StockProducto : controla
StockProducto "1" *-- "0..*" ReservaStock : mantiene
DetallePedido "1" --> "0..1" ReservaStock : reserva temporal
StockProducto "1" *-- "0..*" AjusteInventario : registra
Personal "1" --> "0..*" AjusteInventario : registra
Pedido "1" *-- "0..1" DatosDespacho : destino si delivery
Pedido "1" *-- "1..*" CambioEstadoPedido : historial
Personal "0..1" --> "0..*" CambioEstadoPedido : actor si humano
Pedido "1" --> "0..*" IntentoPago : permite reintentos
IntentoPago "1" *-- "0..*" EventoPago : procesa eventos
Pedido "1" --> "0..1" DocumentoTributario : emite
Cliente "1" --> "0..*" DocumentoTributario : titular
DocumentoTributario "1" *-- "1..*" LineaDocumento : conserva detalle
Cliente "0..1" --> "0..*" MensajeContacto : puede enviar
~~~

## 4. Relaciones y justificación de cardinalidades

Origen → destino indica cuántos destinos puede tener cada origen; destino → origen indica cuántos orígenes puede tener cada destino.

| Clase origen | Clase destino | Origen → destino | Destino → origen | Notación | Justificación |
|---|---|---:|---:|---|---|
| Cliente | CredencialCliente | 1 | 1 | Composición | Cada cuenta autenticada tiene una credencial asociada; el hash solo es interno. |
| Cliente | Pedido | 0..* | 1 | Asociación | El cliente puede no haber comprado o tener varios pedidos; cada pedido autenticado pertenece a un cliente. |
| Pedido | DetallePedido | 1..* | 1 | Composición | Un pedido creado debe tener al menos una línea y cada línea pertenece a un solo pedido. Corresponde al ejemplo parcial de la guía. |
| Producto | DetallePedido | 0..* | 1 | Asociación | Un producto puede aparecer en ninguna o muchas ventas; cada línea guarda el producto y un snapshot histórico. |
| Producto | StockProducto | 1 | 1 | Composición | Cada producto vendible tiene un saldo de control; si existen productos sin inventario, revisar a 0..1. |
| StockProducto | ReservaStock | 0..* | 1 | Composición | Un producto puede tener ninguna o muchas reservas; cada reserva corresponde a un saldo/producto. |
| DetallePedido | ReservaStock | 0..1 | 1 | Asociación | Una línea sin reservar aún o ya vencida puede no tener reserva; una reserva cubre una línea/producto. |
| StockProducto | AjusteInventario | 0..* | 1 | Composición | Un saldo puede no tener ajustes; cada ajuste se conserva ligado al saldo para auditoría. |
| Personal | AjusteInventario | 0..* | 1 | Asociación | Una persona puede registrar varios ajustes; cada ajuste manual tiene un actor autorizado. |
| Pedido | DatosDespacho | 0..1 | 1 | Composición | Retiro no lleva dirección; delivery lleva un destino de entrega. Solo se crea para esa modalidad. |
| Pedido | CambioEstadoPedido | 1..* | 1 | Composición | Cada pedido registra su estado inicial y transiciones; el historial no existe separado del pedido. |
| Personal | CambioEstadoPedido | 0..* | 0..1 | Asociación | Personal puede efectuar muchos cambios; los automáticos pueden no tener actor humano. |
| Pedido | IntentoPago | 0..* | 1 | Asociación | Puede existir pedido pendiente antes de pago y varios intentos; un intento pertenece a un pedido. Máximo un pago exitoso. |
| IntentoPago | EventoPago | 0..* | 1 | Composición | Un intento puede recibir cero o varios eventos; cada evento pertenece a un intento y se deduplica por ID externo. |
| Pedido | DocumentoTributario | 0..1 | 1 | Asociación | La emisión puede estar pendiente; propuesta de máximo un documento por venta para evitar boleta/factura duplicada. |
| Cliente | DocumentoTributario | 0..* | 1 | Asociación | Un cliente puede tener varios documentos y cada documento tiene un titular. |
| DocumentoTributario | LineaDocumento | 1..* | 1 | Composición | Cada documento emitido conserva una o más líneas snapshot y cada línea pertenece a ese documento. |
| Cliente | MensajeContacto | 0..* | 0..1 | Asociación | El formulario puede ser anónimo; un mensaje tiene cero o un cliente vinculado. |

Las reglas tributarias, cancelaciones y despacho son propuestas y requieren confirmación del negocio/docente.

## 5. Servicios UML y correspondencia con M1

El diagrama editable separado se entrega en UML-Servicios-Tokyo-Noodles.mmd.

~~~mermaid
classDiagram
direction LR

class CatalogService {
  <<service>>
  +consultarCatalogo_S01(filtro) ProductoDTO[]
  +consultarDetalle_S02(productId) ProductoDetalleDTO
}
class ClientAuthService {
  <<service>>
  +crearSesion_S03(LoginRequestDTO) SessionDTO
}
class ContactService {
  <<service>>
  +recibirMensaje_S04(MensajeContactoRequestDTO) MensajeContactoReceiptDTO
}
class InvoiceService {
  <<service>>
  +listarPropias_S05(limit,cursor) PaginaDocumentosDTO
  +descargarPDF_S06(invoiceId) DocumentoPDF
}
class OrderService {
  <<service>>
  +crearPedido_S07(CrearPedidoRequestDTO) PedidoResumenDTO
  +consultarPedidoPropio_S10(orderId) SeguimientoPedidoDTO
}
class PaymentService {
  <<service>>
  +iniciarPago_S08(orderId) CheckoutPagoDTO
  +procesarEvento_S09(EventoPagoDTO,firma) ResultadoPagoDTO
}
class InventoryService {
  <<service>>
  +consultarStock_S11(filtro) InventarioItemDTO[]
  +registrarAjuste_S12(productId,request) AjusteInventarioDTO
}
class OrderOperationsService {
  <<service>>
  +cambiarEstado_S13(orderId,request) PedidoEstadoDTO
}

class ProductoDTO {
  +UUID id
  +string nombre
  +string categoria
  +int precioCLP
  +boolean disponible
}
class ProductoDetalleDTO {
  +UUID id
  +string nombre
  +string descripcion
  +int precioCLP
}
class LoginRequestDTO {
  +string email
  +string password
}
class SessionDTO {
  +UUID id
  +string nombre
}
class MensajeContactoRequestDTO {
  +string nombre
  +string email
  +string mensaje
}
class MensajeContactoReceiptDTO {
  +UUID id
  +string estado
}
class PaginaDocumentosDTO {
  +DocumentoResumenDTO[] items
  +string nextCursor
}
class DocumentoPDF {
  +bytes contenido
  +string contentType
}
class CrearPedidoRequestDTO {
  +LineaPedidoRequest[] items
  +ModalidadEntrega modalidad
  +TipoDocumento documento
}
class LineaPedidoRequest {
  +UUID productId
  +int quantity
}
class DatosDespachoRequestDTO {
  +string calle
  +string numero
  +string comuna
  +string region
}
class DatosFacturacionRequestDTO {
  +string rutReceptor
  +string razonSocial
  +string giro
  +string direccionTributaria
}
class PedidoResumenDTO {
  +UUID id
  +EstadoPedido estado
  +string currency
  +int subtotalCLP
  +int deliveryFeeCLP
  +int totalCLP
}
class SeguimientoPedidoDTO {
  +UUID id
  +EstadoPedido estado
  +CambioEstadoDTO[] timeline
}
class CheckoutPagoDTO {
  +UUID paymentId
  +EstadoPago estado
  +URI checkoutUrl
}
class ResultadoPagoDTO {
  +boolean accepted
  +EstadoPago status
}
class EventoPagoDTO {
  +string eventId
  +string paymentId
  +EstadoPago estado
}
class InventarioItemDTO {
  +UUID productId
  +int onHand
  +int reserved
  +int available
}
class AjusteInventarioRequestDTO {
  +int delta
  +string reason
}
class AjusteInventarioDTO {
  +UUID adjustmentId
  +int onHandAfter
  +Instant recordedAt
}
class CambioEstadoRequestDTO {
  +EstadoPedido status
  +string note
}
class PedidoEstadoDTO {
  +UUID id
  +EstadoPedido status
  +Instant updatedAt
}

class Cliente
class CredencialCliente
class Personal
class Producto
class StockProducto
class ReservaStock
class AjusteInventario
class MensajeContacto
class DocumentoTributario
class LineaDocumento
class Pedido
class DetallePedido
class DatosDespacho
class CambioEstadoPedido
class IntentoPago
class EventoPago

CatalogService ..> ProductoDTO : devuelve
CatalogService ..> ProductoDetalleDTO : devuelve
ClientAuthService ..> LoginRequestDTO : recibe
ClientAuthService ..> SessionDTO : devuelve
ContactService ..> MensajeContactoRequestDTO : recibe
ContactService ..> MensajeContactoReceiptDTO : devuelve
InvoiceService ..> PaginaDocumentosDTO : devuelve
InvoiceService ..> DocumentoPDF : transmite
OrderService ..> CrearPedidoRequestDTO : recibe
OrderService ..> PedidoResumenDTO : devuelve
OrderService ..> SeguimientoPedidoDTO : devuelve
PaymentService ..> CheckoutPagoDTO : devuelve
PaymentService ..> EventoPagoDTO : recibe
PaymentService ..> ResultadoPagoDTO : devuelve
InventoryService ..> InventarioItemDTO : devuelve
InventoryService ..> AjusteInventarioRequestDTO : recibe
InventoryService ..> AjusteInventarioDTO : devuelve
OrderOperationsService ..> CambioEstadoRequestDTO : recibe
OrderOperationsService ..> PedidoEstadoDTO : devuelve

CrearPedidoRequestDTO "1" *-- "1..*" LineaPedidoRequest : requiere lineas
CrearPedidoRequestDTO "1" *-- "0..1" DatosDespachoRequestDTO : solo si delivery
CrearPedidoRequestDTO "1" *-- "0..1" DatosFacturacionRequestDTO : solo si factura

CatalogService ..> Producto : consulta
CatalogService ..> StockProducto : consulta disponibilidad
ClientAuthService ..> Cliente : autentica
ClientAuthService ..> CredencialCliente : verifica
ContactService ..> MensajeContacto : registra
InvoiceService ..> Cliente : limita titular
InvoiceService ..> DocumentoTributario : consulta
InvoiceService ..> LineaDocumento : obtiene detalle
OrderService ..> Cliente : identifica titular
OrderService ..> Pedido : crea/consulta
OrderService ..> DetallePedido : crea lineas
OrderService ..> Producto : valida precio/estado
OrderService ..> ReservaStock : reserva
OrderService ..> DatosDespacho : registra destino
PaymentService ..> Pedido : verifica estado/total
PaymentService ..> IntentoPago : inicia
PaymentService ..> EventoPago : deduplica/procesa
InventoryService ..> Producto : consulta
InventoryService ..> StockProducto : consulta/actualiza
InventoryService ..> ReservaStock : calcula reservado
InventoryService ..> AjusteInventario : registra
InventoryService ..> Personal : verifica actor
OrderOperationsService ..> Pedido : actualiza
OrderOperationsService ..> CambioEstadoPedido : registra historial
OrderOperationsService ..> Personal : verifica actor
~~~

### Matriz servicio → operación UML

| ID M1 | Servicio UML | Operación UML | DTO principal |
|---|---|---|---|
| S01 | CatalogService | consultarCatalogo_S01(filtro) | ProductoDTO[] |
| S02 | CatalogService | consultarDetalle_S02(productId) | ProductoDetalleDTO |
| S03 | ClientAuthService | crearSesion_S03(request) | LoginRequestDTO → SessionDTO |
| S04 | ContactService | recibirMensaje_S04(request) | MensajeContactoRequestDTO → MensajeContactoReceiptDTO |
| S05 | InvoiceService | listarPropias_S05(limit,cursor) | PaginaDocumentosDTO |
| S06 | InvoiceService | descargarPDF_S06(invoiceId) | DocumentoPDF binario |
| S07 | OrderService | crearPedido_S07(request) | CrearPedidoRequestDTO → PedidoResumenDTO |
| S08 | PaymentService | iniciarPago_S08(orderId) | CheckoutPagoDTO |
| S09 | PaymentService | procesarEvento_S09(event,firma) | EventoPagoDTO → ResultadoPagoDTO |
| S10 | OrderService | consultarPedidoPropio_S10(orderId) | SeguimientoPedidoDTO |
| S11 | InventoryService | consultarStock_S11(filtro) | InventarioItemDTO[] |
| S12 | InventoryService | registrarAjuste_S12(productId,request) | AjusteInventarioRequestDTO → AjusteInventarioDTO |
| S13 | OrderOperationsService | cambiarEstado_S13(orderId,request) | CambioEstadoRequestDTO → PedidoEstadoDTO |

## 6. Entrada S07 corregida y clasificación de datos

La solicitud S07 tiene forma conceptual:

~~~text
CrearPedidoRequestDTO
- items: LineaPedidoRequest[]                  requerido, 1 o más
- modalidad: ModalidadEntrega                  requerido
- documento: TipoDocumento                     requerido
- datosDespacho: DatosDespachoRequestDTO?      obligatorio si modalidad = delivery
- datosFacturacion: DatosFacturacionRequestDTO? obligatorio si documento = factura

DatosDespachoRequestDTO: calle, numero, comuna, region
DatosFacturacionRequestDTO: rutReceptor, razonSocial, giro, direccionTributaria
~~~

Dirección y datos tributarios son restringidos. No se envían desde el navegador precio unitario, total calculado, clienteId ni estado pagado. El backend calcula importes, deriva identidad de la sesión y valida la autorización. PedidoResumenDTO devuelve el resumen calculado; no necesita repetir dirección o datos tributarios.

| DTO/respuesta | Campos que sí salen | Datos que permanecen internos |
|---|---|---|
| ProductoDTO | ID, nombre, categoría, precio publicado y disponibilidad de venta | Costo, proveedor, saldo físico, reservas detalladas, auditoría |
| SessionDTO | ID y nombre mínimos; cookie segura por cabecera | passwordHash y secreto de sesión |
| PedidoResumenDTO / SeguimientoPedidoDTO | Resumen, estado e hitos del pedido propio | Pedidos ajenos, auditoría interna y secretos de proveedor |
| PaginaDocumentosDTO / DocumentoPDF | Documentos propios; PDF tras validar titularidad | Referencias privadas y documentos de otros clientes |
| InventarioItemDTO | Stock para personal autorizado | Inventario operativo nunca se entrega al visitante anónimo |

## 7. Leyenda UML

- Asociación: línea continua con flecha; se especifica la multiplicidad en ambos extremos.
- Composición: rombo lleno; la parte depende del ciclo de vida del agregado.
- Dependencia: flecha punteada ..>; el servicio usa un DTO o entidad. No implica asociación entre registros.
- «service»: clase de interfaz de servicio expuesta al cliente o integración autorizada.
- 1: exactamente uno; 0..1: opcional, máximo uno; 0..*: ninguno o muchos; 1..*: uno o muchos.
- Relaciones entre DTOs representan la forma del mensaje; no son relaciones persistidas en la base de datos.

## 8. Control antes de avanzar

| Pregunta de control | Resultado |
|---|---|
| ¿Todas las operaciones de M1 están representadas? | Sí: S01–S13 aparecen como operaciones UML con sus IDs. |
| ¿Cada asociación tiene ambas multiplicidades y regla de respaldo? | Sí en el diagrama y la tabla de relaciones. La tabla debe conservarse junto a las imágenes en la entrega. |
| ¿El diagrama evita exponer atributos internos solo porque existen en una clase? | Sí: los DTO se separan del modelo interno y se limita cada respuesta. S07 incluye los datos restringidos solo en su solicitud condicional. |

**Estado:** listo como diseño de Módulo 2 una vez que se utilicen los diagramas actualizados de este paquete. Las reglas de despacho, tributación, stock y cancelación son supuestos que deben contrastarse con el caso.


