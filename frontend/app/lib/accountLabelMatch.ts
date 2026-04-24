/** PRD v0.4: casefold, trim, collapse whitespace; equality or substring either way. */
export function normalizeAccountLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function strongLabelMatch(statement: string, accountLabel: string): boolean {
  const a = normalizeAccountLabel(statement);
  const b = normalizeAccountLabel(accountLabel);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}
