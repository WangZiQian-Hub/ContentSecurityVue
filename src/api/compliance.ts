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
  // silent：证据尚未登记时后端返回 404，属于数据现状而非页面故障，交由页面用中文说明。
  // 注意：silent 只是前端本地标记，不会发给后端，接口地址与参数均不变。
  evidence: (evidenceId: string, signal?: AbortSignal) =>
    request<C.Evidence>({ url: `/compliance/evidence/${id(evidenceId)}`, signal, silent: true }),
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
  // 「合规风险审计」错误评论：errorId 是前端按业务对象拼出的稳定编号，后端按字符串存取。
  errorComments: (errorId: string, signal?: AbortSignal) =>
    request<C.ErrorComment[]>({ url: `/compliance/errors/${id(errorId)}/comments`, signal }),
  addErrorComment: (errorId: string, data: { content: string }, requestId: string) =>
    request<C.ErrorComment>({
      url: `/compliance/errors/${id(errorId)}/comments`,
      method: 'POST',
      data,
      headers: { 'X-Request-Id': requestId },
    }),
}
export type ComplianceApi = typeof complianceApi
