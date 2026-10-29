# GitHub / iPhone PWA handoff

- Version: PWA v1.0 / 2026-10-29
- Hosting: Static HTTPS Github Pages, independent of Windows. Can be deployed from a dedicated public repo.
- Persistence: IndexedDB per iPhone PWA origin/app. No central sync.
- Offline: Service Worker caches app shell; data is always in IndexedDB.
- Existing iPhone LAN edition: retained on feature/used-car-market-iphone branch for rollback. This PWA is a parallel deployment option.
- Data integrity: no bundled transaction records, imports marked unverified; no dealer/consumer/retail pooled medians.
- Limitations: one-device storage; backup CSV; no authorized CarSensor automatic access; no verified source validation; no sale-day inference.
- Next: user creates public dedicated repo / enables Pages, iPhone Safari smoke test, then decide whether Supabase auth/sync is necessary.