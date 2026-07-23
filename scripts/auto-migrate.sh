#!/bin/bash
# ============================================
# AUTO-MIGRATE: Apply new Supabase migrations
# Run after every git pull to keep local DB in sync
# ============================================
# Usage: ./scripts/auto-migrate.sh
# Or add to a post-merge git hook for full automation

set -e

MIGRATIONS_DIR="supabase/migrations"
APPLIED_LOG=".supabase_applied_migrations"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI not found. Install it first.${NC}"
    exit 1
fi

# Check if local Supabase is running
if ! supabase status &> /dev/null 2>&1; then
    echo -e "${YELLOW}Local Supabase not running. Starting...${NC}"
    supabase start
fi

echo -e "${GREEN}Applying pending migrations...${NC}"

# Use supabase's built-in migration command
supabase migration up

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrations applied successfully!${NC}"
else
    echo -e "${RED}❌ Migration failed. Check errors above.${NC}"
    exit 1
fi

# Regenerate types after migration
echo -e "${YELLOW}Regenerating TypeScript types...${NC}"
supabase gen types typescript --local > src/integrations/supabase/types.ts 2>/dev/null || true

echo -e "${GREEN}✅ Done! Local database is in sync.${NC}"
