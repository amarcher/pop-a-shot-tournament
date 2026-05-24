// Constants shared between client and server. Lives in a non-"use server"
// module so a client component can import { BALLER_ARCHETYPES } without
// pulling sharp / heic / fal into the bundle.

export const BALLER_ARCHETYPES = [
  {
    id: "street",
    label: "Street Baller",
    costume:
      "backyard street-court jersey + sweat-stained hoodie; chain-link fence behind; cracked asphalt half-court; golden-hour sun glinting off a beat-up basketball under their arm",
  },
  {
    id: "allstar",
    label: "All-Star Starter",
    costume:
      "pristine pro home jersey + matching shorts; tip-off arena spotlight from above; packed sold-out crowd blurred behind; confetti just settling on their shoulders",
  },
  {
    id: "retro90s",
    label: "Retro 90s Sharpshooter",
    costume:
      "baggy solid-color throwback 90s jersey + above-the-knee shorts; thick terry-cloth wristbands and headband; neon arcade-glow magenta/cyan rim-lighting; soft-focus abstract crowd",
  },
  {
    id: "skywalker",
    label: "Sky-Walking Dunker",
    costume:
      "sleeveless tank jersey showing toned arms; mid-air dunk pose, body silhouetted against stadium lights; motion-blurred crowd; one hand gripping the rim above the frame",
  },
  {
    id: "bench",
    label: "Bench Gunner",
    costume:
      "zip-up warm-up tracksuit jacket; towel draped around neck; locker-room fluorescent lighting; cool sideline smirk like they know they're about to check in and go off",
  },
  {
    id: "wall",
    label: "Defensive Brick Wall",
    costume:
      "broad-shouldered defensive stance; thick headband; navy and silver jersey palette; ball-side hand raised; gritty hardwood reflecting cold rim-light",
  },
  {
    id: "showman",
    label: "Globe-Trotting Showman",
    costume:
      "red-white-and-blue star-spangled jersey (stars only, no letters or numbers); basketball spinning balanced on one finger; comedic exaggerated grin; cartoon-bright crowd in pure primary colors",
  },
  {
    id: "vintage",
    label: "Old-School Coach Player",
    costume:
      "vintage short-shorts and tucked-in jersey; canvas Chuck Taylor sneakers; sepia and warm-amber tones; old gymnasium wood-bleacher background; tidy mustache and a no-nonsense game face",
  },
] as const;

export type BallerArchetype = (typeof BALLER_ARCHETYPES)[number]["id"];

export function isBallerArchetype(s: string): s is BallerArchetype {
  return BALLER_ARCHETYPES.some((a) => a.id === s);
}

export type BallerState = "neutral" | "victory" | "defeated";

export const BALLER_STATES: BallerState[] = ["neutral", "victory", "defeated"];

const ARCHETYPE_BY_ID = Object.fromEntries(
  BALLER_ARCHETYPES.map((a) => [a.id, a])
) as Record<BallerArchetype, (typeof BALLER_ARCHETYPES)[number]>;

const STATE_SUFFIX: Record<BallerState, string> = {
  neutral:
    " Confident game face, basketball tucked under one arm, waiting for tip-off, steady eyes — the pre-game stare-down.",
  victory:
    " They have just won the match: roaring celebration mid-shout, head thrown back, big energy — bright yellow-orange flames erupting from their shoulders and arms, basketball glowing red-hot with sparks, crowd losing it in the background, golden rim-light blazing.",
  defeated:
    " The match is over and they did not win: head hung, hands on knees or hanging at their sides, breath caught, sweat-streaked, comedic exhausted dejection — visibly cooled-off, no flames, dimmer arena lighting, posture solemn but still dignified. Family-friendly, no anguish or tears.",
};

/**
 * Pure prompt builder — no sharp, no heic-convert. Safe to import from
 * scripts and tests that can't pull in baller.ts.
 */
export function buildBallerPrompt(
  archetype: BallerArchetype,
  freeform: string | undefined,
  state: BallerState
): string {
  const a = ARCHETYPE_BY_ID[archetype];
  if (!a) throw new Error(`Unknown baller archetype: ${archetype}`);
  const extra = freeform?.trim() ? ` Also: ${freeform.trim()}.` : "";
  return (
    `Keep this exact person — their face, skin tone, hair, and expression must stay identical. ` +
    `Re-imagine them as a 90s-arcade-style basketball player: ${a.costume}.${extra} ` +
    `Shoulders-up portrait, bold saturated colors, dramatic rim-light, painterly polygon-art style. ` +
    `Do not change their face or facial features. ` +
    // Hard constraint: diffusion models are notoriously bad at rendering
    // letters and digits, and garbled text is the #1 source of "this looks
    // wrong" feedback. Strip all letterforms from the output explicitly.
    `IMPORTANT: do NOT add any text, words, letters, numbers, jersey numbers, ` +
    `team names, logos, signage, scoreboards, sponsor patches, billboards, or ` +
    `readable writing of any kind anywhere in the image. Jerseys should be ` +
    `blank or feature only abstract shapes, stripes, and stars.` +
    STATE_SUFFIX[state]
  );
}
