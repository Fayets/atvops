#!/usr/bin/env bash
# Sync one-shot de transcripts Discord (delegado a atv-clients).
# Uso desde atv-ops:
#   ./backend/scripts/sync_transcripts_once.sh
set -euo pipefail

CLIENTS_BACKEND="${ATV_CLIENTS_BACKEND:-$HOME/Desktop/ATV/atv-clients/backend}"
SCRIPT="$CLIENTS_BACKEND/sync_transcripts_once.sh"

if [[ ! -x "$SCRIPT" && ! -f "$SCRIPT" ]]; then
  echo "No encuentro $SCRIPT" >&2
  exit 1
fi

cd "$CLIENTS_BACKEND"
exec bash ./sync_transcripts_once.sh
