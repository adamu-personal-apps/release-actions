#!/usr/bin/env bash
# Thin curl/jq wrapper for the Discord forum webhook.
#   discord.sh open <webhook> <title> <body>   -> prints thread_id
#   discord.sh post <webhook> <thread_id> <content>
# jq builds the JSON so titles/bodies with quotes or newlines are safe.
set -euo pipefail

cmd="${1:-}"; shift || true
case "$cmd" in
  open)
    webhook="$1"; title="$2"; body="$3"
    payload=$(jq -n --arg name "$title" --arg content "$body" \
      '{thread_name: $name, content: $content}')
    resp=$(curl -sS -X POST -H 'Content-Type: application/json' \
      -d "$payload" "${webhook}?wait=true")
    tid=$(printf '%s' "$resp" | jq -r '.channel_id')
    if [ -z "$tid" ] || [ "$tid" = "null" ]; then
      echo "discord open failed: $resp" >&2
      exit 1
    fi
    printf '%s' "$tid"
    ;;
  post)
    webhook="$1"; thread_id="$2"; content="$3"
    payload=$(jq -n --arg content "$content" '{content: $content}')
    curl -sS -X POST -H 'Content-Type: application/json' \
      -d "$payload" "${webhook}?thread_id=${thread_id}" >/dev/null
    ;;
  *)
    echo "unknown discord cmd: $cmd" >&2
    exit 1
    ;;
esac
