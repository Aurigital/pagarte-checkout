# Persistencia de los cobros (Vercel KV / Redis)

## El problema que resuelve

Los cobros vivían en un `Map` en memoria. En Vercel cada invocación puede caer
en una instancia distinta, y las instancias se reciclan: un cobro creado por
una instancia **desaparece** cuando esa instancia muere.

Eso rompía el caso más importante. El 21/10/2026 pasó en producción:

1. Se generó el cobro `ord-20261021-f7d185c6` → quedó en la memoria de una instancia.
2. Se simuló el pago en PagArte → la venta quedó **PAGADA** de su lado.
3. Llegó el webhook `checkout.payment.confirmed`… a otra instancia.
4. Esa instancia no conocía la compra → `unknown purchase` → evento descartado.
5. `/cobros` se veía vacío aunque el pago había ocurrido.

**Un pago confirmado se perdió en silencio.** Por eso la persistencia no es un
lujo: sin ella el webhook no es confiable.

## La solución

`lib/purchases.ts` guarda en Redis cuando está configurado, y cae a memoria
solo para desarrollo local. Todas las funciones son `async`, así que el backend
se puede cambiar sin tocar las rutas.

| Clave | Qué guarda |
|---|---|
| `purchase:<id>` | El cobro completo |
| `purchases:index` | Sorted set por fecha, para listar del más nuevo al más viejo |
| `event:<eventId>` | Marca de evento procesado (TTL 30 días) |

El TTL de los eventos evita que la base crezca sin límite; a los 30 días
cualquier reintento de PagArte ya expiró.

## Sigue haciendo falta aunque no haya lista de cobros

La lista se quitó del MVP, pero la persistencia **no** es opcional: el webhook
busca la compra por `merchantOrderId`, y si no la encuentra descarta el evento.
Sin Redis, un pago confirmado se pierde igual.

## Configurar en Vercel

1. En el proyecto: **Storage → Create Database**.
2. Elegí **Upstash** (Serverless Redis) y su plan **Free**.
   > No elijas *Redis Cloud*: es otro proveedor del mismo marketplace y su
   > plan más barato cuesta $8/mes. Upstash alcanza de sobra para este volumen.
3. **Connect Project**.
4. Vercel inyecta `KV_REST_API_URL` y `KV_REST_API_TOKEN` solas.
5. **Redeploy** para que el deploy activo las tome.

## Verificar que quedó activo

```bash
curl -s https://pagarte.aurigital.com/api/health | python3 -m json.tool
```

`"persistent": true` significa que los cobros sobreviven reinicios.
`false` significa que sigue en memoria y **se van a perder**.

## En local

Sin las variables, usa el `Map` en memoria: suficiente para desarrollo, y se
borra al reiniciar. Si querés probar la ruta de Redis en local, poné las mismas
variables apuntando a tu base de Upstash.
