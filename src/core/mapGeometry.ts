import { validateGrid } from './gridValidator'

export interface MapPoint {
  lat: number
  lng: number
}
export interface GridBounds {
  south: number
  west: number
  north: number
  east: number
}
export interface RegionFeature {
  type: 'Feature'
  properties: {
    adcode: number
    name: string
    level?: string
    center?: number[]
    [key: string]: any
  }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any[] }
}
export interface RegionCollection {
  type: 'FeatureCollection'
  features: RegionFeature[]
}

export function gridBounds(value: string): GridBounds | null {
  const result = validateGrid(value)
  if (!result.valid) return null
  const grid = result.grid
  let west = -180,
    south = -90
  const widths = [20, 2, 1 / 12, 1 / 120]
  const heights = [10, 1, 1 / 24, 1 / 240]
  for (let i = 0; i < grid.length / 2; i++) {
    const alphabet = i === 0 || i === 2
    west += (alphabet ? grid.charCodeAt(i * 2) - 65 : Number(grid[i * 2])) * widths[i]
    south += (alphabet ? grid.charCodeAt(i * 2 + 1) - 65 : Number(grid[i * 2 + 1])) * heights[i]
  }
  const index = grid.length / 2 - 1
  return { west, south, east: west + widths[index], north: south + heights[index] }
}

export function gridCenter(grid: string): MapPoint | null {
  const b = gridBounds(grid)
  return b ? { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 } : null
}

// WGS84 is retained in evidence. Only the drawing / boundary lookup uses GCJ-02.
export function toMapPoint(point: MapPoint): MapPoint {
  const { lat, lng } = point
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { ...point }
  const x = lng - 105,
    y = lat - 35,
    pi = Math.PI
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  dLat += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3
  dLat += ((20 * Math.sin(y * pi) + 40 * Math.sin((y * pi) / 3)) * 2) / 3
  dLat += ((160 * Math.sin((y * pi) / 12) + 320 * Math.sin((y * pi) / 30)) * 2) / 3
  let dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  dLng += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3
  dLng += ((20 * Math.sin(x * pi) + 40 * Math.sin((x * pi) / 3)) * 2) / 3
  dLng += ((150 * Math.sin((x * pi) / 12) + 300 * Math.sin((x * pi) / 30)) * 2) / 3
  const rad = (lat * pi) / 180,
    sin = Math.sin(rad)
  const magic = 1 - 0.00669342162296594323 * sin * sin
  dLat =
    (dLat * 180) / (((6378245 * (1 - 0.00669342162296594323)) / (magic * Math.sqrt(magic))) * pi)
  dLng = (dLng * 180) / ((6378245 / Math.sqrt(magic)) * Math.cos(rad) * pi)
  return { lat: lat + dLat, lng: lng + dLng }
}

export function boundsRing(b: GridBounds, convert = true): number[][] {
  const corners = [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north]
  ]
  const points: number[][] = []
  for (let edge = 0; edge < 4; edge++) {
    const a = corners[edge],
      c = corners[(edge + 1) % 4]
    for (let i = 0; i < 8; i++) {
      const p = { lng: a[0] + ((c[0] - a[0]) * i) / 8, lat: a[1] + ((c[1] - a[1]) * i) / 8 }
      const mapped = convert ? toMapPoint(p) : p
      points.push([mapped.lng, mapped.lat])
    }
  }
  return [...points, points[0]]
}

function cross(a: number[], b: number[], p: number[]) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
}
function onSegment(a: number[], b: number[], p: number[]) {
  return (
    Math.abs(cross(a, b, p)) < 1e-10 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-10 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-10 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-10 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-10
  )
}
function intersects(a: number[], b: number[], c: number[], d: number[]) {
  return (
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b) ||
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
  )
}
function insideRing(point: number[], ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i]
    if (onSegment(a, b, point)) return false
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}
function polygons(feature: RegionFeature): number[][][][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates
}
export function containsPoint(feature: RegionFeature, point: MapPoint) {
  const p = [point.lng, point.lat]
  return polygons(feature).some(
    (poly) => insideRing(p, poly[0]) && !poly.slice(1).some((hole) => insideRing(p, hole))
  )
}

/** Conservative: a grid touching/crossing an outer edge, a concavity, or a hole is unassigned. */
export function containsGrid(feature: RegionFeature, bounds: GridBounds) {
  const ring = boundsRing(bounds)
  return polygons(feature).some((poly) => {
    if (
      !ring.every(
        (p) => insideRing(p, poly[0]) && !poly.slice(1).some((hole) => insideRing(p, hole))
      )
    )
      return false
    for (const boundary of poly) {
      if (boundary.some((p) => insideRing(p, ring))) return false
      for (let i = 1; i < boundary.length; i++) {
        for (let j = 1; j < ring.length; j++)
          if (intersects(boundary[i - 1], boundary[i], ring[j - 1], ring[j])) return false
      }
    }
    return true
  })
}

export function locateRegion(
  features: RegionFeature[],
  point: MapPoint | null,
  bounds?: GridBounds | null
) {
  if (!point && !bounds) return null
  const candidate = point || gridCenterFromBounds(bounds)
  const mapped = toMapPoint(candidate)
  const matches = features.filter(
    (f) => containsPoint(f, mapped) && (!bounds || containsGrid(f, bounds))
  )
  return matches.length === 1 ? matches[0] : null
}
function gridCenterFromBounds(b: GridBounds): MapPoint {
  return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 }
}
export function distanceKm(a: MapPoint, b: MapPoint) {
  const rad = Math.PI / 180,
    lat = (b.lat - a.lat) * rad,
    lng = (b.lng - a.lng) * rad
  const h =
    Math.sin(lat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
