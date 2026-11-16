import { findRelayReport } from '../../core/relayStatus'
import type { IRelayStatusService } from '../interfaces/IRelayStatusService'

// Public endpoint used by map.fmo.net.cn; no device information is sent to this service.
const SNAPSHOT_URL = 'https://map.srv.ink/v401/api/bootstrap'

export class WebRelayStatusService implements IRelayStatusService {
  private cached: any = null
  private expiresAt = 0
  private pending: Promise<any> | null = null

  constructor(private request: typeof fetch = (...args) => fetch(...args)) {}

  async getReport(uid: string) {
    if (!uid) return null
    if (this.expiresAt > Date.now()) return findRelayReport(this.cached, uid)
    if (!this.pending) {
      this.pending = this.fetchSnapshot().finally(() => {
        this.pending = null
      })
    }
    return findRelayReport(await this.pending, uid)
  }

  private async fetchSnapshot() {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await this.request(SNAPSHOT_URL, {
        signal: controller.signal,
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`广播服务 HTTP ${response.status}`)
      const payload = await response.json()
      if (!Array.isArray(payload?.presences)) throw new Error('广播服务数据格式异常')
      this.cached = payload
      this.expiresAt = Date.now() + 60000
      return payload
    } finally {
      clearTimeout(timeout)
    }
  }
}
