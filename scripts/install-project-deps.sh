#!/usr/bin/env bash
set -euo pipefail

if [ -f pnpm-lock.yaml ]; then
  corepack enable
  if node -e "const pm = require('./package.json').packageManager || ''; process.exit(pm.startsWith('pnpm@') ? 0 : 1)"; then
    PNPM_VERSION=$(node -p "require('./package.json').packageManager")
    corepack prepare "$PNPM_VERSION" --activate
  else
    corepack prepare pnpm@latest-9 --activate
  fi
  CI=true pnpm install --frozen-lockfile
elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  CI=true npm ci
elif [ -f yarn.lock ]; then
  corepack enable
  CI=true yarn install --immutable || CI=true yarn install --frozen-lockfile
else
  CI=true npm install
fi
