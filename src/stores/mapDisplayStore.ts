import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_MAP_DISPLAY, normalizeMapDisplay } from '../core/mapDisplay'
import type { MapDisplayPreferences } from '../core/mapDisplay'
import { getPlatform } from '../platform'
import type { RegionCollection } from '../core/mapGeometry'

const STORAGE_KEY = 'fmo_map_display_v1'

export const useMapDisplayStore = defineStore('mapDisplay', () => {
  const preferences = ref({ ...DEFAULT_MAP_DISPLAY })
  const ready = ref(false)
  const persistenceError = ref('')
  const regions = ref<RegionCollection | null>(null)
  const regionsLoading = ref(false)
  const regionsError = ref('')
  let initialization: Promise<void> | null = null
  let saveQueue = Promise.resolve()
  let edits = 0

  function init() {
    if (initialization) return initialization
    const before = edits
    initialization = (async () => {
      try {
        const saved = await getPlatform().storage.get(STORAGE_KEY)
        if (edits === before)
          preferences.value = normalizeMapDisplay(saved ? JSON.parse(saved) : null)
      } catch {
        // Corrupt preferences are reset without discarding any contact/location evidence.
      } finally {
        ready.value = true
      }
    })()
    return initialization
  }

  function update(patch: Partial<MapDisplayPreferences>) {
    preferences.value = normalizeMapDisplay({ ...preferences.value, ...patch })
    const version = ++edits
    const snapshot = JSON.stringify(preferences.value)
    persistenceError.value = ''
    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        const storage = getPlatform().storage
        await storage.set(STORAGE_KEY, snapshot)
        if ((await storage.get(STORAGE_KEY)) !== snapshot)
          throw new Error('storage verification failed')
      })
      .catch(() => {
        if (version === edits) persistenceError.value = '设置已生效，但未能保存；请重试。'
      })
    return saveQueue
  }

  async function loadSimpleRegions() {
    if (regions.value || regionsLoading.value) return
    regionsLoading.value = true
    regionsError.value = ''
    try {
      regions.value = await getPlatform().map.loadRegions()
    } catch {
      regionsError.value = '简洁底图加载失败，位置与网格仍保留。'
    } finally {
      regionsLoading.value = false
    }
  }

  return {
    preferences,
    ready,
    persistenceError,
    regions,
    regionsLoading,
    regionsError,
    init,
    update,
    loadSimpleRegions
  }
})
