// Pure helpers for the help centre, kept free of Nest/TypeORM so they unit-test cheaply.

export const MAX_TAGS = 10;
const MAX_TERMS = 8;

// "Billing, Refunds , billing" -> ["billing", "refunds"]
export function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, MAX_TAGS);
}

// Splits a search box into words worth matching on. One-letter words and
// repeats are dropped, and the list is capped so a pasted essay can't build a huge query.
export function searchTerms(q: string | undefined): string[] {
  const words = (q ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, MAX_TERMS);
}

// ILIKE treats % and _ as wildcards; a search for "50%" should mean the literal text.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// A plain-text teaser for result lists: Markdown syntax stripped, cut at a word boundary.
export function excerpt(markdown: string, max = 180): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
