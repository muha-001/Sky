import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/search/coordinate-parser.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const parse = context.window.SkyCoordinateParser.parse;

assert.equal(parse('33.5138, 36.2765').lat, 33.5138);
assert.equal(parse('33.5138, 36.2765').lon, 36.2765);
assert.equal(parse('33.5138, 36.2765').format, 'decimal');
assert.equal(parse('33°30\'50"N, 36°16\'35"E').format, 'dms');
assert.equal(parse('lat 33.5138 lon 36.2765').format, 'decimal-labeled');
assert.equal(parse('-33.8688, 151.2093').lat, -33.8688);
assert.equal(parse('95, 181'), null);
console.log('coordinate parser tests passed');
