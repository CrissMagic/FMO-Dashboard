import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { FmoApiClient } from '../services/fmoApi'
import { useSpeakingStatusStore } from './speakingStore'
import { normalizeHost } from '../utils/urlUtils'

type Relay = { uid: string | number; name?: string; [key: string]: any }
type Target = { host: string; protocol?: string }
type Action = { type: 'select' | 'name' | 'prev' | 'next'; uid?: string | number; name?: string }
interface SwitchState {
  busy: boolean
  phase: 'idle' | 'switching' | 'confirming' | 'success' | 'error'
  targetName: string
  message: string
  confirmed: Relay | null
}

export const useRelaySwitchStore = defineStore('relaySwitch', () => {
  const states = reactive<Record<string, SwitchState>>({})
  function stateFor(target: Target): SwitchState {
    const key = `${target.protocol || 'ws'}://${normalizeHost(target.host).toLowerCase()}`
    return (states[key] ||= {
      busy: false,
      phase: 'idle',
      targetName: '',
      message: '',
      confirmed: null
    })
  }

  async function run(
    target: Target,
    action: Action,
    createClient = (url: string) => new FmoApiClient(url)
  ) {
    if (!target.host) throw new Error('请先连接 FMO 盒子')
    const state = stateFor(target)
    if (state.busy) return null
    state.busy = true
    state.phase = 'switching'
    state.targetName =
      action.name ||
      (action.type === 'prev'
        ? '上一中继'
        : action.type === 'next'
          ? '下一中继'
          : String(action.uid || ''))
    state.message = '正在切换中继…'
    state.confirmed = null
    let client: FmoApiClient | null = null
    try {
      client = createClient(`${target.protocol || 'ws'}://${normalizeHost(target.host)}`)
      let station: Relay | null = null
      let uid = action.uid
      if (action.type === 'name') {
        const list = await client.getAllStations()
        station = list.find(
          (item: Relay) =>
            String(item.name || '')
              .trim()
              .toLowerCase() === action.name?.trim().toLowerCase()
        )
        if (!station) throw new Error(`未在中继列表中找到「${action.name}」`)
        uid = station.uid
      }
      const selecting = action.type === 'select' || action.type === 'name'
      if (selecting && (uid == null || String(uid).trim() === '')) throw new Error('中继编号无效')
      const read = () =>
        client!.sendRequest('station', 'getCurrent', {}, { timeoutMs: 3000, retries: 0 })
      const before = selecting ? null : await read()
      if (!selecting && before?.uid == null) throw new Error('无法读取当前中继，请刷新后再试')
      // Never retry a write: a timeout may mean the box has already applied it.
      const result = await client.sendRequest(
        'station',
        selecting ? 'setCurrent' : action.type,
        selecting ? { uid } : {},
        { timeoutMs: 5000, retries: 0 }
      )
      if (result?.result !== 0) throw new Error('盒子拒绝切换，或当前固件不支持此操作')
      state.phase = 'confirming'
      state.message = '正在确认盒子当前中继…'
      let current: Relay | null = null
      for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 500))
        current = await read()
        if (
          current?.uid != null &&
          (selecting
            ? String(current.uid) === String(uid)
            : String(current.uid) !== String(before.uid))
        ) {
          useSpeakingStatusStore().updateServerInfoForTarget(target, current)
          state.confirmed = current
          state.phase = 'success'
          state.message = `已切换到：${current.name || current.uid}`
          return { current, station: station || current }
        }
      }
      throw new Error(
        `未确认切换成功，盒子仍返回：${current?.name || current?.uid || '未知中继'}；请检查后重试`
      )
    } catch (error) {
      state.phase = 'error'
      state.message = /timeout|WebSocket|connection|FMO API/i.test(String(error))
        ? '未能确认切换结果，请检查盒子连接并核实当前中继后再操作'
        : error instanceof Error
          ? error.message
          : String(error)
      throw new Error(state.message)
    } finally {
      try {
        client?.close()
      } finally {
        state.busy = false
      }
    }
  }
  return { states, stateFor, run }
})
