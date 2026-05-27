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

  it("asks for photo-realistic arcade portraits instead of cartoons", () => {
    const prompt = buildBallerPrompt("showman", undefined, "neutral");

    expect(prompt).toContain("Photo-realistic");
    expect(prompt).toContain("realistic skin texture");
    expect(prompt).toContain("avoid cartoon");
    expect(prompt).not.toContain("painterly polygon-art");
  });

  it("includes shared portrait DNA without asking for a multi-image layout", () => {
    const neutral = buildBallerPrompt("retro90s", undefined, "neutral", "p1");
    const victory = buildBallerPrompt("retro90s", undefined, "victory", "p1");

    expect(neutral).toContain("one standalone portrait");
    expect(neutral).toContain("exactly one person");
    expect(neutral).toContain("contact sheet");
    expect(neutral).toContain("signature prop");
    expect(neutral).not.toContain("Character card title");
    expect(neutral).not.toContain("neutral, victory, and defeated");
    expect(victory).toContain("exactly one person");
    expect(victory).toContain("Do not draw the character-card label");
  });
});
