# Apéndice · Verificación en producción

Esta guía no es teórica: la integración que documenta está corriendo en
`pagarte.aurigital.com` y procesó un cobro real.

## El cobro de prueba en Live

| | |
|---|---|
| Fecha | 22 de octubre de 2026 |
| Cobrado | ₡1 000,00 |
| Método | USDT · Tron (TRC20) |
| Pago recibido | 2,23 USDT |
| Liquidado al comercio | 2,222195 USDT |
| Estado | PAGADA · liquidación completada |

El saldo llegó a la billetera de Artemis como **USDT (TRC20)**, sin
conversión automática a colones.

## Qué se verificó

| Verificación | Entorno | Resultado |
|---|---|---|
| Crear sesión | Sandbox y Live | 201 |
| Idempotencia (misma clave → misma sesión) | Sandbox | 200, mismo `sessionId` |
| Moneda distinta de CRC | Sandbox | 422 `CHECKOUT_CURRENCY_NOT_ENABLED` |
| Origen no autorizado | Sandbox | 403 `CHECKOUT_WIDGET_BLOCKED` |
| Checkout embebido | Sandbox y Live | Carga con su QR |
| Pago exacto | Sandbox y Live | Compra completada |
| Pago parcial | Sandbox | Queda `PENDING`, no se completa |
| Evento duplicado | Sandbox | `{"duplicate":true}`, no reprocesa |
| Firma inválida o ausente | Producción | 400 |
| Timestamp fuera de ventana (replay) | Local | 400 |
| `environment` cruzado (LIVE con llave TEST) | Local | Ignorado |
| Monto que no coincide | Local | Ignorado, compra intacta |
| Persistencia tras reinicio | Local y producción | Sobrevive |

## Un hallazgo que vale compartir

Durante la integración, un pago confirmado **se perdió en silencio**: el cobro
vivía en memoria, Vercel recicló la instancia, y el webhook llegó a otra que no
conocía la compra. PagArte la tenía como PAGADA; el sistema propio, no.

Es un error fácil de cometer con cualquier pasarela basada en webhooks, y la
razón por la que este proyecto usa Redis. El detalle está en
`PERSISTENCIA.md`.

## Referencia rápida

```
API              https://api.artemis.money
SDK              https://checkout.pagarte.artemis.money/sdk/v1/checkout.js
Tipos (.d.ts)    https://checkout.pagarte.artemis.money/sdk/v1/checkout.d.ts
Llaves webhook   GET {API}/v1/checkout/webhook-keys
Documentación    https://pagarte.artemis.money/docs/es
```

| Endpoint | Para qué |
|---|---|
| `POST /v1/checkout/sessions` | Crear la sesión |
| `GET /v1/checkout/sessions/{id}` | Estado y liquidación |
| `POST /v1/checkout/sessions/{id}/cancel` | Cancelar |
| `GET /v1/checkout/webhook-keys` | Llaves públicas para verificar firmas |
| `POST /v1/checkout/test/sessions/{id}/…` | Simulaciones (solo sandbox) |

## Código de referencia

La implementación completa es pública:
**github.com/Aurigital/pagarte-checkout**

| Archivo | Qué hace |
|---|---|
| `lib/pagarte.ts` | Cliente de la API |
| `lib/pagarte-webhook.ts` | Verificación Ed25519 y caché de llaves |
| `lib/purchases.ts` | Estado de compras (Redis) e idempotencia |
| `app/api/pagarte/webhook/route.ts` | Receptor con los seis chequeos |
| `components/PagArteCheckout.tsx` | Montaje del SDK |
