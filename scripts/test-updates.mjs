import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'
async function load(path) {
  if (path === resolve('src/platform/index.ts'))
    return 'data:text/javascript,export const getPlatform=()=>globalThis.__updatePlatform'
  let code = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText
  for (const match of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]) {
    const dep = match[1].startsWith('.')
      ? await load(
          resolve(dirname(path), match[1] + (match[1].endsWith('/platform') ? '/index.ts' : '.ts'))
        )
      : import.meta.resolve(match[1])
    code = code.replace(match[0], `from '${dep}'`)
  }
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
}
const { useUpdateStore } = await import(await load(resolve('src/stores/updateStore.ts')))
setActivePinia(createPinia())
const store = useUpdateStore()
const info = { version: '2.6.4', currentVersion: '2.6.3', notes: 'Test' }
let calls = 0,
  release
const gate = new Promise((resolve) => {
  release = resolve
})
globalThis.__updatePlatform = {
  updates: {
    supported: true,
    check: async () => {
      calls++
      return gate
    },
    install: async (cb) => {
      cb({ event: 'started', total: 100 })
      cb({ event: 'progress', chunk: 40 })
      cb({ event: 'progress', chunk: 60 })
      cb({ event: 'finished' })
    }
  }
}
const task = store.check()
assert.equal(store.phase, 'checking')
await store.check()
assert.equal(calls, 1)
release(info)
await task
assert.equal(store.phase, 'available')
await store.install()
assert.equal(store.received, 100)
assert.equal(store.total, 100)
assert.equal(store.phase, 'installing')
setActivePinia(createPinia())
const next = useUpdateStore()
let installs = 0
globalThis.__updatePlatform.updates.install = async () => {
  installs++
  throw Error('invalid signature')
}
await next.install()
assert.equal(installs, 0)
globalThis.__updatePlatform.updates.check = async () => null
await next.check()
assert.equal(next.phase, 'current')
assert.equal(next.available, null)
globalThis.__updatePlatform.updates.check = async () => {
  throw Error('offline')
}
await next.check()
assert.equal(next.phase, 'error')
assert.ok(next.error)
assert.equal(next.busy, false)
globalThis.__updatePlatform.updates.check = async () => info
await next.check()
await next.install()
assert.equal(next.phase, 'error')
assert.equal(next.available.version, '2.6.4')
assert.equal(next.busy, false)
console.log(
  'PASS updates: concurrent checks, available, progress, current, offline and signature failure recovery'
)
delete globalThis.__updatePlatform
