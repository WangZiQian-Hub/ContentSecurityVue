import { isAxiosError } from 'axios'
import { getLlmToken } from './governance-llm'
import { request } from './request'
import type {
  DispositionCommand,
  RiskDisposition,
  RiskDispositionState,
  RiskPublication,
  RiskPublicationPreview,
} from '../types/risk-disposition'

async function dispositionRequest<T>(resultId: string, path: string, data?: object): Promise<T> {
  const token = getLlmToken()
  if (!token) throw new Error('请先配置模型服务访问令牌')
  try {
    return await request<T>({
      url: `/data-governance/risk-dispositions/${encodeURIComponent(resultId)}/${path}`,
      method: data ? 'POST' : 'GET',
      data,
      headers: { 'X-Model-Access-Token': token },
      silent: true,
    })
  } catch (e) {
    const detail = isAxiosError(e) ? e.response?.data?.detail : undefined
    throw new Error(typeof detail === 'string' ? detail : '风险复核请求失败，请刷新后重试')
  }
}

export const getRiskDispositionState = (id: string) =>
  dispositionRequest<RiskDispositionState>(id, 'state')

export const updateRiskDisposition = (
  id: string,
  sampleId: string,
  inputSampleRevisionId: string,
  command: DispositionCommand,
) =>
  dispositionRequest<RiskDisposition>(id, `samples/${encodeURIComponent(sampleId)}`, {
    inputSampleRevisionId,
    ...command,
  })

export const previewRiskPublication = (id: string) =>
  dispositionRequest<RiskPublicationPreview>(id, 'preview', {})

export const publishRiskVersion = (id: string, validationToken: string) =>
  dispositionRequest<RiskPublication>(id, 'publish', { validationToken })
