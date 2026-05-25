import { describe, expect, it } from "vitest";
import { buildBallerPrompt } from "./baller-types";

describe("buildBallerPrompt", () => {
  it("locks victory portraits to the uploaded seed identity", () => {
    const prompt = buildBallerPrompt("street", undefined, "victory");

    expect(prompt).toContain("uploaded seed image");
    expect(prompt).toContain("apparent age");
    expect(prompt).toContain("baby/child");
    expect(prompt).toContain("not an adult athlete");
    expect(prompt).toContain("without replacing them with a different player");
  });

  it("keeps the no-readable-text constraint", () => {
    const prompt = buildBallerPrompt("allstar", undefined, "neutral");

    expect(prompt).toContain("do NOT add any text");
    expect(prompt).toContain("jersey numbers");
    expect(prompt).toContain("readable writing");
  });
});
