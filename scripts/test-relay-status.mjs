import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const modules = new Map()
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path)
  if (path === resolve('src/platform/index.ts')) {
    return `data:text/javascript,export function getPlatform(){return globalThis.__relayStatusTestPlatform}`
  }
  let source = ts.transpileModule(await readFile(path, 'utf8'), {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText
  for (const match of [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]) {
    if (!match[1].startsWith('.')) {
      source = source.replace(match[0], `from '${import.meta.resolve(match[1])}'`)
      continue
    }
    let dependency = resolve(dirname(path), match[1])
    if (!/\.(ts|js)$/.test(dependency)) {
      const candidates = [
        `${dependency}.ts`,
        `${dependency}.js`,
        resolve(dependency, 'index.ts'),
        resolve(dependency, 'index.js')
      ]
      for (const candidate of candidates) {
        try {
          await access(candidate)
          dependency = candidate
          break
        } catch {
          continue
        }
      }
    }
    source = source.replace(match[0], `from '${await moduleUrl(dependency)}'`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(path, url)
  return url
}
const { findRelayReport, isRelayReportStale, relayReportAgeText } = await import(
  await moduleUrl(resolve('src/core/relayStatus.ts'))
)
const { WebRelayStatusService } = await import(
  await moduleUrl(resolve('src/platform/web/RelayStatusService.web.ts'))
)
const { createPinia, setActivePinia } = await import('pinia')
const { useRelayStatusStore } = await import(
  await moduleUrl(resolve('src/stores/relayStatusStore.ts'))
)
const now = Date.now()
const presence = (uid, online, lastSeen = now) => ({
  mode: 'server',
  identityTrust: 'verified',
  callsign: 'TEST',
  lastSeen,
  server: { nodeId: uid, online, peak: 81, name: '同名中继' }
})
const payload = {
  presences: [presence('2200', 17), presence('other', 99), presence('2200', 0, now + 1)]
}
assert.equal(findRelayReport(payload, '2200').online, 0)
assert.equal(findRelayReport(payload, 'missing'), null)
assert.equal(
  findRelayReport({ presences: [{ ...presence('2200'), mode: 'client' }] }, '2200'),
  null
)
assert.equal(
  findRelayReport({ presences: [{ ...presence('2200'), identityTrust: 'unknown' }] }, '2200'),
  null
)
for (const value of [null, undefined, '', -1, '17', 1.2])
  assert.equal(findRelayReport({ presences: [presence('2200', value)] }, '2200').online, null)
assert.equal(isRelayReportStale({ reportedAt: now - 21 * 60000 }, now), true)
assert.equal(isRelayReportStale({ reportedAt: now }, now), false)
assert.equal(isRelayReportStale({ reportedAt: now + 120000 }, now), true)
assert.equal(relayReportAgeText({ reportedAt: now }, now), '刚刚更新')
assert.equal(relayReportAgeText({ reportedAt: now - 5 * 60000 }, now), '5 分钟前更新')
assert.equal(relayReportAgeText({ reportedAt: now - 90 * 60000 }, now), '1 小时前更新')
assert.equal(relayReportAgeText({ reportedAt: now - 2 * 86400000 }, now), '2 天前更新')
assert.equal(relayReportAgeText({ reportedAt: now + 120000 }, now), '广播时间异常')
let calls = 0
const service = new WebRelayStatusService(async () => {
  calls++
  return { ok: true, json: async () => payload }
})
await Promise.all([service.getReport('2200'), service.getReport('other')])
await service.getReport('2200')
assert.equal(calls, 1)
let attempts = 0
const flaky = new WebRelayStatusService(async () => {
  if (++attempts === 1) throw new Error('offline')
  return { ok: true, json: async () => payload }
})
await assert.rejects(flaky.getReport('2200'))
assert.equal((await flaky.getReport('2200')).online, 0)
setActivePinia(createPinia())
const pending = new Map()
globalThis.__relayStatusTestPlatform = {
  relayStatus: { getReport: (uid) => new Promise((resolve) => pending.set(uid, resolve)) }
}
const store = useRelayStatusStore()
const old = store.refresh('ws://one', '2200')
const next = store.refresh('ws://two', 'other')
pending.get('other')(findRelayReport(payload, 'other'))
await next
pending.get('2200')(findRelayReport(payload, '2200'))
await old
assert.equal(store.report.uid, 'other')
globalThis.__relayStatusTestPlatform.relayStatus.getReport = async () => {
  throw new Error('offline')
}
await store.refresh('ws://two', 'other')
assert.equal(store.report.uid, 'other')
assert.match(store.error, /查询失败/)
await store.refresh('', '')
assert.equal(store.report, null)
assert.equal(store.loading, false)
console.log(
  'Relay status: parsing, zero/missing, age, cache, retry and device-switch checks passed'
)
