export interface AccentTokens {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentInk: string;
  accentRing: string;
}

export function deriveAccentTokens(hex: string): AccentTokens {
  const [r, g, b] = hexToRgb(hex);
  return {
    accent: hex.toUpperCase(),
    accentStrong: rgbToHex(mix([r, g, b], [0, 0, 0], 0.12)),
    accentSoft: rgbToHex(mix([r, g, b], [250, 247, 242], 0.88)),
    accentInk: pickContrastInk(hex),
    accentRing: `rgba(${r}, ${g}, ${b}, 0.28)`,
  };
}

export function pickContrastInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#1A1714" : "#FFFFFF";
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const normalized =
    clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(normalized, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHex(rgb: number[]): string {
  return (
    "#" +
    rgb
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function mix(a: number[], b: number[], t: number): [number, number, number] {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
}
