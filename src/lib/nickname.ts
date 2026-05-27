const ADJECTIVES = [
  "Backboard",
  "Baseline",
  "Buzzer Beater",
  "Corner Pocket",
  "Downtown",
  "Fastbreak",
  "Fourth Quarter",
  "Full Court",
  "Glass-Cleaning",
  "High Arc",
  "Hot Streak",
  "No-Look",
  "Overtime",
  "Poster-Making",
  "Rim Rocking",
  "Skyline",
  "Streetlight",
  "Turbo",
  "Triple Threat",
] as const;

const NOUNS = [
  "Boss",
  "Blazer",
  "Bucket",
  "Comet",
  "Dynamo",
  "Firestarter",
  "Handle",
  "Heat Check",
  "Hero",
  "Jam",
  "Launcher",
  "Menace",
  "Net Ripper",
  "Phantom",
  "Playmaker",
  "Rainmaker",
  "Showtime",
  "Sparkplug",
  "Thunder",
] as const;

function hashName(name: string) {
  let hash = 2166136261;
  for (const char of name.toLowerCase().trim()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function generateBallerNickname(name: string) {
  const hash = hashName(name);
  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adjective} ${noun}`;
}
