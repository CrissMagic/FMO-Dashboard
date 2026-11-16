<template>
  <div class="dashboard-view" :class="{ 'is-footprints': showFootprints }">
    <WorkspaceNavigation workspace />
    <div
      v-show="showFootprints"
      id="dashboard-footprints-panel"
      class="dashboard-footprints-panel"
      role="tabpanel"
      aria-labelledby="dashboard-footprints-tab"
    >
      <KeepAlive
        ><MapView
          v-if="showFootprints"
          :db-loaded="dbLoaded"
          :fmo-address="fmoAddress"
          :protocol="protocol"
          :selected-from-callsign="selectedFromCallsign"
          :own-callsign="ownCallsign"
          :active-address-id="activeAddressId"
          :address-list="addressList"
          :total-logs="totalLogs"
          :station-connected="stationConnected"
          :station-busy="stationBusy"
          @open-station-list="emit('open-station-list')"
          @show-callsign-records="emit('show-callsign-records', $event)"
      /></KeepAlive>
    </div>
    <div
      v-show="!showFootprints"
      id="dashboard-live-panel"
      class="live-workspace"
      role="tabpanel"
      aria-labelledby="dashboard-live-tab"
    >
      <section class="current-contact" :class="{ 'is-idle': !activeContact }" aria-label="当前通联">
        <div class="contact-copy">
          <div class="contact-eyebrow">
            <span
              :class="['live-indicator', { speaking: activeContact?.isSpeaking }, liveStatusKind]"
            />{{
              activeContact
                ? activeContact.isSpeaking
                  ? '正在通联'
                  : '最近发言'
                : stationConnected
                  ? '守听中'
                  : '未连接'
            }}<span v-if="activeContact?.isSpeaking" class="live-text">LIVE</span>
          </div>
          <div class="callsign-line">
            <h1>{{ activeContact?.callsign || '等待通联' }}</h1>
            <span v-if="activeContact?.grid" class="grid-label">{{ activeContact.grid }}</span
            ><span v-if="activeContact?.isNewCallsign" class="new-label">新友台</span>
          </div>
          <div v-if="activeContact" class="contact-location">
            <span>{{
              activeContact?.qth || (activeContact ? '友台暂未提供位置' : '保持连接，等待实时通联')
            }}</span
            ><small v-if="activeContact && locationLabel(activeContact)">{{
              locationLabel(activeContact)
            }}</small
            ><span v-if="activeContact?.hasLoggedContact"
              >已通联{{
                activeContact.contactCount ? ` · ${activeContact.contactCount} 次` : ''
              }}</span
            >
          </div>
          <div class="contact-meta">
            <span
              >频率 / 模式 <strong>{{ currentFrequencyLine }}</strong></span
            ><button
              type="button"
              :title="recentRelayCommandTitle"
              @click="showRecentRelaySwitcher = true"
            >
              最近中继 ⌄</button
            ><button
              v-if="activeContact?.hasLoggedContact"
              type="button"
              @click="openCallsignRecords(activeContact)"
            >
              通联详情 →
            </button>
          </div>
          <div class="previous-line">
            <span>上次通联</span
            ><template v-if="previousContact"
              ><strong>{{ previousContact.callsign }}</strong
              ><span>{{ previousContact.qth || previousContact.grid || '位置未提供' }}</span
              ><time>{{ formatTimeAgo(previousContact.timestamp) }}</time></template
            ><span v-else>暂无记录</span>
          </div>
        </div>
        <div
          v-if="activeContact"
          class="bearing-panel"
          :class="{ unavailable: !activeContact?.bearing }"
        >
          <div class="compass">
            <span class="north-label">N</span
            ><svg
              class="compass-arrow"
              viewBox="0 0 24 32"
              aria-hidden="true"
              :style="{ transform: `rotate(${activeContact?.bearing?.bearing || 0}deg)` }"
            >
              <path d="M12 2 21 29 12 23 3 29Z" />
            </svg>
          </div>
          <strong>{{
            activeContact?.bearing
              ? `${activeContact.bearing.direction} ${activeContact.bearing.bearing}°`
              : '方位未知'
          }}</strong
          ><span>{{
            activeContact?.bearing?.distanceText || activeContact?.bearingHint || '等待友台位置'
          }}</span>
        </div>
      </section>
      <section class="live-panel" aria-label="最近通联">
        <header class="panel-heading">
          <div>
            <h2>最近通联</h2>
            <span title="统计来自已同步的本地日志；下方列表包含盒子日志和实时发言。"
              >本地日志：今日 {{ todayLogs }} · 累计 {{ totalLogs }} · 友台
              {{ uniqueCallsigns }}</span
            >
          </div>
          <button type="button" :disabled="refreshing" @click="refreshNow">
            {{ refreshing ? '刷新中…' : '刷新' }}
          </button>
        </header>
        <p v-if="error || refreshWarning" class="refresh-notice" role="status">
          {{ error || refreshWarning }}
        </p>
        <div
          v-if="displayRecords.length"
          class="live-table-wrap"
          tabindex="0"
          aria-label="最近通联记录表格"
        >
          <table class="live-table">
            <thead>
              <tr>
                <th>友台</th>
                <th>时间</th>
                <th>
                  <span class="desktop-label">位置</span
                  ><span class="mobile-label">位置 / 中继</span>
                </th>
                <th class="comment-column">留言</th>
                <th class="mode-column">模式</th>
                <th class="relay-column">中继</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in displayRecords.slice(0, 20)"
                :key="record.rowId"
                :class="{ 'is-speaking': record.isSpeaking }"
              >
                <td>
                  <button
                    v-if="record.hasLoggedContact && record.toCallsign"
                    type="button"
                    class="callsign-link"
                    @click="openCallsignRecords(record)"
                  >
                    {{ record.toCallsign }}</button
                  ><strong v-else>{{ record.toCallsign || '—' }}</strong
                  ><span v-if="record.isSpeaking" class="row-speaking">讲话中</span
                  ><small>{{ record.toGrid || (record.isSelf ? '本机' : '') }}</small>
                </td>
                <td class="time-cell">
                  {{ formatDatePart(record.timestamp)
                  }}<small>{{ formatClockPart(record.timestamp) }}</small>
                </td>
                <td class="position-cell">
                  {{ record.qth || '—'
                  }}<small v-if="locationLabel(record)"
                    >{{ locationLabel(record) }}
                    <a
                      v-if="aprsFiSource(record)"
                      href="https://aprs.fi/"
                      target="_blank"
                      rel="noopener noreferrer"
                      >aprs.fi</a
                    ></small
                  ><button
                    v-if="record.relayName"
                    type="button"
                    class="relay-link mobile-relay-link"
                    :disabled="switchingRelay === record.relayName"
                    @click="switchRelay(record.relayName)"
                  >
                    {{ record.relayName }}
                  </button>
                </td>
                <td class="comment-column">{{ record.toComment || '—' }}</td>
                <td class="mode-column">
                  {{ stationIdentity(record.toCallsign).mode || record.mode || '—' }}
                </td>
                <td class="relay-column">
                  <button
                    v-if="record.relayName"
                    type="button"
                    class="relay-link"
                    :disabled="switchingRelay === record.relayName"
                    @click="switchRelay(record.relayName)"
                  >
                    {{ record.relayName }}</button
                  ><span v-else>—</span
                  ><small v-if="record.relayAdmin">{{ record.relayAdmin }}</small
                  ><span v-if="record.isRelayPinned" class="pinned-mark" title="已收藏">★</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state">
          <strong>{{ refreshing ? '正在读取通联' : '等待实时通联' }}</strong>
          <p>
            {{ fmoAddress ? '新的通联会在这里实时出现。' : '先连接 FMO 盒子，开始查看实时通联。' }}
          </p>
          <button v-if="!fmoAddress" type="button" @click="router.push('/settings')">
            连接设备
          </button>
        </div>
        <footer class="panel-footer">
          <span>盒子日志与实时发言 · 最近 20 个友台</span><span>{{ lastRefreshText }}</span>
        </footer>
      </section>
    </div>
    <div
      v-if="showRecentRelaySwitcher && !showFootprints"
      class="recent-relay-switcher-overlay"
      @click.self="showRecentRelaySwitcher = false"
    >
      <section class="recent-relay-switcher" aria-label="最近活跃中继">
        <h2>最近活跃中继</h2>
        <div>
          <button type="button" :disabled="recentRelayBusy" @click="switchRecentRelay('prev')">
            上个活跃中继</button
          ><button type="button" :disabled="recentRelayBusy" @click="switchRecentRelay('next')">
            下个活跃中继
          </button>
        </div>
        <button class="relay-close" type="button" @click="showRecentRelaySwitcher = false">
          关闭
        </button>
      </section>
    </div>
    <p v-if="voiceStatus" class="sr-only" role="status">{{ voiceStatus }}</p>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { FmoApiClient } from '../services/fmoApi'
import { formatFreqHz, formatTimestamp } from '../components/home/constants'
import { getControlTarget, switchStationByRelayName } from '../services/stationControl'
import { useSpeakingStatusStore } from '../stores/speakingStore'
import { gridToAddress } from '../services/gridService'
import { stationIdentity, eventCoordinates, getEventGrid } from '../core/stationIdentity'
import { getPlatform } from '../platform'
import { coordinatesToMaidenhead } from '../core/maidenhead'
import { addDiagnosticLog } from '../services/diagnosticLog'
import { playCallsignSpeech } from '../services/callsignSpeech'
import { formatCallsignForSpeech as formatCallsignForNatoSpeech } from '../utils/callsignSpeechText'
import toast from '../composables/useToast'
import { useLocale } from '../composables/useLocale'
import WorkspaceNavigation from '../components/home/WorkspaceNavigation.vue'
import { dashboardView } from '../core/navigation'

const MapView = defineAsyncComponent(() => import('./MapView.vue'))

const FmoSpeech = registerPlugin('FmoSpeech')
const IOS_SPEECH_RATE = 1

const props = defineProps({
  dbLoaded: { type: Boolean, default: false },
  activeAddressId: { type: String, default: '' },
  addressList: { type: Array, default: () => [] },
  fmoAddress: {
    type: String,
    default: ''
  },
  protocol: {
    type: String,
    default: 'ws'
  },
  selectedFromCallsign: {
    type: String,
    default: ''
  },
  ownCallsign: {
    type: String,
    default: ''
  },
  todayContactedCallsigns: {
    type: Object,
    default: () => new Set()
  },
  contactCounts: {
    type: Object,
    default: () => new Map()
  },
  voiceMode: {
    type: String,
    default: 'off'
  },
  totalLogs: {
    type: Number,
    default: 0
  },
  todayLogs: {
    type: Number,
    default: 0
  },
  uniqueCallsigns: {
    type: Number,
    default: 0
  },
  stationBusy: {
    type: Boolean,
    default: false
  },
  stationConnected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'show-callsign-records',
  'update-dashboard-voice-mode',
  'open-station-list',
  'station-prev',
  'station-next'
])
const router = useRouter()
const currentRoute = useRoute()
const showFootprints = computed(() => dashboardView(currentRoute.query) === 'footprints')
const { t, isEnglish } = useLocale()
const records = ref([])
const currentStation = ref(null)
const refreshing = ref(false)
const loadingStation = ref(false)
const error = ref('')
const refreshWarning = ref('')
const consecutiveRefreshFailures = ref(0)
const lastRefreshAt = ref(null)
const switchingRelay = ref('')
const pinnedRelayNames = ref([])
const pinnedStations = ref([])
const allStations = ref([])
const qthCache = ref({})
const locationMetadata = ref({})
const qthLoadingKeys = new Set()
const fmoCoordinate = ref(null)
const voiceStatus = ref('')
const activeNow = ref(Date.now())
const showRecentRelaySwitcher = ref(false)
let timer = null
let activeTimer = null
let audioContext = null
let removeVisibilityListener = null
let removeAppStateListener = null
let lastForegroundRefreshAt = 0
const REFRESH_INTERVAL_MS = 12000
const ACTIVE_CONTACT_LINGER_MS = 5000
const SOFT_REFRESH_FAILURE_LIMIT = 3
const VOICE_REPEAT_INTERVAL_MS = 10 * 60 * 1000
const VOICE_HISTORY_KEY = 'fmo_dashboard_voice_history'
const FOREGROUND_REFRESH_DEBOUNCE_MS = 1200
const ANNOUNCE_DEDUP_WINDOW_MS = 3000
const shouldReconnectEventsOnForeground =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
const recentAnnouncements = new Map()
const controlTarget = computed(() => getControlTarget(props.fmoAddress, props.protocol))
const controlHost = computed(() => controlTarget.value.host)
const controlProtocol = computed(() => controlTarget.value.protocol)
const speakingStatus = useSpeakingStatusStore()
const { speakingHistory, allSpeakingHistories } = storeToRefs(speakingStatus)

const lastRefreshText = computed(() => {
  if (!lastRefreshAt.value) return t('dashboard.neverRefreshed', '尚未刷新')
  return t('dashboard.lastRefresh', `上次刷新 ${formatClock(lastRefreshAt.value)}`, {
    time: formatClock(lastRefreshAt.value)
  })
})

const liveStatusKind = computed(() => {
  if (error.value) return 'error'
  if (refreshWarning.value) return 'warning'
  return ''
})

const currentFrequencyDisplay = computed(() => {
  const candidates = [
    currentStation.value,
    activeContact.value?.frequencySource,
    findStationByName(activeContact.value?.relayName),
    findStationByName(recentActiveRelayName.value),
    records.value.find((record) => getFrequencyParts(record).hasFrequency),
    activeContact.value
  ].filter(Boolean)

  let fallback = null
  for (const candidate of candidates) {
    const display = formatFrequencyDisplay(candidate)
    if (display.tx || display.rx) return display
    if (!fallback && (display.hasFrequency || display.mode !== 'FMO')) fallback = display
  }

  if (fallback) return fallback
  return formatFrequencyDisplay(null)
})

const currentFrequencyLine = computed(() => {
  const display = currentFrequencyDisplay.value
  if (display.tx || display.rx) {
    const parts = []
    if (display.tx) parts.push(`T:${display.tx.replace(/\s*MHz$/i, '')}`)
    if (display.rx) parts.push(`R:${display.rx.replace(/\s*MHz$/i, '')}`)
    parts.push(display.mode)
    return parts.join('/')
  }
  return [display.single?.replace(/\s*MHz$/i, ''), display.mode].filter(Boolean).join('/')
})

const currentSpeakingRecord = computed(() => {
  return (
    [...speakingHistory.value]
      .filter((item) => !item.endTime && item.callsign)
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0] || null
  )
})

const recentEndedSpeakingRecord = computed(() => {
  const now = activeNow.value
  return (
    [...speakingHistory.value]
      .filter(
        (item) => item.endTime && item.callsign && now - item.endTime <= ACTIVE_CONTACT_LINGER_MS
      )
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0] || null
  )
})

const activeContact = computed(() => {
  const current = currentSpeakingRecord.value || recentEndedSpeakingRecord.value
  if (!current) return null

  const matchedLog = findMatchingLog(current)
  const grid = normalizeGrid(current.grid || '')
  const qth = getRecordQth({ toCallsign: current.callsign, toGrid: grid })
  const callsign = getCallsign(current)
  const isSelf = isSelfCallsign(callsign)
  const bearing = getBearingForGrid(grid, isSelf)

  return {
    callsign,
    timestamp: Math.floor(current.startTime / 1000),
    grid,
    eventGrid: grid,
    ...eventCoordinates(current),
    qth,
    relayName: current.serverName || matchedLog?.relayName || currentStation.value?.name || '',
    frequencySource: matchedLog || findStationByName(current.serverName) || currentStation.value,
    bearing,
    bearingHint: getBearingHint(grid, isSelf),
    isSpeaking: !current.endTime,
    isNewCallsign: Boolean(callsign && !isSelf && getContactCount(callsign) <= 0),
    contactCount: getContactCount(callsign),
    hasLoggedContact: hasLoggedContact(callsign, matchedLog)
  }
})

const recentActiveRelayName = computed(() => {
  const liveRelay = getSpeakingRelayName(currentSpeakingRecord.value)
  if (liveRelay) return liveRelay

  const recentRelay = getSpeakingRelayName(recentEndedSpeakingRecord.value)
  if (recentRelay) return recentRelay

  const latestRelayRecord = [...speakingHistory.value]
    .filter((item) => item.callsign && (item.serverName || findMatchingLog(item)?.relayName))
    .sort((a, b) => {
      const aTime = a.endTime || a.startTime || 0
      const bTime = b.endTime || b.startTime || 0
      return bTime - aTime
    })[0]

  return getSpeakingRelayName(latestRelayRecord)
})

const recentActiveRelayNames = computed(() => {
  const names = []
  const seen = new Set()
  const recordsByTime = [...speakingHistory.value].sort((a, b) => {
    const aTime = a.endTime || a.startTime || 0
    const bTime = b.endTime || b.startTime || 0
    return bTime - aTime
  })

  for (const item of recordsByTime) {
    const name = getSpeakingRelayName(item)
    const key = normalizeRelayName(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }

  return names
})

const recentRelayControlName = computed(() => {
  return currentStation.value?.name || recentActiveRelayName.value || ''
})

const recentRelayBusy = computed(() => {
  return (
    props.stationBusy || Boolean(switchingRelay.value) || recentActiveRelayNames.value.length === 0
  )
})

const recentRelayCommandTitle = computed(() => {
  if (recentRelayControlName.value) {
    return t('dashboard.recentActiveRelay', `最近活跃中继：${recentRelayControlName.value}`, {
      name: recentRelayControlName.value
    })
  }
  return t('dashboard.recentActiveRelay', '最近活跃中继')
})

const displayRecords = computed(() => {
  const eventRows =
    allSpeakingHistories.value.length > 0 ? allSpeakingHistories.value : speakingHistory.value

  const liveRows = eventRows
    .filter((item) => item.callsign)
    .map((item) => {
      const matchedLog = findMatchingLog(item)
      const timestamp = Math.floor(item.startTime / 1000)
      const grid = getEventGrid(item)
      return {
        ...matchedLog,
        rowId: `live-${item.addressId || 'single'}-${item.callsign}-${item.startTime}`,
        toCallsign: item.callsign,
        toGrid: grid,
        ...eventCoordinates(item),
        eventGrid: grid,
        qth: getRecordQth({ toCallsign: item.callsign, toGrid: grid }),
        timestamp,
        toComment: item.endTime
          ? matchedLog?.toComment || t('dashboard.recentSpeaker', '最近发言')
          : t('dashboard.speaking', '正在发言'),
        mode: matchedLog?.mode || 'FMO',
        relayName: item.serverName || matchedLog?.relayName || currentStation.value?.name || '',
        relayAdmin: matchedLog?.relayAdmin || '',
        isRelayPinned: isRelayPinned(
          item.serverName || matchedLog?.relayName || currentStation.value?.name
        ),
        hasLoggedContact: hasLoggedContact(item.callsign, matchedLog),
        contactCount: getContactCount(item.callsign),
        isSelf: isSelfCallsign(item.callsign),
        isSpeaking: !item.endTime
      }
    })

  const sortedRows = liveRows.sort((a, b) => {
    if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1
    return (b.timestamp || 0) - (a.timestamp || 0)
  })

  const liveCallsigns = new Set(sortedRows.map((row) => getCallsign(row)).filter(Boolean))
  const logFillRows = records.value
    .filter((record) => {
      const callsign = getCallsign(record)
      return callsign && !liveCallsigns.has(callsign)
    })
    .map((record) => ({
      ...record,
      qth: getRecordQth(record),
      rowId: `log-fill-${record.logId || record.timestamp || ''}-${record.toCallsign || ''}`,
      isRelayPinned: isRelayPinned(record.relayName),
      hasLoggedContact: hasLoggedContact(record.toCallsign, record),
      contactCount: getContactCount(record.toCallsign),
      isSelf: isSelfCallsign(record.toCallsign),
      isSpeaking: false
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

  return dedupeLatestByCallsign([...sortedRows, ...logFillRows]).slice(0, 20)
})

const previousContactBaseline = ref(null)

const previousContactSource = computed(() => {
  const activeCallsign = normalizeCallsign(activeContact.value?.callsign)
  const activeTimestamp = activeContact.value?.timestamp || 0
  const record = displayRecords.value.find((item) => {
    const sameCallsign = normalizeCallsign(item.toCallsign) === activeCallsign
    const sameMoment = Math.abs((item.timestamp || 0) - activeTimestamp) < 90
    return !(sameCallsign && sameMoment)
  })
  if (!record) return null

  const callsign = normalizeCallsign(record.toCallsign)
  const grid = normalizeGrid(record.toGrid)
  const currentContactCount = getContactCount(callsign)
  return {
    ...record,
    previousKey: callsign,
    callsign,
    grid,
    qth: getRecordQth(record),
    bearing: getBearingForGrid(grid, record.isSelf),
    currentContactCount
  }
})

watch(
  () => previousContactSource.value?.previousKey || '',
  () => {
    const source = previousContactSource.value
    if (!source) {
      previousContactBaseline.value = null
      return
    }

    const previous = previousContactBaseline.value
    previousContactBaseline.value = {
      key: source.previousKey,
      count:
        previous?.key === source.previousKey
          ? Math.min(previous.count, source.currentContactCount)
          : source.currentContactCount
    }
  },
  { immediate: true }
)

const previousContact = computed(() => {
  const source = previousContactSource.value
  if (!source) return null

  const baseline =
    previousContactBaseline.value?.key === source.previousKey
      ? previousContactBaseline.value.count
      : source.currentContactCount
  const increment = Math.min(1, Math.max(0, source.currentContactCount - baseline))

  return {
    ...source,
    contactCount: increment > 0 ? baseline : source.currentContactCount,
    qsoConfirmedIncrement: increment
  }
})

function createClient() {
  if (!controlHost.value) return null
  return new FmoApiClient(`${controlProtocol.value}://${controlHost.value}`)
}

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTime(timestamp) {
  if (!timestamp) return '-'
  return formatTimestamp(timestamp)
}

function formatDatePart(timestamp) {
  const text = formatTime(timestamp)
  return text.includes(' ') ? text.split(' ')[0] : text
}

function formatClockPart(timestamp) {
  const text = formatTime(timestamp)
  return text.includes(' ') ? text.split(' ')[1] : ''
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return t('dashboard.noPrevious', '暂无')
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 60) return t('dashboard.justNow', '刚刚')
  if (seconds < 3600) {
    const count = Math.floor(seconds / 60)
    return t('dashboard.minutesAgo', `${count} 分钟前`, { count })
  }
  if (seconds < 86400) {
    const count = Math.floor(seconds / 3600)
    return t('dashboard.hoursAgo', `${count} 小时前`, { count })
  }
  const count = Math.floor(seconds / 86400)
  return t('dashboard.daysAgo', `${count} 天前`, { count })
}

function findStationByName(name) {
  const key = normalizeRelayName(name)
  if (!key) return null
  return (
    allStations.value.find((station) => normalizeRelayName(station.name) === key) ||
    pinnedStations.value.find((station) => normalizeRelayName(station.name) === key) ||
    null
  )
}

function readFrequencyValue(record, names) {
  if (!record) return null
  for (const name of names) {
    const value = record[name]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function normalizeFrequencyHz(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && value.trim().toUpperCase().endsWith('MHZ')) {
    const mhz = Number(value.replace(/mhz/i, '').trim())
    return Number.isFinite(mhz) ? Math.round(mhz * 10000) : null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null

  // FMO 日志使用 MHz * 10000；部分接口可能直接返回 MHz 或 Hz。
  if (numeric < 10000) return Math.round(numeric * 10000)
  if (numeric > 100000000) return Math.round(numeric / 100)
  return Math.round(numeric)
}

function normalizeFrequencyDeltaHz(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && value.trim().toUpperCase().endsWith('MHZ')) {
    const mhz = Number(value.replace(/mhz/i, '').trim())
    return Number.isFinite(mhz) && mhz !== 0 ? Math.round(mhz * 10000) : null
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return null
  const abs = Math.abs(numeric)
  let normalized = 0
  if (abs < 10000) normalized = Math.round(abs * 10000)
  else if (abs > 100000000) normalized = Math.round(abs / 100)
  else normalized = Math.round(abs)
  return numeric < 0 ? -normalized : normalized
}

function formatFrequencyValue(value) {
  const normalized = normalizeFrequencyHz(value)
  return normalized ? `${formatFreqHz(normalized)} MHz` : ''
}

function findCombinedFrequencyText(record) {
  if (!record || typeof record !== 'object') return ''
  const preferredKeys = [
    'frequencyText',
    'frequencyDisplay',
    'freqText',
    'freqDisplay',
    'displayFrequency',
    'channel',
    'channelText',
    'radioFrequency',
    'workFrequency'
  ]
  const values = []
  for (const key of preferredKeys) {
    const value = record[key]
    if (typeof value === 'string') values.push(value)
  }
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && /(?:^|[\\s/])(?:T|TX|R|RX)\\s*[:：]/i.test(value)) {
      values.push(value)
    }
  }
  return values.find((value) => /(?:T|TX)\\s*[:：].*(?:R|RX)\\s*[:：]/i.test(value)) || ''
}

function parseCombinedFrequencyParts(record) {
  const text = findCombinedFrequencyText(record)
  if (!text) return { tx: '', rx: '' }
  const txMatch = text.match(/(?:^|[\\s/])(?:T|TX)\\s*[:：]\\s*([0-9]+(?:\\.[0-9]+)?)/i)
  const rxMatch = text.match(/(?:^|[\\s/])(?:R|RX)\\s*[:：]\\s*([0-9]+(?:\\.[0-9]+)?)/i)
  return {
    tx: txMatch ? formatFrequencyValue(txMatch[1]) : '',
    rx: rxMatch ? formatFrequencyValue(rxMatch[1]) : ''
  }
}

function getOffsetFrequencyValue(record) {
  return readFrequencyValue(record, [
    'txOffsetHz',
    'txOffset',
    'freqOffsetHz',
    'freqOffset',
    'frequencyOffsetHz',
    'frequencyOffset',
    'offsetHz',
    'offset',
    'shiftHz',
    'shift',
    'duplexOffsetHz',
    'duplexOffset',
    'differenceHz',
    'difference'
  ])
}

function inferTxRxFromOffset(record, singleText) {
  const singleHz = normalizeFrequencyHz(
    readFrequencyValue(record, ['freqHz', 'frequencyHz', 'freq'])
  )
  const offsetHz = normalizeFrequencyDeltaHz(getOffsetFrequencyValue(record))
  if (!singleHz || !offsetHz) return { tx: '', rx: '' }

  const direction = String(
    readFrequencyValue(record, ['duplex', 'shiftDirection', 'offsetDirection', 'direction']) || ''
  ).toLowerCase()
  const sign =
    direction.includes('-') || direction.includes('minus') || offsetHz < 0
      ? -1
      : direction.includes('+') || direction.includes('plus')
        ? 1
        : 1

  const txHz = singleHz + sign * Math.abs(offsetHz)
  if (txHz <= 0 || txHz === singleHz) return { tx: '', rx: '' }
  return {
    tx: formatFrequencyValue(txHz),
    rx: singleText || formatFrequencyValue(singleHz)
  }
}

function getFrequencyParts(record) {
  let tx = formatFrequencyValue(
    readFrequencyValue(record, [
      'txFreqHz',
      'txFrequencyHz',
      'txFreq',
      'txFrequency',
      'tx_freq',
      'tx_frequency',
      'tx',
      'tFreqHz',
      'tFreq',
      't',
      'transmitFreqHz',
      'transmitFreq',
      'transmitFrequency',
      'transmit',
      'sendFreqHz',
      'sendFreq',
      'sendFrequency',
      'frequencyTx',
      'frequencyTX',
      'uplinkFreqHz',
      'uplinkFreq',
      'uplinkFrequency'
    ])
  )
  let rx = formatFrequencyValue(
    readFrequencyValue(record, [
      'rxFreqHz',
      'rxFrequencyHz',
      'rxFreq',
      'rxFrequency',
      'rx_freq',
      'rx_frequency',
      'rx',
      'rFreqHz',
      'rFreq',
      'r',
      'receiveFreqHz',
      'receiveFreq',
      'receiveFrequency',
      'receive',
      'recvFreqHz',
      'recvFreq',
      'recvFrequency',
      'frequencyRx',
      'frequencyRX',
      'downlinkFreqHz',
      'downlinkFreq',
      'downlinkFrequency'
    ])
  )
  const single = formatFrequencyValue(readFrequencyValue(record, ['freqHz', 'frequencyHz', 'freq']))
  if (!tx || !rx) {
    const combined = parseCombinedFrequencyParts(record)
    tx = tx || combined.tx
    rx = rx || combined.rx
  }
  if (!tx || !rx) {
    const offsetParts = inferTxRxFromOffset(record, single)
    tx = tx || offsetParts.tx
    rx = rx || offsetParts.rx
  }
  return {
    tx,
    rx,
    single: tx || rx ? '' : single,
    hasFrequency: Boolean(tx || rx || single)
  }
}

function formatFrequencyDisplay(record) {
  const parts = getFrequencyParts(record)
  return {
    ...parts,
    mode: record?.mode || record?.app_fmo_mode || 'FMO'
  }
}

function formatErrorMessage(err) {
  if (!err) return '未知错误'
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  if (err?.message) return err.message
  if (err?.type) return `连接事件异常：${err.type}`
  return '连接失败，请检查 FMO 地址、网络或浏览器安全设置'
}

function normalizeRecord(item, detail) {
  const log = detail?.log || detail || item
  return {
    ...item,
    ...log,
    logId: log.logId || item.logId
  }
}

function formatAddress(address) {
  if (!address) return ''
  const region = [address.province, address.city, address.district]
    .filter(Boolean)
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .join('')
  if (region) return region

  const direct =
    address.formattedAddress ||
    address.formatted ||
    address.fullAddress ||
    address.address ||
    address.name
  if (direct && !isMaidenheadGrid(direct)) return direct
  return ''
}

function getRecordQth(record) {
  const aprs = qthCache.value[getQthCacheKey(getCallsign(record), '')]
  if (!record?.toGrid && !record?.grid && aprs) return aprs
  const qthGrid = isMaidenheadGrid(record?.qth) ? record.qth : ''
  const grid = normalizeGrid(record?.toGrid || record?.grid || qthGrid)
  if (grid) {
    const callsign = getCallsign(record)
    const resolved = qthCache.value[getQthCacheKey(callsign, grid)] || qthCache.value[grid]
    if (resolved) return resolved
  }

  const direct =
    (isMaidenheadGrid(record?.qth) ? '' : record?.qth) ||
    record?.address ||
    record?.location ||
    record?.toAddress ||
    record?.city ||
    record?.province
  if (direct) return direct

  return grid
}

function locationLabel(record) {
  const grid = normalizeGrid(record.eventGrid || record.toGrid || record.grid)
  if (grid) return ''
  const meta = locationMetadata.value[getQthCacheKey(getCallsign(record), '')]
  return meta?.receivedAt ? 'APRS 最近位置' : ''
}

function aprsFiSource(record) {
  return (
    !record.eventGrid &&
    !record.toGrid &&
    !record.grid &&
    locationMetadata.value[getQthCacheKey(getCallsign(record), '')]?.source === 'aprs.fi'
  )
}

function getQthCacheKey(callsign, grid) {
  return `${normalizeCallsign(callsign)}|${normalizeGrid(grid)}`
}

function isMaidenheadGrid(value) {
  return /^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/i.test(String(value || '').trim())
}

function normalizeGrid(grid) {
  return String(grid || '')
    .trim()
    .toUpperCase()
}

function gridToLatLng(grid) {
  const normalized = normalizeGrid(grid)
  if (normalized.length < 4 || normalized.length % 2 !== 0) return null

  const pairs = normalized.match(/.{1,2}/g) || []
  let lon = -180
  let lat = -90
  const lonSteps = [20, 2, 5 / 60, 5 / 600]
  const latSteps = [10, 1, 2.5 / 60, 2.5 / 600]
  let lonPrecision = lonSteps[0]
  let latPrecision = latSteps[0]

  for (let index = 0; index < pairs.length && index < lonSteps.length; index += 1) {
    const [lonChar, latChar] = pairs[index]
    lonPrecision = lonSteps[index]
    latPrecision = latSteps[index]

    if (index === 0 || index === 2) {
      const base = index === 0 ? 65 : 65
      const lonValue = lonChar.charCodeAt(0) - base
      const latValue = latChar.charCodeAt(0) - base
      if (lonValue < 0 || latValue < 0) return null
      lon += lonValue * lonPrecision
      lat += latValue * latPrecision
    } else {
      const lonValue = Number(lonChar)
      const latValue = Number(latChar)
      if (Number.isNaN(lonValue) || Number.isNaN(latValue)) return null
      lon += lonValue * lonPrecision
      lat += latValue * latPrecision
    }
  }

  return {
    lat: lat + latPrecision / 2,
    lng: lon + lonPrecision / 2
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function toDegrees(value) {
  return (value * 180) / Math.PI
}

function calculateDistanceKm(from, to) {
  const earthRadiusKm = 6371
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calculateBearing(from, to) {
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const dLng = toRadians(to.lng - from.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return Math.round((toDegrees(Math.atan2(y, x)) + 360) % 360)
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

function bearingToDirection(bearing) {
  const labels = isEnglish.value
    ? [
        'dashboard.direction.N',
        'dashboard.direction.NNE',
        'dashboard.direction.NE',
        'dashboard.direction.ENE',
        'dashboard.direction.E',
        'dashboard.direction.ESE',
        'dashboard.direction.SE',
        'dashboard.direction.SSE',
        'dashboard.direction.S',
        'dashboard.direction.SSW',
        'dashboard.direction.SW',
        'dashboard.direction.WSW',
        'dashboard.direction.W',
        'dashboard.direction.WNW',
        'dashboard.direction.NW',
        'dashboard.direction.NNW'
      ]
    : [
        '北',
        '东北偏北',
        '东北',
        '东北偏东',
        '东',
        '东南偏东',
        '东南',
        '东南偏南',
        '南',
        '西南偏南',
        '西南',
        '西南偏西',
        '西',
        '西北偏西',
        '西北',
        '西北偏北'
      ]
  const label = labels[Math.round(bearing / 22.5) % 16]
  return isEnglish.value ? t(label, label.replace('dashboard.direction.', '')) : label
}

function getBearingForGrid(grid, isSelf = false) {
  if (isSelf) {
    return {
      bearing: 0,
      direction: t('dashboard.selfPosition', '本机位置'),
      distanceKm: 0,
      distanceText: '0 m'
    }
  }

  const from = fmoCoordinate.value
  const to = gridToLatLng(grid)
  if (!from || !to) return null
  const distance = calculateDistanceKm(from, to)
  const bearing = calculateBearing(from, to)
  return {
    bearing,
    direction: bearingToDirection(bearing),
    distanceKm: distance,
    distanceText: formatDistance(distance)
  }
}

function getBearingHint(grid, isSelf = false) {
  if (isSelf) return t('dashboard.selfPosition', '本机位置')
  if (!grid) return t('dashboard.waitingLocation', '缺少对方网格')
  if (!fmoCoordinate.value) return t('dashboard.noFmoCoordinate', '未读取到 FMO 坐标')
  return t('dashboard.invalidGrid', '网格格式不可用')
}

function normalizeRelayName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
}

function isRelayPinned(relayName) {
  const name = normalizeRelayName(relayName)
  return Boolean(name && pinnedRelayNames.value.includes(name))
}

function collectVisibleLocations() {
  const locations = new Map()
  // 当前发言记录通常位于 speakingHistory 首位，优先发起其 QTH 查询。
  const eventRows =
    allSpeakingHistories.value.length > 0 ? allSpeakingHistories.value : speakingHistory.value
  const eventCallsigns = new Set(eventRows.map(getCallsign).filter(Boolean))
  for (const item of eventRows) {
    const grid = getEventGrid(item)
    const callsign = getCallsign(item)
    if (callsign) locations.set(getQthCacheKey(callsign, grid), { callsign, grid })
  }
  for (const record of records.value) {
    const grid = normalizeGrid(record.toGrid)
    const callsign = getCallsign(record)
    if (eventCallsigns.has(callsign)) continue
    if (callsign) locations.set(getQthCacheKey(callsign, grid), { callsign, grid })
  }
  return Array.from(locations.values()).map((item) => ({
    ...item,
    refreshMinute: Math.floor(activeNow.value / 60000)
  }))
}

async function loadQthForStation(callsign, grid) {
  const cacheKey = getQthCacheKey(callsign, grid)
  if (qthLoadingKeys.has(cacheKey)) return
  if (grid && qthCache.value[cacheKey]) return
  const cached = locationMetadata.value[cacheKey]
  if (!grid && cached && Date.now() - cached.checkedAt < 5 * 60 * 1000) return
  qthLoadingKeys.add(cacheKey)
  try {
    if (isMaidenheadGrid(grid)) {
      const address = formatAddress(await gridToAddress(grid))
      qthCache.value = { ...qthCache.value, [cacheKey]: address || grid }
      return
    }
    const position = await getPlatform().stationLocation.getLatest(callsign)
    locationMetadata.value = {
      ...locationMetadata.value,
      [cacheKey]: {
        checkedAt: Date.now(),
        status: getPlatform().stationLocation.getStatus?.(callsign),
        ...position
      }
    }
    if (!position) {
      const updated = { ...qthCache.value }
      delete updated[cacheKey]
      qthCache.value = updated
      return
    }
    const preciseGrid = coordinatesToMaidenhead(position.latitude, position.longitude, 8)
    const address =
      formatAddress(position.address) || formatAddress(await gridToAddress(preciseGrid))
    qthCache.value = { ...qthCache.value, [cacheKey]: address || preciseGrid }
  } catch {
    // Keep the source grid available when reverse geocoding fails.
  } finally {
    qthLoadingKeys.delete(cacheKey)
  }
}
function getCallsign(record) {
  return (record?.toCallsign || record?.callsign || '').toUpperCase()
}

function normalizeCallsign(callsign) {
  return String(callsign || '')
    .trim()
    .toUpperCase()
}

function isSelfCallsign(callsign) {
  return Boolean(
    normalizeCallsign(callsign) &&
    normalizeCallsign(callsign) === normalizeCallsign(props.selectedFromCallsign)
  )
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function isNativeIos() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

function formatCallsignForLegacySpeech(callsign) {
  return String(callsign || '')
    .split('')
    .join(' ')
}

function getPreferredSpeechVoice() {
  if (!window.speechSynthesis?.getVoices) return null
  const voices = window.speechSynthesis.getVoices()
  const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang || ''))
  const femaleHints = [
    'female',
    'woman',
    'samantha',
    'victoria',
    'karen',
    'susan',
    'zira',
    'jenny',
    'aria',
    'ava',
    'emma'
  ]

  return (
    englishVoices.find((voice) =>
      femaleHints.some((hint) => voice.name.toLowerCase().includes(hint))
    ) ||
    englishVoices.find((voice) => /en-US/i.test(voice.lang || '')) ||
    englishVoices[0] ||
    voices[0] ||
    null
  )
}

function waitForVoices(timeoutMs = 1800) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis?.getVoices) {
      resolve([])
      return
    }

    const currentVoices = window.speechSynthesis.getVoices()
    if (currentVoices.length > 0) {
      resolve(currentVoices)
      return
    }

    const timer = setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }, timeoutMs)

    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer)
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }
  })
}

function getSpeechTimeoutMs(text) {
  return Math.max(20000, String(text || '').length * 1800)
}

function getContactCount(callsign) {
  if (!callsign) return 0
  if (props.contactCounts instanceof Map) {
    return props.contactCounts.get(callsign) || props.contactCounts.get(callsign.toLowerCase()) || 0
  }
  return props.contactCounts?.[callsign] || props.contactCounts?.[callsign.toLowerCase()] || 0
}

function hasTodayContact(callsign) {
  if (!callsign) return false
  if (props.todayContactedCallsigns instanceof Set) {
    return (
      props.todayContactedCallsigns.has(callsign) ||
      props.todayContactedCallsigns.has(callsign.toLowerCase())
    )
  }
  return Boolean(
    props.todayContactedCallsigns?.[callsign] ||
    props.todayContactedCallsigns?.[callsign.toLowerCase()]
  )
}

function hasLoggedContact(callsign, record = null) {
  return Boolean(record?.logId || getContactCount(callsign) > 0)
}

function loadVoiceHistory() {
  try {
    return JSON.parse(localStorage.getItem(VOICE_HISTORY_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveVoiceHistory(history) {
  const now = Date.now()
  const pruned = Object.fromEntries(
    Object.entries(history).filter(([, timestamp]) => now - Number(timestamp) < 24 * 60 * 60 * 1000)
  )
  localStorage.setItem(VOICE_HISTORY_KEY, JSON.stringify(pruned))
}

function getVoicePlan(callsign) {
  const history = loadVoiceHistory()
  const lastSeenAt = Number(history[callsign] || 0)
  if (lastSeenAt && Date.now() - lastSeenAt < VOICE_REPEAT_INTERVAL_MS) {
    return null
  }

  if (getContactCount(callsign) <= 0) {
    return { beepCount: 3, label: '历史新呼号' }
  }

  if (!hasTodayContact(callsign)) {
    return { beepCount: 2, label: '今日新呼号' }
  }

  return { beepCount: 0, label: '10分钟未出现' }
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!audioContext) audioContext = new AudioContextClass()
  return audioContext
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function playBeeps(count) {
  const context = getAudioContext()
  if (!context || count <= 0) return
  if (context.state === 'suspended') await context.resume()

  for (let index = 0; index < count; index += 1) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 920
    gain.gain.value = 0.112
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
    await sleep(210)
  }
}

async function speakCallsign(callsign) {
  if (isNativeIos()) {
    return speakCallsignOnIos(callsign)
  }

  const text = formatCallsignForLegacySpeech(callsign)

  try {
    await playCallsignSpeech(callsign)
    return
  } catch (err) {
    addDiagnosticLog('warn', '内置呼号语音播放失败，尝试系统语音', {
      callsign,
      error: err?.message || String(err)
    })
  }

  if (isNativeAndroid()) {
    try {
      const result = await FmoSpeech.speak({
        text,
        lang: 'en-US',
        rate: 0.42,
        pitch: 1
      })
      if (result && result.ok === false) {
        throw new Error(result.error || '安卓系统语音未播放')
      }
      return
    } catch (err) {
      addDiagnosticLog('warn', '安卓原生呼号播报失败，尝试网页语音', {
        callsign,
        error: err?.message || String(err)
      })
    }
  }

  await waitForVoices()
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      addDiagnosticLog('warn', '当前 WebView 不支持语音合成，无法播报呼号')
      resolve()
      return
    }

    const utterance = new window.SpeechSynthesisUtterance(text)
    const voice = getPreferredSpeechVoice()
    if (voice) utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = 0.33
    utterance.volume = 1
    utterance.pitch = 1
    const keepAlive = setInterval(() => {
      window.speechSynthesis?.resume?.()
    }, 1000)
    const timeout = setTimeout(() => {
      clearInterval(keepAlive)
      addDiagnosticLog('warn', '呼号播报超时，已继续播放提示音', {
        callsign,
        voice: voice ? `${voice.name} (${voice.lang})` : '未选择语音',
        text
      })
      resolve()
    }, getSpeechTimeoutMs(text))
    utterance.onend = () => {
      clearInterval(keepAlive)
      clearTimeout(timeout)
      resolve()
    }
    utterance.onerror = (event) => {
      clearInterval(keepAlive)
      clearTimeout(timeout)
      addDiagnosticLog('warn', '呼号播报失败', { callsign, error: event.error })
      resolve()
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    window.speechSynthesis.resume?.()
  })
}

async function speakCallsignOnIos(callsign) {
  const text = formatCallsignForNatoSpeech(callsign)

  async function playBuiltInPrimary() {
    try {
      window.speechSynthesis?.cancel?.()
      await playCallsignSpeech(callsign)
      addDiagnosticLog('info', 'iOS 已使用内置呼号音频播报', { callsign, text })
      return true
    } catch (err) {
      addDiagnosticLog('warn', 'iOS 内置呼号音频不可用，尝试系统语音', {
        callsign,
        text,
        error: err?.message || String(err)
      })
      return false
    }
  }

  async function playBuiltInFallback(reason) {
    try {
      window.speechSynthesis?.cancel?.()
      await playCallsignSpeech(callsign)
      addDiagnosticLog('info', '已使用内置呼号音频保底播报', {
        callsign,
        text,
        reason
      })
    } catch (err) {
      addDiagnosticLog('warn', '内置呼号音频保底播报失败', {
        callsign,
        text,
        reason,
        error: err?.message || String(err)
      })
    }
  }

  if (await playBuiltInPrimary()) return

  await waitForVoices()
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return false
      settled = true
      resolve()
      return true
    }

    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      addDiagnosticLog('warn', '当前 WebView 不支持语音合成，尝试内置呼号语音')
      playBuiltInFallback('web-speech-unavailable').finally(finish)
      return
    }

    const utterance = new window.SpeechSynthesisUtterance(text)
    const voice = getPreferredSpeechVoice()
    if (voice) utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = IOS_SPEECH_RATE
    utterance.volume = 1
    utterance.pitch = 1
    const keepAlive = setInterval(() => {
      window.speechSynthesis?.resume?.()
    }, 1000)
    const timeout = setTimeout(() => {
      clearInterval(keepAlive)
      if (settled) return
      addDiagnosticLog('warn', '呼号播报超时，已继续播放提示音', {
        callsign,
        voice: voice ? `${voice.name} (${voice.lang})` : '未选择语音',
        text
      })
      playBuiltInFallback('web-speech-timeout').finally(finish)
    }, getSpeechTimeoutMs(text))
    utterance.onend = () => {
      clearInterval(keepAlive)
      clearTimeout(timeout)
      finish()
    }
    utterance.onerror = (event) => {
      clearInterval(keepAlive)
      clearTimeout(timeout)
      if (settled) return
      addDiagnosticLog('warn', '呼号播报失败', { callsign, error: event.error })
      playBuiltInFallback(`web-speech-error:${event.error || 'unknown'}`).finally(finish)
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    window.speechSynthesis.resume?.()
  })
}

async function announceCallsign(callsign) {
  if (props.voiceMode !== 'alert' || !callsign) return
  if (isSelfCallsign(callsign)) return
  const normalized = normalizeCallsign(callsign)
  const eventKey = currentSpeakingRecord.value
    ? `${normalized}:${currentSpeakingRecord.value.startTime || ''}`
    : normalized
  const lastAnnouncedAt = recentAnnouncements.get(eventKey) || 0
  if (Date.now() - lastAnnouncedAt < ANNOUNCE_DEDUP_WINDOW_MS) return
  recentAnnouncements.set(eventKey, Date.now())

  const plan = getVoicePlan(callsign)
  if (!plan) {
    recentAnnouncements.delete(eventKey)
    return
  }

  const history = loadVoiceHistory()
  history[callsign] = Date.now()
  saveVoiceHistory(history)

  voiceStatus.value = `正在播报：${callsign}（${plan.label}）`
  await speakCallsign(callsign)
  await playBeeps(plan.beepCount)
  voiceStatus.value = ''
}

function openCallsignRecords(record) {
  const callsign = getCallsign(record)
  if (!callsign || !hasLoggedContact(callsign, record)) return
  emit('show-callsign-records', {
    callsign,
    timestamp: record.timestamp || null
  })
}

function dedupeLatestByCallsign(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    const callsign = getCallsign(row)
    if (!callsign) return true
    if (seen.has(callsign)) return false
    seen.add(callsign)
    return true
  })
}

function findMatchingLog(speakingRecord) {
  const speakingTimestamp = Math.floor(speakingRecord.startTime / 1000)
  return records.value.find((record) => {
    if (getCallsign(record) !== speakingRecord.callsign.toUpperCase()) return false
    return Math.abs((record.timestamp || 0) - speakingTimestamp) < 90
  })
}

async function refreshDashboard() {
  if (refreshing.value) return

  const client = createClient()
  if (!client) {
    error.value = '请先设置 FMO 地址'
    addDiagnosticLog('warn', '仪表盘刷新失败：未设置 FMO 地址')
    return
  }

  refreshing.value = true
  loadingStation.value = true
  error.value = ''

  try {
    const [station, qsoResponse, pinnedList, coordinate, stationList] = await Promise.all([
      client.getCurrentStation(),
      client.getQsoList(0, 20, props.selectedFromCallsign || ''),
      client.getAllPinnedStations(),
      client.getCoordinate().catch(() => null),
      allStations.value.length > 0 ? Promise.resolve(allStations.value) : client.getAllStations()
    ])
    currentStation.value = station
    if (
      coordinate &&
      typeof coordinate.latitude === 'number' &&
      typeof coordinate.longitude === 'number'
    ) {
      fmoCoordinate.value = { lat: coordinate.latitude, lng: coordinate.longitude }
    }
    pinnedStations.value = pinnedList || []
    pinnedRelayNames.value = pinnedStations.value.map((item) => normalizeRelayName(item.name))
    allStations.value = stationList || []
    loadingStation.value = false

    const list = qsoResponse?.list || []
    const detailed = list.map((item) => normalizeRecord(item, null))
    records.value = detailed

    for (const [index, item] of list.entries()) {
      try {
        const detail = item.logId ? await client.getQsoDetail(item.logId) : null
        detailed[index] = normalizeRecord(item, detail)
      } catch (err) {
        addDiagnosticLog('warn', '读取通联详情失败，已使用列表数据', {
          logId: item.logId,
          error: err?.message || String(err)
        })
      }

      if (index === 0) records.value = [...detailed]
    }

    records.value = detailed
    lastRefreshAt.value = new Date()
    consecutiveRefreshFailures.value = 0
    refreshWarning.value = ''
    error.value = ''
  } catch (err) {
    consecutiveRefreshFailures.value += 1
    const message = formatErrorMessage(err)
    const hasCachedData = records.value.length > 0 || currentStation.value || lastRefreshAt.value
    if (hasCachedData && consecutiveRefreshFailures.value < SOFT_REFRESH_FAILURE_LIMIT) {
      refreshWarning.value = `网络波动，保留上次数据（${consecutiveRefreshFailures.value}/${SOFT_REFRESH_FAILURE_LIMIT}）：${message}`
      error.value = ''
      addDiagnosticLog('warn', '仪表盘刷新暂时失败，保留上次数据', {
        failures: consecutiveRefreshFailures.value,
        error: message
      })
    } else {
      refreshWarning.value = ''
      error.value = `刷新失败：${message}`
      addDiagnosticLog('error', '仪表盘刷新失败', err)
    }
  } finally {
    loadingStation.value = false
    refreshing.value = false
    client.close()
  }
}

function refreshNow() {
  refreshDashboard()
  refreshSpeakingSnapshot()
}

function refreshSpeakingSnapshot({ reconnect = false } = {}) {
  const addressId = speakingStatus.primaryAddressId || 'single'
  if (reconnect) {
    return speakingStatus.reconnectEventWs?.(addressId)
  }
  speakingStatus.refreshSnapshot?.(addressId)
}

function updateCurrentStationSnapshot(station) {
  if (!station) return
  currentStation.value = station
  const addressId = speakingStatus.primaryAddressId || 'single'
  speakingStatus.updateServerInfo?.(addressId, station)
}

function refreshAfterForeground() {
  const now = Date.now()
  if (now - lastForegroundRefreshAt < FOREGROUND_REFRESH_DEBOUNCE_MS) return
  lastForegroundRefreshAt = now
  refreshSpeakingSnapshot({ reconnect: shouldReconnectEventsOnForeground })
  refreshDashboard()
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  refreshAfterForeground()
}

function handleAppStateChange(state) {
  if (!state?.isActive) return
  refreshAfterForeground()
}

watch(
  () => JSON.stringify(collectVisibleLocations()),
  (locationKey) => {
    if (!locationKey) return
    for (const item of JSON.parse(locationKey)) {
      loadQthForStation(item.callsign, item.grid)
    }
  },
  { immediate: true }
)

watch(
  () =>
    currentSpeakingRecord.value
      ? `${currentSpeakingRecord.value.callsign}-${currentSpeakingRecord.value.startTime}`
      : '',
  () => {
    if (props.voiceMode !== 'alert') return
    const callsign = getCallsign(currentSpeakingRecord.value)
    announceCallsign(callsign)
  }
)

watch(
  () => props.voiceMode,
  async (mode) => {
    window.speechSynthesis?.cancel()
    if (mode === 'off') {
      voiceStatus.value = '已关闭所有播报'
    } else {
      if (mode === 'alert') {
        waitForVoices().then((voices) => {
          addDiagnosticLog('info', '新呼号提示已开启', {
            speechSynthesis: Boolean(window.speechSynthesis),
            voices: voices.length
          })
        })
      }
      const context = getAudioContext()
      if (context?.state === 'suspended') {
        try {
          await context.resume()
        } catch {
          // 浏览器可能要求再次点击页面后才允许播放。
        }
      }
      const labelMap = {
        alert: '新呼号提示',
        radio: '通联播报',
        off: '关闭所有播报'
      }
      voiceStatus.value = `声音模式：${labelMap[mode] || mode}`
    }
    setTimeout(() => {
      if (voiceStatus.value === '已关闭所有播报' || voiceStatus.value.startsWith('声音模式：')) {
        voiceStatus.value = ''
      }
    }, 1800)
  }
)

async function switchRelay(relayName) {
  if (!relayName || switchingRelay.value) return false
  switchingRelay.value = relayName

  try {
    const { current, station } = await switchStationByRelayName(
      relayName,
      props.fmoAddress,
      props.protocol,
      {
        onSwitched: updateCurrentStationSnapshot
      }
    )
    updateCurrentStationSnapshot(current || station)
    refreshSpeakingSnapshot()
    toast.success(`已切换到：${current?.name || station.name}`)
    return true
  } catch (err) {
    toast.error(err.message || '切换中继失败')
    return false
  } finally {
    switchingRelay.value = ''
  }
}

function getSpeakingRelayName(speakingRecord) {
  if (!speakingRecord) return ''
  const matchedLog = findMatchingLog(speakingRecord)
  return speakingRecord.serverName || matchedLog?.relayName || ''
}

async function switchRecentRelay(direction) {
  if (recentRelayBusy.value) return

  const names = recentActiveRelayNames.value
  if (names.length === 0) {
    toast.warning('暂无最近活跃中继')
    return
  }

  const currentKey = normalizeRelayName(currentStation.value?.name || recentActiveRelayName.value)
  const currentIndex = names.findIndex((name) => normalizeRelayName(name) === currentKey)
  let nextIndex = 0

  if (currentIndex >= 0) {
    nextIndex = direction === 'prev' ? currentIndex + 1 : currentIndex - 1
    if (nextIndex < 0) nextIndex = names.length - 1
    if (nextIndex >= names.length) nextIndex = 0
  }

  const switched = await switchRelay(names[nextIndex])
  if (switched) showRecentRelaySwitcher.value = false
}

onMounted(() => {
  refreshSpeakingSnapshot()
  refreshDashboard()
  timer = setInterval(refreshDashboard, REFRESH_INTERVAL_MS)
  activeTimer = setInterval(() => {
    activeNow.value = Date.now()
  }, 1000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  removeVisibilityListener = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  if (shouldReconnectEventsOnForeground) {
    CapacitorApp.addListener('appStateChange', handleAppStateChange).then((handle) => {
      removeAppStateListener = () => {
        handle.remove()
      }
    })
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (activeTimer) clearInterval(activeTimer)
  if (removeVisibilityListener) removeVisibilityListener()
  if (removeAppStateListener) removeAppStateListener()
  window.speechSynthesis?.cancel()
})
</script>

<style scoped>
.dashboard-view {
  height: 100%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
}
.dashboard-footprints-panel {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dashboard-footprints-panel :deep(.footprint-view) {
  flex: 1 1 0;
  min-height: 0;
}
.live-workspace {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  padding: 22px;
  overflow: hidden;
  animation: workspace-arrive 0.25s ease-out;
}
.current-contact {
  max-height: min(320px, 44vh);
  display: flex;
  align-items: center;
  gap: 32px;
  min-width: 0;
  min-height: 0;
  padding: 24px 28px;
  background: var(--bg-card);
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  overflow: auto;
  overscroll-behavior: contain;
}
.current-contact.is-idle {
  padding-block: 18px;
}
.current-contact.is-idle .callsign-line h1 {
  font-size: 30px;
  letter-spacing: -0.5px;
}
.current-contact.is-idle .previous-line {
  margin-top: 14px;
}
.current-contact.is-idle .previous-line strong {
  font-size: 18px;
  font-weight: 600;
}
.current-contact.is-idle .previous-line time {
  font-size: 14px;
  color: var(--text-secondary);
}
.contact-copy {
  min-width: 0;
  flex: 1;
}
.contact-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.live-indicator {
  width: 7px;
  height: 7px;
  background: var(--text-tertiary);
  border-radius: 50%;
}
.live-indicator.speaking {
  background: var(--color-speaking);
  box-shadow: 0 0 0 4px var(--surface-success);
}
.live-indicator.error {
  background: var(--color-danger);
}
.live-indicator.warning {
  background: var(--color-warning);
}
.live-text {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--color-success);
}
.callsign-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0 10px;
}
.callsign-line h1 {
  margin: 0;
  font-size: clamp(34px, 4.6vw, 64px);
  font-weight: 650;
  line-height: 1.15;
  letter-spacing: -1.5px;
  overflow-wrap: anywhere;
}
.grid-label {
  font-size: 16px;
  color: var(--text-secondary);
}
.new-label {
  font-size: 12px;
  background: var(--surface-accent);
  color: var(--color-primary);
  border-radius: 4px;
  padding: 2px 6px;
}
.contact-location {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: var(--text-secondary);
  font-size: 14px;
}
.contact-location small {
  font-size: 12px;
  color: var(--text-secondary);
}
.contact-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 22px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}
.contact-meta strong {
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 8px;
}
.contact-meta button {
  font: inherit;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  padding: 0;
  cursor: pointer;
}
.previous-line {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border-secondary);
  font-size: 13px;
  color: var(--text-secondary);
}
.previous-line strong {
  color: var(--text-primary);
  font-weight: 550;
}
.previous-line time {
  margin-left: auto;
  font-size: 12px;
}
.bearing-panel {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 5px;
  width: 130px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.compass {
  position: relative;
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border: 1px solid var(--color-primary);
  border-radius: 50%;
  margin-bottom: 5px;
  color: var(--color-primary);
}
.north-label {
  position: absolute;
  top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}
.compass-arrow {
  width: 22px;
  height: 30px;
  fill: var(--surface-accent);
  stroke: var(--color-primary);
  stroke-width: 1.5;
  transform-origin: 50% 50%;
  transition: transform 0.35s ease-out;
}
.bearing-panel.unavailable .compass {
  border-color: var(--border-primary);
  opacity: 0.6;
}
.bearing-panel > span {
  font-size: 12px;
  text-align: center;
  color: var(--text-secondary);
}
.live-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  background: var(--bg-card);
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 17px 20px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-secondary);
}
.panel-heading > div {
  display: flex;
  align-items: baseline;
  gap: 18px;
  flex-wrap: wrap;
}
.panel-heading h2 {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
}
.panel-heading span {
  font-size: 12px;
  color: var(--text-secondary);
}
.panel-heading button,
.empty-state button {
  border: 1px solid var(--border-secondary);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  padding: 5px 12px;
  cursor: pointer;
}
.panel-heading button:disabled {
  opacity: 0.5;
  cursor: default;
}
.live-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.live-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}
.mobile-label,
.mobile-relay-link {
  display: none;
}
.live-table th {
  position: sticky;
  top: 0;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  z-index: 1;
}
.live-table td,
.live-table th {
  padding: 13px 18px;
  border-bottom: 1px solid var(--border-secondary);
  overflow-wrap: anywhere;
}
.live-table th:nth-child(1) {
  width: 17%;
}
.live-table th:nth-child(2) {
  width: 15%;
}
.live-table th:nth-child(3) {
  width: 23%;
}
.live-table th:nth-child(4) {
  width: 18%;
}
.live-table th:nth-child(5) {
  width: 9%;
}
.live-table th:nth-child(6) {
  width: 18%;
}
.live-table td small {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.live-table tr.is-speaking {
  background: color-mix(in srgb, var(--surface-success) 55%, var(--bg-card));
}
.callsign-link,
.relay-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.callsign-link {
  font-weight: 600;
}
.row-speaking {
  display: inline-block;
  margin-left: 7px;
  font-size: 12px;
  color: var(--color-success);
}
.pinned-mark {
  font-size: 12px;
  color: var(--color-warning);
  margin-left: 5px;
}
.panel-footer {
  display: flex;
  justify-content: space-between;
  padding: 9px 20px;
  border-top: 1px solid var(--border-secondary);
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.refresh-notice {
  padding: 10px 20px;
  margin: 0;
  font-size: 13px;
  color: var(--color-warning);
  max-height: 70px;
  overflow: auto;
}
.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
}
.empty-state strong {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
}
.empty-state p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  text-align: center;
}
.recent-relay-switcher-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  z-index: 12000;
  display: grid;
  place-items: center;
  padding: 20px;
}
.recent-relay-switcher {
  width: min(390px, 100%);
  padding: 24px;
  border-radius: 12px;
  background: var(--bg-card);
}
.recent-relay-switcher h2 {
  font-size: 17px;
  margin: 0 0 20px;
}
.recent-relay-switcher > div {
  display: flex;
  gap: 12px;
}
.recent-relay-switcher button {
  font: inherit;
  font-size: 13px;
  padding: 9px 12px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
}
.recent-relay-switcher .relay-close {
  display: block;
  margin: 18px 0 0 auto;
  border: 0;
  color: var(--text-secondary);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
button:focus-visible,
[tabindex='0']:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
button {
  transition:
    background-color 0.16s,
    color 0.16s,
    transform 0.12s;
}
button:active:not(:disabled) {
  transform: translateY(1px);
}
@keyframes workspace-arrive {
  from {
    opacity: 0.7;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 1000px) {
  .live-workspace {
    padding: 16px;
    gap: 14px;
  }
  .current-contact {
    padding: 20px;
    gap: 18px;
  }
  .bearing-panel {
    width: 105px;
  }
  .live-table td,
  .live-table th {
    padding: 11px 13px;
  }
}
@media (max-width: 768px) {
  .live-workspace {
    padding: 12px;
    gap: 12px;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .current-contact {
    padding: 18px;
    gap: 12px;
    align-items: flex-start;
  }
  .callsign-line h1 {
    font-size: 34px;
    letter-spacing: -1px;
  }
  .callsign-line {
    gap: 7px;
    margin-top: 12px;
  }
  .grid-label {
    font-size: 12px;
  }
  .contact-location {
    font-size: 13px;
    gap: 5px 10px;
  }
  .contact-meta {
    font-size: 12px;
    gap: 8px 14px;
    margin-top: 13px;
  }
  .previous-line {
    font-size: 12px;
    gap: 6px 10px;
    margin-top: 15px;
    padding-top: 12px;
  }
  .previous-line time {
    margin-left: 0;
  }
  .bearing-panel {
    width: 72px;
    font-size: 12px;
    padding-top: 22px;
  }
  .compass {
    width: 62px;
    height: 62px;
  }
  .compass-arrow {
    width: 17px;
    height: 24px;
  }
  .bearing-panel > span {
    font-size: 12px;
  }
  .panel-heading {
    padding: 14px 15px;
  }
  .panel-heading > div {
    gap: 5px;
  }
  .panel-heading h2 {
    font-size: 16px;
    width: 100%;
  }
  .panel-heading span {
    font-size: 12px;
  }
  .panel-footer {
    padding: 8px 15px;
    font-size: 12px;
  }
  .comment-column,
  .mode-column,
  .relay-column,
  .desktop-label {
    display: none;
  }
  .mobile-label {
    display: inline;
  }
  .mobile-relay-link {
    display: block;
    margin-top: 5px;
    line-height: 1.5;
  }
  .time-cell {
    white-space: nowrap;
  }
  .live-table {
    font-size: 12px;
  }
  .live-table th:nth-child(1) {
    width: 25%;
  }
  .live-table th:nth-child(2) {
    width: 28%;
  }
  .live-table th:nth-child(3) {
    width: 47%;
  }
  .live-table td,
  .live-table th {
    padding: 10px 9px;
  }
  .live-table td small {
    font-size: 12px;
  }
  .row-speaking {
    display: block;
    margin: 3px 0 0;
    font-size: 12px;
  }
}
@media (max-height: 650px) {
  .live-workspace {
    grid-template-rows: minmax(160px, 1fr) minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
  }
  .current-contact {
    padding: 16px 20px;
  }
  .callsign-line h1 {
    font-size: 42px;
  }
  .contact-meta {
    margin-top: 10px;
  }
  .previous-line {
    margin-top: 12px;
    padding-top: 10px;
  }
  .bearing-panel {
    width: 94px;
  }
  .compass {
    width: 64px;
    height: 64px;
  }
}
@media (max-height: 520px) {
  .live-workspace {
    overflow-y: auto;
    overscroll-behavior: contain;
    grid-template-rows: auto minmax(240px, auto);
  }
  .current-contact {
    max-height: none;
    min-height: 220px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .live-workspace {
    animation: none;
  }
  button,
  .compass-arrow {
    transition: none;
  }
}
</style>
