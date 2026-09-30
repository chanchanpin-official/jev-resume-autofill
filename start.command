#!/bin/zsh -i
set -eu
cd -- "${0:A:h}"
exec python3 -B bridge/server.py
