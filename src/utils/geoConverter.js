const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);

function assertCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid WGS-84 coordinate');
  }
}

export function toDMS(value, axis) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
  const positive = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${degrees}° ${minutes}' ${seconds}\" ${positive}`;
}

export function toUTM(lat, lng) {
  assertCoordinate(lat, lng);
  const zone = Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1));
  const centralMeridian = ((zone * 6) - 183) * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const lambda = lng * Math.PI / 180;
  const ep2 = WGS84_E2 / (1 - WGS84_E2);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = ep2 * Math.cos(phi) ** 2;
  const a = Math.cos(phi) * (lambda - centralMeridian);
  const m = WGS84_A * ((1 - WGS84_E2 / 4 - 3 * WGS84_E2 ** 2 / 64) * phi
    - (3 * WGS84_E2 / 8 + 3 * WGS84_E2 ** 2 / 32) * Math.sin(2 * phi)
    + (15 * WGS84_E2 ** 2 / 256) * Math.sin(4 * phi));
  const easting = 500000 + 0.9996 * n * (a + (1 - t + c) * a ** 3 / 6);
  const northing = (lat >= 0 ? 0 : 10000000) + 0.9996 * (m + n * Math.tan(phi) * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24));
  return { zone, hemisphere: lat >= 0 ? 'N' : 'S', easting, northing };
}

export function toGEOREF(lat, lng) {
  assertCoordinate(lat, lng);
  const lon = (lng + 180) % 360;
  const normalizedLon = lon < 0 ? lon + 360 : lon;
  const normalizedLat = lat + 90;
  const lon15 = Math.floor(normalizedLon / 15);
  const lat15 = Math.floor(normalizedLat / 15);
  const lon1 = Math.floor((normalizedLon % 15) / 1.5);
  const lat1 = Math.floor((normalizedLat % 15) / 1.5);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lonLetter = letters[lon15 % 24];
  const latLetter = letters[lat15 % 12];
  const lonSub = letters[lon1 % 10];
  const latSub = letters[lat1 % 10];
  const minutesLon = Math.floor((normalizedLon % 1.5) * 60);
  const minutesLat = Math.floor((normalizedLat % 1.5) * 60);
  return `${lonLetter}${latLetter}${lonSub}${latSub}${String(minutesLon).padStart(2, '0')}${String(minutesLat).padStart(2, '0')}`;
}

export function toGeoJSON(lat, lng) {
  assertCoordinate(lat, lng);
  return { type: 'Point', coordinates: [Number(lng.toFixed(8)), Number(lat.toFixed(8))] };
}

export function convertCoordinate(lat, lng, mgrsForward) {
  assertCoordinate(lat, lng);
  const utm = toUTM(lat, lng);
  return {
    dd: `${lat.toFixed(8)}, ${lng.toFixed(8)}`,
    dms: `${toDMS(lat, 'lat')}, ${toDMS(lng, 'lng')}`,
    mgrs: typeof mgrsForward === 'function' ? mgrsForward([lng, lat], 5) : 'MGRS unavailable',
    utm: `${utm.zone}${utm.hemisphere} E ${utm.easting.toFixed(2)} N ${utm.northing.toFixed(2)}`,
    georef: toGEOREF(lat, lng),
    geojson: JSON.stringify(toGeoJSON(lat, lng))
  };
}

export default { convertCoordinate, toDMS, toUTM, toGEOREF, toGeoJSON };

if (typeof window !== 'undefined') window.SkyGeoConverter = { convertCoordinate, toDMS, toUTM, toGEOREF, toGeoJSON };
