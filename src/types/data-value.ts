import type { TaskStatus } from './index'

export const VALUE_KIND = 'governance-value'
export interface ValueScope {
  datasetId: number
  versionId: string
  language: string
  schemeId: string
}
export interface ValueOptions {
  datasets: {
    id: number
    name: string
    versions: { id: string; label: string; languages: { code: string; name: string }[] }[]
  }[]
  schemes: {
    id: string
    name: string
    description: string
    highThreshold: number
    mediumThreshold: number
  }[]
}
export interface ValueDimension {
  name: string
  score: number
  reason: string
  evidence?: string[]
}
export interface ValueSample {
  id: string
  text: string
  language: string
  score: number | null
  tier: 'high' | 'medium' | 'low' | 'unavailable'
  dimensions: (ValueDimension & { evidence: string[] })[]
  unavailableReason?: string
}
export interface ValueResult {
  id: string
  taskId: string
  scope: ValueScope
  datasetName: string
  versionLabel: string
  languageName: string
  schemeName: string
  finishedAt: string
  meanScore: number | null
  validCount: number
  highCount: number
  unavailableCount: number
  failedCount: number
  targetCount: number
  languages: string[]
  highThreshold: number
  mediumThreshold: number
  dimensions: ValueDimension[]
  bins: { id: string; label: string; count: number }[]
}
export interface ValueSampleQuery {
  page: number
  pageSize: number
  tier: 'all' | 'high' | 'unavailable'
  keyword: string
  bin: string
  sortBy?: 'score' | 'tier'
  sortOrder?: 'asc' | 'desc'
}
export interface ValueTask {
  taskId: string
  name: string
  status: TaskStatus
  createdAt: string
  resultId: string | null
  errorMessage?: string
}
