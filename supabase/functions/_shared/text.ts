// Model text sometimes arrives with JSON escapes left in it as literal characters
// ("Got it — I'll…", "line one\nline two"). Decode them before saving. No runtime imports.

/** Decodes leftover \uXXXX (including surrogate pairs), \n, \t, \" and \\ escapes. */
export function plainText(s: string): string {
  if (!s.includes('\\')) return s;
  return s
    .replace(/\\u([0-9a-fA-F]{4})(?:\\u([0-9a-fA-F]{4}))?/g, (_, a: string, b?: string) =>
      String.fromCharCode(parseInt(a, 16)) + (b ? String.fromCharCode(parseInt(b, 16)) : ''),
    )
    .replace(/\\([ntr"\\/])/g, (_, c: string) => ({ n: '\n', t: '\t', r: '' })[c] ?? c);
}
