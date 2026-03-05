# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Programmatically updates VS Code MCP `${input:...}` secret values from outside VS Code. These secrets are stored encrypted (AES-256-GCM) in VS Code's workspace SQLite database, with the encryption key itself protected by macOS Keychain via Electron's `safeStorage` API.

## Architecture

Two-layer encryption:
1. **macOS Keychain** (Electron `safeStorage`) encrypts an AES-256-GCM JWK key → stored as `secret://mcpEncryptionKey` in global `state.vscdb`
2. **AES-256-GCM** with that JWK encrypts MCP input values → stored as `mcpInputs` in workspace `state.vscdb`

Key files:
- `update-secret.cjs` — Electron app: decrypts existing secrets, updates a value, re-encrypts, writes back to DB
- `decrypt-app/main.cjs` — Electron app: reads and decrypts secrets (debugging/inspection tool)
- `set-mcp-secret.sh` — Full workflow: quit VS Code → write secret → reopen VS Code
- `echo-server.js` — Test MCP server that logs the `MY_SECRET` env var on startup
- `update-secret-app/package.json` and `decrypt-app/package.json` — Electron app entry points (point to the `.cjs` files)

Both `.cjs` scripts must run via Electron (`npx electron <app-dir>`) because they need `safeStorage` access to the Keychain. They use `app.setName("Code")` to match VS Code's Keychain entry.

## Commands

```bash
# Update a secret (full flow: quit VS Code → write → reopen)
./set-mcp-secret.sh --input-id my-secret --value "new-value"

# Update secret in DB only (VS Code must be quit first, or value will be overwritten)
npx electron update-secret-app --input-id my-secret --value "new-value"

# Read/decrypt current secrets
npx electron decrypt-app

# Both support --workspace <hash> for non-default workspaces
npx electron decrypt-app --workspace <workspace-hash>
```

## Critical Constraints

- **VS Code keeps `mcpInputs` in memory.** Writing to the DB while VS Code is running works, but the in-memory state overwrites the DB on window reload or quit. The only reliable flow is: quit VS Code → write to DB → reopen.
- **macOS only.** DB paths are hardcoded to `~/Library/Application Support/Code/`. The encryption uses macOS Keychain via Electron's `safeStorage`.
- **Workspace-specific.** Each VS Code workspace has its own `state.vscdb`. The default workspace hash is hardcoded; pass `--workspace` to target a different one.
- The `vscode` CLI command opens VS Code in this environment (not `code`, which opens Cursor).

## DB Paths

- Global: `~/Library/Application Support/Code/User/globalStorage/state.vscdb`
- Workspace: `~/Library/Application Support/Code/User/workspaceStorage/<hash>/state.vscdb`

## VS Code Source References

- MCP input storage: `src/vs/workbench/contrib/mcp/common/mcpRegistryInputStorage.ts`
- Encryption service: `src/vs/platform/encryption/electron-main/encryptionMainService.ts`
