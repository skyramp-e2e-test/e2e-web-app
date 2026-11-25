#!/usr/bin/env bash
# Empties the app's items table (the app has no delete API), so a test can start from an empty Items page.
# Uses the SUT's docker compose project; set COMPOSE_PROJECT_NAME to use another.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
docker compose -p "${COMPOSE_PROJECT_NAME:-skyramp-sut}" exec -T db \
  psql -U app -d app -q -c 'TRUNCATE items RESTART IDENTITY'
