<template>
  <header class="header station-header">
    <button
      class="brand-home"
      type="button"
      aria-label="返回仪表盘"
      @click="router.push('/dashboard')"
    >
      <img src="/app-icon-384.png" alt="" /><strong>FMO <span>仪表盘</span></strong>
    </button>
    <div class="station-identity">
      <strong>{{ ownCallsign || selectedFromCallsign || user.callsign || '我的台站' }}</strong
      ><span :class="{ connected: stationConnected }" :title="`实时讲话通道：${connectionLabel}`"
        ><i />{{ connectionLabel }}</span
      >
    </div>
    <div class="relay-controls" aria-label="当前中继控制" :aria-busy="relayBusy">
      <button
        class="relay-step"
        type="button"
        aria-label="上一中继"
        :disabled="!stationConnected || relayBusy"
        @click="emit('station-prev')"
      >
        <ChevronLeft :size="18" aria-hidden="true" />
      </button>
      <button
        class="relay-name"
        :class="{
          'is-switching': relayBusy,
          'has-switch-feedback': relaySwitchLabel !== '当前中继'
        }"
        type="button"
        :disabled="!fmoAddress || relayBusy"
        :title="
          relayBusy || relaySwitchState.phase === 'error'
            ? relaySwitchState.message
            : station?.name || '选择中继'
        "
        aria-haspopup="dialog"
        :aria-expanded="stationListOpen"
        @click="emit('open-station-list')"
      >
        <small
          :class="{ 'relay-switch-error': relaySwitchState.phase === 'error' }"
          role="status"
          >{{ relaySwitchLabel }}</small
        ><strong>{{
          relayBusy
            ? relaySwitchState.targetName || station?.name || '请稍候'
            : station?.name || (fmoAddress ? '选择中继' : '连接设备')
        }}</strong
        ><LoaderCircle
          v-if="relayBusy"
          class="relay-switch-spinner"
          :size="18"
          aria-hidden="true"
        /><ChevronDown v-else :size="18" aria-hidden="true" />
      </button>
      <button
        class="relay-step"
        type="button"
        aria-label="下一中继"
        :disabled="!stationConnected || relayBusy"
        @click="emit('station-next')"
      >
        <ChevronRight :size="18" aria-hidden="true" />
      </button>
    </div>
    <button
      v-if="fmoAddress && station?.uid"
      class="relay-summary"
      :class="{ 'is-stale': relayStale || relayStatus.error }"
      type="button"
      :aria-label="`${populationLabel}，${reportAge}，查看当前中继广播详情`"
      :aria-expanded="showDevice"
      :title="
        relayReport ? new Date(relayReport.reportedAt).toLocaleString('zh-CN') : '查看中继公开广播'
      "
      @click="openDevice"
    >
      <span>{{ populationLabel }}</span>
      <small>{{
        relayStatus.error
          ? relayReport
            ? '查询失败 · 查看上次记录'
            : '查询失败 · 点击重试'
          : reportAge
      }}</small>
    </button>
    <DeviceModeControl class="header-mode" compact :host="fmoAddress" :protocol="protocol" />
    <div class="header-tools">
      <button class="info-trigger" type="button" :aria-expanded="showDevice" @click="openDevice">
        设备信息
      </button>
      <div ref="toolsRoot" class="tools-root" @keydown.esc.stop="toolsOpen = false">
        <button
          class="tool-trigger"
          type="button"
          aria-label="界面与播报"
          :aria-expanded="toolsOpen"
          @click="toolsOpen = !toolsOpen"
        >
          ···
        </button>
        <Transition name="tools"
          ><section v-if="toolsOpen" class="tools-popover" aria-label="界面与播报">
            <h2>界面与播报</h2>
            <label
              >播报模式<select
                :value="voiceMode"
                aria-label="播报模式"
                @change="emit('update-voice-mode', $event.target.value)"
              >
                <option value="alert">新呼号提醒</option>
                <option value="radio">通联播报</option>
                <option value="off">关闭播报</option>
              </select></label
            >
            <button type="button" @click="toggleTheme">
              {{ isDarkTheme ? '切换浅色外观' : '切换深色外观' }}
            </button>
            <button type="button" @click="toggleLocale">
              {{ isEnglish ? '语言：简体中文' : '语言：English' }}
            </button>
            <button type="button" @click="openUpdates">检查软件更新</button>
            <div class="public-tools"><PublicSiteTools /></div>
            <p>
              本地日志：今日 {{ todayLogs }} · 累计 {{ totalLogs }} · 友台 {{ uniqueCallsigns }}
            </p>
          </section></Transition
        >
      </div>
    </div>
    <SideSheet :open="showDevice" title="设备信息" @close="showDevice = false">
      <div class="device-heading">
        <div>
          <span>{{ activeAddress?.name || 'FMO 盒子' }}</span>
          <h3>{{ user.callsign || ownCallsign || '尚未获取呼号' }}</h3>
        </div>
        <span :class="['connection-label', { connected: stationConnected }]">{{
          `实时事件：${connectionLabel}`
        }}</span>
      </div>
      <p v-if="!fmoAddress" class="device-message">先在设备设置中添加并选择 FMO 地址。</p>
      <p v-if="mapStore.connectionError && connection" class="device-message" role="status">
        {{ mapStore.connectionError }}
      </p>
      <section class="device-section relay-section" aria-label="当前中继公开广播">
        <h3>中继公开广播</h3>
        <p class="relay-identity">
          {{ station?.name || '尚未获取中继'
          }}<small v-if="station?.uid"> #{{ station.uid }}</small>
        </p>
        <p v-if="relayReport" class="relay-report-time" :class="{ 'is-stale': relayStale }">
          <strong>{{ relayStale ? '数据已过期' : '管理员广播快照' }}</strong> · {{ reportAge }}
          <time :datetime="new Date(relayReport.reportedAt).toISOString()">{{
            new Date(relayReport.reportedAt).toLocaleString('zh-CN')
          }}</time>
        </p>
        <p v-if="relayStatus.loading" class="device-note" role="status">正在读取公开广播…</p>
        <p v-if="relayStatus.error" class="device-message" role="status">{{ relayStatus.error }}</p>
        <template v-if="relayReport">
          <dl>
            <div class="population-value">
              <dt>{{ relayStale || relayStatus.error ? '上次广播在线' : '广播在线人数' }}</dt>
              <dd>{{ relayReport.online ?? '未提供' }}</dd>
            </div>
            <div class="population-value">
              <dt>历史峰值人数</dt>
              <dd>{{ relayReport.peak ?? '未提供' }}</dd>
            </div>
            <div>
              <dt>管理员</dt>
              <dd>{{ relayReport.admin || '未提供' }}</dd>
            </div>
            <div>
              <dt>{{ relayStale ? '上次广播状态' : '广播状态' }}</dt>
              <dd>{{ relayReport.status || '未提供' }}</dd>
            </div>
          </dl>
          <details class="relay-diagnostics">
            <summary>服务器详情</summary>
            <dl>
              <div>
                <dt>覆盖半径</dt>
                <dd>{{ relayReport.rangeKm == null ? '未提供' : `${relayReport.rangeKm} km` }}</dd>
              </div>
              <div class="full">
                <dt>服务器地址</dt>
                <dd>
                  {{ relayReport.host || '未提供'
                  }}{{ relayReport.port == null ? '' : `:${relayReport.port}` }}
                </dd>
              </div>
              <div class="full">
                <dt>服务器说明</dt>
                <dd>{{ relayReport.description || '未提供' }}</dd>
              </div>
            </dl>
          </details>
        </template>
        <p v-else-if="!relayStatus.loading && !relayStatus.error" class="device-note">
          {{ station?.uid ? '未提供：暂无此中继的公开广播。' : '获取当前中继后可查询公开广播。' }}
        </p>
        <p class="device-note">
          来源：<a href="https://map.fmo.net.cn/" target="_blank" rel="noopener noreferrer"
            >FMO APRS 地图</a
          >
          · 广播通常每 10 分钟更新，超过 20 分钟标记过期。
        </p>
      </section>
      <details class="device-section connection-details">
        <summary>设备与连接</summary>
        <dl>
          <div>
            <dt>设备 UID</dt>
            <dd>{{ user.uid ?? '未提供' }}</dd>
          </div>
          <div>
            <dt>本机呼号</dt>
            <dd>{{ user.callsign || ownCallsign || '未提供' }}</dd>
          </div>
          <div class="full">
            <dt>连接地址</dt>
            <dd>{{ fmoAddress ? `${protocol}://${fmoAddress}` : '未配置' }}</dd>
          </div>
          <div class="full">
            <dt>设备网络地址</dt>
            <dd>{{ user.wlanIP || '未提供' }}</dd>
          </div>
        </dl>
      </details>
      <section class="device-section">
        <h3>频率与位置</h3>
        <dl>
          <div>
            <dt>发射频率</dt>
            <dd>{{ txFrequency || '未提供' }}</dd>
          </div>
          <div>
            <dt>接收频率</dt>
            <dd>{{ rxFrequency || '未提供' }}</dd>
          </div>
          <div>
            <dt>通联模式</dt>
            <dd>{{ station?.mode || 'FMO' }}</dd>
          </div>
          <div>
            <dt>本机网格</dt>
            <dd>{{ selfGrid || '未获取' }}</dd>
          </div>
          <div class="full">
            <dt>设备位置</dt>
            <dd>
              {{ position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : '未提供' }}
            </dd>
          </div>
        </dl>
      </section>
      <details v-if="user.certFingerprint || user.issuerSn" class="device-section">
        <summary>设备标识</summary>
        <dl>
          <div v-if="user.certFingerprint" class="full">
            <dt>证书指纹</dt>
            <dd>{{ user.certFingerprint }}</dd>
          </div>
          <div v-if="user.issuerSn" class="full">
            <dt>签发标识</dt>
            <dd>{{ user.issuerSn }}</dd>
          </div>
        </dl>
      </details>
      <div class="device-actions">
        <button
          type="button"
          :disabled="!fmoAddress || mapStore.connectionLoading"
          @click="refreshMetadata"
        >
          {{ mapStore.connectionLoading ? '读取中…' : '刷新设备信息' }}</button
        ><button
          type="button"
          :disabled="!fmoAddress || connectionStatus === 'connecting'"
          @click="emit('reconnect-events')"
        >
          重连实时事件</button
        ><button type="button" @click="openSettings">设备设置</button>
      </div>
      <small class="device-note">频率和位置以设备实际提供的信息为准。</small>
    </SideSheet>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLocale } from '../../composables/useLocale'
import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle } from '@lucide/vue'
import { useRelaySwitchStore } from '../../stores/relaySwitchStore'
import { useRelayStatusStore } from '../../stores/relayStatusStore'
import { isRelayReportStale, relayReportAgeText } from '../../core/relayStatus'
import { useMapStore } from '../../stores/mapStore'
import { normalizeHost } from '../../utils/urlUtils'
import { frequencyText } from '../../core/stationDetails'
import { coordinatesToMaidenhead } from '../../core/maidenhead'
import DeviceModeControl from './DeviceModeControl.vue'
import PublicSiteTools from './PublicSiteTools.vue'
import SideSheet from '../common/SideSheet.vue'

const props = defineProps({
  todayLogs: { type: Number, default: 0 },
  totalLogs: { type: Number, default: 0 },
  uniqueCallsigns: { type: Number, default: 0 },
  ownCallsign: { type: String, default: '' },
  selectedFromCallsign: { type: String, default: '' },
  voiceMode: { type: String, default: 'off' },
  fmoAddress: { type: String, default: '' },
  protocol: { type: String, default: 'ws' },
  activeAddressId: { type: String, default: '' },
  addressList: { type: Array, default: () => [] },
  currentStation: { type: Object, default: null },
  stationConnected: Boolean,
  connectionStatus: { type: String, default: '' },
  stationBusy: Boolean,
  stationListOpen: Boolean
})
const emit = defineEmits([
  'update-voice-mode',
  'open-station-list',
  'station-prev',
  'station-next',
  'reconnect-events'
])
const router = useRouter()
function openUpdates() {
  toolsOpen.value = false
  router.push('/updates')
}
const mapStore = useMapStore()
const relayStatus = useRelayStatusStore()
const relaySwitch = useRelaySwitchStore()
const relaySwitchState = computed(() =>
  relaySwitch.stateFor({ host: props.fmoAddress, protocol: props.protocol })
)
const relayBusy = computed(() => props.stationBusy || relaySwitchState.value.busy)
const relaySwitchLabel = computed(() => {
  if (relayBusy.value) return relaySwitchState.value.phase === 'confirming' ? '确认中…' : '切换中…'
  if (relaySwitchState.value.phase === 'error') return '切换未确认'
  if (
    relaySwitchState.value.phase === 'success' &&
    String(relaySwitchState.value.confirmed?.uid) === String(station.value?.uid)
  )
    return '已切换'
  return '当前中继'
})
const relayNow = ref(Date.now())
let relayTimer
const connectionLabel = computed(
  () =>
    ({
      connected: '已连接',
      connecting: '连接中',
      reconnecting: '重连中',
      disconnected: '未连接'
    })[props.connectionStatus || (props.stationConnected ? 'connected' : 'disconnected')] ||
    '未连接'
)
const { isEnglish, toggleLocale } = useLocale()
const showDevice = ref(false),
  toolsOpen = ref(false),
  toolsRoot = ref(null)
const activeAddress = computed(() =>
  props.addressList.find((address) => address.id === props.activeAddressId)
)
const connection = computed(() =>
  mapStore.connection?.host === normalizeHost(props.fmoAddress) &&
  mapStore.connection?.protocol === props.protocol
    ? mapStore.connection
    : null
)
const user = computed(() => connection.value?.user || activeAddress.value?.userInfo || {})
const station = computed(() => props.currentStation || connection.value?.station)
const relayReport = computed(() =>
  relayStatus.report?.uid === String(station.value?.uid ?? '') ? relayStatus.report : null
)
const relayStale = computed(
  () => relayReport.value && isRelayReportStale(relayReport.value, relayNow.value)
)
const reportAge = computed(() =>
  relayReport.value
    ? relayReportAgeText(relayReport.value, relayNow.value)
    : relayStatus.loading
      ? '读取中…'
      : '暂无可用广播'
)
const populationLabel = computed(() => {
  if (!relayReport.value && relayStatus.loading) return '广播快照'
  if (relayReport.value?.online == null) return '广播人数未提供'
  return `${relayStale.value || relayStatus.error ? '上次广播' : '广播在线'} ${relayReport.value.online}${relayStale.value ? ' · 已过期' : ''}`
})
function refreshRelay() {
  relayNow.value = Date.now()
  return relayStatus.refresh(
    props.fmoAddress ? `${props.protocol}://${normalizeHost(props.fmoAddress)}` : '',
    String(station.value?.uid ?? '')
  )
}
watch(() => [props.fmoAddress, props.protocol, station.value?.uid], refreshRelay, {
  immediate: true
})
function relayVisibility() {
  if (document.visibilityState !== 'hidden') refreshRelay()
}
const position = computed(() => (connection.value ? mapStore.selfPosition : null))
const selfGrid = computed(() =>
  position.value ? coordinatesToMaidenhead(position.value.lat, position.value.lng, 6) : ''
)
const txFrequency = computed(() => frequencyText(station.value, 'tx'))
const rxFrequency = computed(() => frequencyText(station.value, 'rx'))
const isDarkTheme = ref(
  localStorage.getItem('fmo_theme') === 'dark' ||
    (!localStorage.getItem('fmo_theme') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
)
function applyTheme() {
  document.documentElement.dataset.theme = isDarkTheme.value ? 'dark' : 'light'
  localStorage.setItem('fmo_theme', isDarkTheme.value ? 'dark' : 'light')
}
function toggleTheme() {
  isDarkTheme.value = !isDarkTheme.value
  applyTheme()
}
function refreshMetadata() {
  refreshRelay()
  if (props.fmoAddress && !mapStore.connectionLoading)
    mapStore.refreshConnection(props.fmoAddress, props.protocol)
}
function openDevice() {
  toolsOpen.value = false
  showDevice.value = true
  refreshMetadata()
}
function openSettings() {
  showDevice.value = false
  router.push('/settings')
}
function outside(event) {
  if (!toolsRoot.value?.contains(event.target)) toolsOpen.value = false
}
onMounted(() => {
  applyTheme()
  relayTimer = setInterval(() => {
    relayNow.value = Date.now()
    if (document.visibilityState !== 'hidden') refreshRelay()
  }, 60000)
  document.addEventListener('visibilitychange', relayVisibility)
  document.addEventListener('pointerdown', outside)
})
onBeforeUnmount(() => {
  clearInterval(relayTimer)
  document.removeEventListener('visibilitychange', relayVisibility)
  document.removeEventListener('pointerdown', outside)
})
</script>

<style scoped>
.station-header {
  z-index: 300;
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
  flex-shrink: 0;
  min-height: 64px;
  padding: 10px 22px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-secondary);
  color: var(--text-primary);
}
button {
  font: inherit;
  cursor: pointer;
}
button:disabled {
  cursor: default;
  opacity: 0.5;
}
button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.brand-home {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  flex-shrink: 0;
}
.brand-home img {
  width: 34px;
  height: 34px;
  border-radius: 8px;
}
.brand-home strong {
  font-size: 17px;
  font-weight: 650;
  white-space: nowrap;
}
.station-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 80px;
}
.station-identity strong {
  font-size: 14px;
}
.station-identity > span {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-tertiary);
}
i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.connected {
  color: var(--color-success) !important;
}
.relay-controls {
  display: flex;
  align-items: stretch;
  min-width: 0;
  max-width: 360px;
  flex: 1;
  margin-left: auto;
}
.relay-controls button {
  border: 0;
  background: transparent;
  color: var(--text-primary);
}
.relay-step {
  width: 44px;
  flex-shrink: 0;
  font-size: 25px;
  padding: 0;
  height: 44px;
  line-height: 1;
  color: var(--text-secondary);
}
.relay-name {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
  text-align: left;
  padding: 6px;
}
.relay-name small {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.relay-name strong {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-weight: 550;
}
.relay-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.relay-name > svg {
  flex-shrink: 0;
  color: var(--text-secondary);
}
.relay-name.has-switch-feedback small {
  display: inline;
  color: var(--text-secondary);
}
.relay-name.is-switching:disabled {
  opacity: 1;
  cursor: wait;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--bg-card));
  border-radius: 6px;
}
.relay-name.is-switching > svg {
  color: var(--color-primary);
}
.relay-name small.relay-switch-error {
  color: color-mix(in srgb, var(--color-danger) 45%, var(--text-primary));
}
.relay-switch-spinner {
  animation: relay-switch-spin 1s linear infinite;
}
@keyframes relay-switch-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .relay-switch-spinner {
    animation: none;
  }
}
.relay-name > span {
  color: var(--text-tertiary);
}
.relay-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 4px 6px;
  min-height: 44px;
  flex-shrink: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
}
.relay-summary small {
  font-size: 12px;
  color: var(--text-secondary);
}
.relay-summary:hover {
  background: var(--bg-table-hover);
}
.is-stale,
.relay-report-time.is-stale {
  color: var(--color-warning);
}
.relay-identity {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.relay-identity small {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 400;
}
.relay-report-time {
  margin: 0 0 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.relay-report-time strong {
  font-weight: 500;
}
.relay-report-time time {
  display: block;
}
.population-value dd {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
}
.relay-diagnostics {
  margin-top: 18px;
}
.device-section summary {
  cursor: pointer;
  min-height: 32px;
}
.device-section summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.connection-details:not([open]) {
  margin-top: 18px;
  padding-top: 14px;
}
.connection-details:not([open]) summary {
  min-height: 24px;
  margin-bottom: 0;
}
.header-tools {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}
.info-trigger,
.tool-trigger {
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  height: 34px;
  padding: 0 11px;
  font-size: 13px;
}
.tool-trigger {
  font-weight: 700;
  font-size: 20px;
  width: 34px;
  padding: 0;
  line-height: 1;
}
.tools-root {
  position: relative;
}
.tools-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 270px;
  max-height: calc(100dvh - 80px);
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--border-secondary);
  border-radius: 10px;
  box-shadow: 0 12px 36px var(--shadow-card);
  background: var(--bg-card);
}
.tools-popover h2 {
  margin: 0 0 14px;
  font-size: 15px;
}
.tools-popover label {
  display: grid;
  gap: 7px;
  font-size: 12px;
  color: var(--text-secondary);
}
.tools-popover select {
  width: 100%;
  height: 36px;
  border: 1px solid var(--border-primary);
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0 8px;
  font: inherit;
  font-size: 13px;
}
.tools-popover > button {
  display: block;
  width: 100%;
  padding: 11px 0;
  border: 0;
  border-bottom: 1px solid var(--border-secondary);
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  font-size: 13px;
}
.tools-popover p {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 0;
}
.public-tools {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.public-tools:empty {
  display: none;
}
.device-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.device-heading span {
  font-size: 13px;
  color: var(--text-secondary);
}
.device-heading h3 {
  font-size: 22px;
  margin: 5px 0 0;
}
.connection-label {
  white-space: nowrap;
}
.device-section {
  margin-top: 25px;
  padding-top: 18px;
  border-top: 1px solid var(--border-secondary);
}
.device-section h3,
.device-section summary {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 14px;
}
.device-section dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 17px 20px;
  margin: 0;
}
.device-section dl > div {
  min-width: 0;
}
.device-section .full {
  grid-column: 1/-1;
}
dt {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 5px;
}
dd {
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
dd small {
  color: var(--text-tertiary);
}
.device-actions {
  display: flex;
  gap: 10px;
  margin-top: 25px;
}
.device-actions button {
  font-size: 13px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 8px 12px;
}
.device-actions button:first-child {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.device-note {
  display: block;
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.device-message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-warning);
}
.tools-enter-active,
.tools-leave-active {
  transition:
    opacity 0.16s,
    transform 0.16s;
}
.tools-enter-from,
.tools-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
@media (max-width: 1050px) {
  .station-header {
    gap: 12px;
    padding-inline: 16px;
  }
  .brand-home strong span {
    display: none;
  }
  .relay-name small {
    display: none;
  }
}
@media (max-width: 1050px) {
  .station-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px 12px;
    padding: 9px 12px;
    min-height: 100px;
  }
  .brand-home {
    grid-row: 1;
    grid-column: 1;
  }
  .brand-home img {
    width: 29px;
    height: 29px;
  }
  .brand-home strong {
    font-size: 15px;
  }
  .station-identity {
    grid-row: 1;
    grid-column: 2;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .station-identity strong {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .station-identity > span {
    font-size: 12px;
    white-space: nowrap;
  }
  .header-tools {
    grid-row: 1;
    grid-column: 3;
    gap: 7px;
  }
  .info-trigger {
    font-size: 12px;
    height: 30px;
    padding: 0 8px;
  }
  .tool-trigger {
    height: 30px;
    width: 30px;
  }
  .relay-controls {
    grid-row: 2;
    grid-column: 1/3;
    max-width: none;
    min-width: 0;
    margin: 0;
  }
  .relay-step {
    width: 44px;
  }
  .relay-name {
    padding: 0 4px;
    gap: 5px;
  }
  .relay-name strong {
    font-size: 13px;
  }
  .relay-summary {
    grid-row: 3;
    grid-column: 1/-1;
  }
  .header-mode {
    grid-row: 2;
    grid-column: 3;
    justify-self: end;
  }
  .tools-popover {
    right: 0;
    width: 260px;
  }
  .brand-home strong span {
    display: none;
  }
}
@media (min-width: 769px) and (max-width: 1050px) {
  .station-header {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }
  .header-tools {
    grid-column: 4;
  }
  .relay-summary {
    grid-row: 1;
    grid-column: 3;
  }
  .relay-controls {
    grid-column: 1/4;
  }
  .header-mode {
    grid-column: 4;
  }
}
@media (max-width: 768px) {
  .relay-controls {
    grid-column: 1/-1;
  }
  .relay-name strong {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.4;
  }
  .relay-summary {
    grid-row: 3;
    grid-column: 1/3;
  }
  .header-mode {
    grid-row: 3;
    grid-column: 3;
  }
  .station-header {
    gap: 4px 8px;
    padding-block: 8px;
  }
  .device-actions {
    flex-wrap: wrap;
  }
}
@media (max-width: 365px) {
  .station-header {
    gap: 8px;
  }
  .brand-home strong {
    display: none;
  }
  .station-identity > span {
    font-size: 12px;
  }
  .info-trigger {
    padding: 0 6px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .tools-enter-active,
  .tools-leave-active {
    transition: none;
  }
}
</style>
