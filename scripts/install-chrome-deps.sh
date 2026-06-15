#!/bin/bash
# Installs the system shared libraries required for Puppeteer's bundled Chrome
# to launch in headless mode on Debian/Ubuntu (used by StockxScraper).
#
# Without these, Chrome fails with errors like:
#   error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file
#
# Usage: ./scripts/install-chrome-deps.sh

set -e

sudo apt-get update
sudo apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libatspi2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libcairo2 \
  libpango-1.0-0 \
  libasound2t64

echo "✅ Chrome/Puppeteer shared library dependencies installed"
