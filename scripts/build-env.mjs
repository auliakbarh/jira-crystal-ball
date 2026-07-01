#!/usr/bin/env node
// Build an encrypted deploy env file from a plaintext source, using
// server/.env.example as the canonical structure (same comments + order).
//
//   node scripts/build-env.mjs <env>       # e.g. production | staging
//
// Reads   server/.env.raw.<env>   (plaintext values — gitignored)
//         server/.env.example     (structure/comments template)
// Writes  server/.env.<env>       (deploy: JIRA_API_TOKEN blanked, encrypted pair set)
//
// Every var value is taken from the .raw file and placed into the .env.example
// layout, so the deploy file mirrors .env.example exactly. The plaintext
// JIRA_API_TOKEN is blanked and JIRA_API_TOKEN_ENC (AES-256-GCM) + a fresh
// JIRA_ENC_KEY are filled in; the server decrypts at boot (env.ts →
// resolveJiraToken). Secrets are read/written on disk only — never printed.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Parse KEY=VALUE from an env file (strips quotes + inline comments).
export function parseEnv(text) {
  const m = {};
  for (const line of text.split("\n")) {
    const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!mm) continue;
    let v = mm[2];
    const q = v.match(/^"([^"]*)"/);
    v = q ? q[1] : v.replace(/\s*#.*$/, "").trim();
    m[mm[1]] = v;
  }
  return m;
}

// Render the template, substituting values for any KEY present in `values`,
// preserving comments, order, and inline trailing comments.
export function render(template, values) {
  return template
    .split("\n")
    .map((line) => {
      const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!mm) return line;
      const key = mm[1];
      if (!(key in values)) return line;
      const rest = mm[2];
      let trailing = "";
      const q = rest.match(/^"[^"]*"(.*)$/);
      if (q) trailing = q[1];
      else {
        const c = rest.match(/(\s*#.*)$/);
        if (c) trailing = c[1];
      }
      return `${key}="${values[key]}"${trailing}`;
    })
    .join("\n");
}

const deriveKey = (p) => crypto.createHash("sha256").update(p, "utf8").digest();
function encryptSecret(plain, passphrase) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", deriveKey(passphrase), iv);
  const e = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]).toString("base64");
}

function main() {
  const env = process.argv[2];
  if (!env) {
    console.error("Usage: node scripts/build-env.mjs <env>   (e.g. production, staging)");
    process.exit(1);
  }
  const examplePath = path.join(ROOT, "server", ".env.example");
  const rawPath = path.join(ROOT, "server", `.env.raw.${env}`);
  const outPath = path.join(ROOT, "server", `.env.${env}`);
  for (const p of [examplePath, rawPath]) {
    if (!fs.existsSync(p)) {
      console.error(`Missing ${p}.`);
      process.exit(1);
    }
  }

  const template = fs.readFileSync(examplePath, "utf8");
  const values = parseEnv(fs.readFileSync(rawPath, "utf8"));

  const token = values.JIRA_API_TOKEN || "";
  if (!token) {
    console.error(`No plaintext JIRA_API_TOKEN in ${rawPath}.`);
    process.exit(1);
  }
  const key = crypto.randomBytes(36).toString("base64");
  values.JIRA_API_TOKEN = ""; // plaintext blanked in the deploy file
  values.JIRA_API_TOKEN_ENC = encryptSecret(token, key);
  values.JIRA_ENC_KEY = key;

  fs.writeFileSync(outPath, render(template, values).replace(/\n*$/, "\n"));
  console.log(`Wrote server/.env.${env} (mirrors .env.example; JIRA token encrypted; no secrets printed).`);
}

// Run only when invoked directly (so parseEnv/render can be imported).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
