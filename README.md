# vscode-secrets-updater

Programmatically update VS Code MCP `${input:...}` secret values from outside VS Code.

## How it works

VS Code stores MCP input secrets encrypted (AES-256-GCM) in a per-workspace SQLite database. The encryption key is protected by macOS Keychain via Electron's `safeStorage`. This tool uses Electron to access the Keychain, decrypt/re-encrypt the secrets, and write them back.

**Required flow:** VS Code must be quit before writing — it keeps secrets in memory and overwrites the DB on save.

## Usage

```bash
npm install

# Full flow: quit VS Code → update secret → reopen
./set-mcp-secret.sh --input-id my-secret --value "new-value"

# Update DB only (quit VS Code first)
npx electron update-secret-app --input-id my-secret --value "new-value"

# Read current secrets
npx electron decrypt-app
```

Pass `--workspace <hash>` to target a specific workspace. Find workspace hashes in:
```
~/Library/Application Support/Code/User/workspaceStorage/*/workspace.json
```

## Test MCP server

The included `echo-server.js` is a minimal MCP server that logs the `MY_SECRET` env var. Configure it in `.vscode/mcp.json` with `${input:my-secret}` to verify secrets are being resolved.

## Limitations

- **macOS only** — uses Keychain via Electron's `safeStorage`
- **Requires `npx electron`** — scripts must run in Electron to access `safeStorage`
- **VS Code must be closed** during updates — in-memory state overwrites DB changes
