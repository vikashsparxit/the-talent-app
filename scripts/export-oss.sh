#!/usr/bin/env bash
# Export a sanitized copy of SparxTalent to a temp directory for the public OSS repo.
#
# Usage:
#   ./scripts/export-oss.sh --dry-run   Preview export (no git push)
#   ./scripts/export-oss.sh --push      Export, commit, push to `oss` remote main
#
# Prerequisites:
#   git remote add oss git@github.com:vikashsparxit/the-talent-app.git
#
# See docs/DEPLOYMENT.md for the full dual-repo workflow.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXCLUDE_FILE="$REPO_ROOT/oss-export.exclude"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

MODE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --push) MODE="push" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument: $arg${NC}" >&2
      echo "Usage: $0 --dry-run | --push" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo -e "${RED}Specify --dry-run or --push${NC}" >&2
  echo "Usage: $0 --dry-run | --push" >&2
  exit 1
fi

if [[ ! -f "$EXCLUDE_FILE" ]]; then
  echo -e "${RED}Missing exclude file: $EXCLUDE_FILE${NC}" >&2
  exit 1
fi

EXPORT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sparxtalent-oss-export.XXXXXX")"
cleanup() {
  if [[ -n "${EXPORT_DIR:-}" && -d "$EXPORT_DIR" ]]; then
    rm -rf "$EXPORT_DIR"
  fi
}
trap cleanup EXIT

echo -e "${CYAN}Exporting to temp directory...${NC}"
rsync -a \
  --delete \
  --exclude-from="$EXCLUDE_FILE" \
  "$REPO_ROOT/" "$EXPORT_DIR/"

# Restore documented example env files (.env.* exclude patterns may omit these).
mkdir -p "$EXPORT_DIR/supabase/functions"
[[ -f "$REPO_ROOT/.env.example" ]] && cp "$REPO_ROOT/.env.example" "$EXPORT_DIR/.env.example"
[[ -f "$REPO_ROOT/supabase/functions/.env.example" ]] && \
  cp "$REPO_ROOT/supabase/functions/.env.example" "$EXPORT_DIR/supabase/functions/.env.example"

# Strip any .env files that slipped through (except documented examples).
while IFS= read -r -d '' env_file; do
  case "$env_file" in
    */.env.example|*/supabase/functions/.env.example) continue ;;
    *)
      echo -e "${RED}Removing leaked env file: ${env_file#$EXPORT_DIR/}${NC}" >&2
      rm -f "$env_file"
      ;;
  esac
done < <(find "$EXPORT_DIR" -type f \( -name '.env' -o -name '.env.*' \) -print0 2>/dev/null || true)

echo -e "${CYAN}Checking for secret patterns...${NC}"
SECRET_HITS=0
# Real JWTs in scripts/docs (not env var names or Supabase demo keys in app code).
if grep -RInE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' \
  "$EXPORT_DIR/scripts" "$EXPORT_DIR/docs" 2>/dev/null \
  | grep -v 'supabase-demo'; then
  echo -e "${RED}Possible JWT/token material found in scripts/docs (see above).${NC}" >&2
  SECRET_HITS=1
fi
# Leaked .env-style assignments outside example files.
if grep -RInE '^(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_AI_API_KEY|GEMINI_API_KEY|RESEND_API_KEY)=[^#\s]' \
  "$EXPORT_DIR" \
  --include='*.env*' 2>/dev/null; then
  echo -e "${RED}Possible secret assignments in env files (see above).${NC}" >&2
  SECRET_HITS=1
fi
if [[ "$SECRET_HITS" -eq 1 && "$MODE" == "push" ]]; then
  echo -e "${RED}Aborting push due to possible secrets in export.${NC}" >&2
  exit 1
fi

FILE_COUNT="$(find "$EXPORT_DIR" -type f | wc -l | tr -d ' ')"
DIR_SIZE="$(du -sh "$EXPORT_DIR" | awk '{print $1}')"
echo -e "${GREEN}Export ready:${NC} $FILE_COUNT files, $DIR_SIZE"

if ! git -C "$REPO_ROOT" remote get-url oss &>/dev/null; then
  echo ""
  echo -e "${YELLOW}No git remote named 'oss' configured.${NC}"
  echo "One-time setup (after creating the public GitHub repo):"
  echo "  git remote add oss git@github.com:vikashsparxit/the-talent-app.git"
  echo ""
  if [[ "$MODE" == "push" ]]; then
    echo -e "${RED}Cannot --push without the oss remote.${NC}" >&2
    exit 1
  fi
  echo -e "${CYAN}Dry-run complete (export preview only; no push).${NC}"
  exit 0
fi

OSS_REMOTE_URL="$(git -C "$REPO_ROOT" remote get-url oss)"
echo -e "${CYAN}OSS remote:${NC} $OSS_REMOTE_URL"

if [[ "$MODE" == "dry-run" ]]; then
  echo ""
  echo -e "${CYAN}Top-level export contents:${NC}"
  ls -1 "$EXPORT_DIR" | sed 's/^/  /'
  echo ""
  echo -e "${YELLOW}Dry-run only — no commit or push performed.${NC}"
  echo "When ready: ./scripts/export-oss.sh --push  (or npm run export:oss:push)"
  exit 0
fi

# --push: init, commit, push from temp export dir
echo -e "${CYAN}Initializing git repo in export directory...${NC}"
git -C "$EXPORT_DIR" init -b main
git -C "$EXPORT_DIR" add -A
git -C "$EXPORT_DIR" commit -m "chore: sync from SparxTalent private repo

Automated OSS export. Do not edit on GitHub — changes belong in the private repo."

git -C "$EXPORT_DIR" remote add origin "$OSS_REMOTE_URL"

echo -e "${YELLOW}Force-pushing export snapshot to oss/main (replaces prior export history).${NC}"
git -C "$EXPORT_DIR" push -u origin main --force

echo -e "${GREEN}OSS export pushed to $OSS_REMOTE_URL (main).${NC}"
