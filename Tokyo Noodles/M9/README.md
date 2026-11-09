# Módulo 9 — Analítica y comunicación gRPC

Esta entrega incluye un ADR para la decisión de aplicabilidad, la caracterización del volumen actual, una prueba de carga repetible contra Seguimiento (API Gateway → GraphQL → Orders + Inventory) y el reporte de medición. La conclusión es **no crear por ahora Analytics ni gRPC**; M8 y los servicios privados existentes siguen siendo obligatorios.

## Archivos

- `ADR-M9-Analitica-y-gRPC.md`: contexto, alternativas, decisión, consecuencias, proyección y control.
- `prueba-carga.mjs`: crea un pedido ficticio y mide 20 consultas GraphQL por la ruta pública del Gateway, con 4 solicitudes concurrentes.
- `medir-carga.ps1`: recoge latencias/throughput del ejecutor y CPU/memoria de los procesos backend Node durante la prueba.
- `Resultados-carga.md` y `evidencia-carga.json`: medición local reproducible y sus datos observados.

## Repetir la medición en Windows

1. Requiere Node.js 20+ y el paquete GraphQL instalado (`npm ci` en `MODULO 3/backend`).
2. Configura `MODULO 3/backend/.env` desde `.env.example` con credenciales locales únicas.
3. Desde la raíz del proyecto, ejecuta `powershell -ExecutionPolicy Bypass -File .\M9\medir-carga.ps1`. El script inicia el backend, espera health-check, toma la medición y al terminar apaga los procesos que inició.

La carga crea un pedido de prueba de un producto y deja ese registro local; no cobra ni crea eventos de pago. El Gateway limita GraphQL a 30 solicitudes por minuto por IP; el perfil envía 20 y cada ejecución levanta un backend local nuevo. El medidor compara los procesos Node antes/después de iniciar el backend para medir CPU y memoria sin depender de acceso WMI; toma muestras cada 10 ms. Cada ejecución reemplaza `evidencia-carga.json` con nuevas métricas.

Para esta entrega académica el ZIP incluye un `.env` local con valores ficticios de demostración. No lo reutilices en sistemas reales; rótalo antes de cambiar el entorno y no publiques el backend local en Internet.
