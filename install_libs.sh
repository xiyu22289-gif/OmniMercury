#!/bin/bash
sudo rm -f /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null
sudo apt-get update -o Acquire::http::Timeout=30
sudo apt-get install -y -o Dpkg::Options::="--force-confnew" libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 libasound2
echo "EXIT: $?"