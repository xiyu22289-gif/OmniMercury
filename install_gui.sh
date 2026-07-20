#!/bin/bash
OUT=/mnt/c/Users/wo_sh/tmp_install_result.txt
echo "start" > $OUT

# Clean any locks
rm -f /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null
dpkg --configure -a 2>/dev/null

echo "installing..." >> $OUT
apt-get update -y >> $OUT 2>&1
apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libxkbcommon0 \
  libasound2t64 >> $OUT 2>&1
echo "install exit: $?" >> $OUT

echo "checking..." >> $OUT
dpkg -l libnss3 >> $OUT 2>&1
echo "ALL DONE" >> $OUT