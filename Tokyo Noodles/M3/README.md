# Módulo 3 — Sistemas e integraciones

Carpeta de entrega del Módulo 3 para Tokyo Noodles. Incluye el borrador, los diagramas Mermaid y un backend local inicial formado por los cuatro subsistemas mínimos privados.

## Archivos

- `Modulo-3-Sistemas-e-Integraciones.md`: responsabilidades, autoridad de datos, mapeo S01–S13, matriz de integración, seguridad, fallos y control de cierre.
- `MAPA-COMPONENTES.mmd`: límites y conexiones de sistemas.
- `SECUENCIA-PEDIDO-PAGO.mmd`: flujo representativo de pedido y pago.
- `backend/`: implementación local ejecutable sin dependencias externas.

El backend de este módulo es un avance académico ejecutable con persistencia local JSON y servicios enlazados a `127.0.0.1`. M8 integra localmente la pantalla Seguimiento a través del API Gateway y agrega GraphQL privado. No se despliega ni se conecta al backend desde GitHub Pages; persistencia transaccional y operación de producción siguen pendientes para M10.
