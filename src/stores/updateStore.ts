import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getPlatform } from '../platform'
import type { AppUpdate } from '../platform/interfaces/IUpdateService'

export const useUpdateStore = defineStore('updates', () => {
  const phase = ref('idle')
  const available = ref<AppUpdate | null>(null)
  const error = ref('')
  const received = ref(0),
    total = ref(0)
  const supported = computed(() => getPlatform().updates.supported)
  const busy = computed(() => ['checking', 'downloading', 'installing'].includes(phase.value))
  async function check() {
    if (busy.value) return
    phase.value = 'checking'
    error.value = ''
    available.value = null
    try {
      available.value = await getPlatform().updates.check()
      phase.value = available.value ? 'available' : 'current'
    } catch {
      phase.value = 'error'
      error.value = '未能检查更新。请检查网络，或前往发布页查看；尚未发布更新清单时也会出现此提示。'
    }
  }
  async function install() {
    if (busy.value || !available.value) return
    phase.value = 'downloading'
    error.value = ''
    received.value = 0
    total.value = 0
    try {
      await getPlatform().updates.install((progress) => {
        if (progress.event === 'started') {
          total.value = progress.total || 0
          received.value = 0
        } else if (progress.event === 'progress') received.value += progress.chunk || 0
        else phase.value = 'installing'
      })
      phase.value = 'installing'
    } catch {
      phase.value = 'error'
      error.value = '下载或安装失败，应用未完成更新。请重试或从发布页下载安装包。'
    }
  }
  return { phase, available, error, received, total, supported, busy, check, install }
})
