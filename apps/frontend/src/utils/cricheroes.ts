/**
 * A CricHeroes tournament id from what an admin typed: the id itself, or a
 * CricHeroes tournament link, which carries it as `/tournament/<id>/...`.
 * Null when there is no positive whole number a browser can hold exactly,
 * the same bounds the backend enforces.
 */
export function parseCricHeroesTournamentId(input: string): number | null {
  const text = input.trim();
  const match = /^\d+$/.test(text)
    ? [text, text]
    : text.match(/\/tournament\/(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
