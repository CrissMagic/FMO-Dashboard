<template>
  <div class="contact-map-shell">
    <div ref="container" class="contact-map" role="region" aria-label="通联足迹地图" />
    <div class="map-overview">
      <button type="button" @click="showAll">全国视图</button><span>拖动浏览 · 双指缩放</span>
    </div>
    <div class="map-legend">
      <span><i class="lit" />已通联</span><span><i />尚未点亮</span
      ><span><i class="live" />讲话友台</span>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { boundsRing, gridBounds, gridCenter, toMapPoint } from '../../core/mapGeometry'

const props = defineProps({
  provinces: { type: Array, default: () => [] },
  regions: { type: Array, default: () => [] },
  contacted: { type: Array, default: () => [] },
  periodAreas: { type: Array, default: () => [] },
  grids: { type: Array, default: () => [] },
  periodGridIds: { type: Array, default: () => [] },
  mode: { type: String, default: 'area' },
  level: { type: String, default: 'province' },
  selectedId: { type: String, default: '' },
  speaker: { type: Object, default: null },
  selfPosition: { type: Object, default: null },
  follow: Boolean,
  focus: { type: Object, default: () => ({ type: 'all', sequence: 0 }) }
})
const emit = defineEmits(['select', 'province', 'manual', 'speaker'])
const container = ref(null)
let map,
  geography,
  footprints,
  liveLayer,
  resize = null
const features = new Map()
let initialFit = false
let overview = true
let fittingOverview = false

function label(text) {
  const span = document.createElement('span')
  span.textContent = text
  return span
}
function bindSelectable(layer, id, name) {
  layer.on('click', () => emit('select', id))
  const element = layer.getElement?.()
  if (element) {
    element.setAttribute('tabindex', '0')
    element.setAttribute('role', 'button')
    element.setAttribute('aria-label', `查看${name}的通联记录`)
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        emit('select', id)
      }
    })
  }
}
function polygonLayer(feature, options) {
  return L.geoJSON(feature, { style: options })
}
function renderMap() {
  if (!map) return
  geography.clearLayers()
  footprints.clearLayers()
  features.clear()
  const contacted = new Set(props.contacted),
    recent = new Set(props.periodAreas)
  const regionLabels = []
  for (const feature of props.provinces) {
    const layer = polygonLayer(feature, {
      color: '#8fa4b4',
      weight: 0.8,
      fillColor: '#e4edf3',
      fillOpacity: props.mode === 'grid' ? 0.2 : 0.7
    })
    layer.addTo(geography)
    if (props.mode === 'area' && props.level === 'city') {
      layer.on('click', () => emit('province', String(feature.properties.adcode)))
      layer.bindTooltip(label(`查看${feature.properties.name}的城市`), { className: 'map-label' })
    }
  }
  if (props.mode === 'area') {
    for (const feature of props.regions) {
      const id = `area:${feature.properties.adcode}`,
        lit = contacted.has(id),
        selected = props.selectedId === id
      const layer = polygonLayer(feature, {
        color: selected ? '#085a9c' : '#8ba6bb',
        weight: selected ? 2.5 : 0.9,
        fillColor: selected ? '#319bf0' : recent.has(id) ? '#62b5f1' : lit ? '#92c9f1' : '#e8eff4',
        fillOpacity: lit ? 0.85 : 0.75
      })
      layer.addTo(footprints)
      layer.eachLayer((child) => {
        child.bindTooltip(label(`${feature.properties.name}${lit ? ' · 已通联' : ''}`), {
          className: 'map-label',
          sticky: true
        })
        bindSelectable(child, id, feature.properties.name)
      })
      features.set(id, layer)
      if (
        map.getZoom() < 7 &&
        (props.level === 'province' || props.regions.length < 50) &&
        feature.properties.center
      ) {
        regionLabels.push({ feature, priority: selected ? 2 : lit ? 1 : 0 })
      }
    }
  } else {
    const recentGrid = new Set(props.periodGridIds)
    for (const grid of props.grids) {
      const bounds = gridBounds(grid.grid)
      if (!bounds) continue
      const selected = props.selectedId === grid.id
      const layer = L.polygon(
        boundsRing(bounds).map((p) => [p[1], p[0]]),
        {
          color: selected ? '#075a9b' : '#1687d5',
          weight: selected ? 2.8 : 1.2,
          fillColor: recentGrid.has(grid.id) ? '#36a3ef' : '#79b9e9',
          fillOpacity: grid.coarse ? 0.2 : 0.58,
          dashArray: grid.coarse ? '5 4' : undefined
        }
      )
      layer
        .addTo(footprints)
        .bindTooltip(label(`${grid.grid} · ${grid.coarse ? '原始粗网格' : '已通联'}`), {
          className: 'map-label',
          sticky: true
        })
      bindSelectable(layer, grid.id, grid.grid)
      features.set(grid.id, layer)
    }
  }
  drawRegionLabels(regionLabels)
  renderLive()
  if (!initialFit && props.provinces.length) {
    initialFit = true
    if (!props.follow) showAll()
  }
}
function drawRegionLabels(candidates) {
  const occupied = []
  const speakerPoint =
    props.speaker?.point || (props.speaker?.grid ? gridCenter(props.speaker.grid) : null)
  if (speakerPoint) {
    const mapped = toMapPoint(speakerPoint),
      p = map.latLngToContainerPoint([mapped.lat, mapped.lng])
    occupied.push({ x: p.x - 105, y: p.y - 42, w: 210, h: 40 })
  }
  for (const { feature } of candidates.sort((a, b) => b.priority - a.priority)) {
    const name = feature.properties.name.replace(
      /(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市)$/,
      ''
    )
    const center = [feature.properties.center[1], feature.properties.center[0]],
      point = map.latLngToContainerPoint(center)
    const box = {
      x: point.x - name.length * 6 - 3,
      y: point.y - 11,
      w: name.length * 12 + 6,
      h: 22
    }
    if (
      occupied.some(
        (b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y
      )
    )
      continue
    occupied.push(box)
    L.marker(center, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'region-name',
        html: label(name),
        iconSize: [80, 20],
        iconAnchor: [40, 10]
      })
    }).addTo(footprints)
  }
}
function renderLive() {
  if (!map) return
  liveLayer.clearLayers()
  const me = props.selfPosition ? toMapPoint(props.selfPosition) : null
  const speaker = props.speaker
  const rawTarget = speaker?.point || (speaker?.grid ? gridCenter(speaker.grid) : null)
  const target = rawTarget ? toMapPoint(rawTarget) : null
  if (me)
    L.circleMarker([me.lat, me.lng], {
      interactive: false,
      radius: 5,
      color: '#1c71b0',
      weight: 2,
      fillColor: '#fff',
      fillOpacity: 1
    })
      .addTo(liveLayer)
      .bindTooltip(label('本机位置'), { className: 'map-label' })
  if (!target) return
  if (speaker.grid && !speaker.point) {
    const b = gridBounds(speaker.grid)
    if (b)
      L.polygon(
        boundsRing(b).map((p) => [p[1], p[0]]),
        { color: '#299d68', weight: 1.5, fillOpacity: 0.1, dashArray: '5 4', interactive: false }
      ).addTo(liveLayer)
  }
  const color = speaker.source === 'aprs' ? '#af7a22' : '#299d68'
  L.circleMarker([target.lat, target.lng], {
    radius: speaker.active ? 8 : 6,
    color: '#fff',
    weight: 2,
    fillColor: color,
    fillOpacity: speaker.active ? 1 : 0.65
  })
    .on('click', () => emit('speaker'))
    .addTo(liveLayer)
    .bindTooltip(label(`${speaker.callsign} · ${speaker.sourceLabel}`), {
      permanent: true,
      direction: 'top',
      offset: [0, -8],
      className: 'speaker-map-label'
    })
  if (me && !speaker.self)
    L.polyline(
      [
        [me.lat, me.lng],
        [target.lat, target.lng]
      ],
      { color, weight: 1.6, dashArray: '5 6', interactive: false }
    ).addTo(liveLayer)
}
function showAll() {
  overview = true
  fittingOverview = true
  emit('manual')
  if (props.provinces.length) {
    const layer = L.geoJSON({ type: 'FeatureCollection', features: props.provinces })
    map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 5, animate: false })
  } else map.setView([35, 105], 4, { animate: false })
  fittingOverview = false
}
function focusSpeaker() {
  if (!map || !props.speaker) return
  const position = props.speaker.point || gridCenter(props.speaker.grid)
  if (!position) return
  overview = false
  const target = toMapPoint(position)
  const me = props.selfPosition ? toMapPoint(props.selfPosition) : null
  if (me && !props.speaker.self)
    map.fitBounds(
      [
        [me.lat, me.lng],
        [target.lat, target.lng]
      ],
      { padding: [56, 56], maxZoom: 10, animate: false }
    )
  else map.setView([target.lat, target.lng], 8, { animate: false })
}
function focusSelection() {
  overview = false
  const layer = features.get(props.selectedId)
  if (layer) map.fitBounds(layer.getBounds(), { padding: [36, 36], maxZoom: 10, animate: false })
  else if (props.selectedId.startsWith('grid:')) {
    const bounds = gridBounds(props.selectedId.slice(5))
    if (bounds)
      map.fitBounds(
        boundsRing(bounds).map((p) => [p[1], p[0]]),
        { padding: [36, 36], maxZoom: 10, animate: false }
      )
  }
}
onMounted(() => {
  map = L.map(container.value, {
    zoomControl: false,
    zoomSnap: 0.25,
    minZoom: 2,
    maxZoom: 14,
    worldCopyJump: true
  }).setView([35, 105], 4)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)
  map.attributionControl.setPrefix(false)
  map.attributionControl.addAttribution(
    '边界数据：<a href="https://datav.aliyun.com/portal/school/atlas/atlas_publish" target="_blank" rel="noopener noreferrer">DataV.GeoAtlas</a>'
  )
  geography = L.layerGroup().addTo(map)
  footprints = L.layerGroup().addTo(map)
  liveLayer = L.layerGroup().addTo(map)
  map.on('dragstart', () => {
    overview = false
    emit('manual')
  })
  map.on('zoomstart', () => {
    if (!fittingOverview) overview = false
  })
  map.on('zoomend', renderMap)
  renderMap()
  if (typeof window.ResizeObserver !== 'undefined') {
    resize = new window.ResizeObserver(handleResize)
    resize.observe(container.value)
  }
  window.addEventListener('resize', handleResize)
})
function handleResize() {
  if (!map || !container.value?.clientWidth || !container.value?.clientHeight) return
  map.invalidateSize({ pan: false })
  if (props.follow) focusSpeaker()
  else if (overview) showAll()
  renderMap()
}
watch(
  () => [
    props.provinces,
    props.regions,
    props.contacted,
    props.periodAreas,
    props.grids,
    props.periodGridIds,
    props.mode,
    props.level,
    props.selectedId
  ],
  renderMap
)
watch(
  () => [props.speaker, props.selfPosition],
  () => {
    renderMap()
    if (props.follow) focusSpeaker()
  }
)
watch(
  () => props.focus,
  () => {
    if (!map) return
    if (props.focus.type.startsWith('province:')) {
      overview = false
      const feature = props.provinces.find(
        (f) => String(f.properties.adcode) === props.focus.type.slice(9)
      )
      if (feature)
        map.fitBounds(L.geoJSON(feature).getBounds(), {
          padding: [24, 24],
          maxZoom: 9,
          animate: false
        })
    } else if (props.focus.type === 'speaker') focusSpeaker()
    else if (props.focus.type === 'selection') focusSelection()
    else showAll()
  }
)
onBeforeUnmount(() => {
  resize?.disconnect()
  window.removeEventListener('resize', handleResize)
  map?.remove()
  map = null
})
</script>

<style scoped>
.contact-map-shell {
  position: relative;
  height: 100%;
  min-height: 0;
  isolation: isolate;
  border-radius: 12px;
  overflow: hidden;
  background: #f1f6fa;
}
.contact-map {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 45%, #fff, #eaf2f8);
  font-family: inherit;
}
.map-overview {
  position: absolute;
  z-index: 500;
  top: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #637888;
  pointer-events: none;
}
.map-overview button {
  pointer-events: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.map-overview > span {
  display: none;
}
.map-legend {
  position: absolute;
  bottom: 37px;
  left: 16px;
  z-index: 500;
  display: flex;
  gap: 13px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  font-size: 12px;
  color: #415c70;
  pointer-events: none;
}
.map-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.map-legend i {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  background: #e8eff4;
  border: 1px solid #8ba6bb;
}
.map-legend .lit {
  background: #92c9f1;
  border-color: #1687d5;
}
.map-legend .live {
  border-radius: 50%;
  background: #299d68;
  border-color: #299d68;
}
:deep(.region-name) {
  font:
    12px/20px system-ui,
    sans-serif;
  text-align: center;
  color: #425c70;
  text-shadow: 0 0 3px #fff;
  pointer-events: none;
  background: transparent;
  border: 0;
}
:deep(.map-label),
:deep(.speaker-map-label) {
  font-family: inherit;
  border: 1px solid #c5d8e6;
  box-shadow: 0 3px 12px #244a6714;
  color: #224b68;
}
:deep(.leaflet-attribution-flag) {
  display: none;
}
:deep(.leaflet-control-attribution) {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.88);
}
:deep(.leaflet-interactive:focus) {
  outline: 3px solid #064e82;
  outline-offset: 2px;
}
@media (max-width: 768px) {
  .map-overview span {
    display: none;
  }
  .map-legend {
    gap: 10px;
    font-size: 11px;
    left: 8px;
  }
}
</style>
