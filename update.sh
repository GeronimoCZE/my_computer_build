#!/usr/bin/env bash
# Update My Computer Build to the latest version and restart it.
#
#   ./update.sh            pull, install, test, restart
#   ./update.sh --no-test  skip the test run
#
# Restart picks the first that applies:
#   1. a pm2 process named "my-computer-build"
#   2. a systemd service named "my-computer-build"
#   3. otherwise the script runs the server itself in the background
#      (PID in .server.pid, output in server.log)
set -euo pipefail

APP_NAME="my-computer-build"
BRANCH="${BRANCH:-main}"
RUN_TESTS=1
[[ "${1:-}" == "--no-test" ]] && RUN_TESTS=0

cd "$(dirname "$(readlink -f "$0")")"

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null || fail "git is not installed."
command -v node >/dev/null || fail "Node.js is not installed (needs 20.12 or newer)."
command -v npm >/dev/null || fail "npm is not installed."

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short --untracked-files=no
  fail "You have local changes to tracked files. Commit or stash them first (git stash), then run this again."
fi

OLD_REV="$(git rev-parse --short HEAD)"
say "Pulling latest from origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout -q "$BRANCH"
git merge --ff-only "origin/$BRANCH" || fail "Can't fast-forward: this copy has commits that aren't on origin/$BRANCH."
NEW_REV="$(git rev-parse --short HEAD)"

if [[ "$OLD_REV" == "$NEW_REV" ]]; then
  say "Already up to date ($NEW_REV)"
else
  say "Updated $OLD_REV -> $NEW_REV"
  git --no-pager log --oneline "$OLD_REV..$NEW_REV"
fi

say "Installing dependencies"
npm ci --no-audit --no-fund

if (( RUN_TESTS )); then
  say "Running tests"
  npm test --silent || fail "Tests failed. The server was not restarted, so the old version keeps running."
fi

# Read PORT the same way server.js does: environment first, then .env, then 4030.
if [[ -z "${PORT:-}" && -f .env ]]; then
  PORT="$(sed -n 's/^PORT=\([0-9]*\).*/\1/p' .env | tail -n1 || true)"
fi
PORT="${PORT:-4030}"

if command -v pm2 >/dev/null && pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  say "Restarting pm2 process $APP_NAME"
  pm2 restart "$APP_NAME" --update-env
elif command -v systemctl >/dev/null && systemctl list-unit-files "$APP_NAME.service" 2>/dev/null | grep -q "$APP_NAME"; then
  say "Restarting systemd service $APP_NAME"
  if [[ $EUID -eq 0 ]]; then systemctl restart "$APP_NAME"; else sudo systemctl restart "$APP_NAME"; fi
else
  if [[ -f .server.pid ]] && kill -0 "$(cat .server.pid)" 2>/dev/null; then
    say "Stopping old server (PID $(cat .server.pid))"
    kill "$(cat .server.pid)"
    for _ in {1..20}; do kill -0 "$(cat .server.pid)" 2>/dev/null || break; sleep 0.25; done
  fi
  say "Starting server"
  nohup node server.js >> server.log 2>&1 &
  echo $! > .server.pid
  sleep 1
  kill -0 "$(cat .server.pid)" 2>/dev/null || { tail -n 20 server.log; fail "Server didn't start. See server.log."; }
fi

say "Done: http://localhost:$PORT  (version $NEW_REV)"
