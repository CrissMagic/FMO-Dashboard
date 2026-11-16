import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { getPlatform } from '../platform'
import {
  evidenceBounds,
  evidencePosition,
  groupGrids,
  type ContactEvidence
} from '../core/footprints'
import {
  locateRegion,
  type MapPoint,
  type RegionCollection,
  type RegionFeature
} from '../core/mapGeometry'
import { eventCoordinates } from '../core/stationIdentity'
// @ts-ignore legacy persistence and protocol facades
import { getDataFromIndexedDB } from '../services/db'
// @ts-ignore
import { FmoApiClient } from '../services/fmoApi'
// @ts-ignore
import { normalizeHost } from '../utils/urlUtils'

export interface AreaFootprint {
  id: string
  name: string
  feature: RegionFeature
  records: ContactEvidence[]
}
export const useMapStore = defineStore('contactMap', () => {
  const records = shallowRef<ContactEvidence[]>([])
  const provinces = shallowRef<RegionCollection>({ type: 'FeatureCollection', features: [] })
  const cities = shallowRef<Record<string, RegionCollection>>({})
  const loading = ref(false),
    boundariesLoading = ref(false),
    citiesLoading = ref(false)
  const error = ref(''),
    boundaryError = ref(''),
    cityError = ref('')
  const owner = ref('')
  const connection = shallowRef<any>(null),
    connectionLoading = ref(false),
    connectionError = ref('')
  const selfPosition = ref<MapPoint | null>(null)
  const connectionUpdatedAt = ref(0)
  let loadSequence = 0,
    connectionSequence = 0,
    boundaryTask: Promise<void> | null = null
  let cityTask: Promise<void> | null = null
  const clients = new Set<any>()

  const provinceGroups = computed(() => assign(provinces.value.features, records.value))
  const cityFeatures = computed(() =>
    Object.values(cities.value).flatMap((collection) => collection.features)
  )
  const cityGroups = computed(() => assign(cityFeatures.value, records.value))
  const grids = computed(() => groupGrids(records.value, 6))
  const unknownCount = computed(
    () => records.value.filter((record) => !evidencePosition(record)).length
  )
  const pendingRegionCount = computed(() => {
    if (!provinces.value.features.length) return records.value.length
    const assigned = new Set(
      provinceGroups.value.flatMap((group) => group.records.map((record) => record.id))
    )
    return records.value.filter((record) => !assigned.has(record.id)).length
  })

  function assign(features: RegionFeature[], source: ContactEvidence[]): AreaFootprint[] {
    const groups = new Map<number, AreaFootprint>(),
      locations = new Map<string, RegionFeature | null>()
    if (!features.length) return []
    for (const record of source) {
      const position = evidencePosition(record)
      if (!position) continue
      const key = record.point ? `${record.point.lat},${record.point.lng}` : record.grid
      if (!locations.has(key))
        locations.set(key, locateRegion(features, position, evidenceBounds(record)))
      const feature = locations.get(key)
      if (!feature) continue
      const code = feature.properties.adcode
      if (!groups.has(code))
        groups.set(code, {
          id: `area:${code}`,
          name: feature.properties.name,
          feature,
          records: []
        })
      groups.get(code).records.push(record)
    }
    return [...groups.values()]
  }
  async function loadOwner(callsign: string) {
    const sequence = ++loadSequence
    owner.value = String(callsign || '')
      .trim()
      .toUpperCase()
    records.value = []
    error.value = ''
    if (!owner.value) {
      loading.value = false
      return
    }
    loading.value = true
    const requested = owner.value
    try {
      const legacy = await getDataFromIndexedDB(requested)
      await getPlatform().map.remember(legacy)
      const saved = await getPlatform().map.readEvidence(requested)
      if (sequence !== loadSequence) return
      records.value = saved.sort((a, b) => b.timestamp - a.timestamp)
    } catch (err: any) {
      if (sequence === loadSequence) error.value = err?.message || '通联足迹读取失败，请重试'
    } finally {
      if (sequence === loadSequence) loading.value = false
    }
  }
  async function refreshEvidence() {
    const requested = owner.value,
      sequence = loadSequence
    if (!requested) return
    try {
      const saved = await getPlatform().map.readEvidence(requested)
      if (sequence === loadSequence) records.value = saved.sort((a, b) => b.timestamp - a.timestamp)
    } catch (err: any) {
      error.value = err?.message || '通联足迹读取失败'
    }
  }
  function loadBoundaries() {
    if (boundaryTask) return boundaryTask
    boundariesLoading.value = true
    boundaryError.value = ''
    boundaryTask = (async () => {
      try {
        provinces.value = await getPlatform().map.loadRegions()
      } catch (err: any) {
        boundaryError.value = err?.message || '行政区边界加载失败，请重试'
      } finally {
        boundariesLoading.value = false
        boundaryTask = null
      }
    })()
    return boundaryTask
  }
  async function loadCities(code: string) {
    if (cities.value[code]) return
    // Direct-controlled municipalities are one city, not a collection of district achievements.
    const province = provinces.value.features.find((f) => String(f.properties.adcode) === code)
    const direct = ['110000', '120000', '310000', '500000', '710000', '810000', '820000'].includes(
      code
    )
    const data = direct ? null : await getPlatform().map.loadRegions(code)
    cities.value = {
      ...cities.value,
      [code]: direct ? { type: 'FeatureCollection', features: province ? [province] : [] } : data
    }
  }
  async function loadContactCities() {
    if (cityTask) return cityTask
    citiesLoading.value = true
    cityError.value = ''
    cityTask = (async () => {
      const queue = provinceGroups.value
        .map((group) => String(group.feature.properties.adcode))
        .filter((code) => !cities.value[code])
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (queue.length) {
            const code = queue.shift()
            try {
              await loadCities(code)
            } catch {
              cityError.value = '部分城市边界尚未加载，城市统计待补全'
            }
          }
        })
      )
    })()
    try {
      await cityTask
    } finally {
      citiesLoading.value = false
      cityTask = null
    }
  }
  async function refreshConnection(host: string, protocol = 'ws') {
    const sequence = ++connectionSequence
    for (const client of clients) client.close()
    clients.clear()
    connectionError.value = ''
    connectionLoading.value = false
    if (!host) {
      connection.value = null
      selfPosition.value = null
      return
    }
    connectionLoading.value = true
    const client = new FmoApiClient(`${protocol}://${normalizeHost(host)}`)
    clients.add(client)
    try {
      const results = await Promise.allSettled([
        client.getUserInfo(),
        client.getCurrentStation(),
        client.getCoordinate()
      ])
      if (sequence !== connectionSequence) return
      const [user, station, coordinate] = results.map((result) =>
        result.status === 'fulfilled' ? result.value : null
      )
      const position = eventCoordinates(coordinate)
      selfPosition.value = position ? { lat: position.latitude, lng: position.longitude } : null
      connection.value = { user, station, host: normalizeHost(host), protocol }
      connectionUpdatedAt.value = Date.now()
      const unavailable = results.filter((result) => result.status === 'rejected').length
      if (unavailable)
        connectionError.value =
          unavailable === 3 ? '连接信息读取失败，请检查设备地址后重试' : '部分台站信息暂时不可用'
    } finally {
      client.close()
      clients.delete(client)
      if (sequence === connectionSequence) connectionLoading.value = false
    }
  }
  function resetConnection() {
    connectionSequence++
    clients.forEach((client) => client.close())
    clients.clear()
    connection.value = null
    selfPosition.value = null
    connectionLoading.value = false
    connectionUpdatedAt.value = 0
  }
  return {
    records,
    owner,
    loading,
    error,
    provinces,
    cities,
    provinceGroups,
    cityGroups,
    cityFeatures,
    grids,
    unknownCount,
    pendingRegionCount,
    boundariesLoading,
    citiesLoading,
    boundaryError,
    cityError,
    connection,
    connectionLoading,
    connectionError,
    connectionUpdatedAt,
    selfPosition,
    loadOwner,
    refreshEvidence,
    loadBoundaries,
    loadCities,
    loadContactCities,
    refreshConnection,
    resetConnection
  }
})
