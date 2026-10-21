#!/usr/bin/env bash
# ¿PagArte permite embeber el checkout en nuestro sitio?
#
# Comprueba la ruta REAL (/checkout/{sessionId}), no la raíz: la raíz conserva
# frame-ancestors 'none' y eso no afecta al checkout.
#
# Uso: ./scripts/check-pagarte-fix.sh

set -u
cd "$(dirname "$0")/.." || exit 1
[ -f .env.local ] || { echo "Falta .env.local"; exit 1; }

get() { grep -E "^$1=" .env.local | cut -d= -f2- | xargs; }
K=$(get PAGARTE_SECRET_KEY); W=$(get PAGARTE_WIDGET_ID)
A=$(get PAGARTE_API_URL); O=$(get STORE_ORIGIN)
CO=$(get NEXT_PUBLIC_PAGARTE_CHECKOUT_ORIGIN)
A=${A:-https://api.artemis.money}
CO=${CO:-https://checkout.pagarte.artemis.money}

REF="healthcheck-$(date +%s)"
RESP=$(curl -s -X POST "$A/v1/checkout/sessions" \
  -H "Authorization: Bearer $K" -H "Idempotency-Key: $REF-1" \
  -H "Content-Type: application/json" \
  -d "{\"widgetId\":\"$W\",\"merchantOrderId\":\"$REF\",\"amount\":{\"currency\":\"CRC\",\"amountMinor\":\"100000\"},\"embeddingOrigin\":\"$O\"}")

SID=$(printf '%s' "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sessionId',''))" 2>/dev/null)

if [ -z "$SID" ]; then
  echo "❌ No se pudo crear la sesión con origen $O"
  printf '%s\n' "$RESP" | head -c 300; echo
  echo "   Si es CHECKOUT_WIDGET_BLOCKED: agregá ese origen exacto en"
  echo "   Ventas Online → Configuración → Sitios autorizados."
  exit 1
fi

echo "Origen autorizado  : ✅ $O"
echo "Sesión de prueba   : $SID"

H=$(curl -sI "$CO/checkout/$SID" --max-time 15)
XFO=$(printf '%s' "$H" | grep -i "^x-frame-options:" | tr -d '\r' | cut -d' ' -f2-)
FA=$(printf '%s' "$H" | grep -io "frame-ancestors [^;]*" | head -1)

echo "x-frame-options    : ${XFO:-(ninguno)}"
echo "${FA:-frame-ancestors    : (ninguno)}"
echo ""

if [ -z "$XFO" ] && ! printf '%s' "$FA" | grep -q "'none'"; then
  echo "✅ El checkout puede embeberse. Probá un cobro en $O"
  exit 0
fi

echo "❌ Sigue bloqueado: el iframe no va a cargar."
exit 1
