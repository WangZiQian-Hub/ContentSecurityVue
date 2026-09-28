import type { ResourceSample } from './data-resource'
export type Level = 'HIGH' | 'MEDIUM' | 'LOW' | 'NOTICE'
export type RiskSortField = 'maximumSuggestedLevel' | 'status'
export type SortOrder = 'asc' | 'desc'
export interface Scope {
  datasetId: number
  versionId: string
  language: string
  schemeId: string
}
export interface Query {
  page: number
  pageSize: number
  keyword: string
  level: string
  status: string
  sortBy?: RiskSortField
  sortOrder?: SortOrder
}
export interface Rule {
  id: string
  version: string
  category: string
  name: string
  text: string
  conditions: string
  source: string
}
export interface Finding {
  category: string
  suggestedLevel: Level
  reason: string
  ruleId: string
  ruleVersion: string
  evidenceRefs: string[]
}
export interface Review {
  id: string
  status: '待复核' | '已复核'
  originalFindings: Finding[]
  opinion: string
  reviewer: string
  decision?: string
  level?: Level
  category?: string
  updatedAt: string
  actions: string[]
}
export interface ReviewInput {
  opinion: string
  reviewer: string
  decision: string
  level: Level
  category: string
}
export interface Sample extends ResourceSample {
  revisionId: string
  primaryCategory: string
  maximumSuggestedLevel: Level
  status: string
  findings: Finding[]
  evidence: { id: string; quote: string; feature: string }[]
  rules: Rule[]
  cases: { id: string; ruleId: string; ruleVersion: string; title: string; text: string }[]
  review?: Review
  actions: string[]
}
export interface Result {
  id: string
  taskId: string
  scope: Scope
  datasetName: string
  finishedAt: string
  status: string
  validCount: number
  riskCount: number
  ratio: number
  highCount: number
  pendingCount: number
  reviewedCount: number
  unassessableCount: number
  failedCount: number
  levels: { level: Level; label: string; color: string; count: number; percent: number }[]
  actions: string[]
}
export interface Task {
  id: string
  status: 'running' | 'succeeded' | 'failed'
  input: Scope
  resultId?: string
  createdAt: string
  errorMessage?: string
}
export interface Options {
  datasets: { id: number; name: string; versions: { id: string; languages: string[] }[] }[]
  schemes: {
    id: string
    name: string
    levels: { level: Level; label: string; color: string; definition: string }[]
  }[]
  categories: string[]
  pageSizes: number[]
  defaultScope: Scope
  actions: string[]
  reviewDecisions: { value: string; label: string }[]
  reviewers: string[]
  reviewStatuses: string[]
}
export interface Overview {
  cards: { label: string; value: number; icon: string }[]
  definitions: string[]
  records: {
    resultId: string
    datasetName: string
    versionId: string
    validCount: number
    riskCount: number
    finishedAt: string
  }[]
}
