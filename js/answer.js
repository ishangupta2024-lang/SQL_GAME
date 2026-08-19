/* =============================================================================
 * Answer normalisation + hashing.
 *
 * Answers live in cases.js as hashes rather than plain text, so a curious
 * player poking at the source doesn't get the whole mystery handed to them.
 * (It's a speed bump, not a vault — the tier-3 hint gives the query anyway.)
 *
 * Classic script, assigns to globalThis: works on file:// and under require().
 * ========================================================================== */
(function (root) {
  'use strict';

  const SALT = 'nullport::1998::cascade';

  /** Lowercase, strip punctuation and stray whitespace, keep digits + hyphens. */
  function normalise(raw) {
    return String(raw == null ? '' : raw)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')   // drop combining accents
      .replace(/[^a-z0-9\- ]+/g, '')     // keep letters, digits, hyphen, space
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** cyrb53 — fast, well-distributed, non-cryptographic. */
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ (seed || 0);
    let h2 = 0x41c6ce57 ^ (seed || 0);
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function hash(raw) {
    return cyrb53(SALT + '|' + normalise(raw), 0x4e50);
  }

  /** True if `input` matches any of the accepted hashes for a stage. */
  function matches(input, hashes) {
    const h = hash(input);
    return hashes.indexOf(h) !== -1;
  }

  root.NullportAnswer = { normalise, hash, matches };
})(typeof globalThis !== 'undefined' ? globalThis : this);
