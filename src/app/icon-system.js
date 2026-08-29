(function (global) {
  'use strict';
  var paths = {
    draw:'M4 20l4-1 10-10-3-3L5 16l-1 4zM14 5l3 3M4 20h16',
    clear:'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7l1-3h4l1 3',
    satellite:'M4 4l16 16M6 10l4-4 8 8-4 4M4 16l4 4M16 4l4 4',
    fire:'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-3 2-4 4-4 6-1-1-3-2-3-5-3 3-5 6-5 10a6 6 0 0 0 6 5z',
    target:'M12 2v4M12 18v4M2 12h4M18 12h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    gps:'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    layers:'M3 7l9-5 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
    search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12l5 5',
    tool:'M14 6l4-4 2 2-4 4M3 21l7-7M13 5l6 6M4 4l7 7',
    download:'M12 3v12M7 10l5 5 5-5M4 21h16',
    info:'M12 8v8M12 4h.01M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0z',check:'M5 12l4 4L19 6',close:'M6 6l12 12M18 6L6 18'
  };
  var mapping = { 'btn-draw':'draw','btn-finish':'check','btn-cancel':'close','btn-clear':'clear','btn-satellite':'satellite','btn-fires':'fire','btn-jamming':'gps','btn-cluster-toggle':'layers','btn-heatmap-toggle':'layers','btn-load-quakes':'target' };
  var toolIcons = {
    'tool-buffer':'layers','tool-los':'target','tool-viewshed':'target','tool-mgrs':'gps','tool-isochrone':'tool','tool-geofence':'target','tool-import':'download','tool-timeline':'layers','tool-flights':'target','tool-ships':'target','tool-acled':'target','tool-deadground':'layers','tool-slope':'tool','tool-flood':'layers','tool-solar':'target','tool-weapons':'target','tool-saferoute':'target','tool-optop':'target','tool-chokepoints':'target','tool-celltowers':'layers','tool-radar':'target','tool-population':'layers','tool-infra':'tool','tool-powergrid':'layers','tool-mgrsgrid':'layers','tool-pluscode':'search'
  };
  function svg(name) { return '<svg class="sky-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[name]+'"/></svg>'; }
  function apply() {
    Object.keys(mapping).forEach(function (id) { var el=document.getElementById(id); if (!el) return; var label=el.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim(); el.innerHTML=svg(mapping[id])+'<span>'+label+'</span>'; });
    Object.keys(toolIcons).forEach(function (id) { var el=document.getElementById(id); if (!el) return; var tip=el.querySelector('.tool-tip'); el.innerHTML=svg(toolIcons[id]); if (tip) el.appendChild(tip); });
  }
  global.SkyIcons = { apply: apply };
  document.addEventListener('DOMContentLoaded', apply);
})(window);
