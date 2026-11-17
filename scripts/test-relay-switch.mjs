import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'

const modules = new Map()
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path)
  if (path === resolve('src/services/fmoApi.js'))
    return 'data:text/javascript,export class FmoApiClient {}'

  if (path === resolve('src/stores/speakingStore.ts'))
    return `data:text/javascript,export function useSpeakingStatusStore(){return {updateServerInfoForTarget:(target, info)=>globalThis.__relaySwitchUpdates.push({target, info})}}`
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
globalThis.__relaySwitchUpdates = []
const { useRelaySwitchStore } = await import(
  await moduleUrl(resolve('src/stores/relaySwitchStore.ts'))
)
setActivePinia(createPinia())
const store = useRelaySwitchStore()
const old = { uid: 1, name: '原中继' },
  next = { uid: 2, name: '新中继' }
let checks = 0
const target = { host: 'fixture.invalid', protocol: 'ws' }
function fixture(respond, list = [next]) {
  const calls = []
  let closed = 0
  return {
    calls,
    get closed() {
      return closed
    },
    factory: () => ({
      async sendRequest(type, subType, data, options) {
        calls.push({ type, subType, data, options })
        return respond(subType, data, calls)
      },
      async getAllStations() {
        return list
      },
      close() {
        closed++
      }
    })
  }
}
function pass(name) {
  checks++
  console.log('PASS ' + name)
}
{
  let release
  const ack = new Promise((resolve) => {
    release = resolve
  })
  const f = fixture((sub) => (sub === 'setCurrent' ? ack : next))
  const task = store.run(target, { type: 'select', uid: 2, name: '新中继' }, f.factory)
  assert.equal(store.stateFor(target).busy, true)
  assert.equal(store.stateFor(target).phase, 'switching')
  assert.equal(await store.run(target, { type: 'next' }, f.factory), null)
  release({ result: 0 })
  assert.deepEqual((await task).current, next)
  assert.equal(f.calls.filter((x) => x.subType === 'setCurrent').length, 1)
  assert.equal(f.closed, 1)
  assert.equal(store.stateFor(target).busy, false)
  pass('Pending writes show busy immediately and reject duplicate switches')
}
{
  let releaseRead
  const reading = new Promise((resolve) => {
    releaseRead = resolve
  })
  const f = fixture((sub) => (sub === 'setCurrent' ? { result: 0 } : reading))
  const task = store.run(target, { type: 'select', uid: 2 }, f.factory)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(store.stateFor(target).phase, 'confirming')
  assert.equal(store.stateFor(target).confirmed, null)
  assert.equal(store.stateFor(target).busy, true)
  releaseRead(next)
  await task
  assert.equal(store.stateFor(target).phase, 'success')
  pass('Command acknowledgement stays pending until current relay is read back')
}
{
  let reads = 0
  const f = fixture((sub) => (sub === 'setCurrent' ? { result: 0 } : ++reads < 3 ? old : next))
  const result = await store.run(target, { type: 'select', uid: '2' }, f.factory)
  assert.deepEqual(result.current, next)
  assert.equal(reads, 3)
  assert.equal(f.calls.filter((x) => x.subType === 'setCurrent').length, 1)
  assert.equal(f.calls[0].options.retries, 0)
  pass('Delayed state propagation polls reads without resending the command')
}
{
  const f = fixture((sub) => (sub === 'setCurrent' ? { result: 0 } : old))
  await assert.rejects(store.run(target, { type: 'select', uid: 2 }, f.factory), /未确认切换成功/)
  assert.equal(store.stateFor(target).phase, 'error')
  assert.equal(store.stateFor(target).confirmed, null)
  assert.equal(store.stateFor(target).busy, false)
  assert.equal(f.closed, 1)
  pass('Accepted writes with unchanged device state never claim success')
}
{
  const f = fixture(() => ({ result: 1 }))
  await assert.rejects(store.run(target, { type: 'select', uid: 2 }, f.factory), /盒子拒绝/)
  assert.equal(f.calls.length, 1)
  pass('Firmware refusal is reported without optimistic state changes')
}
{
  const f = fixture(() => {
    throw new Error('Request timeout')
  })
  await assert.rejects(store.run(target, { type: 'select', uid: 2 }, f.factory), /核实当前中继/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.closed, 1)
  assert.equal(store.stateFor(target).busy, false)
  pass('Timed-out writes are not retried and controls recover')
}
{
  let reads = 0
  const f = fixture((sub) => (sub === 'getCurrent' ? (++reads === 1 ? old : next) : { result: 0 }))
  await store.run(target, { type: 'prev' }, f.factory)
  assert.deepEqual(
    f.calls.map((x) => x.subType),
    ['getCurrent', 'prev', 'getCurrent']
  )
  pass('Previous/next confirms a change from the actual original relay')
}
{
  const f = fixture((sub) => (sub === 'setCurrent' ? { result: 0 } : next))
  const result = await store.run(target, { type: 'name', name: ' 新中继 ' }, f.factory)
  assert.equal(result.station.uid, 2)
  assert.equal(f.calls[0].data.uid, 2)
  await assert.rejects(
    store.run(target, { type: 'name', name: '不存在' }, f.factory),
    /未在中继列表/
  )
  assert.equal(f.calls.length, 2)
  pass('Switching from recent contacts resolves names and verifies the actual relay')
}
{
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const f = fixture((sub) => (sub === 'setCurrent' ? gate : next))
  const task = store.run(target, { type: 'select', uid: 2 }, f.factory)
  const other = { host: 'other.invalid', protocol: 'ws' }
  const g = fixture((sub) => (sub === 'setCurrent' ? { result: 0 } : next))
  await store.run(other, { type: 'select', uid: 2 }, g.factory)
  assert.equal(store.stateFor(target).busy, true)
  assert.equal(store.stateFor(other).busy, false)
  release({ result: 0 })
  await task
  pass('Busy and feedback remain isolated between different boxes')
}
{
  const before = globalThis.__relaySwitchUpdates.length
  const f = fixture((sub) => (sub === 'setCurrent' ? { result: 0 } : next))
  await store.run(target, { type: 'select', uid: 2 }, f.factory)
  assert.equal(globalThis.__relaySwitchUpdates.length, before + 1)
  assert.deepEqual(globalThis.__relaySwitchUpdates.at(-1), { target, info: next })
  const refused = fixture(() => ({ result: 1 }))
  await assert.rejects(store.run(target, { type: 'select', uid: 2 }, refused.factory))
  assert.equal(globalThis.__relaySwitchUpdates.length, before + 1)
  pass('Only confirmed changes synchronize the addressed box for every UI entry point')
}
console.log(`${checks} relay switching checks passed`)
