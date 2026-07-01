// CLI: encrypt a secret (JIRA API token or Gemini key) for at-rest storage.
//   JIRA:   JIRA_ENC_KEY=... npm run token:encrypt -- <plain-token>
//   Gemini: ENC_KEY=... npm run token:encrypt -- <gemini-key> GEMINI_API_KEY_ENC
// Reads from stdin if no token arg is given. Prints the <VAR>="..." line to paste
// into your env. The passphrase is never printed; keep it in a secrets manager.
import "dotenv/config";
import { encryptSecret } from "./crypto.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  // Passphrase: ENC_KEY (generic) or the domain-specific JIRA_ENC_KEY/GEMINI_ENC_KEY.
  const key = process.env.ENC_KEY || process.env.JIRA_ENC_KEY || process.env.GEMINI_ENC_KEY;
  if (!key) {
    console.error("Set ENC_KEY (or JIRA_ENC_KEY / GEMINI_ENC_KEY) in the environment first — the passphrase used to decrypt at boot.");
    process.exit(1);
  }
  const varName = process.argv[3] ?? "JIRA_API_TOKEN_ENC"; // optional 2nd arg
  const plain = (process.argv[2] ?? (await readStdin())).trim();
  if (!plain) {
    console.error("No secret provided. Pass it as an argument or pipe it via stdin.");
    process.exit(1);
  }
  const enc = encryptSecret(plain, key);
  console.log(`${varName}="${enc}"`);
  console.error(`Set the above in your env, remove the plaintext var, and keep the passphrase secret.`);
}

main();
