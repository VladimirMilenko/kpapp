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

describe("subtitle cleanup", () => {
  test("strips ASS override tags and decodes entities", () => {
    const cues = parseSubtitles(`1
00:00:01,000 --> 00:00:02,000
{\\an8}{\\i1}Sign text{\\i0}\\NSecond &amp; last

2
00:00:03,000 --> 00:00:04,000
{/q8}Rock &lt;n&gt; roll&nbsp;!
`);

    expect(cues.map((cue) => cue.text)).toEqual(["Sign text\nSecond & last", "Rock <n> roll !"]);
  });

  test("shows overlapping cues together and duplicate cues once", () => {
    const cues = [
      { start: 0, end: 10, text: "Sign" },
      { start: 3, end: 4, text: "Hello" },
      { start: 3, end: 4, text: "Hello" },
      { start: 5, end: 6, text: "Later" }
    ];

    expect(activeCue(cues, 3.5)).toBe("Sign\nHello");
    expect(activeCue(cues, 5.5)).toBe("Sign\nLater");
    expect(activeCue(cues, 7)).toBe("Sign");
  });
});
