(function (global) {
  'use strict';
  var paths = {
    draw:'M4 20l4-1 10-10-3-3L5 16l-1 4zM14 5l3 3M4 20h16',
    clear:'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7l1-3h4l1 3',
    satellite:'M4 4l16 16M6 10l4-4 8 8-4 4M4 16l4 4M16 4l4 4',
    fire:'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-3 2-4 4-4 6-1-1-3-2-3-5-3 3-5 6-5 10a6 6 0 0 0 6 5z',
    radar:'M3 12a9 9 0 1 0 18 0M12 12l6-6M12 3v9h9M5 19l2-2',
    eye:'M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    gps:'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0-5-5z',
    layers:'M3 7l9-5 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
    search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12l5 5',
    route:'M4 19c4 0 4-14 8-14s4 10 8 10M4 19l3-3M4 19l4 1M20 15l-3-2M20 15l-1 3',
    walk:'M13 5a2 2 0 1 0-2-2 2 2 0 0 0 2 2zM12 7l-2 5 3 2 2 6M10 12l-4 5M13 14l5-1',
    car:'M5 16l1-5 2-3h8l2 3 1 5M4 16h16M7 18h2M15 18h2M6 13h12',
    rotate:'M5 6a9 9 0 0 1 14 3M19 9V4M19 9h-5M19 18a9 9 0 0 1-14-3M5 15v5M5 15h5',
    download:'M12 3v12M7 10l5 5 5-5M4 21h16',
    upload:'M12 15V3M7 8l5-5 5 5M4 21h16',
    timeline:'M3 17l5-5 4 3 8-9M3 20h18',
    filter:'M4 5h16l-6 7v6l-4 2v-8L4 5z',
    measure:'M4 19L19 4M7 16l-3 3 3 3M16 7l3-3 3 3M8 15l2 2M11 12l2 2M14 9l2 2',
    polygon:'M4 5l7-2 8 5-3 11-9 2-5-7z',
    warning:'M12 3l10 18H2L12 3zM12 9v5M12 18h.01',
    info:'M12 8v8M12 4h.01M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0z',
    check:'M5 12l4 4L19 6',
    close:'M6 6l12 12M18 6L6 18',
    zoomIn:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12l5 5M11 8v6M8 11h6',
    zoomOut:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12l5 5M8 11h6',
    fullscreen:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    tool:'M14 6l4-4 2 2-4 4M3 21l7-7M13 5l6 6M4 4l7 7',
    location:'M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
  };
  var mapping = { 'btn-draw':'draw','btn-finish':'check','btn-cancel':'close','btn-clear':'clear','btn-satellite':'satellite','btn-fires':'fire','btn-jamming':'radar','btn-cluster-toggle':'layers','btn-heatmap-toggle':'layers','btn-load-quakes':'warning' };
  var toolIcons = {
    'tool-buffer':'layers','tool-los':'eye','tool-viewshed':'radar','tool-mgrs':'gps','tool-isochrone':'timeline','tool-geofence':'warning','tool-import':'upload','tool-timeline':'timeline','tool-flights':'satellite','tool-ships':'route','tool-acled':'warning','tool-deadground':'layers','tool-slope':'measure','tool-flood':'route','tool-solar':'eye','tool-weapons':'measure','tool-saferoute':'route','tool-optop':'eye','tool-chokepoints':'polygon','tool-celltowers':'radar','tool-radar':'radar','tool-population':'layers','tool-infra':'polygon','tool-powergrid':'route','tool-mgrsgrid':'layers','tool-pluscode':'location','tool-uav-planner':'satellite'
  };
  var category = { surveillance:['tool-flights','tool-radar','tool-viewshed','tool-los'], mobility:['tool-saferoute','tool-ships'], analysis:['tool-buffer','tool-mgrs','tool-slope','tool-mgrsgrid'], warning:['tool-geofence','tool-acled','tool-deadground'], data:['tool-population','tool-infra','tool-powergrid'] };
  function svg(name) { return '<svg class="sky-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="'+(paths[name]||paths.tool)+'"/></svg>'; }
  function apply() {
    Object.keys(mapping).forEach(function (id) { var el=document.getElementById(id); if (!el) return; var label=el.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim(); el.innerHTML=svg(mapping[id])+'<span>'+label+'</span>'; });
    Object.keys(toolIcons).forEach(function (id) { var el=document.getElementById(id); if (!el) return; var tip=el.querySelector('.tool-tip'); el.innerHTML=svg(toolIcons[id]); if (tip) el.appendChild(tip); });
    Object.keys(category).forEach(function (group) { category[group].forEach(function(id){var el=document.getElementById(id);if(el)el.dataset.iconCategory=group;}); });
  }
  global.SkyIcons = { apply: apply, svg: svg };
  document.addEventListener('DOMContentLoaded', apply);
})(window);
