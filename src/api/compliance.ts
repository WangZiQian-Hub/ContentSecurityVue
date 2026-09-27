import { request } from './request'
import type * as C from '../types/compliance'

const id = (value: C.EntityId) => encodeURIComponent(String(value))
// No dependency on the shared isMock switch: online errors always remain errors.
export const complianceApi = {
  overview: (params: C.OverviewQuery, signal?: AbortSignal) =>
    request<C.Overview>({ url: '/compliance/overview', params, signal }),
  lineage: (params: C.LineageQuery, signal?: AbortSignal) =>
    request<C.Lineage>({ url: '/compliance/lineage', params, signal }),
  contexts: (params: C.ContextQuery, signal?: AbortSignal) =>
    request<C.ComplianceContext>({ url: '/compliance/contexts', params, signal }),
  audits: (params: C.AuditQuery, signal?: AbortSignal) =>
    request<C.CompliancePage<C.AuditSummary>>({ url: '/compliance/audits', params, signal }),
  audit: (auditId: string, signal?: AbortSignal) =>
    request<C.AuditDetail>({ url: `/compliance/audits/${id(auditId)}`, signal }),
  trace: (traceId: string, signal?: AbortSignal) =>
    request<C.TraceResult>({
      url: `/compliance/traces/${id(traceId)}`,
      params: { includeProvenance: true },
      signal,
    }),
  alerts: (params: C.AlertQuery, signal?: AbortSignal) =>
    request<C.CompliancePage<C.AlertSummary>>({ url: '/alerts', params, signal }),
  alert: (alertId: string, signal?: AbortSignal) =>
    request<C.AlertDetail>({ url: `/alerts/${id(alertId)}`, signal }),
  evidence: (evidenceId: string, signal?: AbortSignal) =>
    request<C.Evidence>({ url: `/compliance/evidence/${id(evidenceId)}`, signal }),
  alertAction: (
    alertId: string,
    action: 'claim' | 'evidence' | 'resolve',
    data: C.AlertAction,
    requestId: string,
  ) =>
    request<C.AlertDetail>({
      url: `/alerts/${id(alertId)}/${action}`,
      method: 'POST',
      data,
      headers: { 'X-Request-Id': requestId },
    }),
  review: (auditId: string, data: C.AuditReview, requestId: string) =>
    request<C.AuditDetail>({
      url: `/compliance/audits/${id(auditId)}/reviews`,
      method: 'POST',
      data,
      headers: { 'X-Request-Id': requestId },
    }),
  execute: (capabilityCode: C.Capability, input: Record<string, unknown>, requestId: string) =>
    request<C.ComplianceTask>({
      url: '/tasks/execute',
      method: 'POST',
      data: { capabilityCode, input },
      timeout: 300000,
      headers: { 'X-Request-Id': requestId },
    }),
  task: (taskId: string, signal?: AbortSignal) =>
    request<C.ComplianceTask>({ url: `/tasks/${id(taskId)}`, signal }),
}
export type ComplianceApi = typeof complianceApi
