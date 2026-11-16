export const RELAY_REPORT_MAX_AGE_MS = 20 * 60 * 1000

export interface RelayReport {
  uid: string
  name: string
  admin: string
  online: number | null
  peak: number | null
  host: string
  port: number | null
  rangeKm: number | null
  description: string
  status: string
  reportedAt: number
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** Match the verified server UID, never infer population from listening clients or names. */
export function findRelayReport(payload: any, uid: string): RelayReport | null {
  if (!uid || !Array.isArray(payload?.presences)) return null
  const candidates = payload.presences.filter(
    (item: any) =>
      item?.mode === 'server' &&
      item.identityTrust === 'verified' &&
      String(item.server?.nodeId ?? '') === uid &&
      typeof item.lastSeen === 'number' &&
      Number.isFinite(item.lastSeen) &&
      item.lastSeen > 0
  )
  candidates.sort((a: any, b: any) => b.lastSeen - a.lastSeen)
  const item = candidates[0]
  if (!item) return null
  const server = item.server
  return {
    uid,
    name: String(server.name || ''),
    admin: String(item.callsign || ''),
    online: count(server.online),
    peak: count(server.peak),
    host: String(server.host || ''),
    port: count(server.port),
    rangeKm: count(server.rangeKm),
    description: String(server.desc || ''),
    status: String(server.statusText || ''),
    reportedAt: item.lastSeen
  }
}

export function isRelayReportStale(report: RelayReport, now = Date.now()): boolean {
  return now - report.reportedAt > RELAY_REPORT_MAX_AGE_MS || report.reportedAt > now + 60000
}

export function relayReportAgeText(report: RelayReport, now = Date.now()): string {
  const age = now - report.reportedAt
  if (age < -60000) return '广播时间异常'
  const minutes = Math.floor(Math.max(0, age) / 60000)
  if (minutes < 1) return '刚刚更新'
  if (minutes < 60) return `${minutes} 分钟前更新`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前更新`
  return `${Math.floor(hours / 24)} 天前更新`
}
