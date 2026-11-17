export interface AppUpdate {
  version: string
  currentVersion: string
  notes: string
  date?: string
}
export interface UpdateProgress {
  event: 'started' | 'progress' | 'finished'
  total?: number
  chunk?: number
}
export interface IUpdateService {
  readonly supported: boolean
  check(): Promise<AppUpdate | null>
  install(onProgress: (progress: UpdateProgress) => void): Promise<void>
}
