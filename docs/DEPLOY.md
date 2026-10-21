# Deploy — pagarte.aurigital.com

## Estado

| | |
|---|---|
| Repo | https://github.com/Aurigital/pagarte-checkout (público) |
| Proyecto Vercel | `pagarte-checkout` (cuenta **Aurigital**) |
| Dominio | https://pagarte.aurigital.com ✅ DNS y SSL listos |
| Credenciales | Sandbox (`pgart_test_…`) |

## Variables de entorno (Vercel → Production)

Las 7 van al entorno **Production**, con credenciales de **sandbox**. Ojo con
las dos últimas: en Vercel llevan el dominio real, no `localhost`.

```
PAGARTE_API_URL=https://api.artemis.money
NEXT_PUBLIC_PAGARTE_CHECKOUT_ORIGIN=https://checkout.pagarte.artemis.money
PAGARTE_SECRET_KEY=pgart_test_…
PAGARTE_WIDGET_ID=695e3d80-8c27-410d-8129-18c3e8943883
STORE_ORIGIN=https://pagarte.aurigital.com
NEXT_PUBLIC_BASE_URL=https://pagarte.aurigital.com
AUTH_PASSWORD=…
```

> **Production (Vercel) no es lo mismo que Live (PagArte).** Production es el
> entorno de despliegue; sandbox vs Live lo decide el prefijo de la llave.
> Con `pgart_test_…` en Production, el sitio funciona con pagos simulados.

**Tras guardarlas hay que hacer redeploy**: Vercel no re-despliega solo al
cambiar variables. Deployments → el último → `⋯` → Redeploy.

Si falta alguna, el login devuelve `{"error":"Server misconfiguration"}`.

## Después del DNS: el panel de Artemis

En **Ventas Online → Configuración**, agregar en **Sitios autorizados**:

```
https://pagarte.aurigital.com
```

Sin esto, crear la sesión devuelve `403 CHECKOUT_WIDGET_BLOCKED`, porque
`STORE_ORIGIN` debe coincidir exacto con un sitio autorizado.

En **Notificaciones (webhook)**:

```
https://pagarte.aurigital.com/api/pagarte/webhook
```

## Pasar a Live más adelante

Live usa **widget, llave y webhook distintos** de sandbox:

1. En el panel, salir de Sandbox e ir a **Ventas Online**.
2. Configurar cómo recibís el dinero (wallet de cripto), o la API devuelve
   `422 CHECKOUT_MERCHANT_NOT_READY`.
3. Crear la llave `pgart_live_…` y copiar el **nuevo** Widget ID.
4. Actualizar en Vercel:

```bash
cd pagarte-checkout
printf '%s' "pgart_live_…" | vercel env add PAGARTE_SECRET_KEY production --force
printf '%s' "<widget-de-live>" | vercel env add PAGARTE_WIDGET_ID production --force
vercel --prod
```

El código detecta el modo por el prefijo de la llave; el webhook valida
`environment` en consecuencia, sin cambios.

## Verificar si PagArte ya corrigió el iframe

```bash
./scripts/check-pagarte-fix.sh
```

Dice si la cabecera sigue bloqueando el checkout. Confirmado por ellos el
21/10/2026 como bug propio, con un fix en camino.

## Notas

- **El checkout embebido sigue bloqueado por PagArte** (ver
  `PAGARTE_IFRAME_ISSUE.md`). El deploy no cambia eso: todo lo demás funciona,
  pero el pago no se puede completar hasta que corrijan la cabecera.
