import type { IEventsService, EventsConnectConfig } from '../interfaces/IEventsService'
import type { EventsSnapshot, EventsStatus, ServerInfo } from '../types/speaking'
// @ts-ignore - legacy JS module
import { FmoApiClient } from '../../services/fmoApi'

/**
 * Web / Tauri 桌面端事件服务。
 *
 * 职责：
 * - 维护多 addressId 的 WebSocket 连接
 * - 掉线自动重连（2.5–30 秒退避），网络恢复／回到前台时补连
 * - 每个订阅地址每 30s 轮询 station:getCurrent，得到 serverInfo 后推送
 * - 转发 onMessage / onStatus / onServerInfo 事件给上层（speakingStore）
 *
 * 不关心业务语义（发言状态、host 标记、历史去重等），纯通道。
 */
export class WebEventsService implements IEventsService {
  private connections = new Map<string, WebSocket>()
  private configs = new Map<string, EventsConnectConfig>()
  private reconnectTimers = new Map<string, any>()
  private reconnectAttempts = new Map<string, number>()
  private connectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private serverInfoTimers = new Map<string, any>()
  private primaryAddressId: string | null = null
  private manualDisconnect = new Set<string>()
  private recoveryBound = false
  private recoverConnections = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    for (const addressId of this.configs.keys()) {
      const ws = this.connections.get(addressId)
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))
        continue
      this.clearReconnectTimer(addressId)
      this.openSocket(addressId)
    }
  }

  private msgListeners = new Set<(addressId: string, data: string) => void>()
  private statusListeners = new Set<(addressId: string, s: EventsStatus) => void>()
  private infoListeners = new Set<(addressId: string, info: ServerInfo) => void>()

  // ========== 公有 API ==========
  async connect(cfg: EventsConnectConfig): Promise<void> {
    const existing = this.connections.get(cfg.addressId)
    const previous = this.configs.get(cfg.addressId)
    if (
      existing &&
      previous?.url === cfg.url &&
      previous?.apiUrl === cfg.apiUrl &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      this.emitStatus(
        cfg.addressId,
        existing.readyState === WebSocket.OPEN ? 'connected' : 'connecting'
      )
      return
    }
    this.clearReconnectTimer(cfg.addressId)
    this.stopServerInfoPolling(cfg.addressId)
    this.retireSocket(cfg.addressId)
    this.configs.set(cfg.addressId, cfg)
    this.manualDisconnect.delete(cfg.addressId)
    this.bindRecovery()
    this.openSocket(cfg.addressId)
  }

  async disconnect(addressId: string): Promise<void> {
    this.manualDisconnect.add(addressId)
    this.clearReconnectTimer(addressId)
    this.stopServerInfoPolling(addressId)

    this.configs.delete(addressId)
    this.retireSocket(addressId)
    this.reconnectAttempts.delete(addressId)
    if (this.primaryAddressId === addressId) this.primaryAddressId = null
    this.emitStatus(addressId, 'disconnected')
    if (!this.configs.size) this.unbindRecovery()
  }

  async disconnectAll(): Promise<void> {
    // Clear the whole old session before the caller can create its replacement.
    // Awaiting each ID here lets an old loop close newly created sockets with the same ID.
    const ids = Array.from(this.configs.keys())
    for (const id of ids) void this.disconnect(id)
    this.primaryAddressId = null
  }

  async setPrimary(addressId: string): Promise<void> {
    this.primaryAddressId = addressId || null
  }

  async refreshServerInfo(addressId: string): Promise<void> {
    await this.fetchServerInfo(addressId)
  }

  async getSnapshot(_addressId?: string): Promise<EventsSnapshot> {
    // Web 端没有离线缓存，快照为空即可（上层 store 自己维护状态）
    return { connections: [] }
  }

  async updateServerName(_addressId: string, _name: string): Promise<void> {
    /* Web 无需缓存到原生 */
  }

  onMessage(cb: (addressId: string, data: string) => void) {
    this.msgListeners.add(cb)
    return () => this.msgListeners.delete(cb)
  }
  onStatus(cb: (addressId: string, status: EventsStatus) => void) {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }
  onServerInfo(cb: (addressId: string, info: ServerInfo) => void) {
    this.infoListeners.add(cb)
    return () => this.infoListeners.delete(cb)
  }

  // ========== 内部：WebSocket 管理 ==========
  private openSocket(addressId: string) {
    const cfg = this.configs.get(addressId)
    if (!cfg || this.manualDisconnect.has(addressId)) return
    this.retireSocket(addressId)
    this.emitStatus(addressId, 'connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(cfg.url)
    } catch (err) {
      console.warn(`[Events][${addressId}] new WebSocket failed`, err)
      this.emitStatus(addressId, 'reconnecting')
      this.scheduleReconnect(addressId)
      return
    }
    this.connections.set(addressId, ws)

    const current = () =>
      this.connections.get(addressId) === ws && this.configs.get(addressId) === cfg
    const connectTimeout = setTimeout(() => {
      if (current() && ws.readyState === WebSocket.CONNECTING) {
        this.retireSocket(addressId)
        this.emitStatus(addressId, 'reconnecting')
        this.scheduleReconnect(addressId)
      }
    }, 12000)
    this.connectTimers.set(addressId, connectTimeout)

    ws.onopen = () => {
      if (!current()) return
      this.clearConnectTimer(addressId)
      this.clearReconnectTimer(addressId)
      this.reconnectAttempts.delete(addressId)
      this.emitStatus(addressId, 'connected')
      this.startServerInfoPolling(addressId)
    }
    ws.onmessage = (ev) => {
      if (!current()) return
      this.emitMessage(addressId, String(ev.data))
    }
    ws.onclose = () => {
      if (!current()) return
      this.clearConnectTimer(addressId)
      this.connections.delete(addressId)
      this.stopServerInfoPolling(addressId)
      this.emitStatus(addressId, 'reconnecting')
      this.scheduleReconnect(addressId)
    }
    ws.onerror = () => {
      /* onclose 会接管 */
    }
  }

  private clearConnectTimer(addressId: string) {
    const timer = this.connectTimers.get(addressId)
    if (timer !== undefined) clearTimeout(timer)
    this.connectTimers.delete(addressId)
  }

  private retireSocket(addressId: string) {
    this.clearConnectTimer(addressId)
    const ws = this.connections.get(addressId)
    this.connections.delete(addressId)
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    } catch {
      /* A failed close must not prevent a replacement connection. */
    }
  }

  private bindRecovery() {
    if (this.recoveryBound || typeof window === 'undefined') return
    window.addEventListener('online', this.recoverConnections)
    window.addEventListener('focus', this.recoverConnections)
    document.addEventListener('visibilitychange', this.recoverConnections)
    this.recoveryBound = true
  }

  private unbindRecovery() {
    if (!this.recoveryBound) return
    window.removeEventListener('online', this.recoverConnections)
    window.removeEventListener('focus', this.recoverConnections)
    document.removeEventListener('visibilitychange', this.recoverConnections)
    this.recoveryBound = false
  }

  private scheduleReconnect(addressId: string) {
    if (
      !this.configs.has(addressId) ||
      this.manualDisconnect.has(addressId) ||
      this.reconnectTimers.has(addressId)
    )
      return
    const attempt = this.reconnectAttempts.get(addressId) || 0
    const delay = Math.min(30000, 2500 * 2 ** attempt)
    this.reconnectAttempts.set(addressId, attempt + 1)
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(addressId)
      if (!this.manualDisconnect.has(addressId) && this.configs.has(addressId)) {
        this.openSocket(addressId)
      }
    }, delay)
    this.reconnectTimers.set(addressId, timer)
  }

  private clearReconnectTimer(addressId: string) {
    const t = this.reconnectTimers.get(addressId)
    if (t) {
      clearTimeout(t)
      this.reconnectTimers.delete(addressId)
    }
  }

  // ========== 内部：serverInfo 轮询（30s） ==========
  private startServerInfoPolling(addressId: string) {
    if (this.serverInfoTimers.has(addressId)) return
    // 立即拉一次
    this.fetchServerInfo(addressId).catch(() => {})
    const timer = setInterval(() => {
      this.fetchServerInfo(addressId).catch(() => {})
    }, 30000)
    this.serverInfoTimers.set(addressId, timer)
  }

  private stopServerInfoPolling(addressId: string) {
    const t = this.serverInfoTimers.get(addressId)
    if (t) {
      clearInterval(t)
      this.serverInfoTimers.delete(addressId)
    }
  }

  private async fetchServerInfo(addressId: string): Promise<void> {
    const cfg = this.configs.get(addressId)
    if (!cfg || !cfg.apiUrl) return
    let client: any = null
    try {
      client = new FmoApiClient(cfg.apiUrl)
      await client.connect()
      if (this.configs.get(addressId) !== cfg) return
      const data = await client.getCurrentStation()
      if (this.configs.get(addressId) === cfg && data && data.uid) {
        this.emitServerInfo(addressId, { ...data, uid: data.uid, name: data.name || '' })
      }
    } catch (err: any) {
      console.warn(`[Events][${addressId}] getCurrentStation failed`, err?.message || err)
    } finally {
      if (client) {
        try {
          client.close()
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ========== 事件分发 ==========
  private emitMessage(addressId: string, data: string) {
    for (const cb of this.msgListeners) {
      try {
        cb(addressId, data)
      } catch (err) {
        console.warn('[Events] msg listener error', err)
      }
    }
  }
  private emitStatus(addressId: string, status: EventsStatus) {
    for (const cb of this.statusListeners) {
      try {
        cb(addressId, status)
      } catch (err) {
        console.warn('[Events] status listener error', err)
      }
    }
  }
  private emitServerInfo(addressId: string, info: ServerInfo) {
    for (const cb of this.infoListeners) {
      try {
        cb(addressId, info)
      } catch (err) {
        console.warn('[Events] info listener error', err)
      }
    }
  }
}
