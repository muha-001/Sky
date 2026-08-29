/* Sky coordinate parser: offline-safe and independent of map providers. */
(function (global) {
  'use strict';

  function toDecimal(degrees, minutes, seconds, hemisphere) {
    var value = Math.abs(Number(degrees)) + (Number(minutes || 0) / 60) + (Number(seconds || 0) / 3600);
    if (String(hemisphere || '').toUpperCase() === 'S' || String(hemisphere || '').toUpperCase() === 'W') value *= -1;
    return value;
  }

  function valid(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  function parseDmsPart(part) {
    var match = String(part).trim().match(/^([+-]?\d+(?:\.\d+)?)\s*[°º]?\s*(?:(\d+(?:\.\d+)?)\s*['′]\s*)?(?:(\d+(?:\.\d+)?)\s*["″]\s*)?([NSEW])?$/i);
    if (!match) return null;
    var value = Number(match[1]);
    if (match[4]) value = toDecimal(match[1], match[2], match[3], match[4]);
    return value;
  }

  function parse(input) {
    var text = String(input || '').trim();
    if (!text) return null;

    var labeled = text.match(/lat(?:itude)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)\s*[,; ]+\s*lon(?:gitude)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)/i);
    if (labeled) {
      var labeledLat = Number(labeled[1]);
      var labeledLon = Number(labeled[2]);
      return valid(labeledLat, labeledLon) ? { lat: labeledLat, lon: labeledLon, format: 'decimal-labeled' } : null;
    }

    var parts = text.split(/\s*[,;]\s*/).filter(Boolean);
    if (parts.length === 2) {
      var first = parseDmsPart(parts[0]);
      var second = parseDmsPart(parts[1]);
      if (valid(first, second)) return { lat: first, lon: second, format: /[°º'′"″NSEW]/i.test(text) ? 'dms' : 'decimal' };
    }

    var hemispheres = text.match(/(\d+(?:\.\d+)?)[^NSEW]*([NS])[^\d]+(\d+(?:\.\d+)?)[^NSEW]*([EW])/i);
    if (hemispheres) {
      var hLat = toDecimal(hemispheres[1], 0, 0, hemispheres[2]);
      var hLon = toDecimal(hemispheres[3], 0, 0, hemispheres[4]);
      return valid(hLat, hLon) ? { lat: hLat, lon: hLon, format: 'hemisphere' } : null;
    }

    return null;
  }

  global.SkyCoordinateParser = { parse: parse };
})(window);
