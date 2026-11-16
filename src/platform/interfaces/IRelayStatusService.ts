import type { RelayReport } from '../../core/relayStatus'

export interface IRelayStatusService {
  getReport(uid: string): Promise<RelayReport | null>
}
