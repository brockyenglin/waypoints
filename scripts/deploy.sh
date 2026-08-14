#!/usr/bin/env bash
# Publish dist/ to gh-pages, carrying the previous deploy's hashed assets
# forward so CDN-cached HTML never references a deleted chunk during the
# ~10-minute Pages cache window.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d dist/assets ] || { echo "run npm run build first"; exit 1; }

prev=$(mktemp -d)
if git clone -q --depth 1 --branch gh-pages https://github.com/brockyenglin/waypoints.git "$prev" 2>/dev/null; then
  # keep old hashed assets + og cards that the new build didn't produce
  cp -n "$prev"/assets/* dist/assets/ 2>/dev/null || true
fi
rm -rf "$prev"

cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Brock Yenglin" -c user.email="byenglin@gmail.com" commit -q -m "deploy"
git push -f -q https://github.com/brockyenglin/waypoints.git gh-pages
echo "deployed (previous assets preserved)"
