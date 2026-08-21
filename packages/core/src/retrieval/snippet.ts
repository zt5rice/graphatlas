export function compactQuery(query: string): string {
  return query.replace(/\s+/g, "");
}

/**
 * Returns a window of `size` characters centered on the first occurrence of
 * the (optionally compacted) query, falling back to the start of the text.
 */
export function snippet(text: string, query: string, size = 220): string {
  const normalized = query.trim();
  const compact = compactQuery(normalized);
  const positions = [text.toLowerCase().indexOf(normalized.toLowerCase())];
  if (compact !== normalized) {
    positions.push(text.toLowerCase().indexOf(compact.toLowerCase()));
  }
  const position = positions.find((p) => p >= 0) ?? 0;
  const start = Math.max(position - 60, 0);
  return text.slice(start, start + size);
}
