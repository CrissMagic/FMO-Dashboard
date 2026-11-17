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
      ref="liveStage"
      class="live-workspace"
      :class="{ 'logs-collapsed': !logsExpanded }"
      :style="{
        '--live-map-bottom': `${mapToolsBottom}px`,
        '--live-map-left': `${mapToolsLeft}px`,
        '--live-map-status-width': `${mapStatusWidth}px`
      }"
      role="tabpanel"
      aria-labelledby="dashboard-live-tab"
    >
      <LiveContactMap
        v-if="!showFootprints"
        :speaker="mapSpeaker"
        :inspected="inspectedContact"
        :self-position="fmoCoordinate"
        :self-callsign="ownCallsign || selectedFromCallsign"
        :padding="mapPadding"
        @resume-live="inspectedContact = null"
      />
      <section
        ref="contactPanel"
        class="current-contact"
        :class="{ 'is-idle': !activeContact }"
        aria-label="当前通联"
      >
        <div class="contact-copy">
          <div class="contact-eyebrow">
            <span
              :class="['live-indicator', { speaking: activeContact?.isSpeaking }, liveStatusKind]"
            />{{
              activeContact
                ? activeContact.isSpeaking
                  ? '正在讲话'
                  : stationConnected
                    ? '守听中 · 上次听到'
                    : '未连接 · 上次记录'
                : stationConnected
                  ? '守听中'
                  : '未连接'
            }}<time v-if="activeContact" class="contact-age">{{ speakerTimeText }}</time>
          </div>
          <div class="callsign-line">
            <h1>{{ activeContact?.callsign || '等待通联' }}</h1>
            <Badge v-if="activePositionLabel" variant="secondary" class="grid-label">{{
              activePositionLabel
            }}</Badge>
            <Badge v-if="activeContact?.isNewCallsign" variant="secondary" class="new-label"
              >新友台</Badge
            >
          </div>
          <div v-if="activeContact" class="contact-location">
            <strong>{{
              activeContact?.qth || (activeContact ? '友台暂未提供位置' : '保持连接，等待实时通联')
            }}</strong>
          </div>
          <div v-if="activeContact" class="location-evidence">
            <span>{{ speakerSourceText }}</span>
            <span v-if="activeContact.bearing"
              >{{ activeContact.bearing.direction }} {{ activeContact.bearing.bearing }}° ·
              {{ activeContact.bearing.distanceText }}</span
            >
            <span v-if="activeContact?.hasLoggedContact"
              >已通联{{
                activeContact.contactCount ? ` · ${activeContact.contactCount} 次` : ''
              }}</span
            >
          </div>
          <div v-if="fmoAddress" class="contact-meta">
            <span
              >频率 / 模式 <strong>{{ currentFrequencyLine }}</strong></span
            ><RecentRelaySwitcher
              v-model:open="showRecentRelaySwitcher"
              :busy="recentRelayBusy"
              :title="recentRelayCommandTitle"
              @previous="switchRecentRelay('prev')"
              @next="switchRecentRelay('next')"
            />
            <Button
              v-if="activeContact?.hasLoggedContact"
              variant="link"
              size="sm"
              type="button"
              @click="openCallsignRecords(activeContact)"
            >
              通联详情 →
            </Button>
            <Button
              v-if="activePositionLabel"
              variant="link"
              size="sm"
              aria-label="复制友台位置"
              @click="copyActivePosition"
              >复制位置</Button
            >
          </div>
          <Button
            v-else
            variant="outline"
            class="connect-device"
            type="button"
            @click="router.push('/settings')"
          >
            连接 FMO 设备 →
          </Button>
          <div v-if="!activeContact" class="previous-line">
            <span>上次通联</span
            ><template v-if="previousContact"
              ><strong>{{ previousContact.callsign }}</strong
              ><span>{{ previousContact.qth || previousContact.grid || '位置未提供' }}</span
              ><time>{{ formatTimeAgo(previousContact.timestamp) }}</time></template
            ><span v-else>暂无记录</span>
          </div>
        </div>
      </section>
      <div class="right-overlays">
        <aside ref="relayPanel" class="relay-inspector" aria-label="当前中继概况">
          <Button
            variant="ghost"
            class="relay-inspector-heading"
            type="button"
            :aria-expanded="relayExpanded"
            aria-controls="live-relay-details"
            @click="relayExpanded = !relayExpanded"
          >
            <span><SvgIcon name="remoteControl" :size="17" /> 当前中继</span
            ><span>{{ relayExpanded ? '收起 −' : '展开 ＋' }}</span>
          </Button>
          <div v-show="relayExpanded" id="live-relay-details" class="relay-inspector-body">
            <strong class="inspector-name">{{ relayStation?.name || '尚未选择中继' }}</strong>
            <p v-if="relayReport" :class="{ 'stale-report': relayStale || relayStatus.error }">
              {{ relayAgeText }}{{ relayStale ? ' · 已过期' : '' }}
            </p>
            <p v-else>
              {{
                relayStatus.loading ? '正在读取公开广播…' : relayStatus.error || '暂无可用公开广播'
              }}
            </p>
            <dl class="relay-counts">
              <div>
                <dt>{{ relayStale || relayStatus.error ? '上次广播在线' : '广播在线' }}</dt>
                <dd>{{ relayReport?.online ?? '—' }}</dd>
              </div>
              <div>
                <dt>历史峰值</dt>
                <dd>{{ relayReport?.peak ?? '—' }}</dd>
              </div>
            </dl>
            <dl v-if="relayReport" class="relay-facts">
              <div>
                <dt>管理员</dt>
                <dd>{{ relayReport.admin || '未提供' }}</dd>
              </div>
              <div v-if="relayReport.rangeKm != null">
                <dt>覆盖半径</dt>
                <dd>{{ relayReport.rangeKm }} km</dd>
              </div>
              <div v-if="relayReport.host">
                <dt>服务器</dt>
                <dd>
                  {{ relayReport.host }}{{ relayReport.port == null ? '' : `:${relayReport.port}` }}
                </dd>
              </div>
            </dl>
            <Button
              variant="link"
              size="sm"
              class="relay-list-button"
              type="button"
              :disabled="!fmoAddress || stationBusy"
              @click="emit('open-station-list')"
            >
              选择中继 →
            </Button>
          </div>
        </aside>
        <section ref="logsPanel" class="live-panel" aria-label="最近通联">
          <header class="panel-heading">
            <div>
              <h2>最近通联</h2>
              <span title="统计来自已同步的本地日志；下方列表包含盒子日志和实时发言。"
                >本地日志：今日 {{ todayLogs }} · 累计 {{ totalLogs }} · 友台
                {{ uniqueCallsigns }}</span
              >
            </div>
            <div class="panel-actions">
              <Button
                variant="outline"
                size="sm"
                type="button"
                :disabled="refreshing"
                @click="refreshNow"
              >
                {{ refreshing ? '刷新中…' : '刷新' }}</Button
              ><Button
                variant="outline"
                size="sm"
                type="button"
                :aria-expanded="logsExpanded"
                aria-controls="live-log-content"
                @click="logsExpanded = !logsExpanded"
              >
                {{ logsExpanded ? '收起 −' : '展开 ＋' }}
              </Button>
            </div>
          </header>
          <p v-if="logsExpanded && (error || refreshWarning)" class="refresh-notice" role="status">
            {{ error || refreshWarning }}
          </p>
          <div
            v-if="logsExpanded && displayRecords.length"
            id="live-log-content"
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
                  :class="{
                    'is-speaking': record.isSpeaking,
                    'is-map-selected': inspectedContact?.rowId === record.rowId
                  }"
                  tabindex="0"
                  :aria-selected="inspectedContact?.rowId === record.rowId"
                  :aria-label="`在地图查看 ${record.toCallsign || '此通联'} 的位置`"
                  title="点击在地图查看位置，实时守听继续"
                  @click="handleRecordMapClick($event, record)"
                  @keydown.enter.self.prevent="inspectRecord(record)"
                  @keydown.space.self.prevent="inspectRecord(record)"
                >
                  <td>
                    <span class="record-identity"
                      ><Button
                        v-if="record.toCallsign"
                        variant="link"
                        size="xs"
                        type="button"
                        class="callsign-link"
                        :aria-label="`在地图查看 ${record.toCallsign} 的位置`"
                        @click.stop="inspectRecord(record)"
                      >
                        {{ record.toCallsign }}</Button
                      ><strong v-else>{{ record.toCallsign || '—' }}</strong
                      ><Button
                        v-if="record.hasLoggedContact"
                        variant="link"
                        size="xs"
                        class="record-details"
                        :aria-label="`查看 ${record.toCallsign} 的通联详情`"
                        @click.stop="openCallsignRecords(record)"
                        >详情</Button
                      ></span
                    ><span v-if="record.isSpeaking" class="row-speaking">讲话中</span
                    ><small>{{ record.toGrid || (record.isSelf ? '本机' : '') }}</small>
                  </td>
                  <td class="time-cell">
                    {{ formatDatePart(record.timestamp)
                    }}<small>{{ formatClockPart(record.timestamp) }}</small>
                  </td>
                  <td class="position-cell">
                    {{ record.qth || '位置未提供'
                    }}<small v-if="locationLabel(record)"
                      >{{ locationLabel(record) }}
                      <a
                        v-if="aprsFiSource(record)"
                        href="https://aprs.fi/"
                        target="_blank"
                        rel="noopener noreferrer"
                        >aprs.fi</a
                      ></small
                    ><Button
                      v-if="record.relayName"
                      variant="link"
                      size="xs"
                      type="button"
                      class="relay-link mobile-relay-link"
                      :disabled="switchingRelay === record.relayName"
                      @click="switchRelay(record.relayName)"
                    >
                      {{ record.relayName }}</Button
                    ><small class="compact-record-detail"
                      >{{ stationIdentity(record.toCallsign).mode || record.mode || 'FMO'
                      }}<template v-if="record.toComment">
                        · {{ record.toComment }}</template
                      ></small
                    >
                  </td>
                  <td class="comment-column">{{ record.toComment || '—' }}</td>
                  <td class="mode-column">
                    {{ stationIdentity(record.toCallsign).mode || record.mode || '—' }}
                  </td>
                  <td class="relay-column">
                    <Button
                      v-if="record.relayName"
                      variant="link"
                      size="xs"
                      type="button"
                      class="relay-link"
                      :disabled="switchingRelay === record.relayName"
                      @click="switchRelay(record.relayName)"
                    >
                      {{ record.relayName }}</Button
                    ><span v-else>—</span
                    ><small v-if="record.relayAdmin">{{ record.relayAdmin }}</small
                    ><span v-if="record.isRelayPinned" class="pinned-mark" title="已收藏">★</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="logsExpanded" id="live-log-content" class="empty-state">
            <strong>{{ refreshing ? '正在读取通联' : '等待实时通联' }}</strong>
            <p>
              {{
                fmoAddress ? '新的通联会在这里实时出现。' : '先连接 FMO 盒子，开始查看实时通联。'
              }}
            </p>
            <Button
              v-if="!fmoAddress"
              variant="outline"
              type="button"
              @click="router.push('/settings')"
            >
              连接设备
            </Button>
          </div>
          <footer v-if="logsExpanded" class="panel-footer">
            <span>点击记录查看地图 · 最近 20 个友台</span><span>{{ lastRefreshText }}</span>
          </footer>
        </section>
      </div>
    </div>
    <p v-if="voiceStatus" class="sr-only" role="status">{{ voiceStatus }}</p>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
import LiveContactMap from '../components/map/LiveContactMap.vue'
import SvgIcon from '../components/common/SvgIcon.vue'
import { speakerPosition } from '../core/speakerLocation'
import { useRelayStatusStore } from '../stores/relayStatusStore'
import { isRelayReportStale, relayReportAgeText } from '../core/relayStatus'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import RecentRelaySwitcher from '../components/home/RecentRelaySwitcher.vue'
import { useMapDisplayStore } from '../stores/mapDisplayStore'
import { formatMapPosition } from '../core/mapDisplay'

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
const liveStage = ref(null)
const contactPanel = ref(null)
const relayPanel = ref(null)
const logsPanel = ref(null)
const inspectedContact = ref(null)
const logsExpanded = ref(true)
const relayExpanded = ref(true)
const mapPadding = ref({ top: 240, right: 380, bottom: 80, left: 40 })
const mapToolsBottom = ref(80)
const mapToolsLeft = ref(16)
const mapStatusWidth = ref(400)
let panelObserver = null
let dashboardGeneration = 0
let timer = null
let activeTimer = null
let audioContext = null
let removeVisibilityListener = null
let removeAppStateListener = null
let lastForegroundRefreshAt = 0
const REFRESH_INTERVAL_MS = 12000
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
const relayStatus = useRelayStatusStore()
const mapDisplay = useMapDisplayStore()
const relayStation = computed(() => speakingStatus.primaryServerInfo || currentStation.value)
const relayReport = computed(() =>
  relayStatus.report?.uid === String(relayStation.value?.uid ?? '') ? relayStatus.report : null
)
const relayStale = computed(
  () => relayReport.value && isRelayReportStale(relayReport.value, activeNow.value)
)
const relayAgeText = computed(() =>
  relayReport.value ? relayReportAgeText(relayReport.value, activeNow.value) : ''
)

function measureMapSpace() {
  const stage = liveStage.value?.getBoundingClientRect()
  if (!stage?.width || !stage?.height) return
  const mobile = stage.width <= 768
  const compactWide = stage.width >= 600 && window.innerHeight <= 520
  const contact = contactPanel.value?.getBoundingClientRect()
  const logs = logsPanel.value?.getBoundingClientRect()
  const relay = relayPanel.value?.getBoundingClientRect()
  const top = compactWide
    ? 32
    : Math.min((contact?.bottom || stage.top) - stage.top + 32, stage.height * 0.48)
  mapToolsBottom.value = compactWide ? 26 : mobile ? (logs?.height || 64) + 24 : 26
  mapToolsLeft.value = compactWide ? (contact?.width || 220) + 28 : mobile ? 12 : 16
  mapStatusWidth.value = compactWide
    ? Math.max(170, stage.width - mapToolsLeft.value - (logs?.width || 260) - 36)
    : 400
  mapPadding.value = {
    top,
    right: compactWide
      ? (logs?.width || 260) + 28
      : mobile
        ? 28
        : Math.min((relay?.width || 340) + 48, stage.width * 0.42),
    bottom: compactWide
      ? Math.max(32, Math.min(100, stage.height - top - 40))
      : mobile
        ? Math.max(32, Math.min(mapToolsBottom.value + 76, stage.height - top - 70))
        : 88,
    left: compactWide ? mapToolsLeft.value : mobile ? 28 : 40
  }
}

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
      .filter((item) => !item.endTime && item.callsign && props.stationConnected)
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0] || null
  )
})

const recentEndedSpeakingRecord = computed(() => {
  return (
    [...speakingHistory.value]
      .filter((item) => item.callsign && (item.endTime || !props.stationConnected))
      .sort((a, b) => (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0))[0] || null
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
  const position = speakerPosition(
    { ...current, isSelf },
    locationMetadata.value[getQthCacheKey(callsign, '')],
    fmoCoordinate.value
  )
  const bearing = getBearingForPoint(position.point, isSelf)

  return {
    callsign,
    timestamp: Math.floor(current.startTime / 1000),
    grid,
    eventGrid: grid,
    position,
    ...eventCoordinates(current),
    qth,
    relayName: current.serverName || matchedLog?.relayName || currentStation.value?.name || '',
    frequencySource: matchedLog || findStationByName(current.serverName) || currentStation.value,
    bearing,
    bearingHint: getBearingHint(grid, isSelf),
    isSpeaking: !current.endTime && props.stationConnected,
    lastHeardAt: current.endTime || current.startTime,
    isNewCallsign: Boolean(callsign && !isSelf && getContactCount(callsign) <= 0),
    contactCount: getContactCount(callsign),
    hasLoggedContact: hasLoggedContact(callsign, matchedLog)
  }
})

const mapSpeaker = computed(() => {
  const contact = activeContact.value
  return contact
    ? {
        ...contact.position,
        callsign: contact.callsign,
        active: contact.isSpeaking,
        self: isSelfCallsign(contact.callsign)
      }
    : null
})
const speakerSourceText = computed(() => {
  const position = activeContact.value?.position
  if (!position) return ''
  return position.receivedAt
    ? `${position.sourceLabel} · ${formatTimeAgo(position.receivedAt / 1000)}`
    : position.sourceLabel
})
const activePositionLabel = computed(() =>
  formatMapPosition(
    activeContact.value?.position,
    mapDisplay.preferences.format,
    mapDisplay.preferences.precision
  )
)
async function copyActivePosition() {
  try {
    await navigator.clipboard.writeText(
      [activePositionLabel.value, speakerSourceText.value].filter(Boolean).join(' · ')
    )
    toast.success('已复制友台位置')
  } catch {
    toast.error('复制失败，请检查剪贴板权限')
  }
}
const speakerTimeText = computed(() => {
  const contact = activeContact.value
  if (!contact) return ''
  if (!contact.isSpeaking) return formatTimeAgo(contact.lastHeardAt / 1000)
  const seconds = Math.max(0, Math.floor(activeNow.value / 1000 - contact.timestamp))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
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
        mapPosition: speakerPosition(
          { ...item, isSelf: isSelfCallsign(item.callsign) },
          locationMetadata.value[getQthCacheKey(item.callsign, '')],
          fmoCoordinate.value
        ),
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
      mapPosition: speakerPosition(
        { ...record, isSelf: isSelfCallsign(record.toCallsign) },
        locationMetadata.value[getQthCacheKey(record.toCallsign, '')],
        fmoCoordinate.value
      ),
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
  const seconds = Math.max(0, Math.floor(activeNow.value / 1000 - timestamp))
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
  return getBearingForPoint(gridToLatLng(grid), isSelf)
}

function getBearingForPoint(to, isSelf = false) {
  if (isSelf) {
    return {
      bearing: 0,
      direction: t('dashboard.selfPosition', '本机位置'),
      distanceKm: 0,
      distanceText: '0 m'
    }
  }

  const from = fmoCoordinate.value
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

function handleRecordMapClick(event, record) {
  if (event.target.closest('button, a, input, select')) return
  inspectRecord(record)
}
function inspectRecord(record) {
  const position = record.mapPosition
  if (!position?.point) {
    toast.warning(`${record.toCallsign || '此通联'} 未提供可定位的位置，地图保持当前位置`)
    return
  }
  inspectedContact.value = {
    ...position,
    point: { ...position.point },
    sourceLabel: position.source === 'self' ? '本机当前坐标' : position.sourceLabel,
    rowId: record.rowId,
    callsign: record.toCallsign,
    timeText: `${formatDatePart(record.timestamp)} ${formatClockPart(record.timestamp)}`,
    self: record.isSelf,
    active: false
  }
  // Give the map a continuous visible area while keeping the selection in view.
  if (window.innerWidth <= 768) {
    logsExpanded.value = false
    nextTick(() =>
      liveStage.value?.querySelector('[aria-label="返回实时跟随"]')?.focus({ preventScroll: true })
    )
  }
}
watch(showFootprints, () => {
  inspectedContact.value = null
})

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
  const generation = dashboardGeneration

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
    if (generation !== dashboardGeneration) return
    currentStation.value = station
    const point = eventCoordinates(coordinate)
    if (point) {
      fmoCoordinate.value = { lat: point.latitude, lng: point.longitude }
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
      if (generation !== dashboardGeneration) return
      if (index === 0) records.value = [...detailed]
    }

    records.value = detailed
    lastRefreshAt.value = new Date()
    consecutiveRefreshFailures.value = 0
    refreshWarning.value = ''
    error.value = ''
  } catch (err) {
    if (generation !== dashboardGeneration) return
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
    if (generation === dashboardGeneration) {
      loadingStation.value = false
      refreshing.value = false
    }
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
  () => [controlHost.value, controlProtocol.value, props.selectedFromCallsign],
  () => {
    dashboardGeneration++
    inspectedContact.value = null
    records.value = []
    currentStation.value = null
    fmoCoordinate.value = null
    allStations.value = []
    pinnedStations.value = []
    pinnedRelayNames.value = []
    lastRefreshAt.value = null
    refreshing.value = false
    error.value = ''
    refreshWarning.value = ''
    consecutiveRefreshFailures.value = 0
    refreshDashboard()
  }
)

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
  const generation = dashboardGeneration
  const host = props.fmoAddress
  const protocol = props.protocol
  const isCurrent = () =>
    generation === dashboardGeneration && host === props.fmoAddress && protocol === props.protocol
  switchingRelay.value = relayName
  try {
    const { current, station } = await switchStationByRelayName(relayName, host, protocol)
    if (!isCurrent()) return false
    updateCurrentStationSnapshot(current || station)
    refreshSpeakingSnapshot()
    toast.success(`已切换到：${current?.name || station.name}`)
    return true
  } catch (err) {
    if (isCurrent()) toast.error(err.message || '切换中继失败')
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
  if (window.matchMedia('(max-width: 768px)').matches) logsExpanded.value = false
  if (window.matchMedia('(min-width: 769px) and (max-height: 650px)').matches) {
    relayExpanded.value = false
  }
  if (typeof window.ResizeObserver !== 'undefined') {
    panelObserver = new window.ResizeObserver(measureMapSpace)
    for (const panel of [liveStage.value, contactPanel.value, relayPanel.value, logsPanel.value]) {
      if (panel) panelObserver.observe(panel)
    }
  }
  window.addEventListener('resize', measureMapSpace)
  nextTick(measureMapSpace)
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
  dashboardGeneration++
  panelObserver?.disconnect()
  window.removeEventListener('resize', measureMapSpace)
  if (timer) clearInterval(timer)
  if (activeTimer) clearInterval(activeTimer)
  if (removeVisibilityListener) removeVisibilityListener()
  if (removeAppStateListener) removeAppStateListener()
  window.speechSynthesis?.cancel()
})
</script>

<style scoped src="./dashboardLive.css"></style>
