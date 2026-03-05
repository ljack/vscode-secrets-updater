// Updates an MCP input secret in VS Code's encrypted storage.
// Usage: npx electron update-secret-app --input-id my-secret --value "new-secret-value"
//
// After updating, restart the MCP server in VS Code to pick up the new value.

const { safeStorage, app } = require("electron");
const { homedir } = require("node:os");
const { join } = require("node:path");
const { execSync } = require("node:child_process");

app.setName("Code");
app.dock?.hide();

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    result[key] = args[i + 1];
  }
  return result;
}

app.on("ready", async () => {
  try {
    const args = parseArgs();
    const inputId = args["input-id"];
    const newValue = args["value"];
    const workspaceId = args["workspace"] || "b2b56e6ead00ae96b84f6a1fc95b9a59";

    if (!inputId || newValue === undefined) {
      console.log("Usage: npx electron update-secret-app --input-id <id> --value <value> [--workspace <id>]");
      app.quit();
      return;
    }

    const GLOBAL_DB = join(
      homedir(),
      "Library/Application Support/Code/User/globalStorage/state.vscdb"
    );
    const WORKSPACE_DB = join(
      homedir(),
      `Library/Application Support/Code/User/workspaceStorage/${workspaceId}/state.vscdb`
    );

    function getDbValue(dbPath, key) {
      return execSync(
        `sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = '${key}'"`,
        { encoding: "utf8" }
      ).trim();
    }

    function setDbValue(dbPath, key, value) {
      const escaped = value.replace(/'/g, "''");
      execSync(`sqlite3 "${dbPath}"`, {
        input: `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('${key}', '${escaped}');\n`,
        encoding: "utf8",
      });
    }

    // Step 1: Get the encryption key
    const encryptedKeyJson = getDbValue(GLOBAL_DB, "secret://mcpEncryptionKey");
    const parsed = JSON.parse(encryptedKeyJson);
    const jwkString = safeStorage.decryptString(Buffer.from(parsed.data));
    const jwk = JSON.parse(jwkString);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "jwk", jwk, "AES-GCM", false, ["encrypt", "decrypt"]
    );

    // Step 2: Read current mcpInputs
    const inputsRaw = getDbValue(WORKSPACE_DB, "mcpInputs");
    const inputs = JSON.parse(inputsRaw);

    // Step 3: Decrypt existing secrets (if any)
    let secrets = {};
    if (inputs.secrets) {
      const iv = Buffer.from(inputs.secrets.iv, "base64");
      const encrypted = Buffer.from(inputs.secrets.value, "base64");
      const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv }, cryptoKey, encrypted
      );
      secrets = JSON.parse(new TextDecoder().decode(decrypted));
    }

    // Step 4: Update the secret value
    const secretKey = `\${input:${inputId}}`;
    if (secrets[secretKey]) {
      console.log(`Updating existing secret: ${secretKey}`);
      console.log(`Old value: "${secrets[secretKey].value}"`);
      secrets[secretKey].value = newValue;
    } else {
      console.log(`Creating new secret: ${secretKey}`);
      secrets[secretKey] = { value: newValue };
    }
    console.log(`New value: "${newValue}"`);

    // Step 5: Re-encrypt and write back
    const toSeal = JSON.stringify(secrets);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer }, cryptoKey,
      new TextEncoder().encode(toSeal).buffer
    );

    inputs.secrets = {
      iv: Buffer.from(iv).toString("base64"),
      value: Buffer.from(new Uint8Array(encryptedData)).toString("base64"),
    };

    setDbValue(WORKSPACE_DB, "mcpInputs", JSON.stringify(inputs));
    console.log("Secret updated successfully in VS Code storage.");
    console.log("\nRestart the MCP server in VS Code to pick up the new value.");
  } catch (e) {
    console.error("Error:", e.message);
    console.error(e.stack);
  }

  app.quit();
});
