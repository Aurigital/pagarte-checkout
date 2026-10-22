# Probar un pago en sandbox

En sandbox **no se mueve dinero real**. Los pagos se simulan desde el panel de
Artemis; no se envía cripto desde una wallet.

## La dirección de sandbox no es real

Al elegir cripto, el checkout muestra algo así:

```
PAGARTE_SANDBOX_TRX_ddc3f236-a4c9-4ede-9f72-1b2cddb5efa8
```

Eso **no es una dirección de Tron** (las reales empiezan con `T` y tienen 34
caracteres). Es un marcador de sandbox que no existe en la blockchain, por eso
cualquier wallet lo rechaza como inválido. Es el comportamiento esperado: el
banner amarillo del checkout lo advierte con *"Modo de prueba · No envíes
dinero real"*.

## Cómo simular el pago

1. Generá un cobro en https://pagarte.aurigital.com y abrí el link.
2. Elegí **Cripto** y esperá a que aparezcan el QR y la dirección. La sesión
   queda en `AWAITING_PAYMENT`.
3. En el panel de Artemis: **Ventas Online → Sandbox → pestaña Ventas**.
4. Abrí la venta (el `merchantOrderId` es el id del cobro, p. ej.
   `ord-20261021-f7d185c6`) y usá **Simular resultado**.

> Las opciones de simulación aparecen solo cuando la sesión está en
> `AWAITING_PAYMENT`. Antes de elegir método no se puede simular un pago.

### Qué simular

| Acción | Qué prueba |
|---|---|
| **Pago exacto** | El pago completo: la venta queda pagada y llega `checkout.payment.confirmed` |
| Otro monto | Un pago parcial: la venta queda en `CONFIRMING` y **no** se completa |
| Moneda incorrecta / otra cuenta / sin código | Pagos que no corresponden y se ignoran |
| Repetir el último pago | Un pago duplicado, que se ignora |
| Hacer que venza ahora | La expiración y `checkout.expired` |
| Hacer fallar el próximo intento | La preparación falla (antes de elegir método) |
| Dejar pendiente la conversión | Solo cripto: la liquidación queda `PENDING` |

Tras un **pago exacto**, el panel muestra **"Pago recibido"** — eso confirma
que el webhook llegó, se verificó la firma y se completó la compra.

## Checklist antes de pasar a Live

Verificada el 22/10/2026 contra `pagarte.aurigital.com`:

- [x] **Pago exacto** → la compra se completa y el panel muestra "Pago recibido"
- [x] **Pago parcial** → PagArte marca PAGO PARCIAL y la compra queda `PENDING`,
      sin completarse (probado: ₡250 000 cobrados, 50 USDT pagados)
- [x] **Evento duplicado** → el webhook responde `{"duplicate":true}` y no
      reprocesa (verificado con firmas Ed25519 reales)
- [x] **Firma manipulada o ausente** → el servidor responde **400**
- [x] **Persistencia** → los cobros y su estado sobreviven reinicios
      (`/api/health` → `"persistent": true`)

> El pago parcial es el caso que más importa: si la compra se completara con
> dinero de menos, en Live estarías entregando sin haber cobrado del todo.
> Ojo al probarlo: poner un monto **mayor** al cobrado es un sobrepago y sí
> completa la venta. Para probar el parcial, el monto debe ser **menor**.

## Verificar que el embebido funciona

```bash
./scripts/check-pagarte-fix.sh
```

Crea una sesión real y revisa las cabeceras de `/checkout/{sessionId}`.
Comprueba de paso que `STORE_ORIGIN` esté autorizado en el panel.

## En Live sí es una dirección real

Con una llave `pgart_live_…` la dirección es de verdad y la wallet la acepta.
Ahí no hay simulaciones: `/v1/checkout/test/…` no existe en Live, y cancelar
una venta **no** reembolsa un pago que ya llegó.
