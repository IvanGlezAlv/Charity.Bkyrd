/**
 * Next `count` free bibs counting up from `start`, zero-padded to `width`
 * digits ("001"). A number already in use is skipped whether it was written
 * padded or not, so "7" and "007" never end up on two runners.
 */
export function planBibs(used: Iterable<string>, count: number, start: number, width: number): string[] {
  const taken = new Set<number>();
  const takenText = new Set<string>();
  for (const b of used) {
    takenText.add(b);
    if (/^\d+$/.test(b)) taken.add(Number(b));
  }
  const out: string[] = [];
  for (let n = start; out.length < count; n++) {
    const bib = String(n).padStart(width, "0");
    if (taken.has(n) || takenText.has(bib)) continue;
    out.push(bib);
  }
  return out;
}
