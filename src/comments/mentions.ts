export interface Mentionable {
  id: number;
  full_name: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds the people tagged as "@Full Name" in a comment.
//  - case-insensitive, any amount of spacing inside the name
//  - an email like "a@Sara.com" is NOT a mention (the @ must not be glued to a word before it)
//  - "@Sara Agentx" is not "@Sara Agent" (the name must end at a word boundary)
export function findMentionedUsers<T extends Mentionable>(body: string, candidates: T[], excludeId?: number): T[] {
  if (!body || !body.includes('@')) return [];
  const found = new Map<number, T>();
  for (const c of candidates) {
    const name = c.full_name?.trim();
    if (!name || c.id === excludeId) continue;
    const pattern = escapeRegex(name).replace(/\s+/g, '\\s+');
    const re = new RegExp(`(?<![\\p{L}\\p{N}._%+-])@${pattern}(?![\\p{L}\\p{N}_])`, 'iu');
    if (re.test(body)) found.set(c.id, c);
  }
  return [...found.values()];
}
