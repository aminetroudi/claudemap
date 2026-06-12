#!/usr/bin/env bash
# Easy local runner for the claudemap dashboard — no Docker, no systemd, no root.
#
# Starts a detached (setsid) production server that keeps running after the
# shell that launched it exits. It inherits the launching session's DISPLAY, so
# the Sessions terminal-attach buttons keep working.
#
#   ./claudemap.sh start     # build if needed, then start detached on $PORT
#   ./claudemap.sh stop      # stop it
#   ./claudemap.sh restart
#   ./claudemap.sh status
#   ./claudemap.sh logs      # tail the log
#
# Override defaults with env vars: PORT, BUN, CLAUDEMAP_LOG.

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

PORT="${PORT:-3737}"
BUN="${BUN:-$HOME/.bun/bin/bun}"
LOG="${CLAUDEMAP_LOG:-$HOME/.claudemap.log}"

# PID of whatever is listening on $PORT (the next-server), or empty.
listener() {
  ss -ltnp 2>/dev/null | grep -F ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1
}

case "${1:-start}" in
  start)
    if pid=$(listener) && [ -n "$pid" ]; then
      echo "already running on http://localhost:$PORT (pid $pid)"
      exit 0
    fi
    [ -d .next ] || { echo "no build found — building…"; "$BUN" run build; }
    # setsid → new session, so it is NOT killed when this shell exits.
    # Bind 127.0.0.1 only: this dashboard has no auth, never expose it on a LAN.
    setsid bash -c "exec '$BUN' run start --hostname 127.0.0.1 --port $PORT" </dev/null >"$LOG" 2>&1 &
    disown || true
    for _ in $(seq 1 40); do
      curl -sf -o /dev/null "http://localhost:$PORT/" && break
      sleep 0.25
    done
    pid=$(listener)
    echo "started on http://localhost:$PORT (pid ${pid:-?}) — logs: $LOG"
    ;;
  stop)
    pid=$(listener) || true
    if [ -n "${pid:-}" ]; then
      # Kill the whole process group (setsid put bun + next-server together).
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
      if [ -n "$pgid" ]; then kill -TERM -- "-$pgid" 2>/dev/null || kill "$pid"; else kill "$pid"; fi
      echo "stopped (pid $pid)"
    else
      echo "not running"
    fi
    ;;
  restart)
    "$0" stop || true
    sleep 1
    "$0" start
    ;;
  status)
    if pid=$(listener) && [ -n "$pid" ]; then
      echo "running on http://localhost:$PORT (pid $pid)"
    else
      echo "stopped"
    fi
    ;;
  logs)
    tail -f "$LOG"
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
