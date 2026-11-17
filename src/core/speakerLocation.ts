import { eventCoordinates, stationIdentity } from './stationIdentity'
import { gridCenter } from './mapGeometry'
import type { MapPoint } from './mapGeometry'
import { normalizeGrid, validateGrid } from './gridValidator'

export interface SpeakerPosition {
  point: MapPoint | null
  grid: string
  source: 'coordinates' | 'grid' | 'aprs' | 'self' | 'unknown'
  sourceLabel: string
  receivedAt: number | null
}

/** Event evidence belongs to this transmission; APRS is explicitly last-known evidence. */
export function speakerPosition(
  record: any,
  aprs: any = null,
  selfPosition: MapPoint | null = null
): SpeakerPosition {
  const coordinates = eventCoordinates(record)
  const rawGrid = normalizeGrid(record?.eventGrid || record?.grid || record?.toGrid)
  const grid = validateGrid(rawGrid).valid ? rawGrid : ''
  if (coordinates) {
    return {
      point: { lat: coordinates.latitude, lng: coordinates.longitude },
      grid,
      source: 'coordinates',
      sourceLabel: '本次上报坐标',
      receivedAt: null
    }
  }
  if (grid) {
    return { point: gridCenter(grid), grid, source: 'grid', sourceLabel: '网格估算', receivedAt: null }
  }
  if (record?.isSelf && selfPosition) {
    return { point: selfPosition, grid: '', source: 'self', sourceLabel: '本机坐标', receivedAt: null }
  }
  const latest = eventCoordinates(aprs)
  if (
    latest &&
    Number.isFinite(aprs.receivedAt) &&
    aprs.receivedAt > 0 &&
    stationIdentity(record?.callsign || record?.toCallsign || '').mode !== 'AI'
  ) {
    return {
      point: { lat: latest.latitude, lng: latest.longitude },
      grid: '',
      source: 'aprs',
      sourceLabel: 'APRS 最近位置',
      receivedAt: aprs.receivedAt
    }
  }
  return { point: null, grid: '', source: 'unknown', sourceLabel: '位置未提供', receivedAt: null }
}
