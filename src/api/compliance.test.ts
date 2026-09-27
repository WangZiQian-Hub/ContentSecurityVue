import { describe, expect, it, vi } from 'vitest'
vi.mock('./request', () => ({ request: vi.fn() }))
import { request } from './request'
import { complianceApi } from './compliance'
import { mapKeys } from '../utils/case'
describe('compliance HTTP contract', () => {
  it('uses explicit target IDs, GET queries, encoded paths and abort signals', async () => {
    const signal = new AbortController().signal
    await complianceApi.contexts(
      { sourceKind: 'model_call', sourceId: 'call/1', traceId: 'target-trace' },
      signal,
    )
    expect(request).toHaveBeenLastCalledWith({
      url: '/compliance/contexts',
      params: { sourceKind: 'model_call', sourceId: 'call/1', traceId: 'target-trace' },
      signal,
    })
    await complianceApi.trace('trace/1', signal)
    expect(request).toHaveBeenLastCalledWith({
      url: '/compliance/traces/trace%2F1',
      params: { includeProvenance: true },
      signal,
    })
  })
  it('sends expected version and a stable caller supplied idempotency header', async () => {
    await complianceApi.alertAction(
      'alert/1',
      'resolve',
      { expectedVersion: 4, evidenceRefs: ['ev'], reviewConclusion: 'checked' },
      'request-id',
    )
    expect(request).toHaveBeenLastCalledWith({
      url: '/alerts/alert%2F1/resolve',
      method: 'POST',
      data: { expectedVersion: 4, evidenceRefs: ['ev'], reviewConclusion: 'checked' },
      headers: { 'X-Request-Id': 'request-id' },
    })
  })
  it('uses shared nested snake/camel mapping while preserving nulls and separate states', () => {
    expect(
      mapKeys(
        {
          subject_ref: { entity_id: 31, version_id: null },
          execution_status: 'succeeded',
          compliance_status: 'alarm',
          verification_state: 'missing',
          review_status: 'pending',
        },
        'camel',
      ),
    ).toEqual({
      subjectRef: { entityId: 31, versionId: null },
      executionStatus: 'succeeded',
      complianceStatus: 'alarm',
      verificationState: 'missing',
      reviewStatus: 'pending',
    })
    expect(
      mapKeys({ expectedVersion: 3, evidenceRefs: ['ev'], reviewConclusion: 'checked' }, 'snake'),
    ).toEqual({ expected_version: 3, evidence_refs: ['ev'], review_conclusion: 'checked' })
  })
})
