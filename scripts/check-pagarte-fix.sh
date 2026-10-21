#!/usr/bin/env bash
# ¿PagArte ya corrigió la cabecera que bloquea el checkout embebido?
# Uso: ./scripts/check-pagarte-fix.sh

URL="https://checkout.pagarte.artemis.money/"
H=$(curl -sI "$URL" --max-time 15)

XFO=$(printf '%s' "$H" | grep -i "^x-frame-options:" | tr -d '\r' | cut -d' ' -f2-)
FA=$(printf '%s' "$H" | grep -io "frame-ancestors [^;]*" | head -1)

echo "Revisando $URL"
echo "  x-frame-options : ${XFO:-(ninguno)}"
echo "  frame-ancestors : ${FA:-(ninguno)}"
echo ""

if [ -z "$XFO" ] && ! printf '%s' "$FA" | grep -q "'none'"; then
  echo "✅ CORREGIDO — el checkout ya puede embeberse."
  echo "   Probá un pago en https://pagarte.aurigital.com"
  exit 0
fi

echo "❌ Sigue bloqueado."
[ -n "$XFO" ] && echo "   Falta quitar x-frame-options: $XFO"
printf '%s' "$FA" | grep -q "'none'" && echo "   frame-ancestors sigue en 'none'"
exit 1
