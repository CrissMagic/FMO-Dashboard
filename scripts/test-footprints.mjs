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
let checks = 0
function check(name, callback) {
  callback()
  checks++
  console.log(`PASS ${name}`)
}

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
