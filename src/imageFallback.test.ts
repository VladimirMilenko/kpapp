import { describe, expect, test } from "bun:test";
import { normalizeImageUrls } from "./imageFallback";

describe("normalizeImageUrls", () => {
  test("trims, drops empty values, and deduplicates", () => {
    expect(normalizeImageUrls([" https://cdn.example/a.jpg ", undefined, "", "https://cdn.example/a.jpg", "https://cdn.example/b.jpg"])).toEqual([
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg"
    ]);
  });
});
