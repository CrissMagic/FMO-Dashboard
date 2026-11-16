import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const modules = new Map()
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path)
  if (path === resolve('src/platform/index.ts')) {
    return `data:text/javascript,export function getPlatform(){return globalThis.__deviceControlTestPlatform}`
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
const { WebDeviceControlService } = await import(
  await moduleUrl(resolve('src/platform/web/DeviceControlService.web.ts'))
)
const target = { host: 'fixture.invalid', protocol: 'ws' }
function fixture(respond) {
  const calls = []
  let closed = 0
  const service = new WebDeviceControlService((url) => ({
    async sendRequest(type, subType, data, options) {
      calls.push({ url, type, subType, data, options })
      return respond(subType, data, calls)
    },
    close() {
      closed++
    }
  }))
  return {
    service,
    calls,
    get closed() {
      return closed
    }
  }
}
let checks = 0
async function check(name, callback) {
  await callback()
  checks++
  console.log(`PASS ${name}`)
}

await check('Unknown/unsupported firmware responses never become a known mode', async () => {
  for (const data of [null, {}, { mode: 2 }, { mode: '1' }]) {
    const f = fixture(() => data)
    await assert.rejects(f.service.getScreenMode(target), /未返回有效模式/)
    assert.equal(f.closed, 1)
  }
})
await check('Both valid device modes are read and connections are closed', async () => {
  for (const mode of [0, 1]) {
    const f = fixture(() => ({ mode }))
    assert.equal(await f.service.getScreenMode(target), mode)
    assert.equal(f.closed, 1)
  }
})
await check('A command acknowledgement is not success until read-back confirms it', async () => {
  let reads = 0
  const f = fixture((subType) => {
    if (subType === 'setScreenMode') return { result: 0 }
    return { mode: ++reads === 1 ? 0 : 1 }
  })
  assert.equal(await f.service.setScreenMode(target, 1), 1)
  assert.equal(reads, 2)
  assert.equal(f.calls.filter((call) => call.subType === 'setScreenMode').length, 1)
  assert.equal(f.closed, 1)
})
await check('A device refusal is reported even when the outer API code succeeded', async () => {
  const f = fixture(() => ({ result: 1 }))
  await assert.rejects(f.service.setScreenMode(target, 1), /拒绝切换/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.closed, 1)
})
await check('A timed-out write is never retried automatically', async () => {
  const f = fixture(() => {
    throw new Error('Request timeout')
  })
  await assert.rejects(f.service.setScreenMode(target, 1), /timeout/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].options.retries || 0, 0)
  assert.equal(f.closed, 1)
})
await check('Accepted commands without a changed device state do not claim success', async () => {
  const f = fixture((subType) => (subType === 'setScreenMode' ? { result: 0 } : { mode: 0 }))
  await assert.rejects(f.service.setScreenMode(target, 1), /尚未确认/)
  assert.equal(f.closed, 1)
})
await check('Invalid modes and addresses are rejected before any device command', async () => {
  const f = fixture(() => {
    throw new Error('Unexpected device request')
  })
  await assert.rejects(f.service.setScreenMode(target, 2), /无效/)
  await assert.rejects(f.service.getScreenMode({ host: '', protocol: 'ws' }), /有效/)
  assert.equal(f.calls.length, 0)
})
await check(
  'Devices stay isolated, duplicate writes are blocked, failed writes become unknown',
  async () => {
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    let writes = 0
    let finishWrite
    const modeControl = {
      async getScreenMode(device) {
        return device.host === 'first.invalid' ? 1 : 0
      },
      async setScreenMode() {
        writes++
        return new Promise((resolve) => {
          finishWrite = resolve
        })
      }
    }
    globalThis.__deviceControlTestPlatform = { deviceControl: modeControl }
    const { useDeviceControlStore } = await import(
      await moduleUrl(resolve('src/stores/deviceControlStore.ts'))
    )
    const store = useDeviceControlStore()
    const first = { host: 'first.invalid', protocol: 'ws' }
    const second = { host: 'second.invalid', protocol: 'ws' }
    await store.refresh(first, true)
    await store.refresh(second, true)
    const pending = store.setMode(first, 0)
    assert.equal(store.stateFor(first).busy, true)
    assert.equal(store.stateFor(first).mode, 1)
    assert.equal(store.stateFor(second).mode, 0)
    await store.setMode(first, 1)
    assert.equal(writes, 1)
    await store.refresh(second, true)
    finishWrite(0)
    await pending
    assert.equal(store.stateFor(first).mode, 0)
    assert.equal(store.stateFor(second).mode, 0)
    modeControl.setScreenMode = async () => {
      throw new Error('Request timeout')
    }
    await store.setMode(first, 1)
    assert.equal(store.stateFor(first).mode, null)
    assert.match(store.stateFor(first).error, /切换未确认/)
    delete globalThis.__deviceControlTestPlatform
  }
)
console.log(`${checks} device control checks passed`)
