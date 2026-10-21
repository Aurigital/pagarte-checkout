# Mensaje para el equipo de PagArte

> Copiá el texto de abajo y enviálo por el canal que tengas con ellos
> (panel de Artemis, correo o WhatsApp de soporte técnico).

---

Hola 👋

Estamos integrando PagArte Checkout y encontramos lo que parece ser un
problema de configuración del lado del servidor que impide que el checkout
embebido funcione. Les paso el detalle técnico.

**El problema**

El SDK del navegador v1 carga el checkout en un iframe:

```js
// <CHECKOUT_ORIGIN>/sdk/v1/checkout.js, línea 186
iframe.src = `${origin.origin}/checkout/${token.sessionId}`
```

Pero esa URL se sirve con cabeceras que prohíben el embebido:

```
content-security-policy: … frame-ancestors 'none'; frame-src 'none'
x-frame-options: DENY
```

El navegador bloquea el iframe y el comprador ve un recuadro vacío.

**No es específico de nuestra cuenta ni del modo sandbox**

Las cabeceras aparecen también en la raíz del checkout y con un sessionId
inexistente, es decir, antes de que exista ninguna sesión:

```bash
curl -sI "https://checkout.pagarte.artemis.money/" | grep -i "x-frame-options"
# x-frame-options: DENY

curl -sI "https://checkout.pagarte.artemis.money/checkout/00000000-0000-4000-8000-000000000000" \
  | grep -i "x-frame-options"
# x-frame-options: DENY
```

Eso sugiere que es una política global del servidor (servido por CloudFront),
no algo derivado del widget o del entorno.

**Lo que ya descartamos**

- La sesión se crea correctamente: `POST /v1/checkout/sessions` responde `201`.
- El `sessionId` es un UUID v4 válido y el `clientSecret` cumple
  `/^pcs_[A-Za-z0-9_-]{43}$/`, exactamente los formatos que su SDK valida
  (líneas 176–179). El SDK los acepta sin error.
- El sitio está autorizado en el panel (`http://localhost:3000`) y el
  `embeddingOrigin` coincide exactamente.
- Probamos con cabeceras de iframe real (`Sec-Fetch-Dest: iframe`,
  `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Site: cross-site`) y con el `Referer`
  y `Origin` del sitio autorizado: las cabeceras no cambian.
- No hay ruta alternativa: `/embed/{id}`, `/checkout/{id}/embed` y `/e/{id}`
  responden `404`.
- Abrir `/checkout/{sessionId}` directamente en el navegador tampoco sirve:
  muestra "Este pago ya no está disponible", porque el `clientSecret` solo se
  entrega por `postMessage` desde la página padre tras el handshake de
  `challenge` (línea 89 del SDK). Es decir, **el iframe es el único camino de
  pago posible**.

**Nuestras preguntas**

1. ¿Es un bug conocido, o hay algún paso de configuración que nos esté faltando
   para que el origen autorizado se refleje en `frame-ancestors`?
2. ¿El comportamiento es el mismo en **producción (Live)**? Queremos descartar
   que sea exclusivo del entorno sandbox antes de pasar a cobrar de verdad.
3. Si es un bug, ¿tienen una fecha estimada de corrección? Tenemos un cliente
   esperando habilitar esta pasarela en su ecommerce.

**Lo que esperaríamos**

Que `/checkout/{sessionId}` se sirva con los sitios autorizados del widget en
`frame-ancestors`, en lugar de `'none'`:

```
content-security-policy: … frame-ancestors https://pagarte.aurigital.com http://localhost:3000;
```

y sin `X-Frame-Options: DENY`, ya que es una cabecera antigua que no admite
lista de orígenes y, donde el navegador la respeta, anula a `frame-ancestors`.

**Datos de nuestra cuenta**

- Empresa: Mainly Digital
- Widget (sandbox): `695e3d80-8c27-410d-8129-18c3e8943883`
- Sitios autorizados: `http://localhost:3000`, `http://localhost:3001`, `http://localhost:3002`
- Fecha de las pruebas: 21 de octubre de 2026

Quedamos atentos. Gracias.
