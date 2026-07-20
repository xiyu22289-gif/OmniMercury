#!/bin/bash
set -e
LOG="$HOME/gui_install_log.txt"

echo "=== Installing Electron GUI dependencies ===" > "$LOG"

sudo apt-get update >> "$LOG" 2>&1
sudo apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libxkbcommon0 \
  libasound2 >> "$LOG" 2>&1

echo "apt install exit: $?" >> "$LOG"

echo "=== Verify libnss3 ===" >> "$LOG"
ldconfig -p | grep libnss3 >> "$LOG" 2>&1
echo "verify exit: $?" >> "$LOG"

echo "=== Done ===" >> "$LOG"