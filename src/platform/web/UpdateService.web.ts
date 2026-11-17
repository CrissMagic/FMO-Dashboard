import type { IUpdateService, AppUpdate, UpdateProgress } from '../interfaces/IUpdateService'
import type { Update } from '@tauri-apps/plugin-updater'

export class WebUpdateService implements IUpdateService {
  private pending: Update | null = null
  get supported() {
    return (
      typeof window !== 'undefined' &&
      Boolean((window as any).__TAURI_INTERNALS__) &&
      /Windows/i.test(navigator.userAgent)
    )
  }
  async check(): Promise<AppUpdate | null> {
    if (!this.supported) throw new Error('当前平台请通过发布页下载更新')
    const { check } = await import('@tauri-apps/plugin-updater')
    if (this.pending) {
      await this.pending.close()
      this.pending = null
    }
    this.pending = await check({ timeout: 20000 })
    return this.pending
      ? {
          version: this.pending.version,
          currentVersion: this.pending.currentVersion,
          notes: this.pending.body || '',
          date: this.pending.date
        }
      : null
  }
  async install(onProgress: (progress: UpdateProgress) => void) {
    if (!this.pending) throw new Error('请先检查更新')
    await this.pending.downloadAndInstall((event) => {
      if (event.event === 'Started')
        onProgress({ event: 'started', total: event.data.contentLength })
      else if (event.event === 'Progress')
        onProgress({ event: 'progress', chunk: event.data.chunkLength })
      else onProgress({ event: 'finished' })
    })
  }
}
