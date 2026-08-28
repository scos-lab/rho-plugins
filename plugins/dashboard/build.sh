#!/usr/bin/env bash
# Bundle the Dashboard plugin: TypeScript src/ → single CJS main.js.
# Needs esbuild (any recent version): `npx esbuild` fetches it on demand.
set -euo pipefail
cd "$(dirname "$0")"
npx -y esbuild src/index.ts --bundle --format=cjs --platform=browser --outfile=main.js
echo "built main.js ($(wc -c < main.js) bytes)"
