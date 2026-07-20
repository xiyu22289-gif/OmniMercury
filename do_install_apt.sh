#!/bin/bash
# Run as root to install Electron GUI dependencies
exec 1>/tmp/apt_result.txt 2>&1

# Kill any remaining apt processes
pkill -9 apt-get 2>/dev/null
pkill -9 dpkg 2>/dev/null
rm -f /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/cache/apt/archives/lock
dpkg --configure -a 2>/dev/null

# Update and install
apt-get update -y
apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 libasound2

# Verify
echo "========== RESULT =========="
dpkg -l libnss3 2>&1 | tail -3
ldconfig -p | grep -c libnss3
echo "EXIT: $?"