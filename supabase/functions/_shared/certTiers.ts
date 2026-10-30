// Certification tier matching shared by parse-resume and rescore-candidates.
// No Deno APIs or remote imports here, so the vitest suite
// (src/test/certTiers.test.ts) can import it directly.

export interface CertTier {
  tier: number;
  category: string;
  skill_upgrade: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when `phrase` occurs in `text` as whole words, not inside a longer word. */
function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(text);
}

/**
 * Find the configured tier for a certification name. Matches an exact key, a
 * key that appears in the name as whole words ("PMP" in "PMP - Project
 * Management Professional"), or a name that appears in a key as whole words.
 * Incidental substrings ("pmp" inside "NotAPMPCourse") do not match.
 */
export function findCertTier(
  certName: string,
  certTiers: Record<string, CertTier>,
): CertTier | null {
  const name = normalize(certName);
  if (!name) return null;
  if (certTiers[name]) return certTiers[name];

  for (const [rawKey, value] of Object.entries(certTiers)) {
    const key = normalize(rawKey);
    if (!key) continue;
    if (containsPhrase(name, key) || containsPhrase(key, name)) return value;
  }
  return null;
}

/**
 * Coerce stored certifications to objects with a name. Plain strings become
 * { name }, so spreading an entry never produces character-indexed keys.
 */
export function normalizeCertifications(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const certifications: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      if (entry.trim()) certifications.push({ name: entry.trim() });
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      certifications.push(entry as Record<string, unknown>);
    }
  }
  return certifications;
}
