import { uniqueSuffix } from "@skyramp/skyramp";

/** The longest item name EWA-10 AC1 allows, counted in characters after trimming. */
export const ITEM_NAME_LIMIT = 60;

/**
 * An item name unique to this run, exactly `length` characters long: a short tag and a run-unique suffix, padded
 * with `fill`. The app keeps no delete route for items, so every name a test makes is unique and found by its value.
 */
export function uniqueItemName(length: number, tag = "t", fill = "a"): string {
  const head = `${tag}${uniqueSuffix()}${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9]/gi, "");
  const name = (head + fill.repeat(length)).slice(0, length);
  if (name.length !== length) throw new Error(`could not build a ${length}-character name`);
  return name;
}
