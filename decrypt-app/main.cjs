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
    if (args[i]?.startsWith("--")) {
      result[args[i].replace(/^--/, "")] = args[i + 1];
    }
  }
  return result;
}

app.on("ready", async () => {
  try {
    const args = parseArgs();
    const workspaceId = args["workspace"] || "b2b56e6ead00ae96b84f6a1fc95b9a59";

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

    const encryptedKeyJson = getDbValue(GLOBAL_DB, "secret://mcpEncryptionKey");
    const parsed = JSON.parse(encryptedKeyJson);
    const jwkString = safeStorage.decryptString(Buffer.from(parsed.data));
    console.log("safeStorage available:", safeStorage.isEncryptionAvailable());

    const jwk = JSON.parse(jwkString);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "jwk", jwk, "AES-GCM", false, ["encrypt", "decrypt"]
    );
    console.log("CryptoKey imported successfully");

    const inputsRaw = getDbValue(WORKSPACE_DB, "mcpInputs");
    const inputs = JSON.parse(inputsRaw);
    console.log("mcpInputs version:", inputs.version);
    console.log("Has secrets:", !!inputs.secrets);

    if (inputs.secrets) {
      const iv = Buffer.from(inputs.secrets.iv, "base64");
      const encrypted = Buffer.from(inputs.secrets.value, "base64");
      const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv }, cryptoKey, encrypted
      );
      const secretsJson = new TextDecoder().decode(decrypted);
      console.log("\n=== Decrypted MCP secrets ===");
      console.log(secretsJson);
    } else {
      console.log("No encrypted secrets found");
    }
  } catch (e) {
    console.error("Error:", e.message);
    console.error(e.stack);
  }

  app.quit();
});
