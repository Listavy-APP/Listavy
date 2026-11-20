// Accessibility token checks (8f). Reads the palette from globals.css so the test follows the tokens.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `token --${name} missing`);
  return m[1];
};

function luminance(hex: string): number {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = n.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Light surfaces where muted text appears in the app.
const LIGHT_SURFACES = ["paper", "canvas", "primary-tint", "accent-tint", "success-tint", "danger-tint"];

test("muted text meets 4.5:1 on every light surface", () => {
  for (const s of LIGHT_SURFACES) {
    const r = ratio(token("muted"), token(s));
    assert.ok(r >= 4.5, `muted on ${s}: ${r.toFixed(2)}`);
  }
});

test("ink and secondary ink meet 4.5:1 on paper and canvas", () => {
  for (const fg of ["ink", "ink-2"]) for (const s of ["paper", "canvas"]) {
    assert.ok(ratio(token(fg), token(s)) >= 4.5, `${fg} on ${s}`);
  }
});

test("input borders meet 3:1 against paper and canvas (WCAG 1.4.11)", () => {
  for (const s of ["paper", "canvas"]) {
    const r = ratio(token("field-line"), token(s));
    assert.ok(r >= 3, `field-line on ${s}: ${r.toFixed(2)}`);
  }
});

test("urgent and attention badges: white text meets 4.5:1", () => {
  assert.ok(ratio("#ffffff", "#b45309") >= 4.5, "attention badge");
  assert.ok(ratio("#ffffff", "#dc2626") >= 4.5, "urgent badge");
});

console.log("a11y token tests passed");
