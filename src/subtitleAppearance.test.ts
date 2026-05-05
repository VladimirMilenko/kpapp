import { beforeEach, describe, expect, test } from "bun:test";
import {
  changeSubtitleAppearance,
  readSubtitleAppearance,
  subtitleAppearanceCssVars,
  subtitleAppearanceOptions
} from "./subtitleAppearance";
import { installLocalStorage } from "./test/localStorage";

const KEY = "kino.pub.tv.subtitle.appearance.v1";

beforeEach(() => {
  installLocalStorage();
});

describe("subtitle appearance", () => {
  test("normalizes persisted appearance values", () => {
    installLocalStorage({
      [KEY]: JSON.stringify({
        sizeStep: 20,
        positionStep: -20,
        background: "neon"
      })
    });

    expect(readSubtitleAppearance()).toEqual({
      sizeStep: 3,
      positionStep: -2,
      background: "shadow"
    });
  });

  test("applies bounded changes and CSS variables", () => {
    const current = { sizeStep: 3, positionStep: 4, background: "off" as const };

    expect(changeSubtitleAppearance(current, "size:up")).toEqual(current);
    expect(changeSubtitleAppearance(current, "background:cycle")).toEqual({
      sizeStep: 3,
      positionStep: 4,
      background: "shadow"
    });
    expect(subtitleAppearanceCssVars({ sizeStep: 1, positionStep: -1, background: "box" })).toEqual({
      "--subtitle-font-size": "3.10rem",
      "--subtitle-bottom": "13%"
    });
  });

  test("disables controls at bounds", () => {
    const options = subtitleAppearanceOptions({ sizeStep: -2, positionStep: 4, background: "shadow" });

    expect(options.find((option) => option.id === "size:down")?.enabled).toBe(false);
    expect(options.find((option) => option.id === "position:up")?.enabled).toBe(false);
    expect(options.find((option) => option.id === "background:cycle")?.enabled).toBe(true);
  });
});
