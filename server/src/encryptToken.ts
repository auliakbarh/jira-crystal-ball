// CLI: encrypt a JIRA API token for at-rest storage.
//   JIRA_ENC_KEY=... npm run token:encrypt -- <plain-token>
//   JIRA_ENC_KEY=... npm run token:encrypt            (reads token from stdin)
// Prints the JIRA_API_TOKEN_ENC value to paste into your env. The key is never
// printed; keep JIRA_ENC_KEY in your platform's secrets manager.
import "dotenv/config";
import { encryptSecret } from "./crypto.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const key = process.env.JIRA_ENC_KEY;
  if (!key) {
    console.error("Set JIRA_ENC_KEY in the environment first (the passphrase used to decrypt at boot).");
    process.exit(1);
  }
  const plain = (process.argv[2] ?? (await readStdin())).trim();
  if (!plain) {
    console.error("No token provided. Pass it as an argument or pipe it via stdin.");
    process.exit(1);
  }
  const enc = encryptSecret(plain, key);
  console.log("JIRA_API_TOKEN_ENC=\"" + enc + "\"");
  console.error("Set the above in your env, remove JIRA_API_TOKEN, and keep JIRA_ENC_KEY secret.");
}

main();
