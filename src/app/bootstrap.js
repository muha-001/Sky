/* Application bootstrap: keeps offline concerns separate from feature code. */
(function (global) {
  'use strict';

  function setConnectivityStatus() {
    var id = 'sky-connectivity-status';
    var node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div');
      node.id = id;
      node.className = 'sky-connectivity-status';
      node.setAttribute('role', 'status');
      var header = document.getElementById('header');
      if (header) header.appendChild(node);
    }
    node.textContent = navigator.onLine ? 'متصل' : 'غير متصل — الوضع المحلي';
    node.classList.toggle('offline', !navigator.onLine);
  }

  function registerOfflineShell() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js').catch(function () {
      setConnectivityStatus();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setConnectivityStatus();
    registerOfflineShell();
  });
  global.addEventListener('online', setConnectivityStatus);
  global.addEventListener('offline', setConnectivityStatus);
})(window);
