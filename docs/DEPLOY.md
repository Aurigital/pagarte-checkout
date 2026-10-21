# Deploy — pagarte.aurigital.com

## Estado

| | |
|---|---|
| Repo | https://github.com/Aurigital/pagarte-checkout (público) |
| Proyecto Vercel | `pagarte-checkout` (cuenta `andresariasurena`) |
| URL temporal | https://pagarte-checkout.vercel.app ✅ funcionando |
| Dominio final | `pagarte.aurigital.com` ⏳ **falta el DNS** |
| Credenciales | Sandbox (`pgart_test_…`) |

## Pendiente: DNS en Hostinger

El subdominio hoy apunta a Hostinger (`88.223.87.175`). Hay que repuntarlo a
Vercel con **dos registros**, en el panel de Hostinger → Dominios →
`aurigital.com` → DNS / Nameservers.

### 1. Verificación de propiedad (TXT)

Hace falta porque `aurigital.com` ya está verificado en otra cuenta de Vercel.

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nombre | `_vercel` |
| Valor | `vc-domain-verify=pagarte.aurigital.com,5afd468e40ce2c292978` |
| TTL | el que venga por defecto |

### 2. Apuntar el subdominio (CNAME)

Primero **borrá los registros A** existentes de `pagarte` (los que apuntan a
`88.223.87.175` y `145.223.124.169`), o el subdominio seguirá yendo a Hostinger.

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre | `pagarte` |
| Valor | `f417470b35dfa9a8.vercel-dns-017.com.` |
| TTL | el que venga por defecto |

> Es el mismo patrón que ya usa `paylink.aurigital.com`
> (`a555c07ddee09372.vercel-dns-017.com.`), así que el procedimiento es idéntico
> al que seguiste para ese subdominio.

### 3. Verificar

El DNS puede tardar entre minutos y un par de horas. Para comprobarlo:

```bash
dig +short pagarte.aurigital.com CNAME
# esperado: f417470b35dfa9a8.vercel-dns-017.com.

curl -sI https://pagarte.aurigital.com | head -1
# esperado: HTTP/2 307  (redirige a /login)
```

Vercel emite el certificado SSL solo cuando el DNS resuelve.

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

## Notas

- **El proyecto quedó en la cuenta personal** (`andresariasurena`, plan Hobby),
  no en `AurigitalAurora's projects` (Pro), donde están los demás sitios. Si
  preferís moverlo, se hace desde el dashboard de Vercel: Project Settings →
  Transfer.
- **El checkout embebido sigue bloqueado por PagArte** (ver
  `PAGARTE_IFRAME_ISSUE.md`). El deploy no cambia eso: todo lo demás funciona,
  pero el pago no se puede completar hasta que corrijan la cabecera.
