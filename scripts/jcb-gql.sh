#!/usr/bin/env bash
# Authed GraphQL probe. Logs in as the seeded admin, then runs one request.
# Usage: bash scripts/jcb-gql.sh '{"query":"{ squads { id name } }"}'
# Server must be running (npm run dev). Reads creds from server/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="http://localhost:4000/graphql"
ENVF="server/.env"
EMAIL=$(grep '^SEED_ADMIN_EMAIL' "$ENVF" | head -1 | cut -d'"' -f2)
PASS=$(grep '^SEED_ADMIN_PASSWORD' "$ENVF" | head -1 | cut -d'"' -f2)

TOKEN=$(curl -s "$URL" -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation(\$e:String!,\$p:String!){login(email:\$e,password:\$p){token}}\",\"variables\":{\"e\":\"$EMAIL\",\"p\":\"$PASS\"}}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['login']['token'])")

curl -s "$URL" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d "${1:?pass a GraphQL JSON body}" | python3 -m json.tool
