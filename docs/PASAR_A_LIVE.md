# Pasar a Live

Live se configura **aparte** de sandbox: otro widget, otras llaves y otra URL
de notificaciones. Nada se hereda.

> **En Live el dinero es real.** Cancelar una venta **no** devuelve un pago que
> ya llegó, y no existen los endpoints de simulación (`/v1/checkout/test/…`).

---

## 1. Configurar el modo Live en el panel

En el panel de Artemis, salí de **Sandbox** y entrá a **Ventas Online**
(sin el sufijo Sandbox).

### 1.1 Cómo recibís el dinero

**Hacelo primero.** Sin esto, crear una sesión devuelve
`422 CHECKOUT_MERCHANT_NOT_READY`.

En **Ajustes → Liquidación de órdenes cripto**, decidí la conversión automática:

| Conversión | Recibís | Cuándo conviene |
|---|---|---|
| **Desactivada** | El cripto directo (USDT) en tu wallet | Si querés quedarte en cripto |
| Activada | Colones al tipo de cambio del momento, menos comisiones | Si necesitás CRC |

Con la conversión **desactivada**, Live solo ofrece las criptos para las que
tengas wallet configurada. Configurá la wallet de USDT en Tron.

### 1.2 Activar pagos y autorizar el sitio

En **Configuración**:

1. **Recibir pagos:** activado.
2. **Sitios autorizados:** agregá `https://pagarte.aurigital.com`
   - Exacto, sin barra final. En Live solo se admite `https://`.
   - Este paso hay que repetirlo: los sitios de sandbox **no** pasan a Live.
3. **Métodos de pago:** marcá Cripto (y SINPE Móvil si registraste el teléfono).
4. **Guardá y copiá el nuevo ID del widget** — es distinto al de sandbox.

### 1.3 Crear la llave de API

En **Llaves de API**, creá una (por ejemplo "Produccion").

> 🔑 Se muestra **una sola vez**. Copiala al instante.

Debe empezar con `pgart_live_`.

### 1.4 Webhook

En **Notificaciones (webhook)**:

```
https://pagarte.aurigital.com/api/pagarte/webhook
```

Marcá los tres eventos: pagada, cancelada y vencida.

---

## 2. Actualizar Vercel

En **Settings → Environment Variables**, entorno **Production**, cambiá solo dos:

| Variable | Valor nuevo |
|---|---|
| `PAGARTE_SECRET_KEY` | La llave `pgart_live_…` |
| `PAGARTE_WIDGET_ID` | El widget de Live |

El resto (`PAGARTE_API_URL`, `STORE_ORIGIN`, `NEXT_PUBLIC_BASE_URL`,
`NEXT_PUBLIC_PAGARTE_CHECKOUT_ORIGIN`, las de Redis) **no cambian**: la URL de
la API es la misma y el modo lo decide el prefijo de la llave.

Después: **Redeploy**.

---

## 3. Verificar antes de cobrar

```bash
curl -s https://pagarte.aurigital.com/api/health | python3 -m json.tool
```

Esperado:

```json
{
  "ok": true,
  "persistent": true,
  "storage": "KV_*",
  "mode": "LIVE",
  "storeOrigin": "https://pagarte.aurigital.com",
  "widgetConfigured": true
}
```

- `"mode": "LIVE"` → la llave de producción está activa.
- `"persistent": true` → Redis conectado. **Si dice `false`, parate acá:** sin
  persistencia un pago confirmado se puede perder.

---

## 4. La primera prueba real

**Empezá con un monto chico**, no con todo el presupuesto.

1. Generá un cobro de **₡1 000** (menos de $2).
2. Pagalo desde tu propia wallet, con **USDT por Tron**: las comisiones de red
   son de centavos, a diferencia de Ethereum.
3. Confirmá que:
   - La dirección del checkout es **real** (empieza con `T`, 34 caracteres).
     Si vuelve a aparecer `PAGARTE_SANDBOX_…`, seguís en sandbox.
   - El panel muestra **"Pago recibido"**.
   - La venta figura **PAGADA** en el panel de Artemis.
   - La liquidación llega a tu wallet.

Recién después movés montos mayores.

> No es un gasto perdido: te estás pagando a vos mismo. Lo único que se pierde
> son las comisiones de red, que en Tron son centavos.

---

## Qué cambia respecto a sandbox

| | Sandbox | Live |
|---|---|---|
| Llave | `pgart_test_…` | `pgart_live_…` |
| Dirección cripto | Marcador `PAGARTE_SANDBOX_…` | Real, la wallet la acepta |
| Dinero | Simulado | **Real** |
| Simulaciones | Sí, desde el panel | **No existen** |
| Cancelar una venta | Sin consecuencias | **No reembolsa** un pago recibido |

---

## Volver a sandbox

Cambiá `PAGARTE_SECRET_KEY` y `PAGARTE_WIDGET_ID` por los de sandbox y
redesplegá. El código detecta el modo por el prefijo de la llave, y el webhook
valida `environment` en consecuencia, así que un evento de sandbox nunca puede
completar una compra de Live ni al revés.
