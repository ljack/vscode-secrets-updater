#!/bin/bash
set -e

# Usage: ./set-mcp-secret.sh --input-id <id> --value <value> [--workspace <workspace-hash>]
#
# Updates a VS Code MCP input secret by:
# 1. Quitting VS Code (so it saves current state)
# 2. Writing the new encrypted value to the DB
# 3. Reopening VS Code

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VSCODE_CMD="vscode"
VSCODE_APP="Visual Studio Code"

# Parse args (pass through to electron script)
ARGS=("$@")
WORKSPACE_DIR=""

# Extract workspace dir if provided, default to script dir
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--workspace-dir" ]]; then
    WORKSPACE_DIR="${ARGS[$((i+1))]}"
    # Remove these args from passthrough
    unset 'ARGS[$i]' 'ARGS[$((i+1))]'
    ARGS=("${ARGS[@]}")
    break
  fi
done
WORKSPACE_DIR="${WORKSPACE_DIR:-$SCRIPT_DIR}"

# Check required args
if ! echo "${ARGS[@]}" | grep -q -- "--input-id"; then
  echo "Usage: $0 --input-id <id> --value <value> [--workspace <hash>] [--workspace-dir <path>]"
  exit 1
fi

echo "==> Quitting VS Code..."
osascript -e "tell application \"$VSCODE_APP\" to quit" 2>/dev/null || true

# Wait for VS Code to fully exit
echo "==> Waiting for VS Code to close..."
TIMEOUT=30
WAITED=0
while pgrep -f "Visual Studio Code.app/Contents/MacOS/Electron" > /dev/null 2>&1; do
  sleep 0.5
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -ge "$((TIMEOUT * 2))" ]; then
    echo "==> Timed out waiting for VS Code to close."
    exit 1
  fi
done
echo "==> VS Code closed."

echo "==> Writing secret to DB..."
npx electron "$SCRIPT_DIR/update-secret-app" "${ARGS[@]}" 2>/dev/null | grep -v "Restart the MCP server"

echo "==> Reopening VS Code..."
$VSCODE_CMD "$WORKSPACE_DIR"

echo "==> Done. Secret updated."
