/**
 * Geographic Grid-Based Google Places Discovery Engine
 *
 * Replaces the single Nearby Search with a grid of overlapping search points,
 * enabling discovery of hundreds of places in large cities.
 */

const GOOGLE_NEARBY_URL   = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const GOOGLE_DETAILS_URL  = 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_GEOCODE_URL  = 'https://maps.googleapis.com/maps/api/geocode/json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GridPoint {
  lat: number;
  lng: number;
  /** Search radius for this cell in metres */
  cellRadiusM: number;
}

export interface NearbyPlace {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  geometry: { location: { lat: number; lng: number } };
  types?: string[];
  opening_hours?: { open_now?: boolean };
}

export interface PlaceDetails {
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: { open_now?: boolean };
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

export interface ProspectingResult {
  searchCenter: string;
  gridCells: number;
  nearbyRequests: number;
  googlePlacesFound: number;
  uniquePlaces: number;
  detailsFetched: number;
  saved: number;
  skipped: number;
  duplicates: number;
  elapsedMs: number;
}

// ── Grid parameters ───────────────────────────────────────────────────────────

/**
 * Compute grid step and cell search radius for a given total search radius.
 * Targets ~200 cells for any radius, capping cell size at sensible limits.
 *
 *   cells ≈ π × (radiusM / stepM)²
 *   → stepM = radiusM / √(200/π) ≈ radiusM / 7.96
 */
export function getGridParams(radiusKm: number): { stepM: number; cellRadiusM: number } {
  const stepM      = Math.max(400, Math.round((radiusKm * 1000) / 8));
  // Cell radius must be at least step × √2 / 2 to cover grid corners
  const cellRadiusM = Math.max(500, Math.round(stepM * 0.8));
  return { stepM, cellRadiusM };
}

// ── Haversine distance ────────────────────────────────────────────────────────

export function calculateDistanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R     = 6_371_000;
  const dLat  = ((lat2 - lat1) * Math.PI) / 180;
  const dLng  = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  return calculateDistanceM(lat1, lng1, lat2, lng2) / 1000;
}

// ── Grid generator ────────────────────────────────────────────────────────────

/**
 * Returns a flat array of grid points covering a circle of `radiusKm` km
 * centred on `(centerLat, centerLng)`.  Only points within the circle are
 * returned.
 */
export function generateGrid(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): GridPoint[] {
  const { stepM, cellRadiusM } = getGridParams(radiusKm);
  const radiusM   = radiusKm * 1000;

  // Degrees per metre at this latitude
  const mPerDegLat = 111_139;
  const mPerDegLng = 111_139 * Math.cos((centerLat * Math.PI) / 180);

  const stepLat   = stepM / mPerDegLat;
  const stepLng   = stepM / mPerDegLng;
  const stepsOut  = Math.ceil(radiusM / stepM) + 1;

  const points: GridPoint[] = [];

  for (let i = -stepsOut; i <= stepsOut; i++) {
    for (let j = -stepsOut; j <= stepsOut; j++) {
      const lat  = centerLat + i * stepLat;
      const lng  = centerLng + j * stepLng;
      if (calculateDistanceM(centerLat, centerLng, lat, lng) <= radiusM) {
        points.push({ lat, lng, cellRadiusM });
      }
    }
  }

  return points;
}

// ── Retry with exponential back-off ──────────────────────────────────────────

export async function retryGoogleRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === maxRetries) {
        console.warn(`[Prospecting] Request failed after ${maxRetries} retries:`, err?.message ?? err);
        return null;
      }
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`[Prospecting] Attempt ${attempt + 1} failed, retrying in ${delay}ms — ${err?.message ?? err}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

// ── Single Nearby Search page ─────────────────────────────────────────────────

export async function nearbySearch(
  lat: number,
  lng: number,
  radiusM: number,
  keyword: string,
  keytype: string,
  apiKey: string,
  pageToken?: string,
): Promise<{ places: NearbyPlace[]; nextPageToken: string | null }> {
  // Always include type=cafe; add keyword when present
  let url = `${GOOGLE_NEARBY_URL}?location=${lat},${lng}&radius=${radiusM}&type=${keytype}&key=${apiKey}`;
  if (keyword.trim()) url += `&keyword=${encodeURIComponent(keyword.trim())}`;
  if (pageToken)       url += `&pagetoken=${encodeURIComponent(pageToken)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nearby Search HTTP ${res.status}`);

  const data = await res.json() as any;

  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    throw new Error(`Google Places: ${data.status} — ${data.error_message ?? ''}`);
  }
  if (data.status === 'OVER_QUERY_LIMIT') {
    throw new Error('OVER_QUERY_LIMIT');
  }

  return {
    places:        data.results ?? [],
    nextPageToken: data.next_page_token ?? null,
  };
}

// ── Paginated Nearby Search for one grid cell ─────────────────────────────────

/**
 * Fetches all pages (up to 3) for a single grid cell.
 * Returns the accumulated places and how many API requests were made.
 */
export async function fetchAllNearbyPages(
  point: GridPoint,
  keyword: string,
  apiKey: string,
): Promise<{ places: NearbyPlace[]; requestCount: number }> {
  const all: NearbyPlace[] = [];
  let pageToken: string | undefined;
  let requestCount = 0;

  for (let page = 0; page < 3; page++) {
    const result = await retryGoogleRequest(() =>
      nearbySearch(point.lat, point.lng, point.cellRadiusM, keyword, apiKey, pageToken)
    );

    requestCount++;
    if (!result) break; // failed after retries — skip remaining pages

    all.push(...result.places);
    if (!result.nextPageToken) break;

    pageToken = result.nextPageToken;
    // Google requires ~2 s before the next page token becomes valid
    await new Promise(r => setTimeout(r, 2000));
  }

  return { places: all, requestCount };
}

// ── Place Details ─────────────────────────────────────────────────────────────

export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails | null> {
  return retryGoogleRequest(async () => {
    const url =
      `${GOOGLE_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}` +
      `&fields=formatted_phone_number,website,opening_hours,address_components` +
      `&key=${apiKey}`;

    const res  = await fetch(url);
    if (!res.ok) throw new Error(`Place Details HTTP ${res.status}`);
    const data = await res.json() as any;

    if (data.status === 'OVER_QUERY_LIMIT') throw new Error('OVER_QUERY_LIMIT');
    if (data.status !== 'OK') return null;

    return data.result as PlaceDetails;
  });
}

// ── Address component extraction ──────────────────────────────────────────────

export function extractAddressComponents(
  components?: PlaceDetails['address_components'],
): { city: string | null; country: string | null } {
  if (!components) return { city: null, country: null };

  let city:    string | null = null;
  let country: string | null = null;

  for (const comp of components) {
    if (comp.types.includes('locality'))                                   city    = comp.long_name;
    if (comp.types.includes('administrative_area_level_2') && !city)       city    = comp.long_name;
    if (comp.types.includes('administrative_area_level_1') && !city)       city    = comp.long_name;
    if (comp.types.includes('country'))                                    country = comp.long_name;
  }

  return { city, country };
}

// ── Prospect score ────────────────────────────────────────────────────────────

/**
 * Scoring rubric (max 100):
 *   Phone          +20
 *   Website        +15
 *   Rating ≥ 4.5   +20
 *   Rating ≥ 4.0   +10
 *   Reviews ≥ 200  +20
 *   Reviews ≥ 100  +15
 *   Currently open +10
 */
export function calculateProspectScore(
  place: NearbyPlace,
  details: PlaceDetails | null,
): number {
  let score = 0;

  if (details?.formatted_phone_number) score += 20;
  if (details?.website)                score += 15;

  const rating  = place.rating ?? 0;
  if      (rating >= 4.5) score += 20;
  else if (rating >= 4.0) score += 10;

  const reviews = place.user_ratings_total ?? 0;
  if      (reviews >= 200) score += 20;
  else if (reviews >= 100) score += 15;

  const isOpen =
    details?.opening_hours?.open_now ??
    place.opening_hours?.open_now ??
    false;
  if (isOpen) score += 10;

  return Math.min(score, 100);
}

// ── Promise pool (no external deps) ──────────────────────────────────────────

/**
 * Runs `fn` for every item in `items` with at most `limit` concurrent
 * executions.  Never throws — individual failures return `null`.
 */
export async function withConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

// ── Geocode address ───────────────────────────────────────────────────────────

export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res  = await fetch(url);
  const data = await res.json() as any;
  if (data.status !== 'OK' || !data.results?.[0]) return null;
  return data.results[0].geometry.location as { lat: number; lng: number };
}
