#!/bin/bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use v24.18.0

cd "$HOME/OmniMercury"

OUT=/mnt/c/Users/wo_sh/tmp_rebuild.txt
echo "=== Rebuilding better-sqlite3 for Electron ===" > "$OUT"

npx electron-rebuild -f -w better-sqlite3 >> "$OUT" 2>&1
echo "REBUILD EXIT: $?" >> "$OUT"
echo "DONE" >> "$OUT"