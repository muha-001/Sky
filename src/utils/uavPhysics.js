const EARTH_RADIUS_M = 6371008.8;
const toRad = value => value * Math.PI / 180;
const toDeg = value => value * 180 / Math.PI;

function validatePoint(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
    throw new Error('إحداثيات غير صالحة');
  }
}

export function geodesicDistanceMeters(a, b) {
  validatePoint(a); validatePoint(b);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function initialBearingDegrees(a, b) {
  validatePoint(a); validatePoint(b);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat); const dLng = toRad(b.lng - a.lng);
  return (toDeg(Math.atan2(Math.sin(dLng) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng))) + 360) % 360;
}

export function calculateFlightPlan({ takeoff, waypoint, airspeedKmh, enduranceMin, reservePercent = 25, windSpeedKmh = 0, windDirectionDeg = 0 }) {
  validatePoint(takeoff); validatePoint(waypoint);
  if (!Number.isFinite(airspeedKmh) || airspeedKmh <= 0) throw new Error('سرعة جوية غير صالحة');
  if (!Number.isFinite(enduranceMin) || enduranceMin <= 0) throw new Error('مدة التحمل غير صالحة');
  if (!Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent >= 90) throw new Error('هامش احتياطي غير صالح');
  const distanceM = geodesicDistanceMeters(takeoff, waypoint);
  const bearing = initialBearingDegrees(takeoff, waypoint);
  const wind = Number.isFinite(windSpeedKmh) ? Math.max(0, windSpeedKmh) : 0;
  const windDirection = Number.isFinite(windDirectionDeg) ? windDirectionDeg : 0;
  const relative = toRad(windDirection - bearing);
  const airspeedMs = airspeedKmh / 3.6;
  const windMs = wind / 3.6;
  const alongTrackWindMs = windMs * Math.cos(relative);
  const outboundGroundMs = Math.max(0.5, airspeedMs + alongTrackWindMs);
  const returnGroundMs = Math.max(0.5, airspeedMs - alongTrackWindMs);
  const outboundMin = distanceM / outboundGroundMs / 60;
  const returnMin = distanceM / returnGroundMs / 60;
  const roundTripMin = outboundMin + returnMin;
  const usableMin = enduranceMin * (1 - reservePercent / 100);
  return {
    distanceM,
    bearingDeg: bearing,
    outboundGroundKmh: outboundGroundMs * 3.6,
    returnGroundKmh: returnGroundMs * 3.6,
    etaMin: outboundMin,
    returnMin,
    roundTripMin,
    enduranceMin,
    reservePercent,
    usableMin,
    remainingMin: usableMin - roundTripMin,
    feasible: roundTripMin <= usableMin
  };
}

export default { geodesicDistanceMeters, initialBearingDegrees, calculateFlightPlan };
if (typeof window !== 'undefined') window.SkyUavPhysics = { geodesicDistanceMeters, initialBearingDegrees, calculateFlightPlan };
