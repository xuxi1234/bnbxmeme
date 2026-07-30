import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contrastRatio } from "./theme-contrast-core.ts";

const minimumNormalTextContrast = 4.5;
const stylesheet = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const lightThemeVariables = stylesheet.match(
  /:root\[data-theme="light"\] \{([\s\S]*?)\n\}/,
)?.[1];

assert.ok(lightThemeVariables, "light-theme variables are missing");

function lightThemeColor(name) {
  const value = lightThemeVariables.match(
    new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, "i"),
  )?.[1];
  assert.ok(value, `--${name} is missing`);
  return value;
}

const lightThemePairs = {
  navigation: [
    lightThemeColor("light-navigation"),
    lightThemeColor("surface"),
  ],
  placeholder: [
    lightThemeColor("light-placeholder"),
    lightThemeColor("surface"),
  ],
  disabled: [
    lightThemeColor("light-disabled-text"),
    lightThemeColor("light-disabled-surface"),
  ],
  control: [
    lightThemeColor("text"),
    lightThemeColor("light-control-surface"),
  ],
};

test("keeps audited light-theme text at WCAG AA contrast", () => {
  for (const [surface, [foreground, background]] of Object.entries(
    lightThemePairs,
  )) {
    assert.ok(
      contrastRatio(foreground, background) >= minimumNormalTextContrast,
      `${surface} contrast fell below ${minimumNormalTextContrast}:1`,
    );
  }
});

test("captures the original low-contrast navigation regression", () => {
  assert.ok(
    contrastRatio("#cbd2c7", "#ffffff") < minimumNormalTextContrast,
  );
});

test("keeps light-theme placeholders and disabled controls opaque", () => {
  assert.match(
    stylesheet,
    /:root\[data-theme="light"\] input::placeholder,[\s\S]*?opacity: 1;/,
  );
  assert.match(
    stylesheet,
    /:root\[data-theme="light"\] \.button:disabled,[\s\S]*?opacity: 1;/,
  );
  assert.match(
    stylesheet,
    /:root\[data-theme="light"\] \.template-card\.disabled \{[\s\S]*?filter: none;[\s\S]*?opacity: 1;/,
  );
});
