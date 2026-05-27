// Constants shared between client and server. Lives in a non-"use server"
// module so a client component can import { BALLER_ARCHETYPES } without
// pulling sharp / heic / fal into the bundle.

export const BALLER_ARCHETYPES = [
  {
    id: "street",
    label: "Driveway Legend",
    tagline: "Blacktop grit, chain-link glare, home-court myth.",
    accent: ["#facc15", "#ef4444"],
    costume:
      "backyard street-court jersey with a sweat-stained hoodie; chain-link fence behind; cracked asphalt half-court; golden-hour sun glinting off a beat-up basketball under their arm",
  },
  {
    id: "allstar",
    label: "Arcade All-Star",
    tagline: "Center-stage spotlight, confetti, maximum swagger.",
    accent: ["#22d3ee", "#f97316"],
    costume:
      "pristine pro home jersey with matching shorts; tip-off arena spotlight from above; packed sold-out crowd blurred behind; confetti just settling on their shoulders",
  },
  {
    id: "retro90s",
    label: "Neon Sniper",
    tagline: "Cyan-magenta arcade glow for long-range legends.",
    accent: ["#ec4899", "#22d3ee"],
    costume:
      "baggy solid-color throwback 90s jersey with above-the-knee shorts; thick terry-cloth wristbands and headband; neon arcade-glow magenta/cyan rim-lighting; soft-focus abstract crowd",
  },
  {
    id: "skywalker",
    label: "Rim Wrecker",
    tagline: "Above-the-rim chaos with cracked-backboard energy.",
    accent: ["#fb7185", "#facc15"],
    costume:
      "sleeveless tank jersey showing toned arms; mid-air dunk pose, body silhouetted against stadium lights; motion-blurred crowd; one hand gripping the rim above the frame",
  },
  {
    id: "bench",
    label: "Microwave Sixth Man",
    tagline: "Warm-up jacket, sideline smirk, instant offense.",
    accent: ["#f97316", "#84cc16"],
    costume:
      "zip-up warm-up tracksuit jacket; towel draped around neck; locker-room fluorescent lighting; cool sideline smirk like they know they're about to check in and go off",
  },
  {
    id: "wall",
    label: "Paint Protector",
    tagline: "Cold rim-light, hard stance, no easy buckets.",
    accent: ["#94a3b8", "#38bdf8"],
    costume:
      "broad-shouldered defensive stance; thick headband; navy and silver jersey palette; ball-side hand raised; gritty hardwood reflecting cold rim-light",
  },
  {
    id: "showman",
    label: "Trick-Shot Showboat",
    tagline: "Finger-spin flash, primary colors, crowd-pleaser grin.",
    accent: ["#3b82f6", "#ef4444"],
    costume:
      "red-white-and-blue star-spangled jersey (stars only, no letters or numbers); basketball spinning balanced on one finger; comedic exaggerated grin; cartoon-bright crowd in pure primary colors",
  },
  {
    id: "vintage",
    label: "Old Gym Professor",
    tagline: "Wood bleachers, short-shorts, timeless fundamentals.",
    accent: ["#f59e0b", "#78350f"],
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

const SIGNATURE_PROPS = [
  "one striped shooting sleeve",
  "chunky terry wristbands",
  "mirrored sport goggles",
  "a loose towel tucked over one shoulder",
  "finger tape on the shooting hand",
  "a scuffed lucky basketball",
  "a sweatband stack on one wrist",
  "bright high-top sneakers visible at the bottom edge",
] as const;

const COURT_DETAILS = [
  "paint-chipped backboard",
  "neon-lit arcade cabinet glow at courtside",
  "old gym scoreboard shapes with no readable text",
  "chalky free-throw line dust",
  "chain-link shadows crossing the court",
  "flashbulb crowd silhouettes",
  "polished hardwood reflections",
  "spray-paint-style abstract wall shapes with no letters",
] as const;

const FX_MOTIFS = [
  "comic-book speed streaks",
  "pixelated heat shimmer",
  "starburst impact shapes",
  "gold rim-light sparks",
  "cyan lightning edges",
  "orange backboard-glass glints",
  "halftone arcade poster texture",
  "subtle lens flare from overhead arena lights",
] as const;

const POSE_CUES = [
  "chin-up stare-down",
  "ball palmed near the shoulder",
  "three-quarter turn toward the camera",
  "leaning forward like the announcer just called their name",
  "one eyebrow raised with quiet confidence",
  "hands ready at chest height",
  "shoulders squared to the rim",
  "head tilted under a dramatic top light",
] as const;

const STATE_SUFFIX: Record<BallerState, string> = {
  neutral:
    " Confident game face, basketball tucked under one arm, waiting for tip-off, steady eyes — the pre-game stare-down.",
  victory:
    " They have just won the match, but the seed identity must dominate the image. Keep their apparent age, face, hair, body proportions, and gender presentation from the reference photo. If the reference is a baby or child, the result must still clearly look like that baby or child, not an adult athlete. Keep the face visible and recognizable; the expression can be excited but must stay rooted in the source person. Add bright yellow-orange flames, red-hot basketball glow, sparks, and golden rim-light around them without replacing them with a different player.",
  defeated:
    " The match is over and they did not win: head hung, hands on knees or hanging at their sides, breath caught, sweat-streaked, comedic exhausted dejection — visibly cooled-off, no flames, dimmer arena lighting, posture solemn but still dignified. Family-friendly, no anguish or tears.",
};

function hashPromptSeed(seed: string) {
  let hash = 2166136261;
  for (const char of seed.toLowerCase().trim()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickFrom<T>(items: readonly T[], hash: number, shift: number) {
  return items[(hash >>> shift) % items.length];
}

function buildCharacterDNA(archetype: BallerArchetype, seedKey: string) {
  const hash = hashPromptSeed(`${archetype}:${seedKey}`);
  return [
    `Use this consistent signature prop: ${pickFrom(SIGNATURE_PROPS, hash, 0)}.`,
    `Add a personal court detail: ${pickFrom(COURT_DETAILS, hash, 4)}.`,
    `Use this arcade effect motif: ${pickFrom(FX_MOTIFS, hash, 8)}.`,
    `Favor this pose language while preserving the seed face: ${pickFrom(POSE_CUES, hash, 12)}.`,
  ].join(" ");
}

/**
 * Pure prompt builder — no sharp, no heic-convert. Safe to import from
 * scripts and tests that can't pull in baller.ts.
 */
export function buildBallerPrompt(
  archetype: BallerArchetype,
  freeform: string | undefined,
  state: BallerState,
  seedKey: string = archetype
): string {
  const a = ARCHETYPE_BY_ID[archetype];
  if (!a) throw new Error(`Unknown baller archetype: ${archetype}`);
  const extra = freeform?.trim() ? ` Also: ${freeform.trim()}.` : "";
  return (
    `Use the uploaded seed image as the source of truth for the person. ` +
    `Keep this exact person — their apparent age, face shape, skin tone, hair, expression cues, body proportions, and gender presentation must stay recognizable. ` +
    `Do not replace them with a generic athlete or change a baby/child into an adult. ` +
    `Re-imagine them as a 90s-arcade-style basketball player: ${a.costume}.${extra} ` +
    `${buildCharacterDNA(archetype, seedKey)} ` +
    `This is one standalone portrait for the current emotional state only. ` +
    `Generate exactly one person, one body, one pose, and one frame. ` +
    `Do not create a contact sheet, triptych, comic panel, lineup, clone, mirror image, before-and-after comparison, or multiple alternate versions of the person. ` +
    `Keep the outfit family, palette, signature prop, and court world coherent for this character. ` +
    `Photo-realistic shoulders-up sports portrait with realistic skin texture, recognizable facial detail, natural hair, and believable fabric. ` +
    `Use bold saturated 90s arcade lighting, dramatic rim-light, and a crisp sports-poster finish, but avoid cartoon, anime, comic-book, caricature, and painterly illustration styles. ` +
    `Do not change their face or facial features. ` +
    // Hard constraint: diffusion models are notoriously bad at rendering
    // letters and digits, and garbled text is the #1 source of "this looks
    // wrong" feedback. Strip all letterforms from the output explicitly.
    `IMPORTANT: do NOT add any text, words, letters, numbers, jersey numbers, ` +
    `team names, logos, signage, scoreboards, sponsor patches, billboards, or ` +
    `readable writing of any kind anywhere in the image. Do not draw the character-card label, captions, banners, or title text. Jerseys should be ` +
    `blank or feature only abstract shapes, stripes, and stars.` +
    STATE_SUFFIX[state]
  );
}
