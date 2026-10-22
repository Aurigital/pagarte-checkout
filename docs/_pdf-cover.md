# Integración de pagos en cripto con PagArte

### Guía técnica de implementación

**Artemis Money · PagArte Checkout**

Preparado por **Aurigital**
22 de octubre de 2026

---

Esta guía documenta cómo integrar el checkout de PagArte para cobrar en
**cripto, SINPE Móvil y Artemis App** desde un sitio propio.

Todo lo que contiene está verificado contra la API real, incluyendo un cobro
en producción con dinero real.

**Contenido**

1. Qué es PagArte y en qué se diferencia de otras pasarelas
2. Preparar la cuenta
3. Montos y moneda
4. Crear la sesión en el servidor
5. Idempotencia y sesiones activas
6. Mostrar el checkout en el navegador
7. Confirmar el pago con webhooks firmados
8. Códigos de error
9. Probar en sandbox
10. Pasar a producción
11. Liquidación

Apéndices: persistencia del estado y referencia rápida de la API.
