import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getPlatform } from '../platform'
import { normalizeHost } from '../utils/urlUtils'
import type { DeviceScreenMode } from '../core/deviceMode'
import type { FmoDeviceTarget } from '../platform/interfaces/IDeviceControlService'

interface ModeState {
  mode: DeviceScreenMode | null
  busy: boolean
  requestedMode: DeviceScreenMode | null
  error: string
  updatedAt: number
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/timeout|WebSocket|connection|^FMO API/i.test(message))
    return '盒子未响应或不支持此操作，请检查连接和固件后刷新'
  return message
}

export const useDeviceControlStore = defineStore('deviceControl', () => {
  const states = reactive<Record<string, ModeState>>({})

  function stateFor(target: FmoDeviceTarget): ModeState {
    const key = `${target.protocol}://${normalizeHost(target.host)}`
    if (!states[key])
      states[key] = {
        mode: null,
        busy: false,
        requestedMode: null,
        error: '',
        updatedAt: 0
      }
    return states[key]
  }

  async function refresh(target: FmoDeviceTarget, force = false): Promise<void> {
    if (!target.host) return
    const state = stateFor(target)
    if (state.busy || (!force && Date.now() - state.updatedAt < 15000)) return
    state.busy = true
    state.error = ''
    try {
      state.mode = await getPlatform().deviceControl.getScreenMode(target)
      state.updatedAt = Date.now()
    } catch (err) {
      state.mode = null
      state.updatedAt = 0
      state.error = `模式读取失败：${errorText(err)}`
    } finally {
      state.busy = false
    }
  }

  async function setMode(target: FmoDeviceTarget, mode: DeviceScreenMode): Promise<void> {
    const state = stateFor(target)
    if (!target.host || state.busy || state.mode === mode) return
    state.busy = true
    state.requestedMode = mode
    state.error = ''
    try {
      state.mode = await getPlatform().deviceControl.setScreenMode(target, mode)
      state.updatedAt = Date.now()
    } catch (err) {
      // A failed acknowledgement cannot prove whether the device applied the write.
      state.mode = null
      state.updatedAt = 0
      state.error = `切换未确认：${errorText(err)}`
    } finally {
      state.busy = false
      state.requestedMode = null
    }
  }

  return { states, stateFor, refresh, setMode }
})
