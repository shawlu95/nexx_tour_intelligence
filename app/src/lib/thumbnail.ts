// Small street-level thumbnails of each home, made on the phone with Apple Look
// Around (map snapshot where there's no coverage) and cached locally. They are
// never uploaded; they only help tell homes apart in lists.
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import LookAround from '../../modules/look-around';

// Sizes in points (the snapshot is rendered at the screen's scale).
// small: list rows (shown at 44–120 pt). hero: full-width photo at the top of a page.
export type ThumbVariant = 'small' | 'hero';
const SIZES: Record<ThumbVariant, { width: number; height: number }> = {
  small: { width: 240, height: 180 },
  hero: { width: 390, height: 260 },
};
const MAX_CONCURRENT = 2;

export interface Locatable {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

function thumbsDir(): Directory {
  const dir = new Directory(Paths.cache, 'thumbs');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function fileFor(p: Locatable, variant: ThumbVariant): File {
  // Coordinates are in the name so a corrected address gets a fresh image.
  const suffix = variant === 'small' ? '' : `_${variant}`;
  return new File(thumbsDir(), `${p.id}_${p.latitude!.toFixed(5)}_${p.longitude!.toFixed(5)}${suffix}.jpg`);
}

/** The cached thumbnail's URI, without generating one. */
export function cachedThumbnail(p: Locatable, variant: ThumbVariant = 'small'): string | null {
  if (!LookAround || p.latitude === null || p.longitude === null) return null;
  const f = fileFor(p, variant);
  return f.exists ? f.uri : null;
}

const inFlight = new Map<string, Promise<string | null>>();
const failed = new Set<string>(); // don't retry within this app session
const queue: (() => void)[] = [];
let active = 0;

function runLimited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      active++;
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < MAX_CONCURRENT) start();
    else queue.push(start);
  });
}

/** The thumbnail's URI, generating and caching it if needed. Null when unavailable. */
export function getThumbnail(p: Locatable, variant: ThumbVariant = 'small'): Promise<string | null> {
  const cached = cachedThumbnail(p, variant);
  if (cached) return Promise.resolve(cached);
  if (!LookAround || p.latitude === null || p.longitude === null) return Promise.resolve(null);
  const file = fileFor(p, variant);
  const { width, height } = SIZES[variant];
  const key = file.uri;
  if (failed.has(key)) return Promise.resolve(null);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const module = LookAround;
  const lat = p.latitude;
  const lng = p.longitude;
  const job = runLimited(async () => {
    try {
      const source = await module.snapshot(lat, lng, width, height, file.uri);
      if (source && file.exists) return file.uri;
    } catch {
      // fall through
    }
    failed.add(key);
    return null;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** React hook: the thumbnail URI once available. */
export function useThumbnail(p: Locatable | null | undefined, variant: ThumbVariant = 'small'): string | null {
  const id = p?.id;
  const lat = p?.latitude ?? null;
  const lng = p?.longitude ?? null;
  const initial = id ? cachedThumbnail({ id, latitude: lat, longitude: lng }, variant) : null;
  const [uri, setUri] = useState<string | null>(initial);

  useEffect(() => {
    if (!id || initial) return;
    let cancelled = false;
    getThumbnail({ id, latitude: lat, longitude: lng }, variant).then((u) => {
      if (!cancelled) setUri(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id, lat, lng, initial, variant]);

  return uri ?? initial;
}
