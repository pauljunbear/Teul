import wadaCorpus from "../../../src/colors.json";
import wernerCorpus from "../../../src/wernerColors.json";

const wadaGroups = ["Reds", "Yellows", "Greens", "Blues", "Purples", "Neutrals"];
const normalizeWadaColor = (color) => ({
  ...color,
  hex: color.hex.toUpperCase(),
  group: wadaGroups[color.swatch] || "Neutrals",
  note: "Wada color-combination corpus · sRGB approximation",
});

export const wadaColors = wadaCorpus.map(normalizeWadaColor);

export function getWadaCombinations(color) {
  if (!color?.combinations) return [];
  return color.combinations.map((id) => ({
    id,
    colors: wadaCorpus.filter((candidate) => candidate.combinations.includes(id)).map(normalizeWadaColor),
  }));
}

export const wernerColors = wernerCorpus.map((color) => ({
  ...color,
  hex: color.hex.toUpperCase(),
  note: "Werner’s Nomenclature · 1821 second edition sample",
}));

export const grids = [
  { name: "Swiss Poster 6", columns: 6, gutter: 16, margin: 32, source: "Modern adaptation · Müller-Brockmann" },
  { name: "Editorial 12", columns: 12, gutter: 20, margin: 40, source: "Documented editorial adaptation" },
  { name: "Vignelli 5 × 4", columns: 5, gutter: 12, margin: 24, source: "Modern adaptation · Vignelli" },
  { name: "USWDS Desktop", columns: 12, gutter: 32, margin: 32, source: "USWDS responsive grid" },
  { name: "Material 8", columns: 8, gutter: 24, margin: 24, source: "Material responsive layout" },
  { name: "Golden Section", columns: 2, gutter: 16, margin: 32, source: "Ratio-based composition" },
];

export const colorGroups = ["All", "Reds", "Yellows", "Greens", "Blues", "Purples", "Neutrals"];

export function isDark(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 145;
}

export function rgbFor(hex) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  const r = channel(parseInt(value.slice(0, 2), 16));
  const g = channel(parseInt(value.slice(2, 4), 16));
  const b = channel(parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastBetween(first, second) {
  const one = luminance(first);
  const two = luminance(second);
  if (one === null || two === null) return null;
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

export function contrastLabel(ratio) {
  if (ratio === null) return "Check values";
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fails WCAG";
}

export function readableContrast(hex) {
  const nearBlackRatio = contrastBetween(hex, "#171717");
  const whiteRatio = contrastBetween(hex, "#FFFFFF");
  const ink = whiteRatio > nearBlackRatio ? "#FFFFFF" : "#171717";
  const ratio = Math.max(nearBlackRatio, whiteRatio);
  return { ink, ratio, label: contrastLabel(ratio) };
}
