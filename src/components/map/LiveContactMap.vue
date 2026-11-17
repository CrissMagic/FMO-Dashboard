<template>
  <div class="live-map-shell">
    <div ref="container" class="live-map" role="region" aria-label="现场位置地图，可拖动和缩放" />
    <div class="live-map-tools">
      <Button
        :variant="inspected ? 'default' : 'outline'"
        size="map"
        type="button"
        :aria-pressed="inspected ? undefined : following"
        :aria-label="inspected ? '返回实时跟随' : following ? '正在跟随' : '恢复跟随'"
        @click="resumeFollowing"
      >
        <SvgIcon name="map" :size="16" />{{
          inspected ? '返回实时跟随' : following ? '正在跟随' : '恢复跟随'
        }}
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="map-zoom-button"
        type="button"
        aria-label="放大地图"
        @click="zoom(1)"
        >＋</Button
      >
      <Button
        variant="outline"
        size="icon"
        class="map-zoom-button"
        type="button"
        aria-label="缩小地图"
        @click="zoom(-1)"
        >−</Button
      >
      <MapDisplaySettings />
    </div>
    <div class="map-status-stack">
      <div v-if="inspected" class="map-review-status" role="status">
        <strong>查看通联 · {{ inspected.callsign }}</strong>
        <span
          >{{ inspected.timeText }} · {{ inspected.sourceLabel
          }}<template v-if="inspected.receivedAt">
            · 位置更新于 {{ new Date(inspected.receivedAt).toLocaleString('zh-CN') }}</template
          ></span
        >
        <span>实时守听继续 · {{ speaker?.callsign || '等待发言' }}</span>
      </div>
      <p v-if="backgroundNotice" class="tile-notice" role="status">
        {{ backgroundNotice }}
        <Button
          v-if="!display.regionsLoading"
          variant="link"
          size="sm"
          type="button"
          @click="retryBackground"
          >重试</Button
        >
      </p>
      <div v-if="gridCaption || cursorCaption" class="map-grid-caption" aria-label="地图坐标与网格">
        <span v-if="gridCaption">{{ gridCaption }}</span>
        <span v-if="cursorCaption">{{ cursorCaption }}</span>
      </div>
      <span v-if="!viewedSpeaker?.point && viewedSpeaker?.callsign" class="map-location-note">
        {{ viewedSpeaker.callsign }} 未提供位置，当前未标记该友台
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { boundsRing, distanceKm, gridBounds, toMapPoint } from '../../core/mapGeometry'
import SvgIcon from '../common/SvgIcon.vue'
import { buildViewportGrid, formatMapPosition, fromMapPoint } from '../../core/mapDisplay'
import { useMapDisplayStore } from '../../stores/mapDisplayStore'
import { Button } from '../ui/button'
import MapDisplaySettings from './MapDisplaySettings.vue'

const props = defineProps({
  speaker: { type: Object, default: null },
  inspected: { type: Object, default: null },
  selfPosition: { type: Object, default: null },
  selfCallsign: { type: String, default: '' },
  padding: { type: Object, default: () => ({ top: 24, right: 24, bottom: 60, left: 24 }) }
})
const emit = defineEmits(['resume-live'])
const viewedSpeaker = computed(() => props.inspected || props.speaker)
const container = ref(null)
const following = ref(true)
const tileError = ref(false)
const failedTiles = new Set()
const display = useMapDisplayStore()
const gridInfo = ref({ precision: 0, reduced: false })
const cursor = ref(null)
const cursorCaption = computed(() =>
  cursor.value
    ? formatMapPosition(
        { point: cursor.value },
        display.preferences.format,
        display.preferences.precision
      )
    : ''
)
const gridCaption = computed(() =>
  display.preferences.grid === 'none'
    ? ''
    : display.preferences.grid === 'coordinates'
      ? '经纬网 · WGS84'
      : `梅登黑德 · ${gridInfo.value.precision} 位${gridInfo.value.reduced ? ' · 已按视野降低密度' : ''}`
)
const backgroundNotice = computed(() =>
  display.preferences.background === 'detailed'
    ? tileError.value
      ? '地图底图加载失败，位置标记仍保留。'
      : ''
    : display.preferences.background === 'simple'
      ? display.regionsLoading
        ? '正在加载简洁地图…'
        : display.regionsError
      : ''
)
const positionKey = computed(() =>
  JSON.stringify([viewedSpeaker.value, props.selfPosition, props.selfCallsign])
)
let map, tiles, markers, observer, gridLayer, simpleLayer, simpleNames
let autoMoving = false
let zooming = false
let frameAfterZoom = false
let disposed = false
let backgroundSequence = 0
let overlayFrame = null

function textLabel(text) {
  const span = document.createElement('span')
  span.textContent = text
  return span
}

function positionPopup(callsign, position) {
  const box = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = callsign || '本机'
  const location = document.createElement('p')
  location.textContent = formatMapPosition(
    position,
    display.preferences.format,
    display.preferences.precision
  )
  const source = document.createElement('small')
  source.textContent = position.sourceLabel || '本机坐标'
  box.append(name, location, source)
  return box
}

async function applyBackground() {
  if (!map) return
  const sequence = ++backgroundSequence
  failedTiles.clear()
  tileError.value = false
  if (tiles && map.hasLayer(tiles)) map.removeLayer(tiles)
  simpleLayer.clearLayers()
  simpleNames.clearLayers()
  if (display.preferences.background === 'detailed') {
    tiles.addTo(map)
  } else if (display.preferences.background === 'simple') {
    await display.loadSimpleRegions()
    if (
      disposed ||
      !map ||
      sequence !== backgroundSequence ||
      display.preferences.background !== 'simple'
    )
      return
    if (display.regions)
      L.geoJSON(display.regions, {
        pane: 'simpleBackground',
        interactive: false,
        style: {
          color: 'var(--border-primary)',
          weight: 1,
          fillColor: 'var(--bg-card)',
          fillOpacity: 0.5
        },
        attribution:
          '行政区：<a href="https://datav.aliyun.com/portal/school/atlas/atlas_publish" target="_blank" rel="noopener noreferrer">DataV.GeoAtlas</a>'
      }).addTo(simpleLayer)
    drawSimpleNames()
  }
}

function drawSimpleNames() {
  if (!map || !simpleNames) return
  simpleNames.clearLayers()
  if (display.preferences.background !== 'simple') return
  const occupied = []
  for (const feature of display.regions?.features || []) {
    const center = feature.properties.center
    if (!center || !map.getBounds().contains([center[1], center[0]])) continue
    const pixel = map.latLngToContainerPoint([center[1], center[0]])
    if (
      occupied.some((point) => Math.abs(point.x - pixel.x) < 70 && Math.abs(point.y - pixel.y) < 25)
    )
      continue
    occupied.push(pixel)
    L.marker([center[1], center[0]], {
      pane: 'displayGrid',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'simple-region-label',
        html: textLabel(feature.properties.name),
        iconSize: [100, 24],
        iconAnchor: [50, 12]
      })
    }).addTo(simpleNames)
  }
}

function drawGrid() {
  if (!map || !gridLayer) return
  gridLayer.clearLayers()
  const bounds = map.getBounds()
  const sw = fromMapPoint({ lat: bounds.getSouth(), lng: bounds.getWest() })
  const ne = fromMapPoint({ lat: bounds.getNorth(), lng: bounds.getEast() })
  const geometry = buildViewportGrid(
    { south: sw.lat, north: ne.lat, west: sw.lng, east: ne.lng },
    display.preferences.grid,
    display.preferences.precision,
    map.getZoom()
  )
  gridInfo.value = { precision: geometry.precision, reduced: geometry.reduced }
  const center = map.getCenter().lng
  function mapped(point) {
    const result = toMapPoint(point)
    return [result.lat, result.lng + Math.round((center - result.lng) / 360) * 360]
  }
  for (const line of geometry.lines)
    L.polyline(line.points.map(mapped), {
      pane: 'displayGrid',
      color: 'var(--color-primary)',
      opacity: 0.4,
      weight: 1,
      interactive: false
    }).addTo(gridLayer)
  for (const label of geometry.labels)
    L.marker(mapped(label.point), {
      pane: 'displayGrid',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'display-grid-label',
        html: textLabel(label.text),
        iconSize: [100, 20],
        iconAnchor: [50, 10]
      })
    }).addTo(gridLayer)
}
function scheduleOverlays() {
  if (overlayFrame != null) window.cancelAnimationFrame(overlayFrame)
  overlayFrame = window.requestAnimationFrame(() => {
    overlayFrame = null
    drawGrid()
    drawSimpleNames()
  })
}

function drawPositions() {
  if (!map) return
  markers.clearLayers()
  const me = props.selfPosition ? toMapPoint(props.selfPosition) : null
  const speaker = viewedSpeaker.value
  const target = speaker?.point ? toMapPoint(speaker.point) : null
  if (me && !speaker?.self) {
    L.circleMarker([me.lat, me.lng], {
      radius: 7,
      color: '#087fc4',
      weight: 2,
      fillColor: '#fff',
      fillOpacity: 1
    })
      .addTo(markers)
      .bindPopup(positionPopup(props.selfCallsign, { point: props.selfPosition, source: 'self' }))
      .bindTooltip(textLabel(props.selfCallsign || '本机'), {
        permanent: true,
        direction: 'bottom',
        className: 'live-station-label live-self-label'
      })
  }
  if (!target) return
  const color = speaker.source === 'aprs' ? '#b97516' : '#087fc4'
  if (speaker.source === 'grid') {
    const bounds = gridBounds(speaker.grid)
    if (bounds) {
      L.polygon(
        boundsRing(bounds, true).map((p) => [p[1], p[0]]),
        {
          color,
          weight: 1.5,
          fillOpacity: 0.12,
          dashArray: '5 5',
          interactive: false
        }
      ).addTo(markers)
    }
  }
  if (me && !speaker.self) {
    L.polyline(
      [
        [me.lat, me.lng],
        [target.lat, target.lng]
      ],
      {
        color: '#fff',
        weight: 5,
        opacity: 0.85,
        interactive: false
      }
    ).addTo(markers)
    const line = L.polyline(
      [
        [me.lat, me.lng],
        [target.lat, target.lng]
      ],
      {
        color,
        weight: 2.5,
        dashArray: '6 7'
      }
    ).addTo(markers)
    const km = distanceKm(props.selfPosition, speaker.point)
    line.bindTooltip(textLabel(`约 ${km < 1 ? '< 1' : Math.round(km).toLocaleString()} km`), {
      permanent: container.value.clientWidth > 768,
      direction: 'center',
      className: 'live-distance-label'
    })
  }
  L.circleMarker([target.lat, target.lng], {
    radius: 15,
    color: '#fff',
    weight: 2,
    fillColor: color,
    fillOpacity: 0.16,
    interactive: false
  }).addTo(markers)
  L.circleMarker([target.lat, target.lng], {
    radius: speaker.active ? 9 : 7,
    color: '#fff',
    weight: 3,
    fillColor: color,
    fillOpacity: speaker.active ? 1 : 0.8
  })
    .addTo(markers)
    .bindPopup(positionPopup(speaker.callsign, speaker))
    .bindTooltip(textLabel(props.inspected ? `查看 · ${speaker.callsign}` : speaker.callsign), {
      permanent: true,
      direction: 'top',
      offset: [0, -10],
      className: `live-station-label live-target-label${speaker.source === 'aprs' ? ' is-aprs' : ''}`
    })
}

function framePositions(force = false) {
  if (!map || (!following.value && !force) || !container.value?.clientHeight) return
  if (zooming) {
    frameAfterZoom = true
    return
  }
  const speaker = viewedSpeaker.value
  const points = []
  if (props.selfPosition && !props.inspected) points.push(toMapPoint(props.selfPosition))
  if (speaker?.point) points.push(toMapPoint(speaker.point))
  if (!points.length) {
    autoMoving = true
    map.setView([35, 105], 4, { animate: false })
    autoMoving = false
    return
  }
  if (speaker?.source === 'grid') {
    const bounds = gridBounds(speaker.grid)
    if (bounds) points.push(...boundsRing(bounds, true).map(([lng, lat]) => ({ lat, lng })))
  }
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
  const { top, right, bottom, left } = props.padding
  autoMoving = true
  map.fitBounds(bounds, {
    paddingTopLeft: [Math.max(72, left), top],
    paddingBottomRight: [Math.max(72, right), bottom],
    maxZoom: speaker?.source === 'aprs' ? 12 : speaker?.point ? 13 : 9,
    animate: false
  })
  autoMoving = false
}

function manualNavigation() {
  if (!autoMoving) {
    following.value = false
    frameAfterZoom = false
  }
}
function resumeFollowing() {
  if (props.inspected) {
    emit('resume-live')
    return
  }
  following.value = true
  if (!props.speaker?.point && !props.selfPosition && map) {
    autoMoving = true
    map.setView([35, 105], 4, { animate: false })
    autoMoving = false
  } else framePositions()
}
function zoom(delta) {
  manualNavigation()
  map?.setZoom(map.getZoom() + delta, { animate: false })
}
function retryBackground() {
  failedTiles.clear()
  tileError.value = false
  if (display.preferences.background === 'simple') applyBackground()
  else tiles?.redraw()
}
function resizeMap() {
  map?.invalidateSize({ pan: false })
  drawPositions()
  framePositions(Boolean(props.inspected))
  scheduleOverlays()
}
function handleMapKey(event) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) {
    manualNavigation()
  }
}
onMounted(async () => {
  await display.init()
  if (disposed) return
  map = L.map(container.value, {
    zoomControl: false,
    minZoom: 3,
    maxZoom: 18,
    zoomSnap: 0.25,
    worldCopyJump: true,
    scrollWheelZoom: true
  }).setView([35, 105], 4)
  map.createPane('displayGrid')
  map.createPane('simpleBackground')
  map.getPane('simpleBackground').style.zIndex = '250'
  map.getPane('displayGrid').style.zIndex = '350'
  map.getPane('displayGrid').style.pointerEvents = 'none'
  map.attributionControl.setPrefix(false)
  tiles = L.tileLayer(
    'https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}',
    {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '© 高德地图 · 网格为估算范围'
    }
  )
  tiles.on('tileerror', ({ tile }) => {
    failedTiles.add(tile)
    tileError.value = true
  })
  tiles.on('tileload tileunload', ({ tile }) => {
    failedTiles.delete(tile)
    tileError.value = failedTiles.size > 0
  })
  markers = L.layerGroup().addTo(map)
  gridLayer = L.layerGroup().addTo(map)
  simpleLayer = L.layerGroup().addTo(map)
  simpleNames = L.layerGroup().addTo(map)
  applyBackground()
  map.on('moveend zoomend', scheduleOverlays)
  map.on('mousemove', (event) => {
    cursor.value = fromMapPoint({ lat: event.latlng.lat, lng: event.latlng.lng })
  })
  map.on('mouseout', () => {
    cursor.value = null
  })
  map.on('dragstart', manualNavigation)
  map.on('zoomstart', () => {
    zooming = true
    manualNavigation()
  })
  map.on('zoomend', () => {
    zooming = false
    if (frameAfterZoom) {
      frameAfterZoom = false
      framePositions(true)
    }
  })
  container.value.addEventListener('keydown', handleMapKey)
  drawPositions()
  framePositions(Boolean(props.inspected))
  scheduleOverlays()
  if (typeof window.ResizeObserver !== 'undefined') {
    observer = new window.ResizeObserver(resizeMap)
    observer.observe(container.value)
  }
})
watch(positionKey, () => {
  drawPositions()
  framePositions()
})
watch(
  () => props.padding,
  () => framePositions(Boolean(props.inspected)),
  { deep: true }
)
watch(
  () => props.inspected,
  (selected, previous) => {
    if (!selected && !previous) return
    following.value = !selected
    drawPositions()
    framePositions(true)
  }
)
watch(() => display.preferences.background, applyBackground)
watch(
  () => display.regions,
  () => {
    if (display.preferences.background === 'simple') applyBackground()
  }
)
watch(() => [display.preferences.grid, display.preferences.precision], scheduleOverlays)
watch(() => [display.preferences.format, display.preferences.precision], drawPositions)
onBeforeUnmount(() => {
  disposed = true
  backgroundSequence++
  if (overlayFrame != null) window.cancelAnimationFrame(overlayFrame)
  container.value?.removeEventListener('keydown', handleMapKey)
  observer?.disconnect()
  map?.remove()
  map = null
})
</script>

<style scoped>
.live-map-shell {
  position: absolute;
  inset: 0;
  isolation: isolate;
  background: var(--bg-page);
}
.live-map {
  position: absolute;
  inset: 0;
  background: var(--bg-page);
  font-family: inherit;
}
.live-map :deep(.leaflet-tile-pane) {
  filter: var(--map-tile-filter);
}
.live-map-tools {
  position: absolute;
  z-index: 500;
  left: var(--live-map-left, 16px);
  bottom: 26px;
  display: flex;
  gap: 6px;
}
.live-map-tools button,
.tile-notice button {
  min-height: 44px;
  box-shadow: 0 2px 8px var(--shadow-card);
}
.live-map-tools button[aria-pressed='true'] {
  color: var(--color-primary);
}
.live-map-tools button:focus-visible,
.tile-notice button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.map-status-stack {
  position: absolute;
  z-index: 500;
  left: var(--live-map-left, 16px);
  bottom: 80px;
  max-width: min(var(--live-map-status-width, 400px), calc(100% - 32px));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  pointer-events: none;
}
.tile-notice,
.map-location-note,
.map-review-status {
  margin: 0;
  padding: 9px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}
.map-review-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-color: var(--color-primary);
  line-height: 1.4;
}
.map-review-status strong {
  color: var(--text-primary);
}
.tile-notice {
  pointer-events: auto;
}
.tile-notice button {
  box-shadow: none;
  border: 0;
  padding: 2px 6px;
  color: var(--color-primary);
}
.map-grid-caption {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 100%;
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  pointer-events: none;
}
:deep(.display-grid-label),
:deep(.simple-region-label) {
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  white-space: nowrap;
}
:deep(.display-grid-label span) {
  padding: 2px 4px;
  border-radius: 3px;
  background: var(--bg-header);
}
:deep(.live-station-label),
:deep(.live-distance-label) {
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 5px 9px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  box-shadow: 0 2px 8px var(--shadow-card);
  white-space: nowrap;
}
:deep(.live-station-label) {
  font-weight: 600;
}
:deep(.live-self-label) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
:deep(.live-target-label) {
  background: #087fc4;
  border-color: #fff;
  color: #fff;
}
:deep(.live-target-label.leaflet-tooltip-top)::before {
  border-top-color: #087fc4;
}
:deep(.live-target-label.is-aprs) {
  background: #93600c;
}
:deep(.live-target-label.is-aprs.leaflet-tooltip-top)::before {
  border-top-color: #93600c;
}
:deep(.leaflet-control-attribution) {
  font-size: 11px;
  background: var(--bg-card);
  color: var(--text-secondary);
}
@media (max-width: 768px) {
  .live-map-tools {
    left: var(--live-map-left, 12px);
    bottom: var(--live-map-bottom, 80px);
  }
  .map-status-stack {
    bottom: calc(var(--live-map-bottom, 80px) + 52px);
  }
}
@media (max-height: 520px) and (min-width: 600px) {
  .live-map-tools {
    bottom: 26px;
  }
  .map-status-stack {
    bottom: 78px;
  }
  .map-review-status {
    padding: 7px 10px;
    gap: 2px;
  }
  .map-review-status span:last-child {
    display: none;
  }
  .live-map-tools .map-zoom-button {
    display: none;
  }
}
</style>
