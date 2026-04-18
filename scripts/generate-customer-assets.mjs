#!/usr/bin/env node
// Generate per-customer Android assets from CUSTOMER_PRIMARY_COLOR:
//   - Adaptive icon foreground + background at 5 densities
//   - Round icon, splash
// Uses sharp. Called by scripts/build-customer.sh right before `cap copy`.
//
// Input env:
//   CUSTOMER_PRIMARY_COLOR  — #RRGGBB
//   CUSTOMER_BRAND_NAME     — used for splash title contrast only
//
// Output: android-capacitor/android/app/src/main/res/mipmap-*/ + drawable/splash.png

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// sharp is installed in android-capacitor/node_modules — resolve from there
const require = createRequire(path.join(repoRoot, "android-capacitor/package.json"));
const sharp = require("sharp");
const resDir = path.join(repoRoot, "android-capacitor", "android", "app", "src", "main", "res");

const accent = (process.env.CUSTOMER_PRIMARY_COLOR || "#2E5D5A").toUpperCase();

// Luminance → pick white or dark ink for the foreground glyph
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const ink = luminance(accent) > 0.6 ? "#1A1714" : "#FFFFFF";

const densities = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

// Khatam (8-point star) SVG — signature mark (§6 of visual direction doc)
function khatamSvg(size, fg) {
  const c = size / 2;
  const r = size * 0.32;
  const points = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI) / 8;
    const radius = i % 2 === 0 ? r : r * 0.55;
    return `${c + radius * Math.cos(angle)},${c + radius * Math.sin(angle)}`;
  }).join(" ");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <polygon points="${points}" fill="${fg}" stroke="${fg}" stroke-width="${size * 0.02}" stroke-linejoin="miter" />
  </svg>`);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeAdaptiveIcon(dir, size) {
  await ensureDir(dir);
  // Solid accent background
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .png()
    .toFile(path.join(dir, "ic_launcher_background.png"));

  // Foreground: khatam glyph on transparent
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: khatamSvg(size, ink) }])
    .png()
    .toFile(path.join(dir, "ic_launcher_foreground.png"));

  // Legacy combined icon (fallback for pre-Android-O launchers)
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .composite([{ input: khatamSvg(size, ink) }])
    .png()
    .toFile(path.join(dir, "ic_launcher.png"));

  // Round variant
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white" /></svg>`,
  );
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .composite([{ input: khatamSvg(size, ink) }, { input: mask, blend: "dest-in" }])
    .png()
    .toFile(path.join(dir, "ic_launcher_round.png"));
}

async function writeSplash() {
  const drawableDir = path.join(resDir, "drawable");
  await ensureDir(drawableDir);
  const size = 2732;
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .composite([{ input: khatamSvg(size, ink), gravity: "center" }])
    .png()
    .toFile(path.join(drawableDir, "splash.png"));
}

async function writeIcLauncherBackground() {
  // Overwrite Capacitor's generated values/ic_launcher_background.xml
  // so the adaptive icon uses the customer accent. colorPrimary is wired
  // via `resValue` in build.gradle, no separate colors_customer.xml needed.
  const valuesDir = path.join(resDir, "values");
  await ensureDir(valuesDir);
  await fs.writeFile(
    path.join(valuesDir, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">${accent}</color>
</resources>
`,
  );
}

async function main() {
  for (const [dir, size] of Object.entries(densities)) {
    await writeAdaptiveIcon(path.join(resDir, dir), size);
  }
  await writeSplash();
  await writeIcLauncherBackground();
  // Remove stale file from a previous version of this script if present
  try { await fs.unlink(path.join(resDir, "values", "colors_customer.xml")); } catch { /* ok */ }
  console.log(`✅ Assets generated for accent ${accent} (ink ${ink})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
