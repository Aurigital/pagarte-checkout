# PagArte Checkout — Cobros en cripto

Generador de cobros dinámicos que se pagan con **cripto, SINPE Móvil o Artemis
App**, usando [PagArte](https://pagarte.artemis.money) de Artemis Money.

Desplegado en `pagarte.aurigital.com`.

> Para el generador de links de ONVO y TiloPay, ver el repo `checkout_gen`
> (`paylink.aurigital.com`). Este repo es solo PagArte.

## Estado

✅ Funcionando en https://pagarte.aurigital.com (sandbox).

El bug del iframe que bloqueaba el checkout fue
[corregido por PagArte](./docs/PAGARTE_IFRAME_ISSUE.md) el 21/10/2026.

Para probar un pago, ver [docs/PROBAR_EN_SANDBOX.md](./docs/PROBAR_EN_SANDBOX.md):
en sandbox la dirección cripto es un marcador y los pagos se **simulan** desde
el panel, no se envían desde una wallet.

## Qué hace

- **Cobro inmediato** — ponés el monto y el checkout aparece al instante, con
  el QR que el cliente escanea desde su wallet
- **Link para enviar** — si el cliente no está presente, copiás o compartís el
  link a la página de pago
- **Webhook firmado** — verificación Ed25519 con los chequeos de seguridad

> ⚠️ **En producción hace falta Redis.** Sin él los cobros viven en memoria y
> se pierden cuando Vercel recicla la instancia, así que el webhook puede no
> encontrar la compra y un pago confirmado se pierde. En Vercel → Storage,
> elegí **Upstash** (tiene plan gratis), no Redis Cloud.
> Ver [docs/PERSISTENCIA.md](./docs/PERSISTENCIA.md) y comprobalo en
> `/api/health`: `"persistent": true`.

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
- [Probar en sandbox](./docs/PROBAR_EN_SANDBOX.md) — cómo simular un pago
- [Pasar a Live](./docs/PASAR_A_LIVE.md) — configuración y primera prueba real
- [Persistencia](./docs/PERSISTENCIA.md) — **requerida en producción**
- [Deploy](./docs/DEPLOY.md)
- [Reporte del bug del iframe](./docs/PAGARTE_IFRAME_ISSUE.md) (resuelto)

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · `qrcode`.
Sin SDK de terceros en el servidor: `fetch` y `node:crypto`.
