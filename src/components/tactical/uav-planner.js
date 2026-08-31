import { calculateFlightPlan } from '../../utils/uavPhysics.js';

function byId(id) { return document.getElementById(id); }
function pointFrom(id) {
  const value = byId(id).value.trim().replace(/،/g, ',');
  const parts = value.split(',').map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) throw new Error('أدخل الإحداثيات بصيغة lat, lng');
  return { lat: parts[0], lng: parts[1] };
}
function fmt(value, digits = 1) { return Number(value).toFixed(digits); }

export function initUavPlanner() {
  const button = byId('tool-uav-planner');
  if (!button) return;
  button.addEventListener('click', () => byId('modal-uav-planner').classList.add('open'));
  byId('uav-use-marker')?.addEventListener('click', () => {
    const point = window.getMainCoordinate?.();
    if (!point) return window.showToast?.('ضع علامة على الخريطة أولاً', true);
    byId('uav-takeoff').value = `${point.lat.toFixed(7)}, ${point.lng.toFixed(7)}`;
  });
  byId('uav-use-center')?.addEventListener('click', () => {
    const map = window.map;
    if (!map) return;
    const point = map.getCenter();
    byId('uav-takeoff').value = `${point.lat.toFixed(7)}, ${point.lng.toFixed(7)}`;
  });
  byId('uav-calculate')?.addEventListener('click', () => {
    try {
      const plan = calculateFlightPlan({
        takeoff: pointFrom('uav-takeoff'), waypoint: pointFrom('uav-waypoint'),
        airspeedKmh: Number(byId('uav-speed').value), enduranceMin: Number(byId('uav-endurance').value),
        reservePercent: Number(byId('uav-reserve').value), windSpeedKmh: Number(byId('uav-wind-speed').value || 0),
        windDirectionDeg: Number(byId('uav-wind-direction').value || 0)
      });
      byId('uav-output').innerHTML = `
        <div class="uav-result-grid">
          <span>المسافة</span><strong>${fmt(plan.distanceM / 1000, 3)} كم</strong>
          <span>الاتجاه الابتدائي</span><strong>${fmt(plan.bearingDeg, 1)}°</strong>
          <span>زمن الوصول</span><strong>${fmt(plan.etaMin, 1)} دقيقة</strong>
          <span>العودة التقديرية</span><strong>${fmt(plan.returnMin, 1)} دقيقة</strong>
          <span>المدة ذهاباً وإياباً</span><strong>${fmt(plan.roundTripMin, 1)} دقيقة</strong>
          <span>المتبقي بعد الاحتياطي</span><strong class="${plan.feasible ? 'ok' : 'danger'}">${fmt(plan.remainingMin, 1)} دقيقة</strong>
        </div>
        <div class="uav-feasibility ${plan.feasible ? 'ok' : 'danger'}">${plan.feasible ? '✓ المسار ضمن مدة التحمل والاحتياطي المدخل' : '⚠ المسار يتجاوز مدة التحمل الآمنة؛ عدّل المسافة أو البيانات'}</div>`;
      if (window.map) { window.map.setView([plan.feasible ? pointFrom('uav-waypoint').lat : pointFrom('uav-takeoff').lat, plan.feasible ? pointFrom('uav-waypoint').lng : pointFrom('uav-takeoff').lng], 12); }
    } catch (error) { byId('uav-output').textContent = error.message; window.showToast?.(error.message, true); }
  });
}
