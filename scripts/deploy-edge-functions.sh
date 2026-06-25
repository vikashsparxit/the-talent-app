#!/bin/bash
# ============================================
# Deploy Edge Functions to dev or prod Supabase (self-hosted)
# ============================================
# Syncs supabase/functions/ to the server via rsync+SSH and restarts the service.
#
# Setup (one-time):
#   Dev:  Copy scripts/.env.deploy.dev.example  → scripts/.env.deploy.dev
#   Prod: Copy scripts/deploy-edge-functions.example.env → .env.deploy  (project root)
#
# Usage:
#   ./scripts/deploy-edge-functions.sh dev    — deploy to dev server
#   ./scripts/deploy-edge-functions.sh prod   — deploy to prod server (requires confirmation)
#   ./scripts/deploy-edge-functions.sh        — defaults to dev
#
# Requires: rsync, ssh access to the target server
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTIONS_SRC="$REPO_ROOT/supabase/functions"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ENV="${1:-dev}"

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
  echo -e "${RED}Usage: $0 <dev|prod>${NC}"
  exit 1
fi

# Load env-specific config file
if [ "$ENV" = "dev" ]; then
  CONFIG_FILE="$SCRIPT_DIR/.env.deploy.dev"
  LABEL="DEV"
  LABEL_COLOR="$CYAN"
  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: $CONFIG_FILE not found.${NC}"
    echo "Copy scripts/.env.deploy.dev.example to scripts/.env.deploy.dev and fill in values."
    exit 1
  fi
else
  # Prod: prefer .env.deploy.prod, fall back to .env.deploy (legacy location)
  if [ -f "$SCRIPT_DIR/.env.deploy.prod" ]; then
    CONFIG_FILE="$SCRIPT_DIR/.env.deploy.prod"
  elif [ -f "$REPO_ROOT/.env.deploy" ]; then
    CONFIG_FILE="$REPO_ROOT/.env.deploy"
  else
    echo -e "${RED}Error: No prod deploy config found.${NC}"
    echo "Create scripts/.env.deploy.prod (or .env.deploy in project root) with your prod server settings."
    exit 1
  fi
  LABEL="PROD"
  LABEL_COLOR="$RED"
fi

set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE"
set +a

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-}"
DEPLOY_FUNCTIONS_PATH="${DEPLOY_FUNCTIONS_PATH:-}"
DEPLOY_RESTART_CMD="${DEPLOY_RESTART_CMD:-}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_OPTS="${DEPLOY_SSH_OPTS:--o StrictHostKeyChecking=accept-new}"

if [ -z "$DEPLOY_HOST" ]; then
  echo -e "${RED}Error: DEPLOY_HOST is not set in $CONFIG_FILE${NC}"
  exit 1
fi

if [ -z "$DEPLOY_FUNCTIONS_PATH" ]; then
  echo -e "${RED}Error: DEPLOY_FUNCTIONS_PATH is not set in $CONFIG_FILE${NC}"
  exit 1
fi

if [ ! -d "$FUNCTIONS_SRC" ]; then
  echo -e "${RED}Error: Functions directory not found: $FUNCTIONS_SRC${NC}"
  exit 1
fi

# Confirmation gate for prod
if [ "$ENV" = "prod" ]; then
  echo -e "${RED}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  WARNING: You are deploying Edge Functions to PROD ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════╝${NC}"
  echo ""
  read -p "Type 'yes' to continue: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# Build remote target
REMOTE="$DEPLOY_HOST"
if [ -n "$DEPLOY_USER" ]; then
  REMOTE="$DEPLOY_USER@$REMOTE"
fi
REMOTE_TARGET="$REMOTE:$DEPLOY_FUNCTIONS_PATH"

RSYNC_OPTS=(-avz --delete)
if [ -n "$DEPLOY_SSH_KEY" ]; then
  RSYNC_OPTS+=( -e "ssh -i $DEPLOY_SSH_KEY $DEPLOY_SSH_OPTS" )
else
  RSYNC_OPTS+=( -e "ssh $DEPLOY_SSH_OPTS" )
fi

echo -e "${LABEL_COLOR}Deploying Edge Functions to ${LABEL} (${REMOTE_TARGET}) ...${NC}"
rsync "${RSYNC_OPTS[@]}" \
  --exclude '.env' \
  --exclude '*.local' \
  "$FUNCTIONS_SRC/" \
  "$REMOTE_TARGET/"

echo -e "${GREEN}✓ Functions synced.${NC}"

if [ -n "$DEPLOY_RESTART_CMD" ]; then
  echo -e "${YELLOW}Restarting Edge Functions service...${NC}"
  if [ -n "$DEPLOY_SSH_KEY" ]; then
    ssh -i "$DEPLOY_SSH_KEY" $DEPLOY_SSH_OPTS "$REMOTE" "$DEPLOY_RESTART_CMD"
  else
    ssh $DEPLOY_SSH_OPTS "$REMOTE" "$DEPLOY_RESTART_CMD"
  fi
  echo -e "${GREEN}✓ Service restarted.${NC}"
else
  echo -e "${YELLOW}Tip: Set DEPLOY_RESTART_CMD in your config to restart the service after deploy.${NC}"
fi

echo -e "${GREEN}Done. Edge Functions deployed to ${LABEL} (${DEPLOY_HOST}).${NC}"
