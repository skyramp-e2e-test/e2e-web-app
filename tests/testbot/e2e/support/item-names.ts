// Item names for the name-length tests (EWA-10). Every name starts with "tbnl" and a run-unique tag,
// so a test finds its own items by the name it sent, and .skyramp/cleanup can remove them.

/** A name of exactly `length` characters, unique to this call. */
export function uniqueItemName(length: number, fill = 'n'): string {
  const tag = `tbnl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  if (length < tag.length) throw new Error(`a unique name needs at least ${tag.length} characters`);
  return tag.padEnd(length, fill);
}

/** The name-length limit EWA-10 AC1 sets. */
export const ITEM_NAME_LIMIT = 60;
