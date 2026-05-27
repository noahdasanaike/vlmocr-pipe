#!/bin/bash
set -e

echo "=== vlmocr-pipe uninstall ==="
echo ""
echo "This will remove:"
echo "  - apps/web/node_modules"
echo "  - apps/web/package-lock.json"
echo "  - apps/web/.next"
echo ""
echo "Your data (SQLite DB + uploaded files in apps/web/data/) is preserved"
echo "by default. Pass --purge to also delete it."
echo ""

PURGE=0
for arg in "$@"; do
  case "$arg" in
    --purge|-p) PURGE=1 ;;
    -y|--yes)   YES=1 ;;
  esac
done

if [ "${YES:-0}" != "1" ]; then
  read -r -p "Proceed? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

rm -rf apps/web/node_modules
rm -f  apps/web/package-lock.json
rm -rf apps/web/.next
echo "Removed web build artifacts."

if [ "$PURGE" = "1" ]; then
  rm -rf apps/web/data
  echo "Removed apps/web/data (database + uploads)."
fi

echo ""
echo "Uninstall complete. Run ./install.sh to reinstall."
