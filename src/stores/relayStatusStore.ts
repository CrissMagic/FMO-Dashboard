import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlatform } from '../platform'
import type { RelayReport } from '../core/relayStatus'

export const useRelayStatusStore = defineStore('relayStatus', () => {
  const report = ref<RelayReport | null>(null)
  const loading = ref(false)
  const error = ref('')
  let selection = ''
  let sequence = 0

  async function refresh(target: string, uid: string) {
    const key = `${target}|${uid}`
    if (key === selection && loading.value) return
    if (key !== selection) {
      selection = key
      report.value = null
      error.value = ''
    }
    const requested = ++sequence
    loading.value = !!target && !!uid
    if (!target || !uid) return
    try {
      const result = await getPlatform().relayStatus.getReport(uid)
      if (requested !== sequence) return
      report.value = result
      error.value = ''
    } catch {
      if (requested === sequence) error.value = '公开广播查询失败，请稍后刷新'
    } finally {
      if (requested === sequence) loading.value = false
    }
  }

  return { report, loading, error, refresh }
})
