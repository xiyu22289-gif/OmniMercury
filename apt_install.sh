#!/bin/bash
sudo apt-get update -y 2>&1
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 libasound2 2>&1
echo "EXIT_CODE: $?"