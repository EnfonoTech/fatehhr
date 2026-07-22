#!/usr/bin/env node
// Generate per-customer PWA icons from customers/logo.<slug>.png onto the
// customer accent colour, written into frontend/dist/icons/ AFTER the vite
// build (so the shared teal defaults in frontend/public/icons/ are left alone
// and other tenants are unaffected). No-op when the customer has no logo — the
// build keeps the static default icons.
//
// Outputs (served at /assets/fatehhr/spa/icons/):
//   icon-192.png, icon-512.png  — manifest icons
//   apple-touch-icon.png (180)  — iOS home-screen icon
//
// Env: CUSTOMER_SLUG, CUSTOMER_PRIMARY_COLOR
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
// sharp lives in android-capacitor/node_modules (same as generate-customer-assets.mjs)
const require = createRequire(path.join(repoRoot, "android-capacitor/package.json"));
const sharp = require("sharp");

const accent = (process.env.CUSTOMER_PRIMARY_COLOR || "#2E5D5A").toUpperCase();
const slug = (process.env.CUSTOMER_SLUG || "").trim();
const logoSrc = slug ? path.join(repoRoot, "customers", `logo.${slug}.png`) : null;
const outDir = path.join(repoRoot, "frontend", "dist", "icons");

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function icon(size, file) {
  // Logo contained at full canvas (the supplied logo is pre-safe-zoned) over an
  // opaque accent background — matches the native app icon.
  const logo = await sharp(logoSrc)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: accent } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, file));
}

async function main() {
  if (!logoSrc || !(await exists(logoSrc))) {
    console.log(`✏️  No customer logo for "${slug}" — keeping default PWA icons`);
    return;
  }
  await fs.mkdir(outDir, { recursive: true });
  await icon(192, "icon-192.png");
  await icon(512, "icon-512.png");
  await icon(180, "apple-touch-icon.png");
  console.log(`🖼️  PWA icons generated from ${path.relative(repoRoot, logoSrc)} on ${accent}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
