import { requireAdmin } from "./shared/middleware";
import { storage } from "../storage";
import { z } from "zod";
import { geocodeAddress, generateGrid, withConcurrency, fetchAllNearbyPages, fetchPlaceDetails, extractAddressComponents, calculateDistanceKm, calculateProspectScore, type NearbyPlace } from "../prospecting-engine";
import { PROSPECT_STATUSES } from "@shared/schema";
import type { Express } from "express";

export function registerProspectingRoutes(app: Express): void {
    // ── Prospecting (Admin CRM) ──────────────────────────────────────────────────

    app.get('/api/admin/prospecting/stats', requireAdmin, async (_req, res) => {
      try { res.json(await storage.getProspectStats()); }
      catch { res.status(500).json({ message: 'Error' }); }
    });

    // Merged built-in ∪ admin-added prospect types — single source of truth consumed
    // by the Type filter, Edit Details, Add Manually, and Google Places search.
    app.get('/api/admin/prospecting/types', requireAdmin, async (_req, res) => {
      try { res.json(await storage.getAllProspectTypes()); }
      catch { res.status(500).json({ message: 'Error' }); }
    });

    app.post('/api/admin/prospecting/types', requireAdmin, async (req, res) => {
      try {
        const label = z.object({ label: z.string().trim().min(1, 'Type name is required').max(60) }).parse(req.body).label;
        const created = await storage.createProspectCustomType(label);
        res.status(201).json(created);
      } catch (err: any) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
        res.status(400).json({ message: err?.message ?? 'Failed to create type' });
      }
    });

    app.get('/api/admin/prospecting', requireAdmin, async (req, res) => {
      try {
        const { search, status, prospectType, city, hasPhone, hasWebsite, hasEmail, minRating, page, limit, sortBy, sortOrder } = req.query as Record<string, string>;
        const result = await storage.getProspects({
          search, status, prospectType, city,
          hasPhone: hasPhone === 'true' ? true : hasPhone === 'false' ? false : undefined,
          hasWebsite: hasWebsite === 'true' ? true : hasWebsite === 'false' ? false : undefined,
          hasEmail: hasEmail === 'true' ? true : undefined,
          minRating: minRating ? parseFloat(minRating) : undefined,
          page: page ? parseInt(page) : 1,
          limit: limit ? Math.min(parseInt(limit), 200) : 50,
          sortBy, sortOrder,
        });
        const matches = await storage.matchProspectsToAccounts(result.prospects.map((p) => ({ id: p.id, email: p.email, phone: p.phone })));
        const prospectsWithMatch = result.prospects.map((p) => ({ ...p, accountMatch: matches.get(p.id) ?? { status: 'NONE', accounts: [] } }));
        res.json({ ...result, prospects: prospectsWithMatch });
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    app.post('/api/admin/prospecting/search', requireAdmin, async (req: any, res) => {
      const MAPS_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!MAPS_KEY) return res.status(400).json({ message: 'Google Maps API key not configured' });

      try {
        const { address, radiusKm = 5, keyword = 'coffee', keywords, keytype = 'cafe', prospectType, minRating, onlyWithPhone, onlyWithWebsite } = req.body;
        if (!address) return res.status(400).json({ message: 'address is required' });
        // Back-compat: a lone `keyword` string still works (existing single-keyword
        // behavior, untouched); `keywords` (badges, Phase 12) is an array of one or
        // more terms — each is a genuinely separate Google Places query (the API's
        // own `keyword` param is server-side, not client-filterable after the fact),
        // so this is N legitimate searches, not duplicate calls for the same one.
        const keywordList: string[] = (Array.isArray(keywords) && keywords.length > 0 ? keywords : [keyword])
          .map((k: string) => String(k).trim()).filter(Boolean);
        if (keywordList.length === 0) return res.status(400).json({ message: 'At least one search keyword is required' });

        const startMs = Date.now();
        const radiusKmNum = parseFloat(String(radiusKm));
        const minRatingNum = minRating ? parseFloat(String(minRating)) : null;

        // ── 1. Geocode address ──────────────────────────────────────────────────
        const coords = await geocodeAddress(address, MAPS_KEY);
        if (!coords) {
          return res.status(400).json({ message: 'Geocoding failed: address not found' });
        }
        const { lat, lng } = coords;

        // ── 2. Generate geographic grid ─────────────────────────────────────────
        const grid = generateGrid(lat, lng, radiusKmNum);
        console.log(`[Prospecting] Starting search — Address: "${address}", Keywords: [${keywordList.join(', ')}], Radius: ${radiusKmNum} km, Grid cells: ${grid.length}`);

        // ── 3. Concurrent Nearby Search across all grid cells × keywords ────────
        const CELL_CONCURRENCY = 8;
        let nearbyRequests = 0;
        const allPlaces: (NearbyPlace & { __foundByKeyword: string })[] = [];
        const cellKeywordTasks = grid.flatMap((point) => keywordList.map((kw) => ({ point, kw })));

        await withConcurrency(
          cellKeywordTasks,
          async ({ point, kw }) => {
            const { places, requestCount } = await fetchAllNearbyPages(point, kw, keytype, MAPS_KEY);
            nearbyRequests += requestCount;
            allPlaces.push(...places.map((p) => ({ ...p, __foundByKeyword: kw })));
          },
          CELL_CONCURRENCY,
        );

        console.log(`[Prospecting] Nearby requests: ${nearbyRequests}, Raw places found: ${allPlaces.length}`);

        // ── 4. Deduplicate by Google place_id (also collapses overlap BETWEEN
        //      different keywords — a place found by two keywords is saved once) ──
        const uniqueMap = new Map<string, NearbyPlace & { __foundByKeyword: string }>();
        for (const p of allPlaces) {
          if (!uniqueMap.has(p.place_id)) uniqueMap.set(p.place_id, p);
        }
        const uniquePlaces = Array.from(uniqueMap.values());
        console.log(`[Prospecting] Unique places after deduplication: ${uniquePlaces.length}`);

        // ── 5. Apply rating filter before detail fetching ───────────────────────
        const ratingFiltered = minRatingNum
          ? uniquePlaces.filter(p => (p.rating ?? 0) >= minRatingNum)
          : uniquePlaces;

        // ── 6. DB duplicate check (skip places already saved) ──────────────────
        const DB_CHECK_CONCURRENCY = 20;
        const dupCheckResults = await withConcurrency(
          ratingFiltered,
          async (place) => {
            const existing = await storage.findDuplicateProspect({ googlePlaceId: place.place_id });
            return existing ? null : place;
          },
          DB_CHECK_CONCURRENCY,
        );
        const toFetch    = dupCheckResults.filter((r): r is NearbyPlace & { __foundByKeyword: string } => r !== null);
        const duplicates = ratingFiltered.length - toFetch.length;
        console.log(`[Prospecting] To fetch details: ${toFetch.length} (${duplicates} DB duplicates skipped)`);

        // ── 7. Fetch Place Details with concurrency limit ───────────────────────
        const DETAIL_CONCURRENCY = 8;
        const detailResults = await withConcurrency(
          toFetch,
          async (place) => {
            const details = await fetchPlaceDetails(place.place_id, MAPS_KEY);
            return { place, details };
          },
          DETAIL_CONCURRENCY,
        );
        const detailsFetched = detailResults.filter(r => r !== null).length;
        console.log(`[Prospecting] Place details fetched: ${detailsFetched}`);

        // ── 8. Apply filters, score, and save ───────────────────────────────────
        const caller     = await storage.getUser(req.session.userId);
        const callerName = caller?.name ?? 'Admin';
        let saved = 0, skipped = 0;

        for (const item of detailResults) {
          if (!item) { skipped++; continue; }
          const { place, details } = item;

          const phone   = details?.formatted_phone_number ?? null;
          const website = details?.website ?? null;

          if (onlyWithPhone   && !phone)   { skipped++; continue; }
          if (onlyWithWebsite && !website) { skipped++; continue; }

          const { city, country } = extractAddressComponents(details?.address_components);
          const distKm = calculateDistanceKm(lat, lng, place.geometry.location.lat, place.geometry.location.lng);
          const score  = calculateProspectScore(place, details);

          await storage.createProspect({
            googlePlaceId: place.place_id,
            businessName:  place.name,
            businessType:  (place.types ?? []).join(', '),
            prospectType:  prospectType ?? null,
            address:       place.vicinity ?? null,
            latitude:      String(place.geometry.location.lat),
            longitude:     String(place.geometry.location.lng),
            phone,
            website,
            rating:        place.rating != null ? String(place.rating) : null,
            reviewCount:   place.user_ratings_total ?? 0,
            status:        'NEW',
            distanceKm:    distKm.toFixed(2),
            searchCenter:  address,
            searchCenterLat: String(lat),
            searchCenterLng: String(lng),
            searchRadius:  String(radiusKm),
            keyword:       place.__foundByKeyword,
            city:          city ?? null,
            country:       country ?? 'Tunisia',
            prospectScore: score,
            notes:    [],
            timeline: [{
              id:        Date.now().toString(),
              event:     'Created via Google Places grid search',
              detail:    `Grid search: "${place.__foundByKeyword}" (of [${keywordList.join(', ')}]) near ${address} (${radiusKmNum} km, ${grid.length} cells)`,
              createdAt: new Date().toISOString(),
              userName:  callerName,
            }],
            contacts: [],
          } as any);
          saved++;
        }

        const elapsedMs = Date.now() - startMs;

        console.log(
          `[Prospecting] Summary:\n` +
          `  Grid cells generated:          ${grid.length}\n` +
          `  Nearby requests executed:      ${nearbyRequests}\n` +
          `  Google places found:           ${allPlaces.length}\n` +
          `  Unique places after dedup:     ${uniquePlaces.length}\n` +
          `  Place details fetched:         ${detailsFetched}\n` +
          `  Prospects saved:               ${saved}\n` +
          `  Elapsed time:                  ${(elapsedMs / 1000).toFixed(1)}s`,
        );

        res.json({
          searchCenter:     `${lat},${lng}`,
          gridCells:        grid.length,
          nearbyRequests,
          googlePlacesFound: allPlaces.length,
          uniquePlaces:     uniquePlaces.length,
          detailsFetched,
          saved,
          skipped,
          duplicates,
          elapsedMs,
        } satisfies import('../prospecting-engine').ProspectingResult);

      } catch (err: any) {
        console.error('[Prospecting search]', err);
        res.status(500).json({ message: err?.message ?? 'Search failed' });
      }
    });

    app.post('/api/admin/prospecting', requireAdmin, async (req: any, res) => {
      try {
        const caller = await storage.getUser(req.session.userId);
        const data = req.body;
        if (!data.businessName) return res.status(400).json({ message: 'businessName is required' });
        const prospect = await storage.createProspect({
          ...data,
          timeline: [{
            id: Date.now().toString(),
            event: 'Prospect created manually',
            createdAt: new Date().toISOString(),
            userName: caller?.name ?? 'Admin',
          }],
        } as any);
        res.status(201).json(prospect);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    app.get('/api/admin/prospecting/export', requireAdmin, async (req, res) => {
      try {
        const result = await storage.getProspects({ limit: 10000, page: 1 });
        const headers = ['ID','Business Name','Type','Status','Phone','Website','Email','Address','City','Country','Rating','Reviews','Distance (km)','Score','Assigned To','Created At','Notes'];
        const rows = result.prospects.map(p => [
          p.id, p.businessName, p.prospectType ?? '', p.status, p.phone ?? '', p.website ?? '',
          p.email ?? '', p.address ?? '', p.city ?? '', p.country ?? '', p.rating ?? '',
          p.reviewCount ?? 0, p.distanceKm ?? '', p.prospectScore ?? 0, p.assignedTo ?? '',
          p.createdAt ? new Date(p.createdAt).toISOString() : '',
          ((p.notes as any[]) ?? []).map((n: any) => n.text).join(' | '),
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="prospects.csv"');
        res.send(csv);
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    app.get('/api/admin/prospecting/:id', requireAdmin, async (req, res) => {
      try {
        const p = await storage.getProspect(parseInt(req.params.id));
        if (!p) return res.status(404).json({ message: 'Not found' });
        const matches = await storage.matchProspectsToAccounts([{ id: p.id, email: p.email, phone: p.phone }]);
        res.json({ ...p, accountMatch: matches.get(p.id) ?? { status: 'NONE', accounts: [] } });
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    app.patch('/api/admin/prospecting/:id', requireAdmin, async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        const existing = await storage.getProspect(id);
        if (!existing) return res.status(404).json({ message: 'Not found' });
        const caller = await storage.getUser(req.session.userId);
        const data = req.body;

        if (data.status && !PROSPECT_STATUSES.includes(data.status)) {
          return res.status(400).json({ message: `Invalid status: ${data.status}` });
        }

        // Auto-append timeline event on status change
        let timeline = (existing.timeline as any[]) ?? [];
        if (data.status && data.status !== existing.status) {
          timeline = [...timeline, {
            id: Date.now().toString(),
            event: `Status changed: ${existing.status} → ${data.status}`,
            createdAt: new Date().toISOString(),
            userName: caller?.name ?? 'Admin',
          }];
          if (data.status === 'CALLED') data.lastContactDate = new Date();
        }
        if (data.assignedTo && data.assignedTo !== existing.assignedTo) {
          const assignee = await storage.getUser(Number(data.assignedTo));
          timeline = [...timeline, {
            id: (Date.now() + 1).toString(),
            event: `Assigned to ${assignee?.name ?? 'user #' + data.assignedTo}`,
            createdAt: new Date().toISOString(),
            userName: caller?.name ?? 'Admin',
          }];
        }

        // If the prospect's own coordinates change and a search center was
        // preserved from the original Google Places search, recompute distanceKm
        // from that SAME center — the search center itself is never touched here,
        // only the prospect's own location + the derived distance (Phase 13D).
        if ((data.latitude !== undefined || data.longitude !== undefined) && existing.searchCenterLat && existing.searchCenterLng) {
          const newLat = parseFloat(String(data.latitude ?? existing.latitude));
          const newLng = parseFloat(String(data.longitude ?? existing.longitude));
          const centerLat = parseFloat(existing.searchCenterLat);
          const centerLng = parseFloat(existing.searchCenterLng);
          if (!isNaN(newLat) && !isNaN(newLng) && !isNaN(centerLat) && !isNaN(centerLng)) {
            data.distanceKm = calculateDistanceKm(centerLat, centerLng, newLat, newLng).toFixed(2);
          }
        }

        // Timestamp columns (last_contact_date, next_follow_up_date) must be real
        // Date instances — drizzle-orm's timestamp mapper unconditionally calls
        // .toISOString() on whatever it's given, which throws on a plain string.
        // The follow-up tab sends nextFollowUpDate as an ISO string over JSON (Date
        // objects don't survive JSON.stringify), and this was the actual root cause
        // of both "Mark as Called" and follow-up creation silently failing — the
        // thrown TypeError was swallowed by the bare catch below with no logging.
        if (data.lastContactDate !== undefined) data.lastContactDate = data.lastContactDate ? new Date(data.lastContactDate) : null;
        if (data.nextFollowUpDate !== undefined) data.nextFollowUpDate = data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null;

        const updated = await storage.updateProspect(id, { ...data, timeline } as any);
        res.json(updated);
      } catch (err) {
        console.error('[Prospecting update]', err);
        res.status(500).json({ message: 'Failed to update prospect' });
      }
    });

    app.delete('/api/admin/prospecting/:id', requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const existing = await storage.getProspect(id);
        if (!existing) return res.status(404).json({ message: 'Not found' });
        await storage.softDeleteProspect(id);
        res.json({ ok: true });
      } catch { res.status(500).json({ message: 'Error' }); }
    });

    app.post('/api/admin/prospecting/bulk', requireAdmin, async (req: any, res) => {
      try {
        const { action, ids, data } = req.body;
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids required' });
        const caller = await storage.getUser(req.session.userId);
        if (action === 'delete') {
          await storage.bulkSoftDeleteProspects(ids);
        } else if (action === 'archive') {
          await storage.bulkUpdateProspects(ids, { status: 'ARCHIVED' } as any);
        } else if (action === 'status' && data?.status) {
          await storage.bulkUpdateProspects(ids, { status: data.status } as any);
        } else if (action === 'assign' && data?.assignedTo) {
          await storage.bulkUpdateProspects(ids, { assignedTo: data.assignedTo } as any);
        } else if (action === 'mark_called') {
          await storage.bulkUpdateProspects(ids, { status: 'CALLED', lastContactDate: new Date() } as any);
        } else {
          return res.status(400).json({ message: 'Unknown action' });
        }
        res.json({ ok: true, affected: ids.length });
      } catch { res.status(500).json({ message: 'Error' }); }
    });
}
