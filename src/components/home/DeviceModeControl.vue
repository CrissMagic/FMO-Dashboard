<template>
  <div
    class="device-mode-control"
    :class="{ compact }"
    :aria-busy="state.busy"
    aria-label="盒子模式控制"
  >
    <div v-if="!compact" class="mode-summary">
      <span>设备模式</span>
      <strong>{{ state.mode === 0 ? '标准模式' : state.mode === 1 ? '待机模式' : '未知' }}</strong>
      <button :disabled="!hasDevice || state.busy" type="button" @click="refresh(true)">
        {{ state.busy && state.requestedMode === null ? '读取中…' : '刷新模式' }}
      </button>
    </div>
    <div class="mode-actions" role="group" aria-label="切换当前盒子的模式">
      <button
        v-for="mode in [0, 1]"
        :key="mode"
        type="button"
        :aria-label="mode === 0 ? '标准模式' : '待机模式'"
        :aria-pressed="state.mode === mode"
        :disabled="!hasDevice || state.busy || state.mode === mode"
        @click="store.setMode(target, mode)"
      >
        {{ mode === 0 ? (compact ? '标准' : '标准模式') : compact ? '待机' : '待机模式' }}
      </button>
      <button
        v-if="compact && (state.error || state.mode === null)"
        type="button"
        :disabled="!hasDevice || state.busy"
        aria-label="刷新设备模式"
        @click="refresh(true)"
      >
        ↻
      </button>
    </div>
    <p v-if="state.error" class="mode-error" role="alert">{{ state.error }}</p>
    <p v-else-if="state.requestedMode !== null" role="status">正在切换，等待盒子确认…</p>
    <p v-else-if="!hasDevice && !compact">请先连接 FMO 盒子</p>
  </div>
</template>

<script setup>
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, watch } from 'vue'
import { useDeviceControlStore } from '../../stores/deviceControlStore'
import { isValidHostAddress, normalizeHost } from '../../utils/urlUtils'

const props = defineProps({
  compact: { type: Boolean, default: false },
  host: { type: String, default: '' },
  protocol: { type: String, default: 'ws' }
})
const store = useDeviceControlStore()
const target = computed(() => ({
  host: normalizeHost(props.host),
  protocol: props.protocol === 'wss' ? 'wss' : 'ws'
}))
const hasDevice = computed(() => isValidHostAddress(target.value.host))
const state = computed(() => store.stateFor(target.value))
let active = true
function refresh(force = false) {
  if (active && hasDevice.value && !document.hidden) store.refresh(target.value, force)
}
function refreshVisible() {
  refresh(true)
}
watch(target, () => refresh(), { immediate: true })
onActivated(() => {
  active = true
  refresh(true)
})
onDeactivated(() => {
  active = false
})
let timer
onMounted(() => {
  timer = setInterval(() => refresh(true), 15000)
  window.addEventListener('focus', refreshVisible)
  document.addEventListener('visibilitychange', refreshVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', refreshVisible)
  document.removeEventListener('visibilitychange', refreshVisible)
})
</script>

<style scoped>
.device-mode-control {
  min-width: 0;
  border-top: 1px solid var(--border-secondary);
  padding: 10px 0;
}
.mode-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.mode-summary strong {
  color: var(--text-primary);
}
.mode-summary button {
  margin-left: auto;
  padding: 3px 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
}
.mode-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}
button {
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mode-actions button {
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  padding: 6px 12px;
  background: var(--bg-card);
  color: var(--text-secondary);
}
.mode-actions button[aria-pressed='true'] {
  border-color: var(--color-primary);
  background: var(--surface-accent);
  color: var(--color-primary);
}
button:disabled {
  cursor: default;
}
button:disabled:not([aria-pressed='true']) {
  opacity: 0.5;
}
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.mode-error {
  color: var(--color-danger);
}
.compact {
  position: relative;
  border: 0;
  padding: 0;
  flex-shrink: 0;
}
.compact .mode-actions {
  margin: 0;
  gap: 2px;
  padding: 3px;
  background: var(--bg-table-header);
  border: 1px solid var(--border-secondary);
  border-radius: 7px;
  flex-wrap: nowrap;
}
.compact .mode-actions button {
  border: 0;
  padding: 4px 11px;
  background: transparent;
  font-size: 13px;
  border-radius: 4px;
}
.compact .mode-actions button[aria-pressed='true'] {
  color: var(--color-primary);
  background: var(--bg-card);
  box-shadow: 0 1px 4px var(--shadow-card);
}
.compact p {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 400;
  width: 250px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-secondary);
  border-radius: 7px;
  background: var(--bg-card);
  box-shadow: 0 8px 24px var(--shadow-card);
}
</style>
