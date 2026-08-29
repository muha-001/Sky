/* Device GPS controller. Positioning can work offline when the device exposes GNSS. */
(function (global) {
  'use strict';

  var watchId = null;
  var gpsMarker = null;
  var accuracyCircle = null;

  function toast(message, type) {
    if (typeof global.showToast === 'function') global.showToast(message, type);
  }

  function ensureControl() {
    if (document.getElementById('sky-gps-control')) return document.getElementById('sky-gps-control');
    var control = document.createElement('button');
    control.id = 'sky-gps-control';
    control.type = 'button';
    control.className = 'h-btn success';
    control.textContent = '📍 GPS';
    control.title = 'تشغيل أو إيقاف تتبع موقع الجهاز';
    control.setAttribute('aria-label', 'تشغيل أو إيقاف تتبع موقع الجهاز');
    control.addEventListener('click', toggle);
    var header = document.getElementById('header');
    if (header) header.appendChild(control);
    return control;
  }

  function updateStatus(position) {
    var accuracy = Math.round(position.coords.accuracy || 0);
    var label = 'GPS ±' + accuracy + 'م';
    var control = ensureControl();
    control.textContent = '📍 ' + label;
    control.dataset.accuracy = String(accuracy);
  }

  function onPosition(position) {
    if (!global.map || !global.L) return;
    var lat = position.coords.latitude;
    var lon = position.coords.longitude;
    var accuracy = position.coords.accuracy || 0;
    var point = global.L.latLng(lat, lon);
    if (!gpsMarker) {
      gpsMarker = global.L.circleMarker(point, { radius: 7, color: '#3fb950', fillColor: '#3fb950', fillOpacity: 0.85, weight: 2 }).addTo(global.map);
    } else gpsMarker.setLatLng(point);
    if (!accuracyCircle) {
      accuracyCircle = global.L.circle(point, { radius: accuracy, color: '#3fb950', fillColor: '#3fb950', fillOpacity: 0.08, weight: 1 }).addTo(global.map);
    } else { accuracyCircle.setLatLng(point); accuracyCircle.setRadius(accuracy); }
    updateStatus(position);
    if (!global.__skyGpsCentered) { global.map.setView(point, Math.max(global.map.getZoom(), 13)); global.__skyGpsCentered = true; }
  }

  function onError(error) {
    var message = error.code === 1 ? 'تم رفض إذن GPS' : error.code === 2 ? 'إشارة GPS غير متاحة' : 'انتهت مهلة GPS';
    var control = ensureControl();
    control.textContent = '📍 GPS';
    control.classList.remove('active');
    toast(message + ' — يمكن أن يعمل GPS دون إنترنت إذا كان الجهاز يدعم GNSS', 'warn');
  }

  function start() {
    if (!global.navigator.geolocation) { toast('هذا المتصفح لا يدعم GPS', true); return; }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      toast('يجب تشغيل GPS عبر HTTPS أو localhost', true);
      return;
    }
    var control = ensureControl();
    control.classList.add('active');
    watchId = global.navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    toast('تم تشغيل تتبع GPS');
  }

  function stop() {
    if (watchId !== null) global.navigator.geolocation.clearWatch(watchId);
    watchId = null;
    var control = ensureControl();
    control.classList.remove('active');
    control.textContent = '📍 GPS';
    toast('تم إيقاف تتبع GPS');
  }

  function toggle() { if (watchId === null) start(); else stop(); }

  global.SkyGps = { start: start, stop: stop, toggle: toggle };
  document.addEventListener('DOMContentLoaded', ensureControl);
})(window);
