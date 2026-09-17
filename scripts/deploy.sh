#!/usr/bin/env bash
# Reconstruye la imagen y fuerza la recreacion del contenedor.
#
# `podman-compose up -d --build` por si solo reconstruye la imagen pero NO
# recrea el contenedor si compose no detecta cambios en docker-compose.yml:
# el contenedor viejo sigue corriendo con el codigo anterior (gotcha real,
# ver backend.md del vault, jornada 17-sep). Por eso --force-recreate es
# obligatorio en este script, no un flag opcional.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER="rebusque-backend"

podman-compose up -d --build --force-recreate

echo "Esperando healthcheck de $CONTAINER..."
for i in $(seq 1 20); do
  status=$(timeout 5 podman inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "sin-respuesta")
  echo "[$i/20] estado: $status"
  case "$status" in
    healthy)
      echo "$CONTAINER saludable."
      exit 0
      ;;
    unhealthy)
      echo "$CONTAINER unhealthy. Ultimos logs:"
      timeout 5 podman logs --tail 50 "$CONTAINER"
      exit 1
      ;;
  esac
  sleep 2
done

echo "Timeout esperando healthcheck (ultimo estado: $status)"
timeout 5 podman logs --tail 50 "$CONTAINER"
exit 1
