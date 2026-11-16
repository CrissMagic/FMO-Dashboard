import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'

const { Event, EventTarget } = globalThis

const modules = new Map()
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path)
  const stubs = new Map([
    [
      resolve('src/platform/index.ts'),
      'export const getPlatform = () => globalThis.__eventsTestPlatform'
    ],
    [resolve('src/services/gridService.js'), 'export const gridToAddress = async () => null'],
    [
      resolve('src/services/fmoApi.js'),
      `export class FmoApiClient {
      constructor(url) { this.url = url }
      async connect() {}
      async getCurrentStation() { return globalThis.__eventsTestStation(this.url) }
      close() {}
    }`
    ]
  ])
  if (stubs.has(path))
    return `data:text/javascript;base64,${Buffer.from(stubs.get(path)).toString('base64')}`
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
    for (const candidate of [
      dependency,
      `${dependency}.ts`,
      `${dependency}.js`,
      resolve(dependency, 'index.ts')
    ]) {
      try {
        await access(candidate)
        if (/\.(ts|js)$/.test(candidate)) {
          dependency = candidate
          break
        }
      } catch {
        /* try next extension */
      }
    }
    source = source.replace(match[0], `from '${await moduleUrl(dependency)}'`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(path, url)
  return url
}

const originals = {
  WebSocket: globalThis.WebSocket,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  window: globalThis.window,
  document: globalThis.document,
  localStorage: globalThis.localStorage
}
const timers = new Map()
let clock = 0,
  timerId = 0
globalThis.setTimeout = (fn, delay) => {
  const id = ++timerId
  timers.set(id, { fn, at: clock + delay })
  return id
}
globalThis.setInterval = (fn, delay) => {
  const id = ++timerId
  timers.set(id, { fn, at: clock + delay, repeat: delay })
  return id
}
globalThis.clearTimeout = globalThis.clearInterval = (id) => timers.delete(id)
globalThis.window = new EventTarget()
globalThis.document = Object.assign(new EventTarget(), {
  visibilityState: 'visible',
  hidden: false
})
globalThis.localStorage = { getItem: () => null, setItem: () => {} }
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
async function advance(ms) {
  const end = clock + ms
  while (true) {
    const next = [...timers.entries()]
      .filter(([, t]) => t.at <= end)
      .sort((a, b) => a[1].at - b[1].at)[0]
    if (!next) break
    const [id, task] = next
    clock = task.at
    timers.delete(id)
    if (task.repeat) timers.set(id, { ...task, at: clock + task.repeat })
    task.fn()
    await flush()
  }
  clock = end
  await flush()
}
class Socket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static all = []
  static fail = false
  readyState = 0
  constructor(url) {
    if (Socket.fail) throw new Error('mock transport unavailable')
    this.url = url
    Socket.all.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  close() {
    this.readyState = 2
  }
  finishClose() {
    this.readyState = 3
    this.onclose?.({ code: 1006 })
  }
  message(data) {
    this.onmessage?.({ data })
  }
}
globalThis.WebSocket = Socket
globalThis.__eventsTestStation = async () => ({ uid: 'relay-test', name: '模拟中继' })
globalThis.__eventsTestPlatform = { capabilities: { hasNativeEvents: false } }
const { WebEventsService } = await import(
  await moduleUrl(resolve('src/platform/web/EventsService.web.ts'))
)
const { useSpeakingStatusStore } = await import(
  await moduleUrl(resolve('src/stores/speakingStore.ts'))
)
const cfg = (addressId = 'single', host = 'one.invalid') => ({
  addressId,
  url: `ws://${host}/events`,
  apiUrl: `ws://${host}/ws`
})
const newest = () => Socket.all.at(-1)
let service
function setup() {
  timers.clear()
  Socket.all = []
  Socket.fail = false
  clock = 0
  service = new WebEventsService()
  globalThis.__eventsTestPlatform.events = service
  globalThis.__eventsTestStation = async () => ({ uid: 'relay-test', name: '模拟中继' })
  setActivePinia(createPinia())
  return service
}
const tests = [
  [
    'Late close/message from a replaced socket cannot downgrade the live connection',
    async () => {
      const events = setup(),
        states = [],
        messages = []
      events.onStatus((id, s) => states.push([id, s]))
      events.onMessage((id, data) => messages.push([id, data]))
      await events.connect(cfg())
      const old = newest()
      old.open()
      await flush()
      await events.disconnect('single')
      await events.connect(cfg())
      newest().open()
      await flush()
      const count = Socket.all.length
      old.finishClose()
      old.message('stale')
      assert.equal(states.at(-1)[1], 'connected')
      assert.equal(messages.length, 0)
      await advance(3000)
      assert.equal(Socket.all.length, count)
    }
  ],
  [
    'Disconnect-all cannot close replacement sockets while its old cleanup is awaiting',
    async () => {
      const events = setup()
      await events.connect(cfg('a'))
      newest().open()
      await events.connect(cfg('b'))
      newest().open()
      const oldB = newest()
      const cleanup = events.disconnectAll()
      const connectA = events.connect(cfg('a'))
      const a = newest()
      a.open()
      const connectB = events.connect(cfg('b'))
      const b = newest()
      b.open()
      await Promise.all([cleanup, connectA, connectB])
      await flush()
      assert.notEqual(a, b)
      assert.notEqual(b, oldB)
      assert.equal(a.readyState, Socket.OPEN)
      assert.equal(b.readyState, Socket.OPEN)
    }
  ],
  [
    'Changing an endpoint under the same address ID replaces the socket',
    async () => {
      const events = setup()
      await events.connect(cfg())
      const old = newest()
      old.open()
      await events.connect(cfg('single', 'two.invalid'))
      assert.equal(newest().url, 'ws://two.invalid/events')
      assert.notEqual(old.readyState, Socket.OPEN)
    }
  ],
  [
    'A late metadata response from the previous endpoint is discarded',
    async () => {
      const events = setup(),
        infos = []
      let resolveOld
      globalThis.__eventsTestStation = () =>
        new Promise((resolve) => {
          resolveOld = resolve
        })
      events.onServerInfo((id, info) => infos.push([id, info]))
      await events.connect(cfg())
      newest().open()
      await flush()
      await events.disconnect('single')
      globalThis.__eventsTestStation = async () => ({ uid: 'new', name: '新中继' })
      await events.connect(cfg('single', 'two.invalid'))
      newest().open()
      await flush()
      resolveOld({ uid: 'old', name: '旧中继' })
      await flush()
      assert.deepEqual(
        infos.map(([, info]) => info.uid),
        ['new']
      )
    }
  ],
  [
    'A hung handshake retries even when the socket never emits close',
    async () => {
      const events = setup(),
        states = []
      events.onStatus((id, s) => states.push(s))
      await events.connect(cfg())
      await advance(12000)
      assert.equal(states.at(-1), 'reconnecting')
      await advance(2500)
      assert.equal(Socket.all.length, 2)
      newest().open()
      assert.equal(states.at(-1), 'connected')
    }
  ],
  [
    'Unexpected disconnect uses backoff and recovers without duplicating sockets',
    async () => {
      const events = setup(),
        states = []
      events.onStatus((id, s) => states.push(s))
      await events.connect(cfg())
      newest().open()
      newest().finishClose()
      assert.equal(states.at(-1), 'reconnecting')
      await advance(2499)
      assert.equal(Socket.all.length, 1)
      await advance(1)
      newest().open()
      assert.equal(states.at(-1), 'connected')
      await events.connect(cfg())
      assert.equal(Socket.all.length, 2)
      await events.disconnectAll()
      await advance(60000)
      assert.equal(Socket.all.length, 2)
    }
  ],
  [
    'Online/foreground recovery retries a closed socket and leaves healthy sockets alone',
    async () => {
      const events = setup()
      await events.connect(cfg())
      newest().open()
      window.dispatchEvent(new Event('online'))
      await flush()
      assert.equal(Socket.all.length, 1)
      newest().finishClose()
      window.dispatchEvent(new Event('online'))
      await flush()
      assert.equal(Socket.all.length, 2)
      newest().open()
      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
      assert.equal(Socket.all.length, 2)
    }
  ],
  [
    'The store follows the primary connection and ignores old disconnect callbacks',
    async () => {
      const events = setup(),
        store = useSpeakingStatusStore()
      store.connectEventWs('one.invalid', 'ws')
      newest().open()
      await flush()
      assert.equal(store.primaryConnected, true)
      const old = newest()
      store.disconnectEventWs('single')
      store.connectEventWs('one.invalid', 'ws')
      newest().open()
      await flush()
      old.finishClose()
      assert.equal(store.primaryConnected, true)
      store.disconnectAllEventWs()
      events.onStatus(() => {})
      old.finishClose()
      assert.equal(store.eventsConnected, false)
      assert.equal(store.primaryConnected, false)
    }
  ],
  [
    'Multi-address rebuild keeps every selected socket connected after async cleanup',
    async () => {
      setup()
      const store = useSpeakingStatusStore()
      const addresses = [
        { id: 'a', host: 'one.invalid', protocol: 'ws' },
        { id: 'b', host: 'two.invalid', protocol: 'ws' }
      ]
      store.connectMultipleEventWs(addresses, 'a')
      await flush()
      Socket.all.forEach((socket) => socket.open())
      const old = [...Socket.all]
      store.connectMultipleEventWs(addresses, 'b')
      const next = Socket.all.slice(old.length)
      next.forEach((socket) => socket.open())
      await flush()
      old.forEach((socket) => socket.finishClose())
      assert.equal(next.length, 2)
      assert.ok(next.every((socket) => socket.readyState === Socket.OPEN))
      assert.equal(store.primaryAddressId, 'b')
      assert.equal(store.primaryConnected, true)
      assert.equal(store.isAddressConnected('a'), true)
      assert.equal(store.isAddressConnected('b'), true)
    }
  ]
]
let failures = 0
try {
  for (const [name, test] of tests) {
    try {
      await test()
      console.log(`PASS ${name}`)
    } catch (err) {
      failures++
      console.error(`FAIL ${name}: ${err.message}`)
    } finally {
      await service?.disconnectAll()
      await flush()
    }
  }
} finally {
  Object.assign(globalThis, originals)
  delete globalThis.__eventsTestPlatform
  delete globalThis.__eventsTestStation
}
console.log(`${tests.length - failures}/${tests.length} event connection checks passed`)
if (failures) process.exitCode = 1
