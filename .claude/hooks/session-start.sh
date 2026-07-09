#!/bin/bash
set -euo pipefail

# Install dependencies and build the TypeScript server so that
# dist/index.js exists for the newsdata MCP server (dist/ is gitignored).
cd "$CLAUDE_PROJECT_DIR"

npm install
npm run build
