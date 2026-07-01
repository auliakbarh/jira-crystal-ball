#!/usr/bin/env node
// Build an encrypted deploy env file from a plaintext source.
//
//   node scripts/build-env.mjs <env>       # e.g. production | staging
//
// Reads   server/.env.raw.<env>   (plaintext source of truth — gitignored)
// Writes  server/.env.<env>       (deploy: JIRA_API_TOKEN encrypted at rest)
//
// The plaintext JIRA_API_TOKEN line is replaced with JIRA_API_TOKEN_ENC
// (AES-256-GCM ciphertext) + a freshly generated JIRA_ENC_KEY, which the server
// decrypts at boot (see server/src/env.ts → resolveJiraToken). All other lines
// (NODE_ENV, CORS_ORIGINS, credentials, …) are copied verbatim, so set those in
// the .raw file. LOG_RETENTION_DAYS is appended if missing.
//
// Secrets are read from disk and written back to disk only — nothing is printed.
// Keep both .env.raw.* and .env.* gitignored.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = process.argv[2];
if (!env) {
  console.error("Usage: node scripts/build-env.mjs <env>   (e.g. production, staging)");
  process.exit(1);
}

const rawPath = path.join(ROOT, "server", `.env.raw.${env}`);
const outPath = path.join(ROOT, "server", `.env.${env}`);
if (!fs.existsSync(rawPath)) {
  console.error(`Missing ${rawPath}. Create it (plaintext) first.`);
  process.exit(1);
}

// AES-256-GCM — must match server/src/crypto.ts. Layout: [12B iv][16B tag][cipher], base64.
const deriveKey = (p) => crypto.createHash("sha256").update(p, "utf8").digest();
function encryptSecret(plain, passphrase) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", deriveKey(passphrase), iv);
  const e = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]).toString("base64");
}

const raw = fs.readFileSync(rawPath, "utf8");
const tokenMatch = raw.match(/^JIRA_API_TOKEN="(.*)"\s*$/m);
if (!tokenMatch) {
  console.error(`No plaintext JIRA_API_TOKEN="..." line in ${rawPath}.`);
  process.exit(1);
}
const key = crypto.randomBytes(36).toString("base64");
const enc = encryptSecret(tokenMatch[1], key);

const out = raw
  .split("\n")
  .flatMap((line) =>
    /^JIRA_API_TOKEN=/.test(line)
      ? [
          "# JIRA API token, encrypted at rest (AES-256-GCM), decrypted at boot.",
          "# Plaintext source lives in .env.raw.* (gitignored). Regenerate with this script.",
          `JIRA_API_TOKEN_ENC="${enc}"`,
          `JIRA_ENC_KEY="${key}"`,
        ]
      : [line],
  )
  .join("\n");

let res = out;
if (!/^LOG_RETENTION_DAYS=/m.test(res)) {
  res =
    res.replace(/\n*$/, "\n") +
    "\n# Log retention: purge ActivityLog / StandupLog older than N days (0 = keep forever)\n" +
    'LOG_RETENTION_DAYS="0"\n';
}
res = res.replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");

fs.writeFileSync(outPath, res);
console.log(`Wrote server/.env.${env} (JIRA token encrypted; no secrets printed).`);
