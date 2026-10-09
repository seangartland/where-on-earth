#!/bin/bash
# Deploy Where on Earth to Vercel production
# Usage: ./deploy.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="/tmp/woe-deploy"

echo "Building deploy directory..."
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy all required directories and files
cp -r "$SCRIPT_DIR/index.html" "$DEPLOY_DIR/"
# Copy preview mockups
# REMOVED: do not ship internal preview pages to prod
# cp "$SCRIPT_DIR"/preview-*.html "$DEPLOY_DIR/" 2>/dev/null || true
cp -r "$SCRIPT_DIR/src" "$DEPLOY_DIR/"
# Drop main.js/style.css backups (main.js.bak-*, main.js.backup-*)
rm -f "$DEPLOY_DIR"/src/*.bak* "$DEPLOY_DIR"/src/*.backup*
cp -r "$SCRIPT_DIR/vendor" "$DEPLOY_DIR/"
# Import map points to lib/<version>/ — copy vendor there too
LIB_VER=$(grep -o '"three": "./lib/[^"]*"' "$SCRIPT_DIR/index.html" | head -1 | sed 's/.*".\/lib\///;s/\/three.*//')
if [ -n "$LIB_VER" ]; then
  mkdir -p "$DEPLOY_DIR/lib/$LIB_VER"
  cp -r "$SCRIPT_DIR/vendor/"* "$DEPLOY_DIR/lib/$LIB_VER/"
fi
cp "$SCRIPT_DIR/vercel.json" "$DEPLOY_DIR/"

# Copy assets but exclude backups and duplicates
mkdir -p "$DEPLOY_DIR/assets"
for f in "$SCRIPT_DIR"/assets/*; do
  base=$(basename "$f")
  # Skip backup files, duplicates, and dead files (not loaded by code).
  # image-audit/ and difficulty/ are offline QA/pipeline data (~43 MB), never fetched by the game.
  case "$base" in
    *.bak|*.pre-*|og-v3.png|world.geo.json|world-10m.geo.json|image-audit|difficulty) continue ;;
  esac
  cp -r "$f" "$DEPLOY_DIR/assets/"
done

# Content-based versioning: only changed files get new URLs
# This ensures browsers cache unchanged files across deploys
version_file() {
  sha256sum "$1" | cut -c1-12
}

# Version main.js and style.css by content hash
MAIN_JS_HASH=$(version_file "$DEPLOY_DIR/src/main.js")
STYLE_CSS_HASH=$(version_file "$DEPLOY_DIR/src/style.css")
sed -i -E "s|main\.js\?v=[^\"]*|main.js?v=$MAIN_JS_HASH|g" "$DEPLOY_DIR/index.html"
sed -i -E "s|style\.css\?v=[^\"]*|style.css?v=$STYLE_CSS_HASH|g" "$DEPLOY_DIR/index.html"

# Stamp app-version for cache-buster (content-based: only changes when HTML changes)
# Hash the HTML after asset versioning but before stamping (exclude the version meta itself)
DEPLOY_VERSION=$(grep -v 'name="app-version"' "$DEPLOY_DIR/index.html" | sha256sum | cut -c1-12)
sed -i -E "s|<meta name=\"app-version\" content=\"[^\"]*\"|<meta name=\"app-version\" content=\"$DEPLOY_VERSION\"|" "$DEPLOY_DIR/index.html"
echo -n "$DEPLOY_VERSION" > "$DEPLOY_DIR/assets/version.txt"

# Version asset JSON URLs by content hash
for json_file in "$DEPLOY_DIR"/assets/*.json; do
  [ -f "$json_file" ] || continue
  base=$(basename "$json_file")
  hash=$(version_file "$json_file")
  # Replace in main.js: assets/<base> or assets/<base>?v=xxx
  sed -i -E "s|(assets/$base)(\?v=[^\"']*)?|\1?v=$hash|g" "$DEPLOY_DIR/src/main.js"
done
echo "Asset versions: content-based (unchanged files keep cached URLs)"

# Optional files if they exist
# REMOVED: do not ship internal review tool to prod
# [ -f "$SCRIPT_DIR/review-locations.html" ] && cp "$SCRIPT_DIR/review-locations.html" "$DEPLOY_DIR/"

echo "Deploying to Vercel..."
DEPLOY_OUTPUT=$(python3 ~/workspace/skills/vercel/bin/vercel-api deploy prj_gqXXakaMlcpXFkZIOp792miGxtv5 "$DEPLOY_DIR" --target production 2>&1)
echo "$DEPLOY_OUTPUT" | tail -1

echo "Waiting for deployment to be ready..."
sleep 20

DEPLOY_ID=$(python3 ~/workspace/skills/vercel/bin/vercel-api raw GET "/v6/deployments?projectId=prj_gqXXakaMlcpXFkZIOp792miGxtv5&limit=1" 2>&1 | python3 -c "
import json,sys
d = json.load(sys.stdin)
dep = d['payload']['deployments'][0]
print(dep['uid'])
")

STATE=$(python3 ~/workspace/skills/vercel/bin/vercel-api raw GET "/v6/deployments?projectId=prj_gqXXakaMlcpXFkZIOp792miGxtv5&limit=1" 2>&1 | python3 -c "
import json,sys
d = json.load(sys.stdin)
dep = d['payload']['deployments'][0]
print(dep['state'])
")

echo "Deployment $DEPLOY_ID: $STATE"

if [ "$STATE" = "READY" ]; then
    echo "Assigning alias..."
    echo '{"alias":"where-on-earth-game.vercel.app"}' > /tmp/woe-alias.json
    python3 ~/workspace/skills/vercel/bin/vercel-api raw POST "/v2/deployments/$DEPLOY_ID/aliases" /tmp/woe-alias.json 2>&1 | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('Alias status:', d.get('status'))
"
    
    echo "Verifying..."
    sleep 3
    VENDOR_PATH=$(grep -o "\./lib/[^\"]*/three/build/three.module.js" "$SCRIPT_DIR/index.html" | head -1 | sed "s|^\.||")
    VENDOR_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://where-on-earth-game.vercel.app${VENDOR_PATH:-/vendor/three/build/three.module.js}")
    LOC_COUNT=$(curl -s "https://where-on-earth-game.vercel.app/assets/locations.json" 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
    echo "Vendor (three.js): $VENDOR_CODE"
    echo "Locations: $LOC_COUNT"
    
    if [ "$VENDOR_CODE" = "200" ] && [ "$LOC_COUNT" = "2000" ]; then
        echo "✅ Deploy successful"
    else
        echo "⚠️  Deploy may have issues - verify manually"
        exit 1
    fi
else
    echo "❌ Deployment not READY: $STATE"
    exit 1
fi
