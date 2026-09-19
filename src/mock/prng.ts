/**
 * Deterministic pseudo-randomness for the mock marketplaces.
 *
 * `Math.random` would be the obvious choice and the wrong one. A mock that
 * rejects a different set of items on every run makes the sync log unreadable,
 * the screenshots wrong the next time they are taken, and the retry path of
 * milestone 6 impossible to demonstrate twice. Everything these fakes decide —
 * which items fail, which orders a page contains — is a pure function of the
 * input, so the same push produces the same failures on every machine.
 */

/** FNV-1a, 32-bit. Small, fast, and stable across processes — that is all that is needed. */
export function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type Prng = {
  float(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
};

/** A generator seeded by a string: same seed, same sequence, every time. */
export function seeded(seed: string): Prng {
  // xorshift32. A zero state is the one value that sticks, so it is stepped past.
  let state = hash32(seed) || 0x9e3779b9;

  const float = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };

  return {
    float,
    int: (min, max) => min + Math.floor(float() * (max - min + 1)),
    pick: (items) => items[Math.floor(float() * items.length)],
  };
}
