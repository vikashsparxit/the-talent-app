#!/bin/bash
# ============================================
# Sets up a Git post-merge hook to auto-run migrations
# after every `git pull`
# ============================================
# Usage: ./scripts/setup-git-hook.sh (run once)

set -e

HOOK_FILE=".git/hooks/post-merge"

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
# Auto-run migrations after git pull

CHANGED_MIGRATIONS=$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD -- supabase/migrations/)

if [ -n "$CHANGED_MIGRATIONS" ]; then
    echo "🔄 New migrations detected, applying..."
    ./scripts/auto-migrate.sh
else
    echo "✅ No new migrations."
fi
EOF

chmod +x "$HOOK_FILE"
echo "✅ Git post-merge hook installed! Migrations will auto-run on git pull."
