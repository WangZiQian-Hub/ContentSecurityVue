import type { Kpi, TaskStatus } from './index'
export type ResourceView = 'overview' | 'ingest' | 'datasets' | 'statistics'
export interface Distribution {
  name: string
  value: number
}
export interface ResourceDataset {
  id: number
  name: string
  sourceType: 'internet' | 'industry' | 'business' | 'synthetic'
  sourceName: string
  modalities: string[]
  languages: string[]
  rowCount: number
  storageGb: number
  qualityScore: number
  qualityStatus: 'excellent' | 'good' | 'poor'
  status: 'uploading' | 'ready' | 'processing' | 'archived'
  versionId: string
  owner: string
  description: string
  createdAt: string
  updatedAt: string
}
export interface IngestTask {
  taskId: string
  name: string
  sourceName: string
  datasetName: string
  storageGb: number
  progress: number
  status: TaskStatus
  createdAt: string
  successCount: number
  duplicateCount: number
  anomalyCount: number
  traceId: string
}
export interface ResourceSummary {
  kpis: Kpi[]
  trend: { dates: string[]; added: number[]; total: number[] }
  modalities: Distribution[]
  sources: Distribution[]
  languages: Distribution[]
  quality: Distribution[]
  qualityScore: number
  issues: Distribution[]
  ranking: { name: string; source: string; storageGb: number; uses: number; share: number }[]
}
export interface DatasetQuery {
  page: number
  pageSize: number
  keyword?: string
  modality?: string
  language?: string
  sourceType?: string
  qualityStatus?: string
}
export interface StatisticsQuery {
  startDate?: string
  endDate?: string
  sourceType?: string
  datasetId?: number
  language?: string
}

export interface ResourceSample {
  id: string
  datasetId: number
  versionId: string
  text: string
  language: string
}
