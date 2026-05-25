const ADJECTIVES = [
  "Baseline",
  "Downtown",
  "Fastbreak",
  "Fourth Quarter",
  "Full Court",
  "High Arc",
  "No-Look",
  "Overtime",
  "Rim Rocking",
  "Skyline",
  "Streetlight",
  "Triple Threat",
] as const;

const NOUNS = [
  "Blazer",
  "Bucket",
  "Comet",
  "Dynamo",
  "Firestarter",
  "Heat Check",
  "Jam",
  "Launcher",
  "Net Ripper",
  "Playmaker",
  "Rainmaker",
  "Sparkplug",
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
