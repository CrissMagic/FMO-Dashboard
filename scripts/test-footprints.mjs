import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

// Exercise the same pure TypeScript modules as the app without a second test framework.
const modules = new Map()
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path)
  let source = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText
  for (const match of [...source.matchAll(/from\s+['"]([.][^'"]+)['"]/g)]) {
    const url = await moduleUrl(resolve(dirname(path), `${match[1]}.ts`))
    source = source.replace(match[0], `from '${url}'`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(path, url)
  return url
}
const load = async (name) => import(await moduleUrl(resolve(`src/core/${name}.ts`)))
const geometry = await load('mapGeometry')
const footprint = await load('footprints')
const { coordinatesToMaidenhead } = await load('maidenhead')
const { frequencyText } = await load('stationDetails')
const { speakerPosition } = await load('speakerLocation')
const mapDisplay = await load('mapDisplay')
let checks = 0
function check(name, callback) {
  callback()
  checks++
  console.log(`PASS ${name}`)
}

check('Live map keeps transmission evidence separate from last-known APRS positions', () => {
  const aprs = { latitude: 39.9, longitude: 116.4, receivedAt: Date.now() - 3600000 }
  const exact = speakerPosition(
    { callsign: 'N1DEMO', latitude: 29.5, longitude: 106.5, grid: 'OL29' },
    aprs
  )
  assert.equal(exact.source, 'coordinates')
  assert.deepEqual(exact.point, { lat: 29.5, lng: 106.5 })
  assert.equal(speakerPosition({ callsign: 'N1DEMO', grid: 'OL29' }, aprs).source, 'grid')
  const previous = speakerPosition({ callsign: 'N1DEMO' }, aprs)
  assert.equal(previous.source, 'aprs')
  assert.equal(previous.receivedAt, aprs.receivedAt)
  assert.equal(speakerPosition({ callsign: 'AI-DEMO' }, aprs).point, null)
  assert.equal(speakerPosition({ callsign: 'N2DEMO' }).point, null)
  assert.equal(speakerPosition({ callsign: 'N2DEMO', grid: 'INVALID', latitude: NaN }).point, null)
  assert.equal(speakerPosition({ callsign: 'N2DEMO' }, { ...aprs, receivedAt: NaN }).point, null)
  assert.equal(
    speakerPosition({ callsign: 'N0DEMO', isSelf: true }, aprs, { lat: 0, lng: 0 }).source,
    'self'
  )
})

check('Map format changes preserve packet grid precision and WGS84 coordinates', () => {
  const position = speakerPosition({ callsign: 'N1DEMO', grid: 'OL39' })
  assert.equal(mapDisplay.formatMapPosition(position, 'maidenhead', 8), 'OL39')
  assert.match(mapDisplay.formatMapPosition(position, 'coordinates'), /^网格中心约 /)
  assert.equal(
    mapDisplay.formatMapPosition({ point: { lat: 0, lng: 0 } }, 'coordinates'),
    '0.0000°N  0.0000°E'
  )
  assert.equal(mapDisplay.formatMapPosition({ point: { lat: NaN, lng: 0 } }, 'coordinates'), '')
  for (const point of [
    { lat: 29.56, lng: 106.55 },
    { lat: 39.9, lng: 116.4 },
    { lat: -33.8, lng: 151.2 }
  ]) {
    const original = mapDisplay.fromMapPoint(geometry.toMapPoint(point))
    assert.ok(
      Math.abs(original.lat - point.lat) < 1e-7 && Math.abs(original.lng - point.lng) < 1e-7
    )
  }
})

check('Viewport grids bound work at world, pole, dateline and fine local scales', () => {
  for (const bounds of [
    { south: -85, north: 85, west: -210, east: 210 },
    { south: 29, north: 31, west: 105, east: 108 },
    { south: -10, north: 10, west: 170, east: -170 }
  ]) {
    for (const mode of ['coordinates', 'maidenhead']) {
      const grid = mapDisplay.buildViewportGrid(bounds, mode, 8, 4)
      assert.ok(grid.lines.length > 0 && grid.lines.length < 160)
      assert.ok(grid.labels.length <= 64)
      assert.ok(
        grid.lines.every((line) =>
          line.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        )
      )
    }
  }
  const local = mapDisplay.buildViewportGrid(
    { south: 29.56, north: 29.57, west: 106.55, east: 106.56 },
    'maidenhead',
    8,
    16
  )
  assert.equal(local.precision, 8)
  assert.equal(local.reduced, false)
  assert.ok(local.labels.every((label) => label.text.length === 8))
  const wide = mapDisplay.buildViewportGrid(
    { south: 20, north: 40, west: 100, east: 120 },
    'maidenhead',
    8,
    4
  )
  assert.equal(wide.reduced, true)
  assert.deepEqual(
    mapDisplay.buildViewportGrid({ south: 0, north: 1, west: 0, east: 1 }, 'none', 'auto', 4).lines,
    []
  )
})

check('Saved map display choices normalize safely without changing shared defaults', () => {
  assert.deepEqual(
    mapDisplay.normalizeMapDisplay({
      background: 'none',
      grid: 'coordinates',
      format: 'coordinates',
      precision: 8
    }),
    { background: 'none', grid: 'coordinates', format: 'coordinates', precision: 8 }
  )
  assert.deepEqual(
    mapDisplay.normalizeMapDisplay({ background: 'bad', grid: {}, format: null, precision: '8' }),
    mapDisplay.DEFAULT_MAP_DISPLAY
  )
  assert.equal(mapDisplay.DEFAULT_MAP_DISPLAY.background, 'detailed')
})

check('Maidenhead centers round-trip at all supported precisions', () => {
  for (const point of [
    [39.9, 116.4],
    [29.77, 106.64],
    [-33.86, 151.2],
    [0, 0],
    [51.5, -0.1]
  ]) {
    for (const length of [4, 6, 8]) {
      const grid = coordinatesToMaidenhead(...point, length)
      const center = geometry.gridCenter(grid)
      assert.equal(coordinatesToMaidenhead(center.lat, center.lng, length), grid)
    }
  }
  assert.equal(geometry.gridBounds('INVALID'), null)
  assert.equal(geometry.gridBounds('OM89ZZ'), null)
  assert.ok(geometry.gridBounds(coordinatesToMaidenhead(90, 180, 8)))
})
const polygon = (rings) => ({
  type: 'Feature',
  properties: { adcode: 1, name: 'Test' },
  geometry: { type: 'Polygon', coordinates: rings }
})
const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0]
]
check('Administrative attribution rejects crossing grids and ambiguous borders', () => {
  const area = polygon([square])
  assert.equal(geometry.containsGrid(area, { west: 1, east: 2, south: 1, north: 2 }), true)
  assert.equal(geometry.containsGrid(area, { west: 9, east: 11, south: 1, north: 2 }), false)
  assert.equal(geometry.locateRegion([area], { lng: 0, lat: 5 }), null)
  assert.equal(geometry.locateRegion([area, area], { lng: 5, lat: 5 }), null)
})
check('Concavities and enclosed holes cannot be counted by grid center/corners', () => {
  const concave = polygon([
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [6, 10],
      [6, 3],
      [4, 3],
      [4, 10],
      [0, 10],
      [0, 0]
    ]
  ])
  assert.equal(geometry.containsGrid(concave, { west: 3, east: 7, south: 2, north: 8 }), false)
  const hole = polygon([
    square,
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4]
    ]
  ])
  assert.equal(geometry.containsGrid(hole, { west: 3, east: 7, south: 3, north: 7 }), false)
  assert.equal(geometry.containsPoint(hole, { lng: 5, lat: 5 }), false)
})
const qso = {
  fromCallsign: 'N0DEMO',
  toCallsign: 'N1DEMO',
  timestamp: 1794600000,
  toGrid: 'OM89OC'
}
check('Evidence requires a real QSO identity and never guesses target coordinates', () => {
  assert.equal(footprint.contactEvidence({ callsign: 'N1DEMO', grid: 'OM89OC' }), null)
  assert.equal(footprint.contactEvidence({ ...qso, toCallsign: 'N0DEMO' }), null)
  assert.equal(footprint.contactEvidence({ ...qso, timestamp: NaN }), null)
  const item = footprint.contactEvidence({ ...qso, toGrid: '', latitude: 39, longitude: 116 })
  assert.equal(item.source, 'unknown')
  assert.equal(item.point, null)
  const explicit = footprint.contactEvidence({
    ...qso,
    toGrid: '',
    toLatitude: 39.9,
    toLongitude: 116.4
  })
  assert.equal(explicit.source, 'coordinates')
  assert.equal(explicit.grid.length, 8)
})
check('Same station at two places on the same day preserves separate evidence', () => {
  const a = footprint.contactEvidence(qso)
  const b = footprint.contactEvidence({ ...qso, timestamp: qso.timestamp + 60, toGrid: 'OM29FH' })
  assert.notEqual(a.id, b.id)
  assert.equal(footprint.groupGrids([a, b]).length, 2)
  assert.equal(footprint.groupGrids([a, a]).length, 1)
})
check('Coarse grids never unlock fine cells; 8 digit originals survive aggregation', () => {
  const coarse = footprint.contactEvidence({ ...qso, toGrid: 'OM89' })
  const precise = footprint.contactEvidence({
    ...qso,
    timestamp: qso.timestamp + 1,
    toGrid: 'OM89OC12'
  })
  const groups = footprint.groupGrids([coarse, precise], 6)
  assert.equal(groups.filter((g) => !g.coarse).length, 1)
  assert.equal(groups.find((g) => g.coarse).precision, 4)
  assert.equal(groups.find((g) => !g.coarse).records[0].grid, 'OM89OC12')
})
check('Time filters affect activity without mutating permanent evidence', () => {
  const records = [footprint.contactEvidence(qso)]
  assert.equal(footprint.inContactPeriod(records[0], 'all', new Date('2027-01-01').getTime()), true)
  assert.equal(
    footprint.inContactPeriod(records[0], 'year', new Date('2027-01-01').getTime()),
    false
  )
  assert.equal(records.length, 1)
})
check('FMO frequency scale and supplied units match the existing protocol', () => {
  for (const value of [4385000, 438500000, 438.5, '438.5 MHz', '438500 kHz', '438500000 Hz']) {
    assert.equal(frequencyText({ freqHz: value }, 'tx'), '438.500 MHz')
  }
  assert.equal(frequencyText({}, 'rx'), '')
  assert.equal(frequencyText({ freqHz: 'unknown' }, 'tx'), '')
})
check('Re-syncing coarse logs preserves precise saved evidence', () => {
  const fine = footprint.contactEvidence({ ...qso, toGrid: 'OM89OC12' })
  const coarse = footprint.contactEvidence({ ...qso, toGrid: 'OM89' })
  assert.equal(footprint.mergeContactEvidence(fine, coarse).grid, fine.grid)
  const point = footprint.contactEvidence({ ...qso, toLatitude: 39.9, toLongitude: 116.4 })
  const restored = footprint.mergeContactEvidence(point, coarse)
  assert.deepEqual(restored.point, point.point)
  assert.equal(restored.source, 'coordinates')
  assert.equal(footprint.mergeContactEvidence(coarse, fine).grid, fine.grid)
  const other = footprint.contactEvidence({ ...qso, timestamp: qso.timestamp + 1 })
  assert.equal(footprint.mergeContactEvidence(point, other), other)
})
// Verify that failed IndexedDB opening cannot hide a fetched boundary collection.
const { WebMapService } = await import(
  await moduleUrl(resolve('src/platform/web/MapService.web.ts'))
)
const boundary = {
  type: 'FeatureCollection',
  features: [{ properties: { name: 'test', adcode: 100001 }, geometry: { type: 'Polygon' } }]
}
const previousFetch = globalThis.fetch
try {
  globalThis.fetch = async () => ({ ok: true, json: async () => boundary })
  const service = new WebMapService()
  service.open = async () => {
    throw new Error('storage unavailable')
  }
  assert.equal((await service.loadRegions()).features.length, 1)
  checks++
  console.log('PASS Boundary fetch survives unavailable cache')
} finally {
  globalThis.fetch = previousFetch
}
console.log(`Passed ${checks} footprint checks`)
