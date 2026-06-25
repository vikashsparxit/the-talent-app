#!/usr/bin/env bash
# Push private SparxTalent main to origin and prod deploy branch.
#
# Usage: ./scripts/push-prod.sh
# Or:    npm run push:prod
#
# See docs/DEPLOYMENT.md

set -euo pipefail

YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}WARNING: This pushes to origin main AND origin prod (SparxIT production deploy).${NC}"
echo -e "${CYAN}Ensure npx tsc --noEmit and npm run build pass before pushing.${NC}"
echo ""

read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

git push origin main
git push origin main:prod

echo -e "${GREEN}Pushed origin main and origin prod.${NC}"
