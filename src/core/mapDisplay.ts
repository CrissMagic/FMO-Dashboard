import { coordinatesToMaidenhead } from './maidenhead'
import { gridBounds, gridCenter, toMapPoint } from './mapGeometry'
import type { MapPoint } from './mapGeometry'

export type MapBackground = 'detailed' | 'simple' | 'none'
export type MapGridMode = 'none' | 'coordinates' | 'maidenhead'
export type PositionFormat = 'coordinates' | 'maidenhead'
export type GridPrecision = 'auto' | 4 | 6 | 8
export interface MapDisplayPreferences {
  background: MapBackground
  grid: MapGridMode
  format: PositionFormat
  precision: GridPrecision
}
export const DEFAULT_MAP_DISPLAY: MapDisplayPreferences = {
  background: 'detailed',
  grid: 'none',
  format: 'maidenhead',
  precision: 'auto'
}

export function normalizeMapDisplay(value: any): MapDisplayPreferences {
  const source = value && typeof value === 'object' ? value : {}
  return {
    background: ['detailed', 'simple', 'none'].includes(source.background)
      ? source.background
      : 'detailed',
    grid: ['none', 'coordinates', 'maidenhead'].includes(source.grid) ? source.grid : 'none',
    format: source.format === 'coordinates' ? 'coordinates' : 'maidenhead',
    precision: [4, 6, 8].includes(source.precision) ? source.precision : 'auto'
  }
}

/** Inverse is used only for reading the GCJ-02 drawing viewport; evidence stays WGS84. */
export function fromMapPoint(point: MapPoint): MapPoint {
  const raw = { ...point }
  for (let i = 0; i < 6; i++) {
    const mapped = toMapPoint(raw)
    raw.lat += point.lat - mapped.lat
    raw.lng += point.lng - mapped.lng
  }
  return raw
}

export function formatMapPosition(
  position: any,
  format: PositionFormat,
  precision: GridPrecision = 'auto'
): string {
  const point = position?.point
  if (
    !point ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180
  )
    return ''
  if (format === 'maidenhead') {
    // A grid-only packet never gains precision by changing the display preference.
    return position.source === 'grid' && gridBounds(position.grid)
      ? position.grid.toUpperCase()
      : coordinatesToMaidenhead(point.lat, point.lng, precision === 'auto' ? 6 : precision)
  }
  const label = `${Math.abs(point.lat).toFixed(4)}°${point.lat < 0 ? 'S' : 'N'}  ${Math.abs(point.lng).toFixed(4)}°${point.lng < 0 ? 'W' : 'E'}`
  return position.source === 'grid' ? `网格中心约 ${label}` : label
}

export interface ViewportBounds {
  south: number
  north: number
  west: number
  east: number
}
export interface MapGridLine {
  id: string
  points: MapPoint[]
}
export interface MapGridLabel {
  id: string
  point: MapPoint
  text: string
}
export interface ViewportGrid {
  lines: MapGridLine[]
  labels: MapGridLabel[]
  precision: number
  reduced: boolean
}
const STEPS: Record<number, [number, number]> = {
  2: [20, 10],
  4: [2, 1],
  6: [1 / 12, 1 / 24],
  8: [1 / 120, 1 / 240]
}
const MAX_CELLS = 160
const MAX_LABELS = 64

function splitLongitude(west: number, east: number) {
  const span = Math.min(360, Math.max(0, east < west ? east + 360 - west : east - west))
  const start = ((((west + 180) % 360) + 360) % 360) - 180
  const end = start + span
  return end <= 180
    ? [[start, end]]
    : [
        [start, 180],
        [-180, end - 360]
      ]
}
function samples(start: MapPoint, end: MapPoint): MapPoint[] {
  return Array.from({ length: 17 }, (_, i) => ({
    lat: start.lat + ((end.lat - start.lat) * i) / 16,
    lng: start.lng + ((end.lng - start.lng) * i) / 16
  }))
}

/** Bounded viewport geometry; never enumerate fine cells for an entire country/world. */
export function buildViewportGrid(
  bounds: ViewportBounds,
  mode: MapGridMode,
  requested: GridPrecision,
  zoom: number
): ViewportGrid {
  const result: ViewportGrid = { lines: [], labels: [], precision: 0, reduced: false }
  if (mode === 'none' || !Object.values(bounds).every(Number.isFinite)) return result
  const south = Math.max(-85, Math.min(85, bounds.south))
  const north = Math.max(south, Math.min(85, bounds.north))
  const spans = splitLongitude(bounds.west, bounds.east)
  const width = spans.reduce((total, [a, b]) => total + b - a, 0)
  const height = north - south
  if (!width || !height) return result
  let lonStep: number, latStep: number
  if (mode === 'maidenhead') {
    const desired =
      requested === 'auto' ? (zoom < 6 ? 2 : zoom < 10 ? 4 : zoom < 14 ? 6 : 8) : requested
    let length = desired
    while (
      length > 2 &&
      (Math.ceil(width / STEPS[length][0]) + 1) * (Math.ceil(height / STEPS[length][1]) + 1) >
        MAX_CELLS
    )
      length -= 2
    result.precision = length
    result.reduced = requested !== 'auto' && length < requested
    ;[lonStep, latStep] = STEPS[length]
  } else {
    const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60]
    lonStep = steps.find((step) => width / step <= 10) || 60
    latStep = steps.find((step) => height / step <= 8) || 60
  }
  let labelIndex = 0
  const stride = Math.max(
    1,
    Math.ceil(((Math.ceil(width / lonStep) + 2) * (Math.ceil(height / latStep) + 2)) / MAX_LABELS)
  )
  for (const [west, east] of spans) {
    const lonStart = Math.floor((west + 180) / lonStep)
    const lonEnd = Math.ceil((east + 180) / lonStep)
    const latStart = Math.floor((south + 90) / latStep)
    const latEnd = Math.ceil((north + 90) / latStep)
    for (let x = lonStart; x <= lonEnd; x++) {
      const lng = x * lonStep - 180
      if (lng < west - 1e-8 || lng > east + 1e-8) continue
      const id = `lon:${lng.toFixed(8)}`
      result.lines.push({ id, points: samples({ lat: south, lng }, { lat: north, lng }) })
      if (mode === 'coordinates')
        result.labels.push({
          id,
          point: { lat: south + height * 0.1, lng },
          text: `${Math.abs(lng).toFixed(lonStep < 1 ? 3 : 0)}°${lng < 0 ? 'W' : 'E'}`
        })
    }
    for (let y = latStart; y <= latEnd; y++) {
      const lat = y * latStep - 90
      if (lat < south - 1e-8 || lat > north + 1e-8) continue
      const id = `lat:${lat.toFixed(8)}:${west}`
      result.lines.push({ id, points: samples({ lat, lng: west }, { lat, lng: east }) })
      if (mode === 'coordinates')
        result.labels.push({
          id,
          point: { lat, lng: west + (east - west) * 0.08 },
          text: `${Math.abs(lat).toFixed(latStep < 1 ? 3 : 0)}°${lat < 0 ? 'S' : 'N'}`
        })
    }
    if (mode !== 'maidenhead') continue
    for (let x = lonStart; x < lonEnd; x++) {
      for (let y = latStart; y < latEnd; y++) {
        const lng = (x + 0.5) * lonStep - 180,
          lat = (y + 0.5) * latStep - 90
        if (lng < west || lng > east || lat < south || lat > north || labelIndex++ % stride)
          continue
        const text =
          result.precision === 2
            ? String.fromCharCode(
                65 + Math.floor((lng + 180) / 20),
                65 + Math.floor((lat + 90) / 10)
              )
            : coordinatesToMaidenhead(lat, lng, result.precision)
        const point = result.precision === 2 ? { lat, lng } : gridCenter(text)
        if (point) result.labels.push({ id: text, point, text })
      }
    }
  }
  result.labels = result.labels.slice(0, MAX_LABELS)
  return result
}
