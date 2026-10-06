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
cp -r "$SCRIPT_DIR/src" "$DEPLOY_DIR/"
cp -r "$SCRIPT_DIR/assets" "$DEPLOY_DIR/"
cp -r "$SCRIPT_DIR/vendor" "$DEPLOY_DIR/"
cp "$SCRIPT_DIR/vercel.json" "$DEPLOY_DIR/"

# Optional files if they exist
[ -f "$SCRIPT_DIR/review-locations.html" ] && cp "$SCRIPT_DIR/review-locations.html" "$DEPLOY_DIR/"

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
