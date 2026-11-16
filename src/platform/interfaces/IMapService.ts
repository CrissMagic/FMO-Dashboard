import type { ContactEvidence } from '../../core/footprints'
import type { RegionCollection } from '../../core/mapGeometry'

export interface IMapService {
  loadRegions(adcode?: string): Promise<RegionCollection>
  readEvidence(fromCallsign: string): Promise<ContactEvidence[]>
  remember(records: any[]): Promise<void>
  hasEvidence(from: string, to: string, timestamp: number): Promise<boolean>
  clearEvidence(): Promise<void>
  onChange(listener: () => void): () => void
}
