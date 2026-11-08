#!/usr/bin/env bash
# HoldBuddy — Secure Owner-Run Local Telephony Launcher
set -euo pipefail

# Ensure no bash history records the launch or keys
unset HISTFILE
export HISTCONTROL=ignorespace

hb_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$hb_dir"

exec node "$hb_dir/scripts/launch-owner-server.mjs"
