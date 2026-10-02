// Passes the home between the confirm card (tour/locate) and Change location (tour/pick).
// In memory only: it lives for one "Record a home" flow.
import type { AddressDraft } from './address';
import type { Property } from './types';

/** A home to confirm: one of the buyer's saved homes, or a street address. */
export type HomeChoice =
  | { kind: 'existing'; property: Property; meters: number | null }
  | { kind: 'new'; draft: AddressDraft; meters: number | null };

let suggested: HomeChoice | null = null;
let picked: HomeChoice | null = null;

/** The home currently on the confirm card (Change location leaves it out of the list). */
export function setSuggested(choice: HomeChoice | null) {
  suggested = choice;
}

export function getSuggested(): HomeChoice | null {
  return suggested;
}

/** Called by Change location when the buyer picks or types a home. */
export function pickHome(choice: HomeChoice) {
  picked = choice;
}

/** The home picked in Change location, once; clears it. */
export function takePicked(): HomeChoice | null {
  const p = picked;
  picked = null;
  return p;
}
