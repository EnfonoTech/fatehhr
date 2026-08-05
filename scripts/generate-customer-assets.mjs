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

// Foreground artwork, in priority order:
//   1. customers/logo.<slug>.png  — this tenant's own mark
//   2. customers/logo.default.png — the Fateh HR mark (product default)
//   3. the generated khatam glyph — last resort, if neither file is present
//
// Provide a high-res square PNG (≥512px, transparent background).
const slug = (process.env.CUSTOMER_SLUG || "").trim();
const customerLogo = slug ? path.join(repoRoot, "customers", `logo.${slug}.png`) : null;
const defaultLogo = path.join(repoRoot, "customers", "logo.default.png");
let logoSrc = null;

async function exists(p) {
  if (!p) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Returns the label to log, so a build says out loud which mark it used. */
async function resolveLogo() {
  if (await exists(customerLogo)) {
    logoSrc = customerLogo;
    return `🖼️  Using tenant logo ${path.relative(repoRoot, customerLogo)}`;
  }
  if (await exists(defaultLogo)) {
    logoSrc = defaultLogo;
    return `🖼️  No logo for "${slug || "(no slug)"}" — using default ${path.relative(repoRoot, defaultLogo)}`;
  }
  logoSrc = null;
  return "✏️  No logo files found — using generated khatam glyph";
}

// Foreground glyph for icons/splash: the resolved logo, else the generated
// khatam star. Returns sharp composite descriptors, always centered.
//
// The supplied logo must be PRE-SAFE-ZONED — the artwork sitting within the
// central ~66% of a square, transparent canvas, exactly like an Android
// adaptive-icon foreground. Both logo.default.png and logo.cooperheat.png measure
// at exactly 66.0% linear / 43.6% area, centered, which is what appicon.co and
// similar tools emit for `adaptive-foreground`. We therefore place the artwork at
// FULL canvas size (no extra shrink); shrinking a pre-padded logo again would
// leave the glyph tiny inside the launcher mask. Pair it with a matching
// CUSTOMER_PRIMARY_COLOR so the padding blends into the adaptive background.
//
// Composited previews look like a tile inset in the accent — that is correct.
// The launcher masks down to roughly the safe zone on device.
async function glyphInputs(size) {
  if (logoSrc) {
    const buf = await sharp(logoSrc)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return [{ input: buf, gravity: "center" }];
  }
  return [{ input: khatamSvg(size, ink), gravity: "center" }];
}

async function writeAdaptiveIcon(dir, size) {
  await ensureDir(dir);
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .png()
    .toFile(path.join(dir, "ic_launcher_background.png"));

  // Foreground: logo (or khatam glyph) on transparent
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(await glyphInputs(size))
    .png()
    .toFile(path.join(dir, "ic_launcher_foreground.png"));

  // Legacy combined icon (fallback for pre-Android-O launchers)
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .composite(await glyphInputs(size))
    .png()
    .toFile(path.join(dir, "ic_launcher.png"));

  // Round variant
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white" /></svg>`,
  );
  await sharp({
    create: { width: size, height: size, channels: 4, background: accent },
  })
    .composite([...(await glyphInputs(size)), { input: mask, blend: "dest-in" }])
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
    .composite(await glyphInputs(size))
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
  console.log(await resolveLogo());
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
