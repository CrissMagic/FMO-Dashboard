import type { IMapService } from '../interfaces/IMapService'
import type { RegionCollection } from '../../core/mapGeometry'
import {
  contactEvidence,
  mergeContactEvidence,
  qsoKey,
  type ContactEvidence
} from '../../core/footprints'

/** WebView and Tauri already use IndexedDB for permanent QSO logs. Keep snapshots
 * in a separate database so the legacy daily/callsign dedup cannot erase places. */
export class WebMapService implements IMapService {
  private database: Promise<IDBDatabase> | null = null
  private listeners = new Set<() => void>()
  private regions = new Map<string, RegionCollection>()
  private pendingRegions = new Map<string, Promise<RegionCollection>>()

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('FmoContactFootprints', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        const evidence = db.createObjectStore('evidence', { keyPath: 'id' })
        evidence.createIndex('fromCallsign', 'fromCallsign')
        db.createObjectStore('regions')
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          this.database = null
        }
        resolve(db)
      }
      request.onerror = () => {
        this.database = null
        reject(request.error)
      }
      request.onblocked = () => {
        this.database = null
        reject(new Error('足迹数据库被其他窗口占用，请关闭旧窗口后重试'))
      }
    })
    return this.database
  }
  private async read(store: string, key: string, index?: string): Promise<any> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly'),
        object = tx.objectStore(store)
      const request = index ? object.index(index).getAll(key) : object.get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  async readEvidence(from: string): Promise<ContactEvidence[]> {
    return (await this.read('evidence', from.trim().toUpperCase(), 'fromCallsign')) || []
  }
  async hasEvidence(from: string, to: string, timestamp: number): Promise<boolean> {
    return Boolean(await this.read('evidence', qsoKey(from, to, timestamp)))
  }
  async remember(records: any[]): Promise<void> {
    const evidence = records.map(contactEvidence).filter(Boolean) as ContactEvidence[]
    if (!evidence.length) return
    const db = await this.open()
    let changed = false
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('evidence', 'readwrite'),
        store = tx.objectStore('evidence')
      for (const item of evidence) {
        const lookup = store.get(item.id)
        lookup.onsuccess = () => {
          const old = lookup.result
          const merged = mergeContactEvidence(old, item)
          if (JSON.stringify(old) === JSON.stringify(merged)) return
          store.put(merged)
          changed = true
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('通联位置证据保存失败'))
      tx.onabort = () => reject(tx.error || new Error('通联位置证据保存已中止'))
    })
    if (changed) this.listeners.forEach((listener) => listener())
  }
  async clearEvidence(): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('evidence', 'readwrite')
      tx.objectStore('evidence').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    this.listeners.forEach((listener) => listener())
  }
  onChange(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async loadRegions(adcode = '100000'): Promise<RegionCollection> {
    if (!/^\d{6}$/.test(adcode)) throw new Error('行政区编码无效')
    if (this.regions.has(adcode)) return this.regions.get(adcode)
    if (this.pendingRegions.has(adcode)) return this.pendingRegions.get(adcode)
    const task = this.fetchRegions(adcode)
    this.pendingRegions.set(adcode, task)
    try {
      return await task
    } finally {
      this.pendingRegions.delete(adcode)
    }
  }
  private async fetchRegions(adcode: string): Promise<RegionCollection> {
    // DataV.GeoAtlas exports are GCJ-02. All map overlays use the same drawing CRS.
    const cached = await this.read('regions', adcode).catch(() => null)
    if (cached?.features?.length) {
      this.regions.set(adcode, cached)
      return cached
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(
        `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`,
        { signal: controller.signal }
      )
      if (!response.ok) throw new Error(`行政区边界加载失败 (${response.status})`)
      const raw = await response.json()
      if (raw?.type !== 'FeatureCollection' || !Array.isArray(raw.features))
        throw new Error('行政区数据格式错误')
      const data: RegionCollection = {
        type: 'FeatureCollection',
        features: raw.features.filter(
          (f: any) =>
            f?.properties?.name &&
            Number(f.properties.adcode) > 0 &&
            ['Polygon', 'MultiPolygon'].includes(f.geometry?.type)
        )
      }
      if (!data.features.length) throw new Error('行政区边界为空')
      this.regions.set(adcode, data)
      await this.open()
        .then(
          (db) =>
            new Promise<void>((resolve, reject) => {
              const tx = db.transaction('regions', 'readwrite')
              tx.objectStore('regions').put(data, adcode)
              tx.oncomplete = () => resolve()
              tx.onerror = () => reject(tx.error)
              tx.onabort = () => reject(tx.error)
            })
        )
        .catch(() => {}) // A cache failure must not hide a successfully loaded map.
      return data
    } finally {
      clearTimeout(timeout)
    }
  }
}
