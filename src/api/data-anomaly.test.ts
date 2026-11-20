import { beforeEach, describe, expect, it, vi } from 'vitest'

const clients = vi.hoisted(() => ({
  business: vi.fn(),
  model: vi.fn(),
  token: vi.fn(),
}))

vi.mock('./request', () => ({ isMock: false, request: clients.business }))
vi.mock('./governance-llm', () => ({
  isGovernanceLlm: true,
  llmRequest: clients.model,
  getLlmToken: clients.token,
}))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

import {
  checkAnomalyVersion,
  getAnomalyResult,
  getAnomalyReviewState,
  publishAnomalyVersion,
  updateCandidate,
} from './data-anomaly'

const scope = {
  datasetId: 9,
  versionId: 'dsv_000009',
  language: 'all',
  schemeId: 'anomaly-basic-v2.1',
}
const prefix = '/data-governance/anomaly-reviews/result-id'

describe('真实异常检测和复核请求分流', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    clients.token.mockReturnValue('test-model-token')
  })

  it('模型服务继续提供检测结果，业务后端处理复核和发布', async () => {
    await getAnomalyResult('result-id')
    expect(clients.model).toHaveBeenCalledOnce()
    expect(clients.model).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/data-governance/anomaly-results/result-id',
      }),
    )
    await getAnomalyReviewState('result-id')
    await updateCandidate('result-id', '47', 'submit', 'candidate-id', 'dsv_000009:47')
    await checkAnomalyVersion(scope, 'result-id')
    await publishAnomalyVersion(scope, 'preview-token', 'result-id')
    expect(clients.model).toHaveBeenCalledOnce()
    expect(clients.business.mock.calls.map(([request]) => request.url)).toEqual([
      `${prefix}/state`,
      `${prefix}/samples/47/candidates/submit`,
      `${prefix}/change-set/validate`,
      `${prefix}/change-set/generate-version`,
    ])
    expect(clients.business).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Model-Access-Token': 'test-model-token' },
        data: { candidateId: 'candidate-id', inputSampleRevisionId: 'dsv_000009:47' },
      }),
    )
    expect(clients.business).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: { validationToken: 'preview-token' },
      }),
    )
  })

  it('缺少模型服务令牌时不会发出复核请求', async () => {
    clients.token.mockReturnValue('')
    await expect(getAnomalyReviewState('result-id')).rejects.toThrow('模型服务访问令牌')
    expect(clients.business).not.toHaveBeenCalled()
  })
})
