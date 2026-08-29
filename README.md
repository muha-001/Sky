# Sky — GEOINT Pro

Sky is a browser-based geospatial analysis interface with an Arabic right-to-left user interface. The application uses Leaflet for interactive mapping and separates the application shell, map tools, search, GPS, service integrations, storage, and offline behavior into maintainable directories.

## Development

```bash
pnpm install
pnpm dev
```

Create a production build with:

```bash
pnpm build
```

## Search

The search field accepts local country and city names in Arabic or English, decimal coordinates such as `33.5138, 36.2765`, labeled coordinates such as `lat 33.5138 lon 36.2765`, and degrees/minutes/seconds such as `33°30'50"N, 36°16'35"E`. Coordinate parsing and the bundled gazetteer do not require network access. When no local result is found, a deliberate user-submitted search may use the configured online geocoder.

The public Nominatim service must not be used for client-side autocomplete. Any production deployment using Nominatim must comply with its usage policy, including attribution, request throttling, caching, a valid application identifier, and the ability to switch providers.

## GPS and offline mode

The GPS controller uses the browser Geolocation API with high-accuracy tracking when the user grants permission. Device positioning can work without internet when the device exposes GNSS/GPS, but the browser must be served from HTTPS or localhost. GPS coordinates are independent from map tiles and place-name data.

The service worker caches the application shell and the bundled gazetteer. Live external layers such as weather, routing, aircraft, ships, events, and online map tiles remain unavailable offline unless a regional data-pack and tile-cache workflow is added. This is intentional so that stale live intelligence is not presented as current data.

## Structure

- `src/app`: startup and legacy compatibility surface.
- `src/styles`: application stylesheet.
- `src/search`: coordinate parsing and offline-first place search.
- `src/gps`: device GPS tracking and accuracy indicators.
- `src/offline`: service-worker and offline behavior.
- `public/data`: local gazetteer data.
- `tests`: focused automated tests.

## Attribution and operational notes

Review each external provider’s terms, attribution requirements, rate limits, and licensing before deploying at scale. Do not store API keys in source control or expose sensitive operational data through a public deployment.
