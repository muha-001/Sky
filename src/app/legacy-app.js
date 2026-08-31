'use strict';
/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & GLOBALS
═══════════════════════════════════════════════════════════════════ */
import { convertCoordinate } from '../utils/geoConverter.js';

var R_EARTH=6371000, K_REFRACT=0.13;
var ZONE_COLORS=['#e63946','#00d4ff','#ffc947','#2ea043','#ff9800','#9c27b0','#00e5ff','#ff5722','#4fc3f7','#a3e635'];
var CLOSE_DIST_M=22;

var map, streetTile, satelliteTile, labelsLayer, isSatellite=false;
var mainMarker=null, drawMode=false, drawPoints=[], drawLine=null, drawDots=[];
var zones=[], zoneSeq=0, modalIdx=null, editIdx=null;
var timelineRecording=false, timelinePoints=[], timelineMarker=null, timelineInterval=null, timelinePolyline=null;
var losPoints=[], losMarkers=[], losLine=null;
var flightAutoInterval=null, mgrsGridActive=false;

// Layer groups
var bufferLayer, viewshedLayer, isochroneLayer, quakeLayer, importedLayer;
var clusterGroup, heatmapLayer=null;
var flightLayer, shipLayer, acledLayer;
var deadGroundLayer, slopeLayer, floodLayer, solarLayer;
var weaponLayer, safeRouteLayer, opLayer, chokeLayer;
var cellLayer, radarLayer;
var infraLayer, powerLayer, mgrsGridLayer;
var seamapTile=null, popTile=null, fireTile=null, jammingTile=null;

/* ════ OLC (Plus Codes) — full client-side implementation ════ */
var OLC=(function(){
  var C='23456789CFGHJMPQRVWX', R=[20,1,0.05,0.0025,0.000125];
  function encode(lat,lng,len){
    len=len||10; lat=Math.min(89.9999,Math.max(-89.9999,lat));
    var lo=((lng+180)%360+360)%360, la=lat+90, code='';
    for(var i=0;i<5;i++){
      var li=Math.min(19,Math.floor(la/R[i])), loi=Math.min(19,Math.floor(lo/R[i]));
      code+=C[li]+C[loi]; la-=li*R[i]; lo-=loi*R[i];
    }
    return code.slice(0,8)+'+'+code.slice(8,Math.max(8,len));
  }
  function decode(code){
    var s=code.toUpperCase().replace('+',''); while(s.length<10)s+='2';
    var la=0,lo=0;
    for(var i=0;i<5;i++){la+=Math.max(0,C.indexOf(s[i*2]||'2'))*R[i]; lo+=Math.max(0,C.indexOf(s[i*2+1]||'2'))*R[i];}
    return {lat:la-90,lng:lo-180};
  }
  return {encode:encode,decode:decode};
})();

/* ════ INIT MAP ════ */
function initMap(){
  map=L.map('map',{center:[33.3152,44.3661],zoom:7,zoomControl:true,preferCanvas:true});

  streetTile=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:22}).addTo(map);
  satelliteTile=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'© Esri/Maxar',maxZoom:22});
  labelsLayer=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:22,attribution:''});

  bufferLayer=L.featureGroup().addTo(map); viewshedLayer=L.featureGroup().addTo(map);
  isochroneLayer=L.featureGroup().addTo(map); quakeLayer=L.featureGroup().addTo(map);
  importedLayer=L.featureGroup().addTo(map); clusterGroup=L.markerClusterGroup({chunkedLoading:true});
  flightLayer=L.featureGroup().addTo(map); shipLayer=L.featureGroup().addTo(map);
  acledLayer=L.featureGroup().addTo(map); deadGroundLayer=L.featureGroup().addTo(map);
  slopeLayer=L.featureGroup().addTo(map); floodLayer=L.featureGroup().addTo(map);
  solarLayer=L.featureGroup().addTo(map); weaponLayer=L.featureGroup().addTo(map);
  safeRouteLayer=L.featureGroup().addTo(map); opLayer=L.featureGroup().addTo(map);
  chokeLayer=L.featureGroup().addTo(map); cellLayer=L.featureGroup().addTo(map);
  radarLayer=L.featureGroup().addTo(map); infraLayer=L.featureGroup().addTo(map);
  powerLayer=L.featureGroup().addTo(map); mgrsGridLayer=L.featureGroup().addTo(map);

  map.on('click',function(e){
    if(drawMode) addDrawPoint(e);
    else if(document.getElementById('modal-los').classList.contains('open')) addLOSPoint(e);
    else if(timelineRecording) addTimelinePoint(e);
    else placeMainMarker(e.latlng);
  });
  map.on('mousemove',function(e){ document.getElementById('cursor-info').textContent=e.latlng.lat.toFixed(7)+',  '+e.latlng.lng.toFixed(7); });
  map.on('moveend',function(){ if(mgrsGridActive) drawMGRSGrid(); });
  map.on('zoomend',function(){ if(mgrsGridActive) drawMGRSGrid(); });

  // Set today for solar date
  var d=new Date(); document.getElementById('solar-date').value=d.toISOString().split('T')[0];
  // Set ACLED date range (last 30 days)
  var from=new Date(d-30*864e5); document.getElementById('acled-to').value=d.toISOString().split('T')[0]; document.getElementById('acled-from').value=from.toISOString().split('T')[0];
}

/* ════ SATELLITE ════ */
document.getElementById('btn-satellite').addEventListener('click',function(){
  isSatellite=!isSatellite;
  if(isSatellite){map.removeLayer(streetTile);satelliteTile.addTo(map);labelsLayer.addTo(map);this.textContent='🗺️ شارع';this.classList.add('active');}
  else{map.removeLayer(satelliteTile);map.removeLayer(labelsLayer);streetTile.addTo(map);this.textContent='🛰️ قمر صناعي';this.classList.remove('active');}
});

/* ════ FIRES — NASA GIBS ════ */
document.getElementById('btn-fires').addEventListener('click',function(){
  if(fireTile&&map.hasLayer(fireTile)){map.removeLayer(fireTile);fireTile=null;this.textContent='🔥 حرائق';this.classList.remove('fire-active');showToast('تم إخفاء طبقة الحرائق');return;}
  var today=new Date().toISOString().split('T')[0];
  fireTile=L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Thermal_Anomalies_375m_Night/default/'+today+'/GoogleMapsCompatible/{z}/{y}/{x}.png',{attribution:'© NASA FIRMS/GIBS',opacity:0.85,maxZoom:14});
  fireTile.addTo(map); this.textContent='🔥 حرائق (ON)'; this.classList.add('fire-active');
  showToast('🔥 طبقة الحرائق الحية (NASA FIRMS — VIIRS SNPP)');
});

/* ════ GPS JAMMING ════ */
document.getElementById('btn-jamming').addEventListener('click',function(){
  if(jammingTile&&map.hasLayer(jammingTile)){map.removeLayer(jammingTile);jammingTile=null;this.textContent='📡 تشويش GPS';this.classList.remove('jam-active');showToast('تم إخفاء طبقة التشويش');return;}
  // GPSJam.org tile layer
  jammingTile=L.tileLayer('https://tiles.gpsjam.org/{z}/{x}/{y}.png',{attribution:'© GPSJam.org',opacity:0.7,maxZoom:9,maxNativeZoom:8});
  jammingTile.on('tileerror',function(){
    if(!this._fallbackDone){this._fallbackDone=true;showToast('⚠ تعذّر تحميل tiles GPSJam — جرّب gpsjam.org مباشرةً','warn');}
  });
  jammingTile.addTo(map); this.textContent='📡 تشويش (ON)'; this.classList.add('jam-active');
  showToast('📡 طبقة تشويش GPS (gpsjam.org)');
});

/* ════ MAIN MARKER & COORD ════ */
function placeMainMarker(latlng){
  if(mainMarker)map.removeLayer(mainMarker);
  var icon=L.divIcon({className:'',html:'<div style="width:22px;height:22px;background:radial-gradient(circle at 35% 35%,#88ccff,#1f6feb);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 10px rgba(56,139,253,.65);cursor:grab;"></div>',iconSize:[22,22],iconAnchor:[11,11]});
  mainMarker=L.marker(latlng,{draggable:true,icon:icon}).addTo(map);
  setCoordPanel(latlng);
  mainMarker.on('drag',function(ev){setCoordPanel(ev.target.getLatLng());});
  mainMarker.on('dragend',function(ev){setCoordPanel(ev.target.getLatLng());});
}
function setCoordPanel(latlng,name){
  document.getElementById('c-lat').textContent=latlng.lat.toFixed(7);
  document.getElementById('c-lng').textContent=latlng.lng.toFixed(7);
  document.getElementById('place-name').textContent=name?'📌 '+name:'';
}
document.getElementById('copy-coord-btn').addEventListener('click',function(){
  var lat=document.getElementById('c-lat').textContent.trim(), lng=document.getElementById('c-lng').textContent.trim();
  if(lat==='-- ------'||!lat||isNaN(parseFloat(lat))){showToast('لم يتم تحديد نقطة بعد!',true);return;}
  copyText(lat+', '+lng,'✓ تم نسخ: '+lat+', '+lng);
});
document.getElementById('btn-clear').addEventListener('click',function(){
  if(mainMarker){map.removeLayer(mainMarker);mainMarker=null;}
  zones.forEach(function(zone){if(zone.layer)map.removeLayer(zone.layer);stopEdit(zones.indexOf(zone));});
  zones=[]; editIdx=null; modalIdx=null; zoneSeq=0; clearDraw(); stopDraw(); renderZones(); closeModal();
  document.getElementById('c-lat').textContent='-- ------'; document.getElementById('c-lng').textContent='-- ------'; document.getElementById('place-name').textContent='';
  showToast('تم مسح العلامة والمناطق والرسم الحالي');
});

/* ════ SEARCH ════ */
var srTimer=null;
document.getElementById('search-input').addEventListener('keyup',function(e){
  clearTimeout(srTimer); var q=this.value.trim();
  if(e.key==='Escape'){hideSR();return;} if(e.key==='Enter'){doSearch(q);return;}
  if(q.length<2){hideSR();return;} srTimer=setTimeout(function(){doSearch(q);},430);
});
function parseCoords(txt){
  var parsed=window.SkyCoordinateParser&&window.SkyCoordinateParser.parse(txt.replace(/،/g,','));
  return parsed?{lat:parsed.lat,lng:parsed.lon,format:parsed.format}:null;
}
var localGazetteer=null;
async function loadLocalGazetteer(){
  if(localGazetteer)return localGazetteer;
  try{var response=await fetch('public/data/gazetteer.json');localGazetteer=await response.json();return localGazetteer;}
  catch(e){return {entries:[]};}
}
function localSearch(query,entries){
  var needle=query.trim().toLocaleLowerCase();
  return (entries||[]).filter(function(item){
    return [item.name].concat(item.aliases||[]).some(function(value){return String(value).toLocaleLowerCase().indexOf(needle)!==-1;});
  }).slice(0,8);
}
function renderSearchResult(box,label,lat,lon){
  var div=document.createElement('div'); div.className='sr-item'; div.textContent=label;
  div.addEventListener('click',function(){var ll=L.latLng(lat,lon);map.setView(ll,14);placeMainMarker(ll);setCoordPanel(ll,label);hideSR();document.getElementById('search-input').value='';});
  box.appendChild(div);
}
async function doSearch(q){
  if(!q||q.length<2)return;
  var box=document.getElementById('search-results');
  var coords=parseCoords(q);
  if(coords){
    box.innerHTML=''; var d=document.createElement('div'); d.className='sr-item sr-coord';
    d.textContent='📍 انتقال إلى: '+coords.lat.toFixed(6)+', '+coords.lng.toFixed(6)+' ('+coords.format+')';
    d.addEventListener('click',function(){var ll=L.latLng(coords.lat,coords.lng);map.setView(ll,14);placeMainMarker(ll);setCoordPanel(ll);hideSR();document.getElementById('search-input').value='';});
    box.appendChild(d); box.style.display='block'; return;
  }
  box.innerHTML='<div class="sr-item sr-loading">⏳ جارٍ البحث المحلي…</div>'; box.style.display='block';
  var local=localSearch(q,(await loadLocalGazetteer()).entries);
  if(local.length){box.innerHTML='';local.forEach(function(item){renderSearchResult(box,item.name+' — '+item.type,item.lat,item.lon);});return;}
  box.innerHTML='<div class="sr-item sr-loading">⏳ جارٍ البحث عبر الإنترنت…</div>';
  try{
    var res=await fetchTimeout('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q)+'&limit=8&accept-language=ar,en',{},8000);
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json();
    if(!data.length){box.innerHTML='<div class="sr-item sr-error">لا توجد نتائج محلية أو عبر الإنترنت</div>';return;}
    box.innerHTML='';data.forEach(function(item){renderSearchResult(box,item.display_name,parseFloat(item.lat),parseFloat(item.lon));});
  }catch(err){box.innerHTML='<div class="sr-item sr-error">⚠ لا يتوفر الاتصال ولا توجد نتيجة محلية</div>';}
}
function hideSR(){document.getElementById('search-results').style.display='none';}
document.addEventListener('click',function(e){if(!document.querySelector('.search-wrap').contains(e.target))hideSR();});

/* ════ DRAW MODE ════ */
document.getElementById('btn-draw').addEventListener('click',startDraw);
document.getElementById('btn-finish').addEventListener('click',finishDraw);
document.getElementById('btn-cancel').addEventListener('click',cancelDraw);
function startDraw(){drawMode=true;drawPoints=[];document.getElementById('btn-draw').style.display='none';document.getElementById('btn-finish').style.display='inline-flex';document.getElementById('btn-cancel').style.display='inline-flex';document.getElementById('draw-banner').style.display='block';document.getElementById('map').classList.add('drawing-cursor');}
function addDrawPoint(e){
  L.DomEvent.stopPropagation(e); var ll=e.latlng;
  if(drawPoints.length>=3&&map.distance(ll,drawPoints[0])<CLOSE_DIST_M){finishDraw();return;}
  drawPoints.push(ll); var isF=drawPoints.length===1;
  var di=L.divIcon({className:'',html:'<div style="width:'+(isF?14:10)+'px;height:'+(isF?14:10)+'px;background:'+(isF?'#ffc947':'#e63946')+';border:2px solid #fff;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,.6);"></div>',iconSize:[isF?14:10,isF?14:10],iconAnchor:[isF?7:5,isF?7:5]});
  drawDots.push(L.marker(ll,{icon:di,zIndexOffset:1000}).addTo(map)); redrawLine();
}
function redrawLine(){if(drawLine){map.removeLayer(drawLine);drawLine=null;}if(drawPoints.length>=2)drawLine=L.polyline(drawPoints.concat([drawPoints[0]]),{color:'#e63946',weight:2.5,dashArray:'8,5',opacity:.9}).addTo(map);}
function finishDraw(){
  if(drawPoints.length<3){showToast('يجب رسم ٣ نقاط على الأقل!',true);return;}
  zoneSeq++; var color=ZONE_COLORS[(zoneSeq-1)%ZONE_COLORS.length];
  var zone={id:zoneSeq,name:'المنطقة '+zoneSeq,points:drawPoints.slice(),color:color,layer:null,editMarkers:[]};
  zone.layer=L.polygon(zone.points,{color:color,fillColor:color,weight:2.2,fillOpacity:0.17}).addTo(map);
  zones.push(zone); clearDraw(); stopDraw(); renderZones(); showToast('✅ تم إنشاء "'+zone.name+'"');
}
function cancelDraw(){clearDraw();stopDraw();}
function stopDraw(){drawMode=false;document.getElementById('btn-draw').style.display='inline-flex';document.getElementById('btn-finish').style.display='none';document.getElementById('btn-cancel').style.display='none';document.getElementById('draw-banner').style.display='none';document.getElementById('map').classList.remove('drawing-cursor');}
function clearDraw(){if(drawLine){map.removeLayer(drawLine);drawLine=null;}drawDots.forEach(function(d){map.removeLayer(d);});drawDots=[];drawPoints=[];}

/* ════ STATS ════ */
function computeStats(zone){
  var coords=zone.points.map(function(p){return[p.lng,p.lat];}); coords.push(coords[0]);
  var poly=turf.polygon([coords]); var aM2=turf.area(poly);
  var periK=turf.length(turf.polygonToLine(poly),{units:'kilometers'});
  var cen=turf.centroid(poly);
  return{areaM2:aM2,areaKm2:aM2/1e6,periKm:periK,cLat:cen.geometry.coordinates[1],cLng:cen.geometry.coordinates[0]};
}

/* ════ RENDER ZONES ════ */
function renderZones(){
  var list=document.getElementById('zones-list'); document.getElementById('zone-badge').textContent=zones.length;
  if(!zones.length){list.innerHTML='<div class="empty-hint">لا توجد مناطق بعد<br>استخدم زر <strong>"رسم"</strong> للبدء</div>';return;}
  list.innerHTML='';
  zones.forEach(function(zone,i){
    var stats=computeStats(zone), isEdit=editIdx===i;
    var card=document.createElement('div'); card.className='zone-card'; card.style.borderRightColor=zone.color;
    card.innerHTML='<div class="zc-head"><span class="z-dot" style="background:'+zone.color+'"></span><input class="z-name-input" value="'+escHtml(zone.name)+'" onchange="zones['+i+'].name=this.value"/></div>'+
      '<div class="z-meta">🔺 '+zone.points.length+' رأس &nbsp;|&nbsp; 📐 '+(stats.areaKm2<0.001?stats.areaM2.toFixed(2)+' م²':stats.areaKm2.toFixed(5)+' كم²')+'</div>'+
      '<div class="z-actions"><button class="z-btn info" onclick="openModal('+i+')">📊</button>'+
      '<button class="z-btn edit '+(isEdit?'active-edit':'')+'" onclick="toggleEdit('+i+')">'+(isEdit?'💾':'✏️')+'</button>'+
      '<button class="z-btn exp" onclick="doExport('+i+',\'geojson\')">GeoJSON</button>'+
      '<button class="z-btn exp" onclick="doExport('+i+',\'kml\')" style="background:#ff9800">KML</button>'+
      '<button class="z-btn del" onclick="deleteZone('+i+')">🗑</button></div>';
    list.appendChild(card);
  });
}
function toggleEdit(idx){if(editIdx!==null){stopEdit(editIdx);var was=editIdx;editIdx=null;if(was===idx){renderZones();return;}}editIdx=idx;startEdit(idx);renderZones();}
function startEdit(idx){
  var zone=zones[idx];
  zone.points.forEach(function(pt,i){
    var icon=L.divIcon({className:'',html:'<div style="width:13px;height:13px;background:'+zone.color+';border:2.5px solid #fff;border-radius:50%;cursor:move;box-shadow:0 2px 7px rgba(0,0,0,.7);"></div>',iconSize:[13,13],iconAnchor:[6,6]});
    var m=L.marker(pt,{draggable:true,icon:icon,zIndexOffset:2000}).addTo(map);
    m.on('drag',function(ev){zone.points[i]=ev.target.getLatLng();zone.layer.setLatLngs(zone.points);});
    m.on('dragend',function(){renderZones();}); zone.editMarkers.push(m);
  });
}
function stopEdit(idx){if(!zones[idx])return;zones[idx].editMarkers.forEach(function(m){map.removeLayer(m);});zones[idx].editMarkers=[];}
function deleteZone(idx){
  stopEdit(idx);map.removeLayer(zones[idx].layer);zones.splice(idx,1);
  if(editIdx===idx)editIdx=null;else if(editIdx>idx)editIdx--;
  if(modalIdx===idx)modalIdx=null;else if(modalIdx>idx)modalIdx--;
  renderZones();showToast('تم حذف المنطقة');
}
function openModal(idx){
  modalIdx=idx;var zone=zones[idx],st=computeStats(zone);
  document.getElementById('m-title').textContent='📊 '+zone.name;
  document.getElementById('m-verts-count').textContent=zone.points.length;
  document.getElementById('m-area-km').textContent=st.areaKm2.toFixed(8)+' كم²';
  document.getElementById('m-area-m2').textContent=Math.round(st.areaM2).toLocaleString('ar')+' م²';
  document.getElementById('m-perimeter').textContent=st.periKm.toFixed(6)+' كم';
  document.getElementById('m-centroid').textContent=st.cLat.toFixed(7)+', '+st.cLng.toFixed(7);
  var vc=document.getElementById('verts-container');vc.innerHTML='';
  zone.points.forEach(function(p,i){var r=document.createElement('div');r.className='vert-row';r.innerHTML='<span class="v-idx">['+String(i+1).padStart(2,'0')+']</span>'+p.lat.toFixed(8)+',&nbsp;&nbsp;'+p.lng.toFixed(8);vc.appendChild(r);});
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal(){document.getElementById('modal-bg').classList.remove('open');}
document.getElementById('m-btn-close').addEventListener('click',closeModal);
document.getElementById('modal-bg').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.getElementById('m-btn-geojson').addEventListener('click',function(){if(modalIdx!==null)doExport(modalIdx,'geojson');});
document.getElementById('m-btn-json').addEventListener('click',function(){if(modalIdx!==null)doExport(modalIdx,'json');});
document.getElementById('m-btn-copy').addEventListener('click',function(){
  if(modalIdx===null)return;var z=zones[modalIdx];
  copyText(z.points.map(function(p,i){return'['+(i+1)+'] '+p.lat.toFixed(8)+', '+p.lng.toFixed(8);}).join('\n'),'✓ تم نسخ '+z.points.length+' إحداثيات');
});

/* ════ EXPORT ════ */
function doExport(idx,fmt){
  var zone=zones[idx],st=computeStats(zone);
  var coords=zone.points.map(function(p){return[parseFloat(p.lng.toFixed(8)),parseFloat(p.lat.toFixed(8))];});coords.push(coords[0]);
  var content,fname,mime;
  if(fmt==='geojson'){
    content=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:zone.name,id:zone.id,area_km2:st.areaKm2,perimeter_km:st.periKm,centroid:{lat:st.cLat,lng:st.cLng}},geometry:{type:'Polygon',coordinates:[coords]}}]},null,2);
    fname='zone_'+zone.id+'.geojson';mime='application/geo+json';
  }else if(fmt==='kml'){
    content=tokml({type:'Feature',geometry:{type:'Polygon',coordinates:[coords]},properties:{name:zone.name}});
    fname='zone_'+zone.id+'.kml';mime='application/vnd.google-earth.kml+xml';
  }else{
    content=JSON.stringify({name:zone.name,id:zone.id,stats:{vertices:zone.points.length,area_km2:st.areaKm2,area_m2:st.areaM2,perimeter_km:st.periKm,centroid:{lat:st.cLat,lng:st.cLng}},vertices:zone.points.map(function(p,i){return{index:i+1,lat:parseFloat(p.lat.toFixed(8)),lng:parseFloat(p.lng.toFixed(8))};})},null,2);
    fname='zone_'+zone.id+'.json';mime='application/json';
  }
  var blob=new Blob([content],{type:mime});
  var a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:fname});
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  showToast('✓ تم تصدير '+zone.name+' ('+fmt.toUpperCase()+')');
}

/* ════ ELEVATION API ════ */
async function getElevations(locs){
  try{
    var lats=locs.map(function(l){return l.lat;}).join(',');
    var lngs=locs.map(function(l){return l.lng;}).join(',');
    var res=await fetchTimeout('https://api.open-meteo.com/v1/elevation?latitude='+lats+'&longitude='+lngs,{},12000);
    if(res.ok){var d=await res.json();if(d.elevation&&d.elevation.length===locs.length)return d.elevation.map(function(v){return v!==null?v:0;});}
  }catch(e){}
  try{
    var body=JSON.stringify({locations:locs.map(function(l){return{latitude:l.lat,longitude:l.lng};})});
    var res2=await fetchTimeout('https://api.open-elevation.com/api/v1/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:body},12000);
    if(res2.ok){var d2=await res2.json();return d2.results.map(function(r){return r.elevation||0;});}
  }catch(e2){}
  return null;
}
async function getElevsBatched(locs,bsz){
  bsz=bsz||90; var all=[];
  for(var i=0;i<locs.length;i+=bsz){
    var b=locs.slice(i,Math.min(i+bsz,locs.length)); var r=await getElevations(b);
    if(!r)return null; all=all.concat(r); if(i+bsz<locs.length)await sleep(250);
  }
  return all;
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function fetchTimeout(url,opts,ms){
  var ctrl=new AbortController(),tid=setTimeout(function(){ctrl.abort();},ms||10000);
  return fetch(url,Object.assign({},opts,{signal:ctrl.signal})).then(function(r){clearTimeout(tid);return r;}).catch(function(e){clearTimeout(tid);throw e;});
}

/* ════ VIEWSHED ENGINE (shared by viewshed, dead ground, radar, optimal OP) ════ */
async function runViewshedEngine(center,range,numRays,obsH,progressEl){
  var prog=progressEl;
  if(prog)prog.textContent='⏳ جلب ارتفاع موضع المراقب…';
  var obsArr=await getElevations([{lat:center.lat,lng:center.lng}]);
  if(!obsArr)return null;
  var observerH=obsArr[0]+obsH;

  if(prog)prog.textContent='⏳ بناء شبكة '+numRays+'×10 نقاط…';
  var NUM_STEP=10, allLocs=[], rayMap=[];
  for(var r=0;r<numRays;r++){
    var bearing=(r/numRays)*360; rayMap[r]=[];
    for(var s=0;s<NUM_STEP;s++){
      var dkm=range*(s+1)/NUM_STEP;
      var dest=turf.destination(turf.point([center.lng,center.lat]),dkm,bearing,{units:'kilometers'});
      rayMap[r][s]=allLocs.length;
      allLocs.push({lat:dest.geometry.coordinates[1],lng:dest.geometry.coordinates[0],distM:dkm*1000});
    }
  }

  if(prog)prog.textContent='⏳ جلب بيانات التضاريس ('+allLocs.length+' نقطة)…';
  var allElevs=await getElevsBatched(allLocs,90);
  if(!allElevs){if(prog)prog.textContent='';return null;}

  if(prog)prog.textContent='⏳ حساب الرؤية…';
  var horizonPts=[];
  for(var r=0;r<numRays;r++){
    var maxAngle=-Infinity, lastVisStep=0;
    for(var s=0;s<NUM_STEP;s++){
      var fi=rayMap[r][s], h=allElevs[fi]||0, d=allLocs[fi].distM;
      var curv=(d*d)/(2*R_EARTH)*(1-K_REFRACT);
      var elevAng=(h-curv-observerH)/d;
      if(elevAng>=maxAngle){maxAngle=elevAng;lastVisStep=s;}
    }
    var visDistKm=range*(lastVisStep+1)/NUM_STEP;
    var bearing=(r/numRays)*360;
    var visDest=turf.destination(turf.point([center.lng,center.lat]),visDistKm,bearing,{units:'kilometers'});
    horizonPts.push(L.latLng(visDest.geometry.coordinates[1],visDest.geometry.coordinates[0]));
  }
  if(prog)prog.textContent='';
  return{horizonPts:horizonPts,observerH:observerH};
}

/* ════ 1. BUFFER ════ */
document.getElementById('tool-buffer').addEventListener('click',function(){toggleModal('modal-buffer');});
document.getElementById('buffer-apply').addEventListener('click',function(){
  if(!mainMarker){showToast('ضع علامة على الخريطة أولاً',true);return;}
  var r=parseFloat(document.getElementById('buffer-radius').value),c=mainMarker.getLatLng();
  var circle=turf.circle([c.lng,c.lat],r/1000,{steps:64,units:'kilometers'});
  L.geoJSON(circle,{style:{color:'#00d4ff',weight:1.5,fillOpacity:0.07}}).addTo(bufferLayer);
  showToast('تم رسم دائرة '+r+' م');
});
document.getElementById('buffer-clear').addEventListener('click',function(){bufferLayer.clearLayers();showToast('تم مسح الدوائر');});

/* ════ 2. LINE OF SIGHT ════ */
document.getElementById('tool-los').addEventListener('click',function(){toggleModal('modal-los');resetLOS();});
function resetLOS(){
  losPoints=[];losMarkers.forEach(function(m){map.removeLayer(m);});losMarkers=[];
  if(losLine){map.removeLayer(losLine);losLine=null;}
  document.getElementById('los-result').style.display='none';document.getElementById('los-progress').textContent='';
  var c=document.getElementById('los-canvas');c.getContext('2d').clearRect(0,0,c.width,c.height);
}
function addLOSPoint(e){
  if(losPoints.length>=2)return; losPoints.push(e.latlng);
  var isF=losPoints.length===1;
  var icon=L.divIcon({className:'',html:'<div style="width:12px;height:12px;background:'+(isF?'#ffc947':'#ff5722')+';border:2px solid #fff;border-radius:50%;"></div>',iconSize:[12,12],iconAnchor:[6,6]});
  losMarkers.push(L.marker(e.latlng,{icon:icon}).addTo(map));
  if(losPoints.length===2){losLine=L.polyline(losPoints,{color:'#ff9800',weight:1.5,dashArray:'6,3'}).addTo(map);computeLOS();}
}
async function computeLOS(){
  var p1=losPoints[0],p2=losPoints[1];
  var obsOff=parseFloat(document.getElementById('los-obs-h').value)||2;
  var tgtOff=parseFloat(document.getElementById('los-tgt-h').value)||0;
  var N=20,prog=document.getElementById('los-progress');
  prog.textContent='⏳ جلب الارتفاعات ('+( N+2)+' نقطة)…';
  var totalDistKm=turf.distance(turf.point([p1.lng,p1.lat]),turf.point([p2.lng,p2.lat]),{units:'kilometers'});
  var totalDistM=totalDistKm*1000;
  var locs=[],dists=[];
  for(var i=0;i<=N+1;i++){var t=i/(N+1);locs.push({lat:p1.lat+(p2.lat-p1.lat)*t,lng:p1.lng+(p2.lng-p1.lng)*t});dists.push(t*totalDistM);}
  var elevs=await getElevations(locs); prog.textContent='';
  if(!elevs||elevs.length<N+2){document.getElementById('los-result').innerHTML='<span style="color:#f85149">⚠ فشل جلب بيانات الارتفاع</span>';document.getElementById('los-result').style.display='block';return;}
  var obsAbsH=elevs[0]+obsOff, tgtAbsH=elevs[N+1]+tgtOff, blocked=false, blockIdx=-1, blockDistM=0;
  for(var i=1;i<=N;i++){
    var d=dists[i],D=totalDistM;
    var curv=(d*(D-d))/(2*R_EARTH)*(1-K_REFRACT);
    var losH=obsAbsH+(tgtAbsH-obsAbsH)*(d/D);
    if(elevs[i]-curv>losH&&!blocked){blocked=true;blockIdx=i;blockDistM=d;}
  }
  drawLOSChart(elevs,dists,totalDistM,obsAbsH,tgtAbsH,blocked,blockIdx);
  if(losLine)losLine.setStyle({color:blocked?'#f85149':'#56d364'});
  var ds=totalDistM>=1000?totalDistKm.toFixed(3)+' كم':totalDistM.toFixed(0)+' م';
  var html='<strong>المسافة:</strong> '+ds+'<br><strong>ارت. ن١:</strong> '+elevs[0].toFixed(1)+'م (+'+obsOff+'م = '+obsAbsH.toFixed(1)+'م)<br><strong>ارت. ن٢:</strong> '+elevs[N+1].toFixed(1)+'م (+'+tgtOff+'م = '+tgtAbsH.toFixed(1)+'م)<br>';
  if(blocked){var bd=blockDistM>=1000?(blockDistM/1000).toFixed(2)+' كم':blockDistM.toFixed(0)+' م';html+='<span style="color:#f85149;font-weight:700">🔴 محجوب عند '+bd+' (ارتفاع الأرض: '+elevs[blockIdx].toFixed(1)+' م)</span>';}
  else html+='<span style="color:#56d364;font-weight:700">🟢 خط الرؤية مفتوح بالكامل</span>';
  document.getElementById('los-result').innerHTML=html; document.getElementById('los-result').style.display='block';
}
function drawLOSChart(elevs,dists,totalDistM,obsH,tgtH,blocked,blockIdx){
  var cvs=document.getElementById('los-canvas'),W=cvs.width,H=cvs.height,ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,W,H);
  var minE=Math.min.apply(null,elevs.concat([0]))-8, maxE=Math.max.apply(null,elevs.concat([obsH,tgtH]))+22;
  var eR=maxE-minE; if(eR===0)eR=1;
  var pad={top:22,right:12,bottom:28,left:48}; var cW=W-pad.left-pad.right,cH=H-pad.top-pad.bottom;
  function xP(d){return pad.left+(d/totalDistM)*cW;} function yP(h){return pad.top+cH-((h-minE)/eR)*cH;}
  ctx.fillStyle='#0d1117';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=0.5;
  for(var gi=0;gi<=4;gi++){var gy=pad.top+gi*(cH/4);ctx.beginPath();ctx.moveTo(pad.left,gy);ctx.lineTo(W-pad.right,gy);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(xP(dists[0]),yP(elevs[0]));for(var i=1;i<elevs.length;i++)ctx.lineTo(xP(dists[i]),yP(elevs[i]));
  ctx.lineTo(xP(totalDistM),yP(minE));ctx.lineTo(xP(dists[0]),yP(minE));ctx.closePath();
  var tg=ctx.createLinearGradient(0,pad.top,0,pad.top+cH);tg.addColorStop(0,'rgba(86,211,100,.35)');tg.addColorStop(1,'rgba(86,211,100,.04)');ctx.fillStyle=tg;ctx.fill();
  ctx.beginPath();ctx.moveTo(xP(dists[0]),yP(elevs[0]));for(var i=1;i<elevs.length;i++)ctx.lineTo(xP(dists[i]),yP(elevs[i]));ctx.strokeStyle='#56d364';ctx.lineWidth=1.5;ctx.stroke();
  if(blocked){for(var i=1;i<elevs.length;i++){var d=dists[i],D=totalDistM,curv=(d*(D-d))/(2*R_EARTH)*(1-K_REFRACT),losH=obsH+(tgtH-obsH)*(d/D);if(elevs[i]-curv>losH){ctx.fillStyle='rgba(248,81,73,.22)';ctx.fillRect(xP(dists[i-1]),pad.top,xP(dists[i])-xP(dists[i-1]),cH);}}}
  ctx.beginPath();ctx.moveTo(xP(0),yP(obsH));ctx.lineTo(xP(totalDistM),yP(tgtH));ctx.strokeStyle=blocked?'#f85149':'#58a6ff';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);ctx.stroke();ctx.setLineDash([]);
  if(blocked&&blockIdx>0){ctx.beginPath();ctx.arc(xP(dists[blockIdx]),yP(elevs[blockIdx]),5,0,Math.PI*2);ctx.fillStyle='#f85149';ctx.fill();}
  ctx.beginPath();ctx.arc(xP(0),yP(obsH),5,0,Math.PI*2);ctx.fillStyle='#ffc947';ctx.fill();
  ctx.beginPath();ctx.arc(xP(totalDistM),yP(tgtH),5,0,Math.PI*2);ctx.fillStyle='#ff5722';ctx.fill();
  ctx.fillStyle='#484f58';ctx.font='9px monospace';ctx.textAlign='right';ctx.fillText(maxE.toFixed(0)+'م',pad.left-3,pad.top+9);ctx.fillText(minE.toFixed(0)+'م',pad.left-3,pad.top+cH+4);
  ctx.textAlign='center';ctx.fillText('0',xP(0),H-3);ctx.fillText(totalDistM>=1000?(totalDistM/1000).toFixed(1)+'كم':totalDistM.toFixed(0)+'م',xP(totalDistM),H-3);
  ctx.fillStyle=blocked?'#f85149':'#56d364';ctx.textAlign='left';ctx.font='bold 10px monospace';ctx.fillText(blocked?'⛔ محجوب':'✅ مفتوح',pad.left+4,pad.top+14);
}
document.getElementById('los-clear').addEventListener('click',resetLOS);

/* ════ 3. VIEWSHED ════ */
document.getElementById('tool-viewshed').addEventListener('click',function(){toggleModal('modal-viewshed');});
document.getElementById('viewshed-apply').addEventListener('click',async function(){
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  viewshedLayer.clearLayers(); var btn=this; btn.disabled=true;
  var range=parseFloat(document.getElementById('viewshed-range').value)||10;
  var obsH=parseFloat(document.getElementById('viewshed-obs-h').value)||2;
  var numRays=parseInt(document.getElementById('viewshed-rays').value)||36;
  var center=mainMarker.getLatLng();
  var result=await runViewshedEngine(center,range,numRays,obsH,document.getElementById('viewshed-progress'));
  btn.disabled=false;
  if(!result){showToast('فشل جلب بيانات التضاريس',true);return;}
  L.circle([center.lat,center.lng],{radius:range*1000,color:'#484f58',fill:false,weight:1,dashArray:'5,5'}).addTo(viewshedLayer);
  var hPts=result.horizonPts.concat([result.horizonPts[0]]);
  L.polygon(hPts,{color:'#00d4ff',fillColor:'#00d4ff',weight:1.5,fillOpacity:0.15}).addTo(viewshedLayer).bindPopup('منطقة التغطية الحقيقية | المدى: '+range+' كم | بيانات: SRTM Open-Meteo');
  showToast('✅ Viewshed اكتمل');
});
document.getElementById('viewshed-clear').addEventListener('click',function(){viewshedLayer.clearLayers();document.getElementById('viewshed-progress').textContent='';showToast('تم مسح التغطية');});

/* ════ 4. MGRS/DMS/UTM ════ */
document.getElementById('tool-mgrs').addEventListener('click',function(){toggleModal('modal-mgrs');});
document.getElementById('mgrs-use-marker').addEventListener('click',function(){if(!mainMarker){showToast('ضع علامة أولاً',true);return;}var ll=mainMarker.getLatLng();document.getElementById('mgrs-input').value=ll.lat.toFixed(7)+', '+ll.lng.toFixed(7);document.getElementById('mgrs-convert').click();});
document.getElementById('mgrs-convert').addEventListener('click',function(){
  var val=document.getElementById('mgrs-input').value.trim().replace(/،/g,',');
  var c=parseCoords(val);if(!c){showToast('أدخل إحداثيات صحيحة',true);return;}
  try{
    var result=convertCoordinate(c.lat,c.lng,typeof mgrs!=='undefined'?mgrs.forward:null);
    document.getElementById('mgrs-out').textContent=result.mgrs;
    document.getElementById('dms-out').textContent=result.dms;
    document.getElementById('utm-out').textContent=result.utm;
    var georef=document.getElementById('georef-out'); if(georef) georef.textContent=result.georef;
    var geojson=document.getElementById('geojson-out'); if(geojson) geojson.textContent=result.geojson;
    document.querySelectorAll('[data-copy-format]').forEach(function(btn){btn.dataset.copyValue=result[btn.dataset.copyFormat]||'';btn.onclick=function(){navigator.clipboard?.writeText(btn.dataset.copyValue||'');showToast('تم نسخ القيمة');};});
  }catch(e){showToast('تعذر تحويل الإحداثيات: '+e.message,true);}
});
function toDMS(deg,type){var neg=deg<0,abs=Math.abs(deg),d=Math.floor(abs),m=Math.floor((abs-d)*60),s=((abs-d-m/60)*3600).toFixed(2);return d+'° '+m+"' "+s+'" '+(type==='lat'?(neg?'جنوب':'شمال'):(neg?'غرب':'شرق'));}

/* ════ 5. ISOCHRONES ════ */
document.getElementById('tool-isochrone').addEventListener('click',function(){toggleModal('modal-isochrone');});
document.getElementById('isochrone-apply').addEventListener('click',async function(){
  var apiKey=document.getElementById('ors-key').value.trim();
  if(!apiKey){showToast('أدخل مفتاح ORS',true);return;}
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  var time=parseInt(document.getElementById('isochrone-time').value)||15;
  var mode=document.getElementById('isochrone-mode').value;
  var c=mainMarker.getLatLng(); var btn=this; btn.disabled=true;
  showToast('⏳ حساب منطقة الوصول…');
  try{
    var res=await fetchTimeout('https://api.openrouteservice.org/v2/isochrones/'+mode,{method:'POST',headers:{'Authorization':apiKey,'Content-Type':'application/json'},body:JSON.stringify({locations:[[c.lng,c.lat]],range:[time*60],range_type:'time'})},15000);
    if(!res.ok){var t=await res.text();throw new Error('HTTP '+res.status+': '+t.slice(0,60));}
    var data=await res.json(); isochroneLayer.clearLayers();
    L.geoJSON(data,{style:{color:'#00d4ff',fillColor:'#00d4ff',fillOpacity:0.1,weight:2,dashArray:'5,3'}}).addTo(isochroneLayer);
    showToast('✅ منطقة الوصول: '+time+' دقيقة');
  }catch(e){showToast('فشل: '+e.message,true);}
  btn.disabled=false;
});
document.getElementById('isochrone-clear').addEventListener('click',function(){isochroneLayer.clearLayers();showToast('تم مسح');});

/* ════ 6. GEOFENCE ════ */
document.getElementById('tool-geofence').addEventListener('click',function(){toggleModal('modal-geofence');});
document.getElementById('geofence-use-marker').addEventListener('click',function(){if(!mainMarker){showToast('ضع علامة أولاً',true);return;}var ll=mainMarker.getLatLng();document.getElementById('geofence-coord').value=ll.lat.toFixed(7)+', '+ll.lng.toFixed(7);document.getElementById('geofence-check').click();});
document.getElementById('geofence-check').addEventListener('click',function(){
  var val=document.getElementById('geofence-coord').value.trim().replace(/،/g,',');
  var c=parseCoords(val);if(!c){showToast('إحداثيات غير صحيحة',true);return;}
  if(!zones.length){document.getElementById('geofence-result').textContent='لا توجد مناطق محظورة';return;}
  var pt=turf.point([c.lng,c.lat]),inside=[];
  zones.forEach(function(z){var co=z.points.map(function(p){return[p.lng,p.lat];});co.push(co[0]);if(turf.booleanPointInPolygon(pt,turf.polygon([co])))inside.push(z.name);});
  var el=document.getElementById('geofence-result');
  el.innerHTML=inside.length?'<span style="color:#f85149;font-weight:700">🚨 داخل: '+inside.join('، ')+'</span>':'<span style="color:#56d364;font-weight:700">✅ خارج المناطق المحظورة</span>';
  L.circleMarker([c.lat,c.lng],{radius:7,color:inside.length?'#f85149':'#56d364',fillColor:inside.length?'#f85149':'#56d364',fillOpacity:0.5,weight:2}).addTo(map).bindPopup(inside.length?'🚨 محظورة':'✅ آمنة').openPopup();
});
function checkGeoFencePoint(latlng){
  if(!zones.length)return;var pt=turf.point([latlng.lng,latlng.lat]);
  var hit=zones.some(function(z){var co=z.points.map(function(p){return[p.lng,p.lat];});co.push(co[0]);return turf.booleanPointInPolygon(pt,turf.polygon([co]));});
  if(hit)showToast('🚨 المسار دخل منطقة محظورة!',true);
}

/* ════ 7. IMPORT ════ */
document.getElementById('tool-import').addEventListener('click',function(){toggleModal('modal-import');});
document.getElementById('import-load').addEventListener('click',function(){
  var fi=document.getElementById('import-file');if(!fi.files.length){showToast('اختر ملفاً',true);return;}
  var file=fi.files[0],reader=new FileReader();
  reader.onload=function(e){
    try{var gj;if(file.name.toLowerCase().endsWith('.kml')){var doc=new DOMParser().parseFromString(e.target.result,'text/xml');gj=toGeoJSON.kml(doc);}else{gj=JSON.parse(e.target.result);}
      importedLayer.clearLayers();L.geoJSON(gj,{style:function(){return{color:'#ff9800',weight:2,fillOpacity:0.1};},pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:6,color:'#ff9800',fillColor:'#ff9800',fillOpacity:0.6});}}).addTo(importedLayer);
      if(importedLayer.getLayers().length)map.fitBounds(importedLayer.getBounds());showToast('✅ تم استيراد: '+file.name);
    }catch(err){showToast('❌ '+err.message,true);}
  };reader.readAsText(file);
});
document.getElementById('import-clear').addEventListener('click',function(){importedLayer.clearLayers();showToast('تم مسح');});

/* ════ 8. TIMELINE ════ */
document.getElementById('tool-timeline').addEventListener('click',function(){toggleModal('modal-timeline');});
document.getElementById('timeline-start').addEventListener('click',function(){timelinePoints=[];timelineRecording=true;document.getElementById('timeline-start').disabled=true;document.getElementById('timeline-stop').disabled=false;document.getElementById('timeline-info').textContent='🔴 التسجيل نشط…';if(timelinePolyline){map.removeLayer(timelinePolyline);timelinePolyline=null;}showToast('انقر على الخريطة لتسجيل نقاط المسار');});
function addTimelinePoint(e){
  timelinePoints.push({latlng:e.latlng,time:new Date()});var n=timelinePoints.length;
  L.circleMarker(e.latlng,{radius:5,color:'#ffc947',fillColor:'#ffc947',fillOpacity:.7}).addTo(map).bindTooltip(String(n),{permanent:true,direction:'top'});
  if(timelinePolyline)timelinePolyline.addLatLng(e.latlng);else timelinePolyline=L.polyline([e.latlng],{color:'#ffc947',weight:1.5,dashArray:'4,3'}).addTo(map);
  document.getElementById('timeline-slider').max=n-1;document.getElementById('timeline-slider').disabled=false;document.getElementById('timeline-info').textContent='🔴 '+n+' نقطة';checkGeoFencePoint(e.latlng);
}
document.getElementById('timeline-stop').addEventListener('click',function(){timelineRecording=false;document.getElementById('timeline-start').disabled=false;document.getElementById('timeline-stop').disabled=true;document.getElementById('timeline-info').textContent='✅ '+timelinePoints.length+' نقطة';});
document.getElementById('timeline-play').addEventListener('click',function(){
  if(!timelinePoints.length){showToast('لا توجد نقاط',true);return;}
  var idx=0;if(timelineMarker)map.removeLayer(timelineMarker);
  timelineMarker=L.circleMarker(timelinePoints[0].latlng,{radius:9,color:'#e63946',fillColor:'#e63946',fillOpacity:.85}).addTo(map);
  if(timelineInterval)clearInterval(timelineInterval);
  timelineInterval=setInterval(function(){idx=(idx+1)%timelinePoints.length;timelineMarker.setLatLng(timelinePoints[idx].latlng);document.getElementById('timeline-slider').value=idx;checkGeoFencePoint(timelinePoints[idx].latlng);},900);
});
document.getElementById('timeline-reset').addEventListener('click',function(){
  if(timelineInterval){clearInterval(timelineInterval);timelineInterval=null;}if(timelineMarker){map.removeLayer(timelineMarker);timelineMarker=null;}if(timelinePolyline){map.removeLayer(timelinePolyline);timelinePolyline=null;}
  timelinePoints=[];timelineRecording=false;document.getElementById('timeline-start').disabled=false;document.getElementById('timeline-stop').disabled=true;
  document.getElementById('timeline-slider').value=0;document.getElementById('timeline-slider').max=0;document.getElementById('timeline-slider').disabled=true;document.getElementById('timeline-info').textContent='';showToast('تم مسح المسار');
});
document.getElementById('timeline-slider').addEventListener('input',function(){var idx=parseInt(this.value);if(timelineMarker&&timelinePoints[idx])timelineMarker.setLatLng(timelinePoints[idx].latlng);});

/* ════ CLUSTERING & HEATMAP ════ */
function getRealPoints(){var pts=[];zones.forEach(function(z){try{var s=computeStats(z);pts.push({lat:s.cLat,lng:s.cLng});}catch(e){}});if(mainMarker){var ll=mainMarker.getLatLng();pts.push({lat:ll.lat,lng:ll.lng});}timelinePoints.forEach(function(tp){pts.push({lat:tp.latlng.lat,lng:tp.latlng.lng});});quakeLayer.getLayers().forEach(function(ly){if(ly.getLatLng){var q=ly.getLatLng();pts.push({lat:q.lat,lng:q.lng});}});return pts;}
document.getElementById('btn-cluster-toggle').addEventListener('click',function(){
  if(map.hasLayer(clusterGroup)){map.removeLayer(clusterGroup);this.classList.remove('active');this.textContent='📊 تجميع';return;}
  clusterGroup.clearLayers();var pts=getRealPoints();if(!pts.length){showToast('لا توجد بيانات',true);return;}
  pts.forEach(function(p){clusterGroup.addLayer(L.marker([p.lat,p.lng]));});map.addLayer(clusterGroup);this.classList.add('active');this.textContent='📊 تجميع (ON)';showToast('✅ '+pts.length+' نقطة');
});
document.getElementById('btn-heatmap-toggle').addEventListener('click',function(){
  if(heatmapLayer){map.removeLayer(heatmapLayer);heatmapLayer=null;this.classList.remove('active');this.textContent='🌡️ حرارية';return;}
  var pts=getRealPoints();if(!pts.length){showToast('لا توجد بيانات',true);return;}
  heatmapLayer=L.heatLayer(pts.map(function(p){return[p.lat,p.lng,1];}),{radius:28,blur:20,maxZoom:12}).addTo(map);this.classList.add('active');this.textContent='🌡️ حرارية (ON)';showToast('✅ '+pts.length+' نقطة');
});

/* ════ EARTHQUAKES ════ */
document.getElementById('btn-load-quakes').addEventListener('click',async function(){
  showToast('⏳ جلب USGS…');
  try{var res=await fetchTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',{},12000);if(!res.ok)throw new Error('HTTP '+res.status);var data=await res.json();quakeLayer.clearLayers();
    L.geoJSON(data,{pointToLayer:function(f,ll){var mag=f.properties.mag||2.5,col=mag>=5?'#f85149':mag>=3.5?'#ff9800':'#ffc947';return L.circleMarker(ll,{radius:Math.max(4,mag*2.5),color:col,fillColor:col,fillOpacity:.4,weight:1.5});},onEachFeature:function(f,ly){if(f.properties)ly.bindPopup('<b>'+(f.properties.title||'')+'</b><br>القوة: '+f.properties.mag+' ريختر<br>'+(f.properties.place||''));}}).addTo(quakeLayer);
    showToast('🌍 '+data.features.length+' زلزال');
  }catch(e){showToast('فشل: '+e.message,true);}
});

/* ════════════════════════════════════════════
   NEW FEATURES
════════════════════════════════════════════ */

/* ════ ADS-B FLIGHTS ════ */
document.getElementById('tool-flights').addEventListener('click',function(){toggleModal('modal-flights');});
document.getElementById('flights-load').addEventListener('click',function(){loadFlights(true);});
document.getElementById('flights-auto').addEventListener('click',function(){
  if(flightAutoInterval){clearInterval(flightAutoInterval);flightAutoInterval=null;this.textContent='🔄 تفعيل التحديث التلقائي';showToast('تم إيقاف التحديث التلقائي');return;}
  var sec=parseInt(document.getElementById('flights-interval').value)||30;if(sec<10){showToast('الحد الأدنى 10 ثواني',true);return;}
  loadFlights(true);flightAutoInterval=setInterval(function(){loadFlights(false);},sec*1000);
  this.textContent='⏹ إيقاف التحديث ('+sec+'ث)';showToast('✈ تحديث كل '+sec+' ث');
});
document.getElementById('flights-clear').addEventListener('click',function(){flightLayer.clearLayers();if(flightAutoInterval){clearInterval(flightAutoInterval);flightAutoInterval=null;document.getElementById('flights-auto').textContent='🔄 تفعيل التحديث التلقائي';}document.getElementById('flights-result').textContent='';showToast('تم مسح الرحلات');});
async function loadFlights(showMsg){
  var b=map.getBounds(),prog=document.getElementById('flights-progress');
  if(showMsg)prog.textContent='⏳ جلب بيانات OpenSky Network…';
  var url='https://opensky-network.org/api/states/all?lamin='+b.getSouth()+'&lomin='+b.getWest()+'&lamax='+b.getNorth()+'&lomax='+b.getEast();
  try{
    var res=await fetchTimeout(url,{},12000); prog.textContent='';
    if(!res.ok)throw new Error('HTTP '+res.status+' — قد تكون تجاوزت حد الطلبات (400/يوم)');
    var data=await res.json(); flightLayer.clearLayers();
    if(!data.states||!data.states.length){document.getElementById('flights-result').textContent='لا توجد رحلات في المنطقة حالياً';return;}
    var count=0;
    data.states.forEach(function(s){
      if(!s[6]||!s[5]||s[8])return; // skip if no position or on ground
      var heading=s[10]||0;
      var icon=L.divIcon({className:'',html:'<div style="transform:rotate('+heading+'deg);font-size:16px;line-height:1;filter:drop-shadow(0 0 3px #58a6ff);color:#58a6ff;display:block;transform-origin:center;">✈</div>',iconSize:[20,20],iconAnchor:[10,10]});
      L.marker([s[6],s[5]],{icon:icon}).addTo(flightLayer).bindPopup(
        '<b>'+(s[1]||'N/A').trim()+'</b> ('+s[2]+')<br>'+
        '🛫 الارتفاع: '+(s[7]?s[7].toFixed(0)+' م':'N/A')+'<br>'+
        '⚡ السرعة: '+(s[9]?(s[9]*3.6).toFixed(0)+' كم/س':'N/A')+'<br>'+
        '🧭 الاتجاه: '+heading+'°<br>ICAO: '+s[0]
      ); count++;
    });
    document.getElementById('flights-result').textContent='✈ '+count+' طائرة في المنطقة (OpenSky Network)';
    if(showMsg)showToast('✈ '+count+' رحلة في المنطقة');
  }catch(e){prog.textContent='';document.getElementById('flights-result').textContent='⚠ '+e.message;if(showMsg)showToast('خطأ: '+e.message,true);}
}

/* ════ SHIPS (AIS) ════ */
document.getElementById('tool-ships').addEventListener('click',function(){toggleModal('modal-ships');});
document.getElementById('ships-seamap').addEventListener('click',function(){
  if(seamapTile&&map.hasLayer(seamapTile)){map.removeLayer(seamapTile);seamapTile=null;this.textContent='🗺️ تفعيل طبقة OpenSeaMap';showToast('تم إخفاء OpenSeaMap');return;}
  seamapTile=L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',{attribution:'© OpenSeaMap',maxZoom:17,opacity:0.8});
  seamapTile.addTo(map);this.textContent='⏹ إخفاء OpenSeaMap';showToast('🚢 تم تفعيل طبقة OpenSeaMap (العلامات البحرية)');
});
document.getElementById('ships-live').addEventListener('click',async function(){
  var apiKey=document.getElementById('ais-key').value.trim();
  if(!apiKey){showToast('أدخل مفتاح AISStream.io',true);return;}
  if(!mainMarker){showToast('ضع علامة تحدد مركز البحث',true);return;}
  var radius=parseFloat(document.getElementById('ais-radius').value)||200;
  var c=mainMarker.getLatLng();
  document.getElementById('ships-progress').textContent='⏳ جلب بيانات السفن…';
  try{
    // AISStream REST API (if available) or fallback message
    var res=await fetchTimeout('https://api.aisstream.io/v0/vessels?latitude='+c.lat+'&longitude='+c.lng+'&radius='+radius,{headers:{'Authorization':'Bearer '+apiKey}},12000);
    document.getElementById('ships-progress').textContent='';
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json(); shipLayer.clearLayers();
    var vessels=data.vessels||data||[];
    vessels.forEach(function(v){
      if(!v.Latitude||!v.Longitude)return;
      var icon=L.divIcon({className:'',html:'<div style="font-size:14px;filter:drop-shadow(0 0 3px #00d4ff);color:#00d4ff">🚢</div>',iconSize:[18,18],iconAnchor:[9,9]});
      L.marker([v.Latitude,v.Longitude],{icon:icon}).addTo(shipLayer).bindPopup('<b>'+(v.Name||v.MMSI||'N/A')+'</b><br>MMSI: '+(v.MMSI||'--')+'<br>السرعة: '+(v.SOG||'--')+' عقدة<br>الاتجاه: '+(v.COG||'--')+'°<br>النوع: '+(v.ShipType||'--'));
    });
    document.getElementById('ships-result').textContent='🚢 '+vessels.length+' سفينة في النطاق';
    showToast('🚢 '+vessels.length+' سفينة');
  }catch(e){document.getElementById('ships-progress').textContent='';document.getElementById('ships-result').textContent='⚠ '+e.message+'\n💡 جرّب تفعيل طبقة OpenSeaMap للعلامات البحرية';showToast('خطأ: '+e.message,true);}
});
document.getElementById('ships-clear').addEventListener('click',function(){
  shipLayer.clearLayers();if(seamapTile&&map.hasLayer(seamapTile)){map.removeLayer(seamapTile);seamapTile=null;document.getElementById('ships-seamap').textContent='🗺️ تفعيل طبقة OpenSeaMap';}
  document.getElementById('ships-result').textContent='';showToast('تم مسح');
});

/* ════ ACLED ════ */
document.getElementById('tool-acled').addEventListener('click',function(){toggleModal('modal-acled');});
document.getElementById('acled-load').addEventListener('click',async function(){
  var key=document.getElementById('acled-key').value.trim(),email=document.getElementById('acled-email').value.trim();
  if(!key||!email){showToast('أدخل مفتاح ACLED والبريد الإلكتروني',true);return;}
  var fromD=document.getElementById('acled-from').value,toD=document.getElementById('acled-to').value;
  var prog=document.getElementById('acled-progress'); prog.textContent='⏳ جلب بيانات ACLED…';
  var bbox=document.getElementById('acled-bbox').checked;
  var b=map.getBounds();
  var url='https://api.acleddata.com/acled/read?key='+key+'&email='+encodeURIComponent(email)+'&limit=1000&event_date='+fromD+'|'+toD+'&event_date_where=BETWEEN';
  if(bbox)url+='&latitude='+b.getSouth()+'|'+b.getNorth()+'&latitude_where=BETWEEN&longitude='+b.getWest()+'|'+b.getEast()+'&longitude_where=BETWEEN';
  try{
    var res=await fetchTimeout(url,{},20000); prog.textContent='';
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json(); acledLayer.clearLayers();
    if(!data.data||!data.data.length){document.getElementById('acled-result').textContent='لا توجد حوادث في النطاق الزمني والمكاني المحدد';return;}
    var COLORS={'Battles':'#e63946','Violence against civilians':'#ff5722','Explosions/Remote violence':'#ff9800','Protests':'#ffc947','Riots':'#e3b341','Strategic developments':'#58a6ff'};
    data.data.forEach(function(ev){
      var col=COLORS[ev.event_type]||'#8b949e';
      L.circleMarker([parseFloat(ev.latitude),parseFloat(ev.longitude)],{radius:5,color:col,fillColor:col,fillOpacity:.75,weight:1})
        .addTo(acledLayer).bindPopup('<b>'+ev.event_type+'</b><br>'+ev.event_date+'<br>'+ev.location+', '+ev.country+'<br>الفاعل: '+ev.actor1+'<br>الوفيات: '+ev.fatalities);
    });
    document.getElementById('acled-result').textContent='💥 '+data.data.length+' حادثة | '+fromD+' → '+toD;
    showToast('💥 '+data.data.length+' حادثة ACLED');
  }catch(e){prog.textContent='';document.getElementById('acled-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
document.getElementById('acled-clear').addEventListener('click',function(){acledLayer.clearLayers();document.getElementById('acled-result').textContent='';showToast('تم مسح');});

/* ════ DEAD GROUND ════ */
document.getElementById('tool-deadground').addEventListener('click',function(){toggleModal('modal-deadground');});
document.getElementById('dg-apply').addEventListener('click',async function(){
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  deadGroundLayer.clearLayers();var btn=this;btn.disabled=true;
  var range=parseFloat(document.getElementById('dg-range').value)||8;
  var obsH=parseFloat(document.getElementById('dg-obs-h').value)||2;
  var numRays=parseInt(document.getElementById('dg-rays').value)||36;
  var center=mainMarker.getLatLng();
  var result=await runViewshedEngine(center,range,numRays,obsH,document.getElementById('dg-progress'));
  btn.disabled=false;
  if(!result){showToast('فشل جلب التضاريس',true);return;}
  // Full range circle
  var fullCircle=turf.circle([center.lng,center.lat],range,{steps:numRays,units:'kilometers'});
  // Visible polygon
  var visPts=result.horizonPts.map(function(p){return[p.lng,p.lat];}); visPts.push(visPts[0]);
  try{
    var visPoly=turf.polygon([visPts]);
    var deadGround=turf.difference(fullCircle,visPoly);
    if(deadGround){
      L.geoJSON(deadGround,{style:{color:'#e63946',fillColor:'#e63946',fillOpacity:0.3,weight:1}}).addTo(deadGroundLayer).bindPopup('🕳️ مناطق ميتة — غير مرئية من المراقب');
    }
    // Draw visible for reference
    L.polygon(result.horizonPts,{color:'#56d364',fillColor:'#56d364',weight:1,fillOpacity:0.08,dashArray:'4,3'}).addTo(deadGroundLayer);
    showToast('✅ المناطق الميتة (أحمر) والمرئية (أخضر)');
  }catch(e){showToast('خطأ: '+e.message,true);}
});
document.getElementById('dg-clear').addEventListener('click',function(){deadGroundLayer.clearLayers();document.getElementById('dg-progress').textContent='';showToast('تم مسح');});

/* ════ SLOPE ANALYSIS ════ */
document.getElementById('tool-slope').addEventListener('click',function(){toggleModal('modal-slope');});
document.getElementById('slope-apply').addEventListener('click',async function(){
  slopeLayer.clearLayers();var btn=this;btn.disabled=true;
  var N=parseInt(document.getElementById('slope-grid').value)||18;
  var b=map.getBounds();
  var latStep=(b.getNorth()-b.getSouth())/(N-1), lngStep=(b.getEast()-b.getWest())/(N-1);
  var prog=document.getElementById('slope-progress'); prog.textContent='⏳ بناء الشبكة…';
  var locs=[];
  for(var i=0;i<N;i++)for(var j=0;j<N;j++)locs.push({lat:b.getSouth()+i*latStep,lng:b.getWest()+j*lngStep});
  prog.textContent='⏳ جلب '+locs.length+' ارتفاع…';
  var elevs=await getElevsBatched(locs,90); prog.textContent=''; btn.disabled=false;
  if(!elevs){showToast('فشل جلب التضاريس',true);return;}
  for(var i=1;i<N-1;i++){
    for(var j=1;j<N-1;j++){
      var idx=i*N+j;
      var dz_dx=(elevs[i*N+(j+1)]-elevs[i*N+(j-1)])/(2*lngStep*111000*Math.cos(locs[idx].lat*Math.PI/180));
      var dz_dy=(elevs[(i+1)*N+j]-elevs[(i-1)*N+j])/(2*latStep*111000);
      var slopeDeg=Math.atan(Math.sqrt(dz_dx*dz_dx+dz_dy*dz_dy))*180/Math.PI;
      var col=slopeDeg<5?'#56d364':slopeDeg<15?'#ffc947':slopeDeg<30?'#ff9800':'#e63946';
      var la1=b.getSouth()+(i-0.5)*latStep, la2=la1+latStep, ln1=b.getWest()+(j-0.5)*lngStep, ln2=ln1+lngStep;
      L.polygon([[la1,ln1],[la1,ln2],[la2,ln2],[la2,ln1]],{color:'transparent',fillColor:col,fillOpacity:0.4,weight:0})
        .addTo(slopeLayer).bindTooltip(slopeDeg.toFixed(1)+'° | ارتفاع '+elevs[idx].toFixed(0)+'م',{sticky:true});
    }
  }
  showToast('✅ تحليل المنحدرات اكتمل ('+N+'×'+N+' خلية)');
});
document.getElementById('slope-clear').addEventListener('click',function(){slopeLayer.clearLayers();document.getElementById('slope-progress').textContent='';showToast('تم مسح');});

/* ════ FLOOD MODELING ════ */
document.getElementById('tool-flood').addEventListener('click',function(){toggleModal('modal-flood');});
document.getElementById('flood-apply').addEventListener('click',async function(){
  floodLayer.clearLayers();var btn=this;btn.disabled=true;
  var level=parseFloat(document.getElementById('flood-level').value)||0;
  var N=parseInt(document.getElementById('flood-grid').value)||15;
  var b=map.getBounds();
  var latStep=(b.getNorth()-b.getSouth())/(N-1), lngStep=(b.getEast()-b.getWest())/(N-1);
  var prog=document.getElementById('flood-progress'); prog.textContent='⏳ جلب البيانات…';
  var locs=[];
  for(var i=0;i<N;i++)for(var j=0;j<N;j++)locs.push({lat:b.getSouth()+i*latStep,lng:b.getWest()+j*lngStep});
  var elevs=await getElevsBatched(locs,90); prog.textContent=''; btn.disabled=false;
  if(!elevs){showToast('فشل جلب التضاريس',true);return;}
  var floodCount=0;
  for(var i=0;i<N-1;i++){
    for(var j=0;j<N-1;j++){
      var idx=i*N+j; var h=elevs[idx];
      if(h<=level){
        var la1=b.getSouth()+i*latStep, la2=la1+latStep, ln1=b.getWest()+j*lngStep, ln2=ln1+lngStep;
        var depth=level-h;
        var opacity=Math.min(0.7,0.15+depth*0.05);
        L.polygon([[la1,ln1],[la1,ln2],[la2,ln2],[la2,ln1]],{color:'transparent',fillColor:'#1a73e8',fillOpacity:opacity,weight:0})
          .addTo(floodLayer).bindTooltip('عمق: '+(depth).toFixed(1)+' م | ارتفاع الأرض: '+h.toFixed(1)+' م',{sticky:true});
        floodCount++;
      }
    }
  }
  document.getElementById('flood-result').textContent=floodCount>0?'🌊 '+floodCount+' خلية ستُغمر عند منسوب '+level+' م':'✅ لا توجد مناطق تُغمر عند هذا المنسوب';
  showToast(floodCount>0?'🌊 '+floodCount+' خلية ستُغمر':'✅ لا فيضان في المنطقة');
});
document.getElementById('flood-clear').addEventListener('click',function(){floodLayer.clearLayers();document.getElementById('flood-progress').textContent='';document.getElementById('flood-result').textContent='';showToast('تم مسح');});

/* ════ SOLAR ANALYSIS ════ */
document.getElementById('tool-solar').addEventListener('click',function(){toggleModal('modal-solar');});
document.getElementById('solar-now').addEventListener('click',function(){var d=new Date();document.getElementById('solar-date').value=d.toISOString().split('T')[0];document.getElementById('solar-time').value=d.toISOString().split('T')[1].slice(0,5);document.getElementById('solar-apply').click();});
document.getElementById('solar-apply').addEventListener('click',function(){
  solarLayer.clearLayers();
  if(!mainMarker){showToast('ضع علامة على الخريطة أولاً',true);return;}
  var dateStr=document.getElementById('solar-date').value, timeStr=document.getElementById('solar-time').value;
  if(!dateStr){showToast('اختر تاريخاً',true);return;}
  var dateTime=new Date(dateStr+'T'+(timeStr||'12:00')+':00Z');
  var ll=mainMarker.getLatLng();
  var sun=sunPosition(dateTime,ll.lat,ll.lng);
  var objH=parseFloat(document.getElementById('solar-obj-h').value)||10;
  // Shadow length = object height / tan(elevation angle), direction = opposite to azimuth
  var shadowLen=sun.altitude>0?objH/Math.tan(sun.altitude*Math.PI/180):null;
  var shadowAz=(sun.azimuth+180)%360; // shadow goes opposite to sun
  var res=document.getElementById('solar-result');
  if(sun.altitude<0){
    res.innerHTML='<span style="color:#e3b341">🌙 الشمس تحت الأفق — وقت الليل</span><br>الزاوية: '+sun.altitude.toFixed(2)+'° | الاتجاه: '+sun.azimuth.toFixed(1)+'°';
  }else{
    res.innerHTML='☀️ ارتفاع الشمس: <strong>'+sun.altitude.toFixed(2)+'°</strong><br>الاتجاه (Azimuth): <strong>'+sun.azimuth.toFixed(1)+'° ('+azToDir(sun.azimuth)+')</strong><br>طول الظل ('+objH+'م): <strong>'+(shadowLen?shadowLen.toFixed(1)+' م':'لا ظل')+'</strong>';
    // Draw shadow line from marker
    if(shadowLen&&shadowLen<100){
      var shadowEnd=turf.destination(turf.point([ll.lng,ll.lat]),shadowLen/1000,shadowAz,{units:'kilometers'});
      L.polyline([[ll.lat,ll.lng],[shadowEnd.geometry.coordinates[1],shadowEnd.geometry.coordinates[0]]],{color:'#e3b341',weight:3,opacity:0.9}).addTo(solarLayer);
      L.circleMarker([shadowEnd.geometry.coordinates[1],shadowEnd.geometry.coordinates[0]],{radius:4,color:'#e3b341',fillColor:'#e3b341',fillOpacity:0.8}).addTo(solarLayer);
    }
    // Sun direction line
    var sunDest=turf.destination(turf.point([ll.lng,ll.lat]),0.5,sun.azimuth,{units:'kilometers'});
    L.polyline([[ll.lat,ll.lng],[sunDest.geometry.coordinates[1],sunDest.geometry.coordinates[0]]],{color:'#ffc947',weight:2,opacity:0.6,dashArray:'5,3'}).addTo(solarLayer);
  }
  showToast('☀️ تحليل موضع الشمس اكتمل');
});
document.getElementById('solar-clear').addEventListener('click',function(){solarLayer.clearLayers();document.getElementById('solar-result').textContent='';showToast('تم مسح');});
function sunPosition(date,lat,lng){
  var d=date.getTime()/86400000+2440587.5-2451545.0;
  var L=(280.46+0.9856474*d)%360;
  var g=((357.528+0.9856003*d)%360)*Math.PI/180;
  var lam=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*Math.PI/180;
  var eps=(23.439-0.0000004*d)*Math.PI/180;
  var dec=Math.asin(Math.sin(eps)*Math.sin(lam));
  var ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam));
  var UT=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
  var GHA=(280.46061837+360.98564736629*d+(UT-12)*15)*Math.PI/180;
  var H=GHA+lng*Math.PI/180-ra;
  var latR=lat*Math.PI/180;
  var sinAlt=Math.sin(latR)*Math.sin(dec)+Math.cos(latR)*Math.cos(dec)*Math.cos(H);
  var alt=Math.asin(Math.max(-1,Math.min(1,sinAlt)))*180/Math.PI;
  var az=(Math.atan2(-Math.cos(dec)*Math.sin(H),Math.sin(latR)*Math.cos(dec)*Math.cos(H)-Math.cos(latR)*Math.sin(dec))*180/Math.PI+360)%360;
  return{altitude:alt,azimuth:az};
}
function azToDir(az){var dirs=['شمال','شمال شرق','شرق','جنوب شرق','جنوب','جنوب غرب','غرب','شمال غرب'];return dirs[Math.round(az/45)%8];}

/* ════ WEAPONS RANGE RINGS ════ */
document.getElementById('tool-weapons').addEventListener('click',function(){toggleModal('modal-weapons');});
document.getElementById('weapons-apply').addEventListener('click',function(){
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  var preset=document.getElementById('weapons-preset').value;
  var PRESETS={small:{ranges:[0.3,0.6,1],label:'سلاح خفيف'},mortar:{ranges:[1,3,7],label:'هاون 120مم'},arty:{ranges:[5,15,30],label:'مدفعية 155مم'},mlrs:{ranges:[10,45,80],label:'MLRS'},srm:{ranges:[50,100,150],label:'صاروخ قصير المدى'},mrm:{ranges:[100,300,500],label:'صاروخ متوسط المدى'}};
  var ranges=[],label='مخصص';
  if(preset&&PRESETS[preset]){ranges=PRESETS[preset].ranges;label=PRESETS[preset].label;}
  else{var custom=document.getElementById('weapons-custom').value;ranges=custom.split(',').map(function(v){return parseFloat(v.trim());}).filter(function(v){return!isNaN(v)&&v>0;});}
  if(!ranges.length){showToast('أدخل مديات صحيحة',true);return;}
  var color=document.getElementById('weapons-color').value;
  var c=mainMarker.getLatLng();
  ranges.forEach(function(r,idx){
    var opacity=0.08+idx*0.03;
    L.circle([c.lat,c.lng],{radius:r*1000,color:color,fillColor:color,weight:1.5,fillOpacity:opacity})
      .addTo(weaponLayer).bindTooltip('<b>'+label+'</b><br>المدى: '+r+' كم',{permanent:false});
    var labelPt=turf.destination(turf.point([c.lng,c.lat]),r,0,{units:'kilometers'});
    L.marker([labelPt.geometry.coordinates[1],labelPt.geometry.coordinates[0]],{
      icon:L.divIcon({className:'',html:'<div class="ring-label">'+r+' كم</div>',iconSize:[50,16],iconAnchor:[25,8]})
    }).addTo(weaponLayer);
  });
  showToast('🎯 تم رسم حلقات '+label+' ('+ranges.length+' مدى)');
});
document.getElementById('weapons-clear').addEventListener('click',function(){weaponLayer.clearLayers();showToast('تم مسح');});

/* ════ SAFE ROUTE ════ */
document.getElementById('tool-saferoute').addEventListener('click',function(){toggleModal('modal-saferoute');});
document.getElementById('sr-from-marker').addEventListener('click',function(){if(!mainMarker){showToast('ضع علامة أولاً',true);return;}var ll=mainMarker.getLatLng();document.getElementById('sr-from').value=ll.lat.toFixed(6)+', '+ll.lng.toFixed(6);});
document.getElementById('sr-apply').addEventListener('click',async function(){
  var apiKey=document.getElementById('ors-key').value.trim();if(!apiKey){showToast('أدخل مفتاح ORS في نافذة Isochrones',true);return;}
  var fromC=parseCoords(document.getElementById('sr-from').value.trim().replace(/،/g,','));
  var toC=parseCoords(document.getElementById('sr-to').value.trim().replace(/،/g,','));
  if(!fromC||!toC){showToast('أدخل إحداثيات صحيحة للبداية والنهاية',true);return;}
  var mode=document.getElementById('sr-mode').value; var btn=this; btn.disabled=true;
  document.getElementById('sr-progress').textContent='⏳ حساب المسار…';
  safeRouteLayer.clearLayers();
  try{
    var res=await fetchTimeout('https://api.openrouteservice.org/v2/directions/'+mode,{method:'POST',headers:{'Authorization':apiKey,'Content-Type':'application/json'},body:JSON.stringify({coordinates:[[fromC.lng,fromC.lat],[toC.lng,toC.lat]]})},15000);
    document.getElementById('sr-progress').textContent='';btn.disabled=false;
    if(!res.ok){var t=await res.text();throw new Error('HTTP '+res.status+': '+t.slice(0,60));}
    var data=await res.json();
    var geometry=data.routes[0].geometry; // encoded polyline or GeoJSON
    var geoLine;
    if(typeof geometry==='string'){
      // Decode Google polyline
      geoLine=decodePolyline(geometry);
    }else{
      geoLine=geometry.coordinates.map(function(c){return[c[1],c[0]];});
    }
    var summary=data.routes[0].summary;
    var distKm=(summary.distance/1000).toFixed(2), durMin=Math.round(summary.duration/60);
    // Check if route passes through forbidden zones
    var warnings=[];
    var turfLine=turf.lineString(data.routes[0].geometry.coordinates||geoLine.map(function(ll){return[ll[1],ll[0]];}));
    zones.forEach(function(z){
      var co=z.points.map(function(p){return[p.lng,p.lat];}); co.push(co[0]);
      var poly=turf.polygon([co]);
      try{if(turf.booleanIntersects(turfLine,poly))warnings.push(z.name);}catch(e){}
    });
    var routeColor=warnings.length?'#f85149':'#56d364';
    L.polyline(geoLine,{color:routeColor,weight:4,opacity:0.85}).addTo(safeRouteLayer);
    L.circleMarker([fromC.lat,fromC.lng],{radius:7,color:'#56d364',fillColor:'#56d364',fillOpacity:0.9,weight:2}).addTo(safeRouteLayer).bindPopup('🟢 نقطة البداية');
    L.circleMarker([toC.lat,toC.lng],{radius:7,color:'#e63946',fillColor:'#e63946',fillOpacity:0.9,weight:2}).addTo(safeRouteLayer).bindPopup('🔴 نقطة الوصول');
    var result='📍 المسافة: '+distKm+' كم | الزمن: '+durMin+' دقيقة';
    if(warnings.length)result+='<br><span style="color:#f85149">⚠️ المسار يخترق: '+warnings.join('، ')+'</span>';
    else result+='<br><span style="color:#56d364">✅ المسار آمن</span>';
    document.getElementById('sr-result').innerHTML=result;
    showToast(warnings.length?'⚠️ تحذير: يخترق مناطق محظورة':'✅ مسار آمن — '+distKm+' كم');
  }catch(e){document.getElementById('sr-progress').textContent='';btn.disabled=false;document.getElementById('sr-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
document.getElementById('sr-clear').addEventListener('click',function(){safeRouteLayer.clearLayers();document.getElementById('sr-result').textContent='';showToast('تم مسح');});
function decodePolyline(encoded){var points=[],index=0,lat=0,lng=0;while(index<encoded.length){var b,shift=0,result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=32);lat+=(result&1)?~(result>>1):(result>>1);shift=0;result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=32);lng+=(result&1)?~(result>>1):(result>>1);points.push([lat/1e5,lng/1e5]);}return points;}

/* ════ OPTIMAL OP PLACEMENT ════ */
document.getElementById('tool-optop').addEventListener('click',function(){toggleModal('modal-optop');});
document.getElementById('op-apply').addEventListener('click',async function(){
  if(!mainMarker){showToast('ضع علامة مركزاً للبحث',true);return;}
  opLayer.clearLayers();var btn=this;btn.disabled=true;
  var searchR=parseFloat(document.getElementById('op-search-r').value)||3;
  var viewR=parseFloat(document.getElementById('op-view-r').value)||5;
  var nCand=parseInt(document.getElementById('op-candidates').value)||16;
  var gridN=Math.round(Math.sqrt(nCand)); var center=mainMarker.getLatLng();
  var prog=document.getElementById('op-progress'); prog.textContent='⏳ إنشاء '+nCand+' نقطة مرشحة…';
  // Generate candidate grid
  var candidates=[];
  for(var i=0;i<gridN;i++){for(var j=0;j<gridN;j++){
    var bearing_x=(j/(gridN-1)-0.5)*2; var bearing_y=(i/(gridN-1)-0.5)*2;
    var dist=Math.sqrt(bearing_x*bearing_x+bearing_y*bearing_y)*searchR;
    var bearing=Math.atan2(bearing_x,bearing_y)*180/Math.PI;
    var dest=turf.destination(turf.point([center.lng,center.lat]),dist,bearing,{units:'kilometers'});
    candidates.push({lat:dest.geometry.coordinates[1],lng:dest.geometry.coordinates[0]});
  }}
  // Get candidate elevations
  prog.textContent='⏳ جلب ارتفاعات النقاط المرشحة…';
  var candElevs=await getElevations(candidates); if(!candElevs){prog.textContent='';btn.disabled=false;showToast('فشل',true);return;}
  // For each candidate, run quick viewshed (12 rays × 6 steps)
  prog.textContent='⏳ تقييم التغطية لكل نقطة…';
  var RAYS=12, STEPS=6, allRayLocs=[], candidateRayMaps=[];
  candidates.forEach(function(cand,ci){
    candidateRayMaps[ci]=[];
    for(var r=0;r<RAYS;r++){
      candidateRayMaps[ci][r]=[];
      for(var s=0;s<STEPS;s++){
        var d_km=viewR*(s+1)/STEPS;
        var bearing=(r/RAYS)*360;
        var dest=turf.destination(turf.point([cand.lng,cand.lat]),d_km,bearing,{units:'kilometers'});
        candidateRayMaps[ci][r][s]=allRayLocs.length;
        allRayLocs.push({lat:dest.geometry.coordinates[1],lng:dest.geometry.coordinates[0],distM:d_km*1000});
      }
    }
  });
  prog.textContent='⏳ جلب ارتفاعات شبكة التحليل ('+allRayLocs.length+' نقطة)…';
  var allElevs=await getElevsBatched(allRayLocs,90); if(!allElevs){prog.textContent='';btn.disabled=false;showToast('فشل',true);return;}
  // Score each candidate
  var bestScore=-1, bestIdx=0;
  candidates.forEach(function(cand,ci){
    var obsH=(candElevs[ci]||0)+2; var score=0;
    for(var r=0;r<RAYS;r++){
      var maxAngle=-Infinity, lastVis=0;
      for(var s=0;s<STEPS;s++){
        var fi=candidateRayMaps[ci][r][s], h=allElevs[fi]||0, d=allRayLocs[fi].distM;
        var curv=(d*d)/(2*R_EARTH)*(1-K_REFRACT);
        var elevAng=(h-curv-obsH)/d;
        if(elevAng>=maxAngle){maxAngle=elevAng;lastVis=s;}
      }
      score+=lastVis;
    }
    if(score>bestScore){bestScore=score;bestIdx=ci;}
    // Mark candidates
    L.circleMarker([cand.lat,cand.lng],{radius:4,color:'#484f58',fillColor:'#484f58',fillOpacity:0.5,weight:1}).addTo(opLayer);
  });
  prog.textContent=''; btn.disabled=false;
  // Mark best candidate
  var best=candidates[bestIdx];
  var bestIcon=L.divIcon({className:'',html:'<div style="font-size:22px;filter:drop-shadow(0 0 6px #ffc947)">🏔️</div>',iconSize:[24,24],iconAnchor:[12,12]});
  L.marker([best.lat,best.lng],{icon:bestIcon}).addTo(opLayer).bindPopup('<b>🏔️ أفضل موقع مراقبة</b><br>الإحداثيات: '+best.lat.toFixed(6)+', '+best.lng.toFixed(6)+'<br>نسبة التغطية: '+(bestScore/(RAYS*STEPS)*100).toFixed(0)+'%<br>الارتفاع: '+(candElevs[bestIdx]||0).toFixed(0)+' م').openPopup();
  // Draw viewshed from best
  L.circle([best.lat,best.lng],{radius:viewR*1000,color:'#ffc947',fill:false,weight:1,dashArray:'4,4'}).addTo(opLayer);
  document.getElementById('op-result').innerHTML='🏔️ أفضل نقطة: '+best.lat.toFixed(5)+', '+best.lng.toFixed(5)+'<br>تغطية: '+(bestScore/(RAYS*STEPS)*100).toFixed(0)+'% | ارتفاع: '+(candElevs[bestIdx]||0).toFixed(0)+' م';
  showToast('🏔️ أفضل موقع مراقبة: '+(bestScore/(RAYS*STEPS)*100).toFixed(0)+'% تغطية');
});
document.getElementById('op-clear').addEventListener('click',function(){opLayer.clearLayers();document.getElementById('op-result').textContent='';document.getElementById('op-progress').textContent='';showToast('تم مسح');});

/* ════ CHOKEPOINTS ════ */
document.getElementById('tool-chokepoints').addEventListener('click',function(){toggleModal('modal-chokepoints');});
document.getElementById('choke-load').addEventListener('click',async function(){
  chokeLayer.clearLayers();var btn=this;btn.disabled=true;
  var b=map.getBounds(); var prog=document.getElementById('choke-progress'); prog.textContent='⏳ استعلام OpenStreetMap…';
  var filters='';
  if(document.getElementById('ck-bridges').checked)filters+='way["bridge"="yes"]('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+');';
  if(document.getElementById('ck-tunnels').checked)filters+='way["tunnel"="yes"]('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+');';
  if(document.getElementById('ck-crossings').checked)filters+='node["highway"="crossing"]('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+');way["highway"="crossing"]('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+');';
  if(document.getElementById('ck-fords').checked)filters+='node["ford"="yes"]('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+');';
  if(!filters){prog.textContent='';btn.disabled=false;showToast('اختر نوعاً واحداً على الأقل',true);return;}
  var query='[out:json][timeout:30];('+filters+');out center;';
  try{
    var res=await fetchTimeout('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),{},30000);
    prog.textContent=''; btn.disabled=false;
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json(); var count=0;
    data.elements.forEach(function(el){
      var lat=el.lat||(el.center&&el.center.lat), lng=el.lon||(el.center&&el.center.lon);
      if(!lat||!lng)return;
      var type=el.tags&&(el.tags.bridge?'🌉 جسر':el.tags.tunnel?'🚇 نفق':el.tags.ford?'🌊 مخاضة':'🔀 معبر');
      var name=el.tags&&(el.tags.name||el.tags['name:ar']||type);
      var col=el.tags&&el.tags.bridge?'#ff9800':el.tags&&el.tags.tunnel?'#9c27b0':'#00d4ff';
      L.circleMarker([lat,lng],{radius:7,color:col,fillColor:col,fillOpacity:0.7,weight:2})
        .addTo(chokeLayer).bindPopup('<b>'+type+'</b><br>'+name+'<br>'+lat.toFixed(5)+', '+lng.toFixed(5));
      count++;
    });
    document.getElementById('choke-result').textContent='🌉 '+count+' نقطة اختناق في المنطقة';
    showToast('🌉 '+count+' نقطة اختناق');
  }catch(e){prog.textContent='';btn.disabled=false;document.getElementById('choke-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
document.getElementById('choke-clear').addEventListener('click',function(){chokeLayer.clearLayers();document.getElementById('choke-result').textContent='';showToast('تم مسح');});

/* ════ CELL TOWERS ════ */
document.getElementById('tool-celltowers').addEventListener('click',function(){toggleModal('modal-celltowers');});
document.getElementById('cell-load').addEventListener('click',async function(){
  var key=document.getElementById('cell-key').value.trim();if(!key){showToast('أدخل مفتاح OpenCelliD',true);return;}
  if(!mainMarker){showToast('ضع علامة تحدد مركز البحث',true);return;}
  var radius=parseFloat(document.getElementById('cell-radius').value)||10;
  var c=mainMarker.getLatLng();var btn=this;btn.disabled=true;
  var prog=document.getElementById('cell-progress'); prog.textContent='⏳ جلب أبراج الاتصالات…';
  var bbox={minLat:c.lat-radius/111,maxLat:c.lat+radius/111,minLon:c.lng-radius/(111*Math.cos(c.lat*Math.PI/180)),maxLon:c.lng+radius/(111*Math.cos(c.lat*Math.PI/180))};
  try{
    // OpenCelliD JSON API — note: CORS may block direct browser requests
    var url='https://api.opencellid.org/cell/getInArea.json?key='+key+'&BBOX='+bbox.minLat+','+bbox.minLon+','+bbox.maxLat+','+bbox.maxLon+'&format=json&limit=1000';
    var res=await fetchTimeout(url,{mode:'cors'},15000);
    prog.textContent='';btn.disabled=false;
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json(); cellLayer.clearLayers();
    var cells=data.cells||[];
    cells.forEach(function(cell){
      var icon=L.divIcon({className:'',html:'<div style="font-size:14px;filter:drop-shadow(0 0 3px #56d364)">📶</div>',iconSize:[16,16],iconAnchor:[8,8]});
      L.marker([cell.lat,cell.lon],{icon:icon}).addTo(cellLayer).bindPopup('<b>📶 برج اتصالات</b><br>MCC: '+cell.mcc+'<br>MNC: '+cell.mnc+'<br>Cell ID: '+cell.cellid+'<br>القوة: '+(cell.averageSignalStrength||'N/A')+' dBm');
      if(cell.range)L.circle([cell.lat,cell.lon],{radius:cell.range,color:'#56d364',fillColor:'#56d364',fillOpacity:0.04,weight:0.5}).addTo(cellLayer);
    });
    document.getElementById('cell-result').textContent='📶 '+cells.length+' برج اتصالات';
    showToast('📶 '+cells.length+' برج');
  }catch(e){
    prog.textContent='';btn.disabled=false;
    document.getElementById('cell-result').textContent='⚠ '+e.message+'\n💡 قد يتطلب CORS proxy — جرّب opencellid.org مباشرةً';
    showToast('فشل: '+e.message,true);
  }
});
document.getElementById('cell-clear').addEventListener('click',function(){cellLayer.clearLayers();document.getElementById('cell-result').textContent='';showToast('تم مسح');});

/* ════ RADAR COVERAGE ════ */
document.getElementById('tool-radar').addEventListener('click',function(){toggleModal('modal-radar');});
document.getElementById('radar-apply').addEventListener('click',async function(){
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  radarLayer.clearLayers();var btn=this;btn.disabled=true;
  var radarH=parseFloat(document.getElementById('radar-h').value)||5;
  var range=parseFloat(document.getElementById('radar-range').value)||15;
  var numRays=parseInt(document.getElementById('radar-rays').value)||36;
  var center=mainMarker.getLatLng();
  var result=await runViewshedEngine(center,range,numRays,radarH,document.getElementById('radar-progress'));
  btn.disabled=false;
  if(!result){showToast('فشل جلب التضاريس',true);return;}
  L.circle([center.lat,center.lng],{radius:range*1000,color:'#484f58',fill:false,weight:1,dashArray:'5,5'}).addTo(radarLayer);
  var hPts=result.horizonPts.concat([result.horizonPts[0]]);
  L.polygon(hPts,{color:'#9c27b0',fillColor:'#9c27b0',weight:1.5,fillOpacity:0.18}).addTo(radarLayer).bindPopup('🔭 تغطية الرادار<br>الارتفاع: '+radarH+'م | المدى: '+range+' كم');
  var radarIcon=L.divIcon({className:'',html:'<div style="font-size:20px;filter:drop-shadow(0 0 8px #9c27b0)">🔭</div>',iconSize:[22,22],iconAnchor:[11,11]});
  L.marker([center.lat,center.lng],{icon:radarIcon}).addTo(radarLayer).bindPopup('موضع الرادار<br>ارتفاع: '+radarH+'م');
  showToast('✅ تغطية الرادار اكتملت');
});
document.getElementById('radar-clear').addEventListener('click',function(){radarLayer.clearLayers();document.getElementById('radar-progress').textContent='';showToast('تم مسح');});

/* ════ POPULATION DENSITY ════ */
document.getElementById('tool-population').addEventListener('click',function(){toggleModal('modal-population');});
document.getElementById('pop-apply').addEventListener('click',function(){
  if(popTile&&map.hasLayer(popTile)){map.removeLayer(popTile);popTile=null;}
  var type=document.getElementById('pop-type').value;
  var opacity=parseInt(document.getElementById('pop-opacity').value)/100;
  var layerName=type==='density'?'gpw-v4:gpw-v4-population-density-adjusted-to-2015-unwpp-country-totals_2020':'gpw-v4:gpw-v4-population-count-adjusted-to-2015-unwpp-country-totals_2020';
  popTile=L.tileLayer.wms('https://sedac.ciesin.columbia.edu/geoserver/gpw-v4/wms',{layers:layerName,format:'image/png',transparent:true,attribution:'© SEDAC/CIESIN',opacity:opacity,version:'1.1.1'});
  popTile.addTo(map);showToast('👥 طبقة كثافة السكان (GPWv4 — SEDAC/NASA)');
});
document.getElementById('pop-clear').addEventListener('click',function(){if(popTile&&map.hasLayer(popTile)){map.removeLayer(popTile);popTile=null;}showToast('تم إخفاء الطبقة');});

/* ════ CRITICAL INFRASTRUCTURE ════ */
document.getElementById('tool-infra').addEventListener('click',function(){toggleModal('modal-infra');});
document.getElementById('infra-load').addEventListener('click',async function(){
  infraLayer.clearLayers();var btn=this;btn.disabled=true;
  var b=map.getBounds(); var prog=document.getElementById('infra-progress'); prog.textContent='⏳ استعلام Overpass API…';
  var bbox='('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+')';
  var filters='';
  if(document.getElementById('inf-hospital').checked)filters+='node["amenity"="hospital"]'+bbox+';way["amenity"="hospital"]'+bbox+';';
  if(document.getElementById('inf-airport').checked)filters+='node["aeroway"="aerodrome"]'+bbox+';way["aeroway"="aerodrome"]'+bbox+';';
  if(document.getElementById('inf-fuel').checked)filters+='node["amenity"="fuel"]'+bbox+';';
  if(document.getElementById('inf-water').checked)filters+='node["man_made"="water_works"]'+bbox+';way["man_made"="water_works"]'+bbox+';';
  if(document.getElementById('inf-military').checked)filters+='way["landuse"="military"]'+bbox+';node["military"]'+bbox+';';
  if(document.getElementById('inf-comm').checked)filters+='node["man_made"="communications_tower"]'+bbox+';node["tower:type"="communication"]'+bbox+';';
  var query='[out:json][timeout:30];('+filters+');out center;';
  try{
    var res=await fetchTimeout('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),{},30000);
    prog.textContent='';btn.disabled=false;
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json(); var count=0;
    var ICONS={'hospital':'🏥','aerodrome':'✈️','fuel':'⛽','water_works':'💧','military':'🪖','communication':'📡'};
    data.elements.forEach(function(el){
      var lat=el.lat||(el.center&&el.center.lat), lng=el.lon||(el.center&&el.center.lon); if(!lat||!lng)return;
      var tags=el.tags||{};
      var type=tags.amenity||tags.aeroway||tags.man_made||tags.landuse||tags.military||'infra';
      var emoji=ICONS[type]||'🏭';
      var name=tags.name||tags['name:ar']||emoji+' '+type;
      var icon=L.divIcon({className:'',html:'<div style="font-size:16px;filter:drop-shadow(0 0 4px rgba(255,255,255,.4))">'+emoji+'</div>',iconSize:[20,20],iconAnchor:[10,10]});
      L.marker([lat,lng],{icon:icon}).addTo(infraLayer).bindPopup('<b>'+emoji+' '+name+'</b><br>النوع: '+type+'<br>'+lat.toFixed(5)+', '+lng.toFixed(5));count++;
    });
    document.getElementById('infra-result').textContent='🏭 '+count+' منشأة بنية تحتية';
    showToast('🏭 '+count+' منشأة');
  }catch(e){prog.textContent='';btn.disabled=false;document.getElementById('infra-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
document.getElementById('infra-clear').addEventListener('click',function(){infraLayer.clearLayers();document.getElementById('infra-result').textContent='';showToast('تم مسح');});

/* ════ POWER GRID ════ */
document.getElementById('tool-powergrid').addEventListener('click',function(){toggleModal('modal-powergrid');});
document.getElementById('power-load').addEventListener('click',async function(){
  powerLayer.clearLayers();var btn=this;btn.disabled=true;
  var b=map.getBounds(); var prog=document.getElementById('power-progress'); prog.textContent='⏳ استعلام Overpass API…';
  var bbox='('+b.getSouth()+','+b.getWest()+','+b.getNorth()+','+b.getEast()+')';
  var filters='';
  if(document.getElementById('pg-lines').checked)filters+='way["power"="line"]'+bbox+';way["power"="cable"]'+bbox+';';
  if(document.getElementById('pg-stations').checked)filters+='node["power"="plant"]'+bbox+';way["power"="plant"]'+bbox+';';
  if(document.getElementById('pg-substations').checked)filters+='node["power"="substation"]'+bbox+';way["power"="substation"]'+bbox+';node["power"="transformer"]'+bbox+';';
  var query='[out:json][timeout:30];('+filters+');out geom;';
  try{
    var res=await fetchTimeout('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),{},30000);
    prog.textContent='';btn.disabled=false;
    if(!res.ok)throw new Error('HTTP '+res.status);
    var data=await res.json(); var lineCount=0,nodeCount=0;
    data.elements.forEach(function(el){
      var tags=el.tags||{};
      if(el.type==='way'&&el.geometry){
        var pts=el.geometry.map(function(g){return[g.lat,g.lon];});
        var col=tags.power==='plant'?'#e63946':tags.power==='line'?'#ffc947':'#ff9800';
        L.polyline(pts,{color:col,weight:tags.voltage>200000?2.5:1.5,opacity:0.85}).addTo(powerLayer)
          .bindPopup('<b>⚡ '+(tags.power||'كهرباء')+'</b><br>الجهد: '+(tags.voltage?tags.voltage+' V':'غير محدد')+'<br>'+(tags.name||''));lineCount++;
      }else{
        var lat=el.lat||(el.center&&el.center.lat),lng=el.lon||(el.center&&el.center.lon);if(!lat||!lng)return;
        var emoji=tags.power==='plant'?'🏭':tags.power==='substation'?'⚡':'🔌';
        var icon=L.divIcon({className:'',html:'<div style="font-size:14px">'+emoji+'</div>',iconSize:[16,16],iconAnchor:[8,8]});
        L.marker([lat,lng],{icon:icon}).addTo(powerLayer).bindPopup('<b>'+emoji+' '+(tags.power||'')+'</b><br>'+(tags.name||'')+'<br>'+(tags.voltage?'الجهد: '+tags.voltage+' V':''));nodeCount++;
      }
    });
    document.getElementById('power-result').textContent='⚡ '+lineCount+' خط + '+nodeCount+' محطة/محول';
    showToast('⚡ '+lineCount+' خط كهرباء، '+nodeCount+' نقطة');
  }catch(e){prog.textContent='';btn.disabled=false;document.getElementById('power-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
document.getElementById('power-clear').addEventListener('click',function(){powerLayer.clearLayers();document.getElementById('power-result').textContent='';showToast('تم مسح');});

/* ════ MGRS GRID OVERLAY ════ */
document.getElementById('tool-mgrsgrid').addEventListener('click',function(){toggleModal('modal-mgrsgrid');});
document.getElementById('grid-toggle').addEventListener('click',function(){
  mgrsGridActive=!mgrsGridActive;
  if(mgrsGridActive){drawMGRSGrid();document.getElementById('grid-result').textContent='✅ الشبكة نشطة — تتحدث مع التكبير والتنقل';}
  else{mgrsGridLayer.clearLayers();document.getElementById('grid-result').textContent='⭕ الشبكة متوقفة';}
});
document.getElementById('grid-refresh').addEventListener('click',function(){if(mgrsGridActive)drawMGRSGrid();else showToast('فعّل الشبكة أولاً','warn');});
function drawMGRSGrid(){
  mgrsGridLayer.clearLayers();
  var b=map.getBounds(),zoom=map.getZoom();
  var col=document.getElementById('grid-color').value;
  var opacity=parseInt(document.getElementById('grid-opacity').value)/100;
  // Determine interval
  var interval;
  if(zoom>=14)interval=0.01;
  else if(zoom>=11)interval=0.1;
  else if(zoom>=8)interval=0.5;
  else if(zoom>=5)interval=2;
  else interval=6;
  var minLat=Math.floor(b.getSouth()/interval)*interval;
  var maxLat=Math.ceil(b.getNorth()/interval)*interval;
  var minLng=Math.floor(b.getWest()/interval)*interval;
  var maxLng=Math.ceil(b.getEast()/interval)*interval;
  var isZone=(interval>=6), weight=isZone?1.5:0.6;
  // Draw horizontal grid lines
  for(var lat=minLat;lat<=maxLat;lat=parseFloat((lat+interval).toFixed(8))){
    if(lat<-90||lat>90)continue;
    L.polyline([[lat,b.getWest()],[lat,b.getEast()]],{color:col,weight:weight,opacity:opacity,interactive:false}).addTo(mgrsGridLayer);
    if(zoom>=7){
      L.marker([lat,(b.getWest()+b.getEast())/2],{icon:L.divIcon({className:'',html:'<div style="color:'+col+';font-size:8.5px;white-space:nowrap;font-family:monospace;opacity:'+opacity+'">'+lat.toFixed(interval<0.1?2:1)+'°</div>',iconSize:[60,12],iconAnchor:[30,6]}),interactive:false}).addTo(mgrsGridLayer);
    }
  }
  // Draw vertical grid lines
  for(var lng=minLng;lng<=maxLng;lng=parseFloat((lng+interval).toFixed(8))){
    if(lng<-180||lng>180)continue;
    L.polyline([[b.getSouth(),lng],[b.getNorth(),lng]],{color:col,weight:weight,opacity:opacity,interactive:false}).addTo(mgrsGridLayer);
    if(zoom>=7){
      L.marker([(b.getSouth()+b.getNorth())/2,lng],{icon:L.divIcon({className:'',html:'<div style="color:'+col+';font-size:8.5px;white-space:nowrap;font-family:monospace;opacity:'+opacity+'">'+lng.toFixed(interval<0.1?2:1)+'°</div>',iconSize:[60,12],iconAnchor:[30,6]}),interactive:false}).addTo(mgrsGridLayer);
    }
  }
  // Add MGRS labels at intersections (medium zoom)
  if(zoom>=8&&zoom<=12&&typeof mgrs!=='undefined'){
    for(var lat=minLat;lat<=maxLat;lat=parseFloat((lat+interval).toFixed(8))){
      for(var lng=minLng;lng<=maxLng;lng=parseFloat((lng+interval).toFixed(8))){
        if(lat<-80||lat>84)continue;
        try{
          var mgrsStr=mgrs.forward([lng,lat],2);
          L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div style="color:'+col+';font-size:7.5px;font-family:monospace;opacity:'+(opacity*0.8)+';background:rgba(13,17,23,.6);padding:1px 3px;border-radius:2px">'+mgrsStr.slice(0,5)+'</div>',iconSize:[60,14],iconAnchor:[0,7]}),interactive:false}).addTo(mgrsGridLayer);
        }catch(e){}
      }
    }
  }
}

/* ════ W3W + PLUS CODES ════ */
document.getElementById('tool-pluscode').addEventListener('click',function(){toggleModal('modal-pluscode');});
// W3W
document.getElementById('w3w-from-marker').addEventListener('click',async function(){
  var key=document.getElementById('w3w-key').value.trim();if(!key){showToast('أدخل مفتاح W3W',true);return;}
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  var ll=mainMarker.getLatLng();
  try{
    var res=await fetchTimeout('https://api.what3words.com/v3/convert-to-3wa?coordinates='+ll.lat+','+ll.lng+'&key='+key+'&language=ar',{},10000);
    if(!res.ok)throw new Error('HTTP '+res.status);
    var d=await res.json();
    if(d.error)throw new Error(d.error.message);
    document.getElementById('w3w-result').innerHTML='<strong style="color:#00d4ff">/// '+d.words+'</strong><br><span style="font-size:9.5px;color:#8b949e">'+d.nearestPlace+'</span>';
    showToast('/// '+d.words);
  }catch(e){document.getElementById('w3w-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
document.getElementById('w3w-decode').addEventListener('click',async function(){
  var key=document.getElementById('w3w-key').value.trim();if(!key){showToast('أدخل مفتاح W3W',true);return;}
  var words=document.getElementById('w3w-input').value.trim().replace(/^\/{0,3}/,'');
  if(!words||!words.includes('.')){showToast('أدخل عنوان W3W صحيح',true);return;}
  try{
    var res=await fetchTimeout('https://api.what3words.com/v3/convert-to-coordinates?words='+encodeURIComponent(words)+'&key='+key,{},10000);
    if(!res.ok)throw new Error('HTTP '+res.status);
    var d=await res.json();if(d.error)throw new Error(d.error.message);
    var ll=L.latLng(d.coordinates.lat,d.coordinates.lng);
    map.setView(ll,16);placeMainMarker(ll);setCoordPanel(ll,'/// '+d.words);
    document.getElementById('w3w-result').innerHTML='<strong style="color:#00d4ff">/// '+d.words+'</strong><br>'+d.coordinates.lat.toFixed(7)+', '+d.coordinates.lng.toFixed(7);
    showToast('✅ /// '+d.words);
  }catch(e){document.getElementById('w3w-result').textContent='⚠ '+e.message;showToast('فشل: '+e.message,true);}
});
// Plus Codes
document.getElementById('olc-from-marker').addEventListener('click',function(){
  if(!mainMarker){showToast('ضع علامة أولاً',true);return;}
  var ll=mainMarker.getLatLng();var code=OLC.encode(ll.lat,ll.lng,10);
  document.getElementById('olc-result').innerHTML='<strong style="color:#56d364">'+code+'</strong><br><span style="font-size:9.5px;color:#8b949e">دقة ±14م × ±14م</span>';
  showToast('Plus Code: '+code);
});
document.getElementById('olc-decode').addEventListener('click',function(){
  var code=document.getElementById('olc-input').value.trim();
  if(!code){showToast('أدخل Plus Code',true);return;}
  try{
    var result=OLC.decode(code);
    var ll=L.latLng(result.lat,result.lng);
    map.setView(ll,16);placeMainMarker(ll);setCoordPanel(ll,'Plus Code: '+code);
    document.getElementById('olc-result').innerHTML='<strong style="color:#56d364">'+code+'</strong><br>'+result.lat.toFixed(7)+', '+result.lng.toFixed(7);
    showToast('✅ '+code);
  }catch(e){document.getElementById('olc-result').textContent='⚠ كود غير صحيح';showToast('كود غير صحيح',true);}
});

/* ════ CLUSTERING & HEATMAP ════ */
// (these buttons are already handled above in the existing section)

/* ════ HELPERS ════ */
function toggleModal(id){
  var el=document.getElementById(id),open=el.classList.contains('open');
  document.querySelectorAll('.tool-modal').forEach(function(m){m.classList.remove('open');});
  if(!open)el.classList.add('open');
}
document.querySelectorAll('.tool-modal-close').forEach(function(btn){
  btn.addEventListener('click',function(){btn.closest('.tool-modal').classList.remove('open');});
});
async function copyText(text,msg){
  try{await navigator.clipboard.writeText(text);}
  catch(e){var ta=Object.assign(document.createElement('textarea'),{value:text,style:'position:fixed;opacity:0;'});document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}
  showToast(msg||'✓ تم النسخ');
}
var toastTimer;
function showToast(msg,type){
  var el=document.getElementById('toast');el.textContent=msg;
  el.className=type===true?'err':type==='warn'?'warn':'';
  el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.style.display='none';},3500);
}
function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
window.addEventListener('resize',function(){if(map)map.invalidateSize();});

/* Compatibility bridge for inline card actions and external controllers. */
window.openModal=openModal;
window.toggleEdit=toggleEdit;
window.doExport=doExport;
window.deleteZone=deleteZone;
window.showToast=showToast;
window.placeMainMarker=placeMainMarker;
window.setCoordPanel=setCoordPanel;
window.map=null;

/* ════ START ════ */
document.addEventListener('DOMContentLoaded',function(){initMap();window.map=map;});
