# PagArte Checkout — Cobros en cripto

Generador de cobros dinámicos que se pagan con **cripto, SINPE Móvil o Artemis
App**, usando [PagArte](https://pagarte.artemis.money) de Artemis Money.

Desplegado en `pagarte.aurigital.com`.

> Para el generador de links de ONVO y TiloPay, ver el repo `checkout_gen`
> (`paylink.aurigital.com`). Este repo es solo PagArte.

## ⚠️ Estado

El checkout embebido de PagArte está **bloqueado del lado de ellos**
(`frame-ancestors 'none'`). Todo lo demás funciona y está verificado contra la
API real. Ver [docs/PAGARTE_IFRAME_ISSUE.md](./docs/PAGARTE_IFRAME_ISSUE.md) y
el mensaje a enviarles en
[docs/MENSAJE_PARA_PAGARTE.md](./docs/MENSAJE_PARA_PAGARTE.md).

## Qué hace

- **Panel de cobro** — monto en colones + descripción → link de pago y **QR**
  para escanear con el teléfono
- **Lista de cobros** — estado en vivo (pendiente, pagado, vencido), actualizado
  por webhook
- **Página de pago** — monta el SDK de PagArte para que el cliente pague
- **Webhook firmado** — verificación Ed25519 con los chequeos de seguridad

## Setup

```bash
npm install
cp .env.example .env.local   # completá las credenciales
npm run dev
```

Las credenciales se sacan del panel de Artemis, en **Ventas Online →
Configuración**. La llave de API se muestra **una sola vez**.

| Variable | Qué es |
|---|---|
| `PAGARTE_API_URL` | `https://api.artemis.money` |
| `PAGARTE_SECRET_KEY` | `pgart_test_…` (sandbox) o `pgart_live_…` |
| `PAGARTE_WIDGET_ID` | ID del widget, **distinto** en sandbox y Live |
| `STORE_ORIGIN` | Debe coincidir exacto con un sitio autorizado |
| `NEXT_PUBLIC_BASE_URL` | URL pública de esta app |
| `AUTH_PASSWORD` | Contraseña del panel |

## Webhooks en desarrollo

PagArte no envía webhooks a `localhost`. Para probarlos:

```bash
ngrok http 3000
# Pegá https://<id>.ngrok-free.app/api/pagarte/webhook en el panel
```

## Documentación

- [Manual de integración](./docs/PAGARTE_INTEGRATION_MANUAL.md) — guía completa
  en español, pensada para que otro equipo integre PagArte desde cero
- [Reporte del bug del iframe](./docs/PAGARTE_IFRAME_ISSUE.md)
- [Mensaje para PagArte](./docs/MENSAJE_PARA_PAGARTE.md)

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · `qrcode`.
Sin SDK de terceros en el servidor: `fetch` y `node:crypto`.
