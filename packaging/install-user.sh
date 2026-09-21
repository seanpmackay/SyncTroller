#!/usr/bin/env bash
# Install (or refresh) SyncTroller for the current user only -- no root.
#
# Runs the electron-builder build, then writes a user-level .desktop entry
# that launches straight out of dist/linux-unpacked. Because
# ~/.local/share/applications overrides /usr/share/applications for the same
# file name, this also takes precedence over any older pacman-installed copy
# (packaging/arch) that may still be on the machine.
#
# Usage:  npm run install:desktop      (from the project root)
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
apps_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
desktop_file="$apps_dir/synctroller.desktop"

cd "$project_dir"
npx electron-builder --dir

mkdir -p "$apps_dir"
sed "s|@PROJECT_DIR@|$project_dir|g" packaging/linux-user/synctroller.desktop > "$desktop_file"
chmod 644 "$desktop_file"
command -v update-desktop-database >/dev/null && update-desktop-database "$apps_dir" || true

# A running instance keeps the old code in memory; restart it so the menu
# launch really reflects this build.
if pgrep -f "dist/linux-unpacked/hue-sync-controller|/opt/synctroller/hue-sync-controller" >/dev/null; then
  pkill -f "dist/linux-unpacked/hue-sync-controller|/opt/synctroller/hue-sync-controller" || true
  sleep 1
  setsid nohup "$project_dir/dist/linux-unpacked/hue-sync-controller" </dev/null >/dev/null 2>&1 &
  echo "Restarted the running SyncTroller instance with the new build."
fi

echo "Installed: $desktop_file -> $project_dir/dist/linux-unpacked/hue-sync-controller"
