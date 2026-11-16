<template>
  <div class="footprint-view">
    <header class="footprint-heading">
      <div>
        <h1>通联足迹</h1>
        <p>{{ owner ? `${owner} · 累计足迹` : '尚未选择通联记录' }}</p>
      </div>
      <div class="footprint-stats" aria-label="累计点亮地域">
        <span
          ><strong>{{ store.provinceGroups.length }}</strong
          >省级地域</span
        ><span
          ><strong>{{ store.citiesLoading ? '…' : store.cityGroups.length }}</strong
          >城市<small v-if="store.cityError" :title="store.cityError">待补全</small></span
        ><span
          ><strong>{{ countedGrids }}</strong
          >{{ precision }} 位网格</span
        >
      </div>
      <button class="refresh-footprints" type="button" :disabled="store.loading" @click="reload">
        {{ store.loading ? '读取中…' : '↻ 刷新' }}
      </button>
    </header>
    <p v-if="store.error" class="map-notice error" role="alert">
      {{ store.error }} <button type="button" @click="reload">重试</button>
    </p>
    <p v-if="!owner && !store.loading" class="map-notice">
      先连接 FMO 设备，或从通联日志中导入记录。
      <button type="button" @click="router.push('/settings')">连接与数据设置</button>
    </p>
    <div class="footprint-workspace">
      <section class="atlas-panel" aria-label="地图与足迹">
        <div class="atlas-toolbar">
          <div class="segmented" role="group" aria-label="足迹类型">
            <span
              class="segment-indicator"
              :style="{ transform: `translateX(${mode === 'grid' ? '100%' : '0'})` }"
              aria-hidden="true"
            /><button type="button" :aria-pressed="mode === 'area'" @click="switchMode('area')">
              行政区</button
            ><button type="button" :aria-pressed="mode === 'grid'" @click="switchMode('grid')">
              网格
            </button>
          </div>
          <label v-if="mode === 'area'" class="toolbar-select"
            ><span class="sr-only">行政区层级</span
            ><select :value="level" aria-label="行政区层级" @change="setLevel($event.target.value)">
              <option value="province">省级</option>
              <option value="city">城市</option>
            </select></label
          ><label v-else class="toolbar-select"
            ><span class="sr-only">网格精度</span
            ><select v-model.number="precision" aria-label="网格精度">
              <option :value="4">4 位网格</option>
              <option :value="6">6 位网格</option>
            </select></label
          ><button
            v-if="scopeName && level === 'city'"
            class="scope-back"
            type="button"
            @click="returnToNation"
          >
            全国 / {{ scopeName }} ↩</button
          ><label class="toolbar-select time-select"
            ><span class="sr-only">通联时间范围</span
            ><select v-model="period" aria-label="通联时间范围">
              <option value="all">全部时间</option>
              <option value="year">今年</option>
              <option value="month">本月</option>
            </select></label
          >
        </div>
        <div v-if="store.boundariesLoading" class="boundary-status" role="status">
          正在加载行政区边界…
        </div>
        <div v-else-if="store.boundaryError" class="boundary-status error" role="alert">
          {{ store.boundaryError }} <button type="button" @click="loadGeography">重试</button
          ><button type="button" @click="switchMode('grid')">查看网格</button>
        </div>
        <div class="atlas-canvas" @touchstart.stop @touchmove.stop @touchend.stop>
          <ContactMap
            :provinces="store.provinces.features"
            :regions="displayRegions"
            :contacted="areaGroups.map((g) => g.id)"
            :period-areas="periodAreaIds"
            :grids="gridGroups"
            :period-grid-ids="periodGridIds"
            :mode="mode"
            :level="level"
            :selected-id="selectedId"
            :speaker="speaker"
            :self-position="store.selfPosition"
            :follow="following"
            :focus="mapFocus"
            @select="selectObject"
            @province="showProvince"
            @manual="following = false"
            @speaker="locateSpeaker"
          />
          <div class="speaker-locator" aria-label="实时讲话友台">
            <div>
              <span :class="['live-dot', { active: speaker?.active }]" /><strong>{{
                speaker?.callsign || '等待友台呼叫'
              }}</strong
              ><small>{{ speaker ? (speaker.active ? '正在讲话' : '最后发言') : '正在守听' }}</small
              ><span v-if="speaker" class="speaker-position"
                >{{ speaker.grid || speaker.sourceLabel
                }}<template v-if="speakerDistance"> · {{ speakerDistance }}</template></span
              >
            </div>
            <button v-if="following" type="button" @click="returnToFootprints">返回足迹</button
            ><button v-else type="button" :disabled="!speaker" @click="locateSpeaker">定位</button>
          </div>
        </div>
        <footer class="atlas-caption">
          <span>{{
            mode === 'area'
              ? '点亮依据：已保存的通联位置'
              : `${precision} 位 Maidenhead · 虚线为原始粗网格`
          }}</span
          ><span v-if="period !== 'all'"
            >强调{{ period === 'year' ? '今年' : '本月' }}活动，累计足迹保留</span
          ><span v-else-if="store.pendingRegionCount"
            >{{ store.pendingRegionCount }} 条地域待确认，网格仍保留</span
          ><button v-if="store.cityError" type="button" @click="store.loadContactCities()">
            重试城市数据
          </button>
        </footer>
      </section>
      <aside v-if="!isMobile" class="context-panel">
        <FootprintContext v-bind="contextProps" v-on="contextEvents" />
      </aside>
    </div>
    <div v-if="isMobile" class="mobile-context-summary">
      <button type="button" :aria-expanded="sheetOpen" @click="sheetOpen = true">
        <strong>{{
          following && speaker
            ? speaker.callsign
            : selectedObject?.name ||
              `已点亮 ${timeline.length} 个${mode === 'grid' ? '网格' : '地域'}`
        }}</strong
        ><small
          >{{
            selectedObject ? `${selectedRecords.length} 条通联 · 查看地域详情` : '地域与通联详情'
          }}
          ↑</small
        ></button
      ><button class="summary-records" type="button" @click="openAllRecords">
        通联记录 <span>{{ store.records.length }} ›</span>
      </button>
    </div>
    <SideSheet
      :open="isMobile && sheetOpen"
      title="地域与通联"
      placement="bottom"
      @close="sheetOpen = false"
      ><FootprintContext v-bind="contextProps" v-on="contextEvents"
    /></SideSheet>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onBeforeUnmount,
  ref,
  watch
} from 'vue'
import { useRouter } from 'vue-router'
import ContactMap from '../components/map/ContactMap.vue'
import FootprintContext from '../components/map/FootprintContext.vue'
import SideSheet from '../components/common/SideSheet.vue'
import { useMapStore } from '../stores/mapStore'
import { useSpeakingStatusStore } from '../stores/speakingStore'
import { getPlatform } from '../platform'
import { groupGrids, firstContact, inContactPeriod } from '../core/footprints'
import { distanceKm, gridBounds, gridCenter } from '../core/mapGeometry'
import { coordinatesToMaidenhead } from '../core/maidenhead'
import { eventCoordinates } from '../core/stationIdentity'
import toast from '../composables/useToast'

const props = defineProps({
  selectedFromCallsign: { type: String, default: '' },
  ownCallsign: { type: String, default: '' },
  fmoAddress: { type: String, default: '' },
  protocol: { type: String, default: 'ws' },
  activeAddressId: { type: String, default: '' },
  addressList: { type: Array, default: () => [] },
  dbLoaded: Boolean,
  totalLogs: { type: Number, default: 0 },
  stationConnected: Boolean,
  stationBusy: Boolean
})
const emit = defineEmits(['open-station-list', 'show-callsign-records'])
const router = useRouter(),
  store = useMapStore(),
  speaking = useSpeakingStatusStore()
const mode = ref('area'),
  level = ref('province'),
  precision = ref(6),
  period = ref('all'),
  selectedId = ref(''),
  scopeCode = ref(''),
  search = ref(''),
  following = ref(false),
  evidenceLimit = ref(30),
  speaker = ref(null)
const isMobile = ref(false)
const sheetOpen = ref(false)
const contextMode = ref('regions')
let compactMedia = null
function updateCompactLayout() {
  isMobile.value = compactMedia?.matches || false
  if (!isMobile.value) sheetOpen.value = false
}
const mapFocus = ref({ type: 'all', sequence: 0 })
let sequence = 0,
  timer = null,
  unsubscribe = null,
  disposed = false
let active = true
let wasDeactivated = false
const owner = computed(() => props.selectedFromCallsign || props.ownCallsign)
const currentUser = computed(
  () =>
    store.connection?.user ||
    props.addressList.find((address) => address.id === props.activeAddressId)?.userInfo
)
const areaGroups = computed(() => {
  if (level.value === 'province') return store.provinceGroups
  if (!scopeCode.value) return store.cityGroups
  const codes = new Set(
    (store.cities[scopeCode.value]?.features || []).map((f) => `area:${f.properties.adcode}`)
  )
  return store.cityGroups.filter((group) => codes.has(group.id))
})
const gridGroups = computed(() => groupGrids(store.records, precision.value))
const countedGrids = computed(() => gridGroups.value.filter((grid) => !grid.coarse).length)
const displayRegions = computed(() =>
  level.value === 'province'
    ? store.provinces.features
    : scopeCode.value
      ? store.cities[scopeCode.value]?.features || []
      : store.cityFeatures
)
const scopeName = computed(
  () =>
    store.provinces.features.find((f) => String(f.properties.adcode) === scopeCode.value)
      ?.properties.name
)
const periodAreaIds = computed(() =>
  areaGroups.value
    .filter((group) => group.records.some((r) => inContactPeriod(r, period.value)))
    .map((g) => g.id)
)
const periodGridIds = computed(() =>
  gridGroups.value
    .filter((group) => group.records.some((r) => inContactPeriod(r, period.value)))
    .map((g) => g.id)
)
const allObjects = computed(() =>
  mode.value === 'area'
    ? areaGroups.value.map((area) => ({ ...area, name: area.name }))
    : gridGroups.value.map((grid) => ({ ...grid, name: grid.grid }))
)
const selectedObject = computed(() => {
  const found = allObjects.value.find((object) => object.id === selectedId.value)
  if (found) return found
  if (mode.value === 'area') {
    const feature = displayRegions.value.find(
      (f) => `area:${f.properties.adcode}` === selectedId.value
    )
    if (feature)
      return { id: selectedId.value, name: feature.properties.name, feature, records: [] }
  } else if (selectedId.value.startsWith('grid:')) {
    const grid = selectedId.value.slice(5)
    if (gridBounds(grid)) return { id: selectedId.value, name: grid, grid, records: [] }
  }
  return null
})
const selectedRecords = computed(() => selectedObject.value?.records || [])
const first = computed(() => firstContact(selectedRecords.value))
const latest = computed(() =>
  selectedRecords.value.reduce(
    (latest, r) => (!latest || r.timestamp > latest.timestamp ? r : latest),
    null
  )
)
const evidenceRows = computed(() =>
  (selectedObject.value && !following.value ? selectedRecords.value : store.records).filter((r) =>
    inContactPeriod(r, period.value)
  )
)
const timeline = computed(() =>
  allObjects.value
    .map((area) => ({ ...area, first: firstContact(area.records) }))
    .filter(
      (area) => area.first && area.name.toLowerCase().includes(search.value.toLowerCase().trim())
    )
    .sort((a, b) => b.first.timestamp - a.first.timestamp)
)
const speakerDistance = computed(() => {
  const position =
    speaker.value?.point || (speaker.value?.grid ? gridCenter(speaker.value.grid) : null)
  if (!store.selfPosition || !position || speaker.value?.self) return ''
  return `约 ${Math.round(distanceKm(store.selfPosition, position)).toLocaleString()} km`
})
function nearbyCells(grid) {
  const bounds = gridBounds(grid),
    center = gridCenter(grid)
  if (!bounds || !center) return []
  const cells = []
  for (let row = 1; row >= -1; row--)
    for (let col = -1; col <= 1; col++) {
      const lat = center.lat + row * (bounds.north - bounds.south),
        lng = center.lng + col * (bounds.east - bounds.west)
      if (Math.abs(lat) >= 90 || Math.abs(lng) >= 180) continue
      const value = coordinatesToMaidenhead(lat, lng, grid.length)
      cells.push({
        grid: value,
        lit: store.records.some((r) => r.grid.startsWith(value)),
        selected: value === grid
      })
    }
  return cells
}
const miniCells = computed(() =>
  selectedObject.value?.grid ? nearbyCells(selectedObject.value.grid) : []
)
function focusMap(type) {
  mapFocus.value = { type, sequence: mapFocus.value.sequence + 1 }
}
function returnToNation() {
  contextMode.value = 'regions'
  scopeCode.value = ''
  selectedId.value = ''
  following.value = false
  focusMap('all')
}
function clearSelection() {
  selectedId.value = ''
  following.value = false
  contextMode.value = 'regions'
}
function switchMode(value) {
  contextMode.value = 'regions'
  mode.value = value
  selectedId.value = ''
  following.value = false
  search.value = ''
}
function setLevel(value) {
  contextMode.value = 'regions'
  level.value = value
  if (value === 'province') scopeCode.value = ''
  selectedId.value = ''
  following.value = false
  if (value === 'city') store.loadContactCities()
}
function selectObject(id, focus = false) {
  following.value = false
  contextMode.value = 'records'
  if (isMobile.value) sheetOpen.value = true
  selectedId.value = id
  evidenceLimit.value = 30
  if (focus) nextTick(() => focusMap('selection'))
}
async function chooseGrid(grid) {
  sheetOpen.value = false
  mode.value = 'grid'
  selectedId.value = `grid:${grid.slice(0, precision.value)}`
  following.value = false
  await nextTick()
  focusMap('selection')
}
async function showProvince(code) {
  if (!code) return
  contextMode.value = 'regions'
  sheetOpen.value = false
  scopeCode.value = String(code)
  level.value = 'city'
  selectedId.value = ''
  following.value = false
  try {
    await store.loadCities(String(code))
    await nextTick()
    focusMap(`province:${code}`)
  } catch {
    toast.warning('城市边界暂时不可用，请稍后重试')
  }
}
function locateSpeaker() {
  if (!speaker.value?.point && !speaker.value?.grid) {
    toast.info('友台暂未提供可用位置')
    return
  }
  following.value = true
  sheetOpen.value = false
  focusMap('speaker')
}
function returnToFootprints() {
  sheetOpen.value = false
  following.value = false
  focusMap(selectedId.value ? 'selection' : 'all')
}
async function reload() {
  await store.loadOwner(owner.value)
  await loadGeography()
}
async function loadGeography() {
  await store.loadBoundaries()
  await store.loadContactCities()
}
function refreshConnection() {
  if (!active) return
  return store.refreshConnection(props.fmoAddress, props.protocol)
}
async function updateSpeaker() {
  const token = ++sequence,
    current = speaking.currentSpeaker
  const record =
    speaking.speakingHistory.find((r) => r.callsign === current) || speaking.speakingHistory[0]
  if (!record) {
    speaker.value = null
    return
  }
  const coordinates = eventCoordinates(record)
  const base = {
    callsign: record.callsign,
    grid: record.grid || '',
    point: coordinates ? { lat: coordinates.latitude, lng: coordinates.longitude } : null,
    source: coordinates ? 'coordinates' : record.grid ? 'grid' : 'unknown',
    sourceLabel: coordinates ? '本次坐标' : record.grid ? '网格位置' : '位置未提供',
    active: Boolean(current && record.callsign === current),
    self: record.callsign === (currentUser.value?.callsign || props.ownCallsign)
  }
  speaker.value = base
  if (base.point || base.grid || base.self) return
  const position = await getPlatform().stationLocation.getLatest(base.callsign)
  if (token !== sequence || disposed || !position) return
  speaker.value = {
    ...base,
    point: { lat: position.latitude, lng: position.longitude },
    source: 'aprs',
    sourceLabel: 'APRS 最近位置'
  }
}
watch(owner, () => store.loadOwner(owner.value), { immediate: true })
watch(
  () => [props.dbLoaded, props.totalLogs],
  () => {
    if (props.dbLoaded) store.loadOwner(owner.value)
  }
)
watch(
  () => [props.fmoAddress, props.protocol],
  () => {
    store.resetConnection()
    refreshConnection()
  },
  { immediate: true }
)
watch(
  () => [
    speaking.currentSpeaker,
    speaking.currentSpeakerGrid,
    speaking.speakingHistory[0]?.startTime
  ],
  updateSpeaker,
  { immediate: true }
)
watch(
  () => speaking.primaryServerInfo?.uid,
  () => {
    if (props.fmoAddress && !store.connectionLoading) refreshConnection()
  }
)
watch(
  () => store.provinceGroups.map((g) => g.id).join(','),
  () => store.loadContactCities()
)
watch(
  () => [selectedId.value, period.value],
  () => {
    evidenceLimit.value = 30
  }
)
onMounted(() => {
  compactMedia = window.matchMedia('(max-width: 768px)')
  updateCompactLayout()
  compactMedia.addEventListener('change', updateCompactLayout)
  loadGeography()
  unsubscribe = getPlatform().map.onChange(() => store.refreshEvidence())
  timer = setInterval(() => {
    if (active && !document.hidden && props.fmoAddress && !store.connectionLoading)
      refreshConnection()
  }, 30000)
})
onActivated(() => {
  active = true
  if (wasDeactivated && !store.connectionLoading) refreshConnection()
  wasDeactivated = false
})
onDeactivated(() => {
  active = false
  wasDeactivated = true
})
onBeforeUnmount(() => {
  compactMedia?.removeEventListener('change', updateCompactLayout)
  disposed = true
  sequence++
  clearInterval(timer)
  unsubscribe?.()
  store.resetConnection()
})

const contextRecords = computed(() =>
  following.value && speaker.value
    ? evidenceRows.value.filter(
        (record) => record.callsign.toUpperCase() === speaker.value.callsign.toUpperCase()
      )
    : evidenceRows.value
)
const contextProps = computed(() => ({
  selected: following.value ? null : selectedObject.value,
  following: following.value,
  speaker: speaker.value,
  distance: speakerDistance.value,
  timeline: timeline.value,
  records: contextRecords.value,
  first: first.value,
  latest: latest.value,
  miniCells: miniCells.value,
  search: search.value,
  mode: mode.value,
  level: level.value,
  scopeName: scopeName.value || '',
  periodLabel: period.value === 'all' ? '全部时间' : period.value === 'year' ? '今年' : '本月',
  allRecords: contextMode.value === 'records',
  total: store.records.length,
  limit: evidenceLimit.value,
  loading: store.loading
}))
function openAllRecords() {
  clearSelection()
  contextMode.value = 'records'
  if (isMobile.value) sheetOpen.value = true
}
function contextBack() {
  if (following.value) returnToFootprints()
  else clearSelection()
}
function showContact(record) {
  sheetOpen.value = false
  nextTick(() =>
    emit('show-callsign-records', { callsign: record.callsign, timestamp: record.timestamp })
  )
}
const contextEvents = {
  'update:search': (value) => {
    search.value = value
  },
  select: (id) => selectObject(id, true),
  grid: chooseGrid,
  province: showProvince,
  back: contextBack,
  contact: showContact,
  more: () => {
    evidenceLimit.value += 50
  },
  all: openAllRecords,
  logs: () => {
    sheetOpen.value = false
    router.push('/logs')
  }
}
</script>

<style scoped>
.footprint-view {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 20px 22px 22px;
  color: var(--text-primary);
  box-sizing: border-box;
  animation: map-arrive 0.25s ease-out;
}
.footprint-heading {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
  margin-bottom: 17px;
}
.footprint-heading h1 {
  font-size: 23px;
  line-height: 1.4;
  font-weight: 650;
  margin: 0;
}
.footprint-heading p {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 4px 0 0;
}
.footprint-stats {
  display: flex;
  align-items: center;
  gap: 23px;
  margin-left: auto;
}
.footprint-stats > span {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.footprint-stats strong {
  font-size: 25px;
  font-weight: 550;
  color: var(--color-primary);
}
.footprint-stats small {
  font-size: 10px;
  color: var(--color-warning);
}
.refresh-footprints {
  font: inherit;
  font-size: 12px;
  border: 0;
  border-left: 1px solid var(--border-primary);
  background: transparent;
  padding: 5px 0 5px 20px;
  color: var(--text-secondary);
  cursor: pointer;
}
.refresh-footprints:disabled {
  opacity: 0.5;
  cursor: default;
}
.footprint-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(295px, 29%);
  gap: 18px;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.atlas-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  background: var(--bg-card);
}
.atlas-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
  min-height: 53px;
  flex-wrap: wrap;
}
.segmented {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 146px;
  flex-shrink: 0;
  isolation: isolate;
}
.segmented .segment-indicator {
  position: absolute;
  inset: 0 auto 0 0;
  width: 50%;
  border-radius: 5px;
  background: var(--surface-accent);
  z-index: -1;
  transition: transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.segmented button {
  font: inherit;
  font-size: 13px;
  border: 0;
  padding: 7px 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.segmented button[aria-pressed='true'] {
  color: var(--color-primary);
  font-weight: 550;
}
.toolbar-select select {
  font: inherit;
  font-size: 13px;
  border: 0;
  background: var(--bg-card);
  color: var(--text-secondary);
  padding: 6px 4px;
  cursor: pointer;
}
.time-select {
  margin-left: auto;
}
.scope-back {
  font: inherit;
  font-size: 12px;
  color: var(--color-primary);
  background: transparent;
  border: 0;
  padding: 5px 0;
  cursor: pointer;
}
.atlas-canvas {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}
.speaker-locator {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 450;
  display: flex;
  align-items: center;
  gap: 15px;
  max-width: calc(100% - 130px);
  padding: 10px 13px;
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 95%, transparent);
  box-shadow: 0 3px 10px var(--shadow-card);
}
.speaker-locator > div {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}
.speaker-locator strong {
  font-size: 14px;
  font-weight: 600;
}
.speaker-locator small {
  font-size: 11px;
  color: var(--text-tertiary);
}
.speaker-position {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--text-secondary);
  padding-left: 14px;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
}
.live-dot.active {
  background: var(--color-speaking);
}
.speaker-locator button {
  font: inherit;
  font-size: 12px;
  padding: 5px 0 5px 12px;
  border: 0;
  border-left: 1px solid var(--border-secondary);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  white-space: nowrap;
}
.speaker-locator button:disabled {
  color: var(--text-disabled);
  cursor: default;
}
.atlas-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 8px 13px;
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  border-top: 1px solid var(--border-secondary);
}
.atlas-caption button,
.boundary-status button,
.map-notice button {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--color-primary);
  font: inherit;
  cursor: pointer;
}
.boundary-status {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  max-height: 72px;
  overflow: auto;
  flex-shrink: 0;
}
.boundary-status button {
  margin-left: 10px;
}
.error {
  color: var(--color-warning);
}
.context-panel {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-card);
}
.map-notice {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  flex-shrink: 0;
  max-height: 70px;
  overflow: auto;
}
.map-notice button {
  margin-left: 8px;
}
.mobile-context-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 0 0;
  flex-shrink: 0;
}
.mobile-context-summary > button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  font: inherit;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--text-primary);
  cursor: pointer;
}
.mobile-context-summary strong {
  font-size: 14px;
  font-weight: 550;
}
.mobile-context-summary small {
  font-size: 11px;
  color: var(--text-tertiary);
}
.mobile-context-summary .summary-records {
  align-items: flex-end;
  font-size: 13px;
  color: var(--text-secondary);
}
.summary-records span {
  color: var(--color-primary);
  font-size: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  clip: rect(0, 0, 0, 0);
  overflow: hidden;
}
button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
button {
  transition:
    color 0.15s,
    transform 0.12s;
}
button:active:not(:disabled) {
  transform: translateY(1px);
}
@keyframes map-arrive {
  from {
    opacity: 0.7;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 1050px) {
  .footprint-view {
    padding: 16px;
  }
  .footprint-workspace {
    gap: 14px;
    grid-template-columns: minmax(0, 1fr) 285px;
  }
  .footprint-heading {
    gap: 16px;
  }
  .footprint-stats {
    gap: 14px;
  }
  .footprint-stats strong {
    font-size: 23px;
  }
  .atlas-toolbar {
    gap: 7px;
    padding: 8px 10px;
  }
  .segmented {
    width: 132px;
  }
  .segmented button {
    font-size: 12px;
  }
  .toolbar-select select {
    font-size: 12px;
  }
}
@media (max-width: 768px) {
  .footprint-view {
    padding: 14px 12px 12px;
  }
  .footprint-heading {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 7px 16px;
    margin-bottom: 12px;
  }
  .footprint-heading h1 {
    font-size: 20px;
  }
  .footprint-heading p {
    font-size: 11px;
  }
  .footprint-stats {
    order: 3;
    width: 100%;
    margin: 0;
    gap: 21px;
  }
  .footprint-stats strong {
    font-size: 20px;
  }
  .footprint-stats > span {
    font-size: 11px;
    gap: 5px;
  }
  .refresh-footprints {
    margin-left: auto;
    border: 0;
    padding: 4px 0;
    font-size: 12px;
  }
  .footprint-workspace {
    display: flex;
    gap: 0;
  }
  .atlas-panel {
    flex: 1;
    border-radius: 10px;
  }
  .atlas-toolbar {
    padding: 8px;
    gap: 8px;
    min-height: 45px;
  }
  .segmented {
    width: 128px;
  }
  .toolbar-select select {
    font-size: 12px;
    max-width: 100px;
  }
  .scope-back {
    order: 4;
    flex-basis: 100%;
    text-align: left;
    font-size: 11px;
  }
  .speaker-locator {
    left: 10px;
    top: 10px;
    padding: 8px 10px;
    gap: 7px;
    max-width: calc(100% - 104px);
  }
  .speaker-locator strong {
    font-size: 12px;
  }
  .speaker-locator small {
    font-size: 10px;
  }
  .speaker-locator button {
    padding-left: 8px;
    font-size: 11px;
  }
  .speaker-position {
    font-size: 10px;
    padding-left: 13px;
  }
  .atlas-caption {
    padding: 6px 9px;
    font-size: 10px;
    max-height: 48px;
    overflow: auto;
  }
}
@media (max-height: 650px) {
  .footprint-view {
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .footprint-heading {
    margin-bottom: 10px;
  }
  .footprint-heading h1 {
    font-size: 20px;
  }
  .footprint-heading p {
    margin-top: 1px;
  }
  .atlas-toolbar {
    min-height: 42px;
    padding-top: 6px;
    padding-bottom: 6px;
  }
}
@media (max-height: 520px) {
  .footprint-view {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .footprint-workspace {
    flex: 0 0 360px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .footprint-view {
    animation: none;
  }
  button,
  .segment-indicator {
    transition: none !important;
  }
}
</style>
