import { useEffect, useState } from "react";
import { normalizeImageUrl } from "@/lib/avatar";

/**
 * Tries each candidate URL in priority order, advancing to the next one on
 * image-load failure — never looping, since duplicate URLs among the
 * candidates are tried only once and the index never exceeds the list length
 * (once exhausted, `src` is null and the caller's own existing placeholder
 * takes over). Pass `resetKey` (e.g. the record's own id) so switching to a
 * different record without remounting this component — as in a Fast Search
 * carousel — restarts from the first candidate instead of carrying over a
 * previous record's failures.
 */
export function useFallbackImage(candidates: Array<string | null | undefined>, resetKey?: string | number | null) {
  const unique: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate);
    if (normalized && !unique.includes(normalized)) unique.push(normalized);
  }
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [resetKey]);
  const src = unique[index] ?? null;
  const onError = () => setIndex((i) => (i < unique.length ? i + 1 : i));
  return { src, onError };
}
