#!/usr/bin/env node
// Increment NATIVE_VERSION (web side) AND NATIVE_VERSION_CODE together.
// Enforces frappe-vue-pwa §5 commandment #15.
//
// Usage:
//   node scripts/bump-version.mjs            # patch bump
//   node scripts/bump-version.mjs minor      # minor
//   node scripts/bump-version.mjs major      # major
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "..", "frontend", "src", "app", "native-version.ts");
const src = await fs.readFile(target, "utf8");

const vMatch = src.match(/NATIVE_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
const cMatch = src.match(/NATIVE_VERSION_CODE\s*=\s*(\d+)/);
if (!vMatch || !cMatch) throw new Error("Cannot parse native-version.ts");

const kind = process.argv[2] ?? "patch";
let [, major, minor, patch] = vMatch.map((x) => Number(x));
if (kind === "major") { major++; minor = 0; patch = 0; }
else if (kind === "minor") { minor++; patch = 0; }
else patch++;

const nextVersion = `${major}.${minor}.${patch}`;
const nextCode = Number(cMatch[1]) + 1;

const next = src
  .replace(/NATIVE_VERSION\s*=\s*"[^"]+"/, `NATIVE_VERSION = "${nextVersion}"`)
  .replace(/NATIVE_VERSION_CODE\s*=\s*\d+/, `NATIVE_VERSION_CODE = ${nextCode}`);

await fs.writeFile(target, next, "utf8");
console.log(`→ v${nextVersion} (versionCode ${nextCode})`);
