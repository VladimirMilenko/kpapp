import { describe, expect, test } from "bun:test";
import { activeCue, parseSubtitles } from "./subtitles";

describe("parseSubtitles", () => {
  test("parses SRT and WebVTT timings, strips tags, and sorts cues", () => {
    const cues = parseSubtitles(`WEBVTT

2
00:00:04,000 --> 00:00:05,500
<i>Second</i> line

1
00:00:01.000 --> 00:00:02.250 align:start
First
`);

    expect(cues).toEqual([
      { start: 1, end: 2.25, text: "First" },
      { start: 4, end: 5.5, text: "Second line" }
    ]);
  });

  test("skips cues with invalid or empty timing/text", () => {
    const cues = parseSubtitles(`00:00:02.000 --> 00:00:01.000
Backwards

not a timing line
Text

00:00:03.000 --> 00:00:04.000
`);

    expect(cues).toEqual([]);
  });
});

describe("activeCue", () => {
  test("treats cue end time as exclusive", () => {
    const cues = [
      { start: 1, end: 2, text: "First" },
      { start: 2, end: 3, text: "Second" }
    ];

    expect(activeCue(cues, 0.99)).toBe("");
    expect(activeCue(cues, 1.5)).toBe("First");
    expect(activeCue(cues, 2)).toBe("Second");
    expect(activeCue(cues, 3)).toBe("");
  });
});
