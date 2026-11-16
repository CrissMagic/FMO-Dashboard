import { validateGrid } from './gridValidator'
import { gridBounds, gridCenter, type MapPoint } from './mapGeometry'
import { coordinatesToMaidenhead } from './maidenhead'

export interface ContactEvidence {
  id: string
  qsoKey: string
  fromCallsign: string
  callsign: string
  timestamp: number
  grid: string
  point: MapPoint | null
  source: 'grid' | 'coordinates' | 'unknown'
  relayName: string
  mode: string
}
export function qsoKey(from: string, to: string, timestamp: number) {
  return `${from.trim().toUpperCase()}|${to.trim().toUpperCase()}|${timestamp}`
}
export function contactEvidence(record: any): ContactEvidence | null {
  const from = String(record?.fromCallsign || '')
    .trim()
    .toUpperCase()
  const to = String(record?.toCallsign || '')
    .trim()
    .toUpperCase()
  const timestamp = Number(record?.timestamp)
  if (!from || !to || from === to || !Number.isFinite(timestamp) || timestamp <= 0) return null
  const valid = validateGrid(typeof record.toGrid === 'string' ? record.toGrid : '')
  let grid = valid.valid ? valid.grid : ''
  // Do not use generic latitude/longitude: those may refer to the local station.
  const lat = record.toLatitude,
    lng = record.toLongitude
  const point =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
      ? { lat, lng }
      : null
  const key = qsoKey(from, to, timestamp)
  if (!grid && point) grid = coordinatesToMaidenhead(point.lat, point.lng, 8)
  return {
    id: key,
    qsoKey: key,
    fromCallsign: from,
    callsign: to,
    timestamp,
    grid,
    point,
    source: point ? 'coordinates' : grid ? 'grid' : 'unknown',
    relayName: String(record.relayName || ''),
    mode: String(record.mode || 'FMO')
  }
}
/** Re-reading a legacy log must not discard a more precise saved location. */
export function mergeContactEvidence(
  old: ContactEvidence | undefined,
  item: ContactEvidence
): ContactEvidence {
  if (!old || old.id !== item.id || item.point) return item
  if (old.point) return { ...item, point: old.point, grid: old.grid, source: 'coordinates' }
  if (old.grid && old.grid.length > item.grid.length)
    return { ...item, grid: old.grid, source: 'grid' }
  return item
}

export function evidencePosition(e: ContactEvidence) {
  return e.point || gridCenter(e.grid)
}
export function evidenceBounds(e: ContactEvidence) {
  return e.point ? null : gridBounds(e.grid)
}
export interface GridFootprint {
  id: string
  grid: string
  precision: number
  coarse: boolean
  records: ContactEvidence[]
}
export function groupGrids(records: ContactEvidence[], precision = 6): GridFootprint[] {
  const groups = new Map<string, GridFootprint>()
  for (const record of records) {
    if (!record.grid) continue
    const grid = record.grid.slice(0, precision)
    if (!groups.has(grid))
      groups.set(grid, {
        id: `grid:${grid}`,
        grid,
        precision: grid.length,
        coarse: grid.length < precision,
        records: []
      })
    groups.get(grid).records.push(record)
  }
  return [...groups.values()]
}
export function inContactPeriod(record: ContactEvidence, period: string, now = Date.now()) {
  if (period === 'all') return true
  const date = new Date(record.timestamp * 1000),
    current = new Date(now)
  return (
    date.getFullYear() === current.getFullYear() &&
    (period !== 'month' || date.getMonth() === current.getMonth())
  )
}
export function firstContact(records: ContactEvidence[]) {
  return records.reduce(
    (first, r) => (!first || r.timestamp < first.timestamp ? r : first),
    null as ContactEvidence | null
  )
}
