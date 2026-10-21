# El checkout embebido de PagArte está bloqueado por `frame-ancestors 'none'`

**Fecha:** 21 de octubre de 2026
**Entorno:** Sandbox
**Widget:** `695e3d80-8c27-410d-8129-18c3e8943883`
**Estado:** ✅ **RESUELTO** por PagArte el 21/10/2026.

La ruta del checkout ahora responde con el origen autorizado en vez de `'none'`:

```
frame-ancestors https://pagarte.aurigital.com
```

y sin `X-Frame-Options`. El checkout embebido funciona.

> Ojo: la **raíz** del checkout (`/`) conserva `frame-ancestors 'none'`, lo cual
> es correcto — solo la ruta `/checkout/{sessionId}` necesita ser embebible.
> Comprobalo con `./scripts/check-pagarte-fix.sh`, que revisa la ruta real.

Lo que sigue es el registro del problema, por si reaparece.

---

## Resumen

El SDK del navegador v1 de PagArte no puede mostrar el checkout en **ningún**
sitio, porque la página que el propio SDK carga en su iframe se sirve con
cabeceras que prohíben ser embebida.

La integración del lado del servidor funciona correctamente: la sesión se crea,
los formatos son válidos y el SDK se descarga sin problemas. El fallo ocurre
cuando el navegador intenta cargar el iframe.

## Detalle técnico

El SDK (`<CHECKOUT_ORIGIN>/sdk/v1/checkout.js`, línea 186) hace:

```js
iframe.src = `${origin.origin}/checkout/${token.sessionId}`
```

Esa URL responde con:

```
content-security-policy: default-src 'self'; … frame-ancestors 'none'; frame-src 'none'
x-frame-options: DENY
```

`frame-ancestors 'none'` indica al navegador que la página no puede embeberse
en ningún iframe, desde ningún origen. El resultado visible es un recuadro
vacío donde debería estar el checkout.

## Cómo reproducirlo

```bash
# 1. Crear una sesión (responde 201)
curl -X POST "https://api.artemis.money/v1/checkout/sessions" \
  -H "Authorization: Bearer $PAGARTE_SECRET_KEY" \
  -H "Idempotency-Key: repro-1" \
  -H "Content-Type: application/json" \
  -d '{
    "widgetId": "695e3d80-8c27-410d-8129-18c3e8943883",
    "merchantOrderId": "repro-1",
    "amount": { "currency": "CRC", "amountMinor": "250000" },
    "embeddingOrigin": "http://localhost:3000"
  }'

# 2. Inspeccionar las cabeceras de la URL que carga el iframe
curl -sI "https://checkout.pagarte.artemis.money/checkout/<sessionId>" \
  | grep -iE "x-frame-options|content-security-policy"
```

## Qué se descartó

- **Contexto de la petición:** con `Sec-Fetch-Dest: iframe`,
  `Sec-Fetch-Mode: navigate` y `Sec-Fetch-Site: cross-site` → mismas cabeceras.
- **Origen autorizado:** con `Referer` y `Origin` del sitio autorizado
  (`http://localhost:3000`, registrado en el panel) → mismas cabeceras.
- **Datos de la sesión:** el `sessionId` es un UUID v4 válido y el
  `clientSecret` cumple `/^pcs_[A-Za-z0-9_-]{43}$/`, exactamente los patrones
  que el propio SDK valida (líneas 176–179). El SDK los acepta sin error.
- **Rutas alternativas:** `/embed/{id}`, `/checkout/{id}/embed` y `/e/{id}`
  responden 404.
- **Específico de la cuenta o del sandbox:** descartado. Las cabeceras aparecen
  también en la raíz del checkout y con un `sessionId` inexistente, es decir
  antes de que exista ninguna sesión:

  ```bash
  curl -sI "https://checkout.pagarte.artemis.money/" | grep -i x-frame-options
  # x-frame-options: DENY
  curl -sI "https://checkout.pagarte.artemis.money/checkout/00000000-0000-4000-8000-000000000000" \
    | grep -i x-frame-options
  # x-frame-options: DENY
  ```

  Es una política global del servidor (servido por CloudFront), no algo
  derivado del widget ni del entorno.
- **Abrir el checkout fuera del iframe:** no es viable. `/checkout/{sessionId}`
  responde `200` pero muestra "Este pago ya no está disponible", porque el
  `clientSecret` solo se entrega por `postMessage` desde la página padre tras
  el handshake de `challenge` (línea 89 del SDK). Pasarlo por query string no
  funciona. **El iframe es el único camino de pago posible.**

## Comportamiento esperado

Que `/checkout/{sessionId}` se sirva con `frame-ancestors` conteniendo los
**sitios autorizados del widget** en lugar de `'none'`, por ejemplo:

```
content-security-policy: … frame-ancestors http://localhost:3000 https://pagarte.aurigital.com;
```

y sin `X-Frame-Options: DENY`, que es una cabecera antigua y más estricta que
no admite una lista de orígenes.

## Estado: sin workaround viable

No existe forma de completar un pago mientras la cabecera siga así. El iframe
es el único camino, y está cerrado.

Lo único que hace la aplicación es **detectar el bloqueo y explicarlo**: si el
iframe no reporta estado en 6 segundos, en lugar del recuadro vacío se muestra
un mensaje claro indicando que el checkout no está disponible por un problema
del proveedor. Ver `app/pay/[purchaseId]/page.tsx`.

Se evaluó y **se descartó** servir el checkout a través de un proxy en un
subdominio propio (el SDK acepta un `checkoutOrigin` personalizado). Es
técnicamente posible, pero implica pasar por encima de una medida de seguridad
del proveedor y poner nuestro dominio en medio del flujo de pago. No es un
camino aceptable para producción.

Cuando PagArte corrija la cabecera, el iframe carga solo y el aviso deja de
mostrarse, sin cambios de código.

## Cómo verificar si ya se corrigió

```bash
curl -sI "https://checkout.pagarte.artemis.money/" \
  | grep -iE "x-frame-options|frame-ancestors"
```

Está corregido cuando `x-frame-options: DENY` desaparece y `frame-ancestors`
incluye los sitios autorizados del widget en vez de `'none'`.
