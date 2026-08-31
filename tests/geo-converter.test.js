import assert from 'node:assert/strict';
import { convertCoordinate, toDMS, toUTM, toGEOREF, toGeoJSON } from '../src/utils/geoConverter.js';

const lat = 33.3152;
const lng = 44.3661;
const utm = toUTM(lat, lng);
assert.equal(utm.zone, 38);
assert.equal(utm.hemisphere, 'N');
assert.match(toDMS(lat, 'lat'), /N$/);
assert.match(toDMS(lng, 'lng'), /E$/);
assert.match(toGEOREF(lat, lng), /^[A-Z]{4}\d{4}$/);
assert.deepEqual(toGeoJSON(lat, lng), { type: 'Point', coordinates: [44.3661, 33.3152] });
const result = convertCoordinate(lat, lng, ([lon, latitude]) => `38SMA0000${Math.round(latitude)}${Math.round(lon)}`);
assert.match(result.utm, /^38N E \d+\.\d{2} N \d+\.\d{2}$/);
assert.match(result.dms, /N, .*E$/);
assert.ok(result.geojson.includes('44.3661'));
console.log('geo converter tests passed');
