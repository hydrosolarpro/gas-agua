#!/usr/bin/env node
// Bloquea archivos con secretos antes de que entren al repositorio.
//   node scripts/check-secrets.mjs --staged   → solo lo que está en el commit (hook pre-commit)
//   node scripts/check-secrets.mjs --all      → todos los archivos rastreados (CI)
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const mode = process.argv.includes("--all") ? "all" : "staged";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const files = (mode === "all" ? git("ls-files") : git("diff", "--cached", "--name-only", "--diff-filter=ACMR"))
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

// Nombres de archivo que nunca deben subirse.
const FORBIDDEN_NAMES = [
  /(^|\/)\.env(\..+)?$/, // .env, .env.local, .env.production…
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)supabase\/\.temp\//,
  /(^|\/)\.vercel\//,
];
const ALLOWED_NAMES = [/(^|\/)\.env\.example$/];

// Contenido que parece una clave.
const SECRET_PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT / clave de Supabase (anon o service_role)"],
  [/sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/, "clave de Supabase (sb_secret_/sb_publishable_)"],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, "llave privada"],
  [/AKIA[0-9A-Z]{16}/, "clave de acceso de AWS"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "token de GitHub"],
  [/github_pat_[A-Za-z0-9_]{30,}/, "token de GitHub"],
  [/AIza[0-9A-Za-z_-]{35}/, "clave de API de Google"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "clave de API de Anthropic"],
  [/(SERVICE_ROLE_KEY|PIN_PEPPER|SECRET|PASSWORD)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{24,}/i, "valor secreto asignado"],
];

const problems = [];
for (const file of files) {
  if (ALLOWED_NAMES.some((re) => re.test(file))) continue;
  if (FORBIDDEN_NAMES.some((re) => re.test(file))) {
    problems.push(`${file}: archivo que no debe subirse`);
    continue;
  }
  let text;
  try {
    if (statSync(file).size > 2 * 1024 * 1024) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue; // binario
  if (file.endsWith("package-lock.json")) continue;
  for (const [re, label] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) problems.push(`${file}: parece contener ${label}`);
  }
}

if (problems.length) {
  console.error("\n✖ Se detectaron posibles secretos. Commit/CI bloqueado:\n");
  for (const p of problems) console.error("  - " + p);
  console.error("\nQuita el secreto, muévelo a .env.local (ignorado por git) y, si ya se expuso, ROTA esa clave.\n");
  process.exit(1);
}
console.log(`✔ Sin secretos (${files.length} archivos revisados, modo ${mode}).`);
