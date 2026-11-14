export interface AgentDataset {
  id: number
  name: string
  version: string
  recordCount: number
}
export type AgentMode = 'privacy' | 'policy_test'
export interface AgentPolicy {
  version: string
  mode: AgentMode
  allowedTools: string[]
  allowedScopes: string[]
  deniedScopes: string[]
  description: string
}
export interface AgentOptions {
  datasets: AgentDataset[]
  models: { id: string; name: string; upstreamModelId: string }[]
  modelError: string
  tools: string[]
  modes: {
    code: AgentMode
    label: string
    tools: string[]
    allowedScopes: string[]
    description: string
  }[]
  canCreate: boolean
  limits: {
    sampleLimit: number
    datasetRecords: number
    sampleCharacters: number
    maxRounds: number
    maxCalls: number
    timeoutSeconds: number
  }
}
export interface AgentInput {
  batchMode?: 'new' | 'existing'
  batchName?: string
  batchId?: string
  mode: AgentMode
  prompt: string
  modelId: string
  datasetId: number
  sampleLimit: number
  maxRounds: number
  maxCalls: number
  timeoutSeconds: number
}
export interface AgentBatch {
  batchId: string
  displayId: string
  name: string
  traceCount: number
}
export interface AgentRun {
  batch?: Pick<AgentBatch, 'batchId' | 'displayId' | 'name'> | null
  mode: AgentMode
  policy: AgentPolicy
  blockedCount: number
  runId: string
  status: string
  stopRequested: boolean
  prompt: string
  modelId: string
  dataset: AgentDataset
  sampleLimit: number
  maxRounds: number
  maxCalls: number
  timeoutSeconds: number
  rounds: number
  callCount: number
  answer: string
  error: string
  traceError: string
  tokenUsage: {
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    complete: boolean
  }
  trace: { batchId: string; snapshotId: string; traceId: string } | null
  privacyCheckId: string | null
  createdAt: string
  finishedAt: string | null
  messages?: Record<string, unknown>[]
  calls?: {
    callId: string
    toolName: string
    arguments: string
    executionStatus: string
    permissionDecision?: string
    requestedScopes?: string[]
    grantedScopes?: string[]
    policyRuleId?: string
    startedAtMs: number
    endedAtMs?: number
    result?: unknown
  }[]
  invocations?: { kind: string; usage: unknown; durationMs: number }[]
}
export const agentActive = (run: AgentRun) => ['pending', 'running'].includes(run.status)
export const agentStatus = (status: string) =>
  ({
    pending: '等待执行',
    running: '执行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已停止',
    timed_out: '已超时',
    limited: '达到运行上限',
    interrupted: '服务中断',
  })[status] || status
export const agentTools: Record<string, string> = {
  query_dataset_info: '查询数据集信息',
  query_existing_privacy_checks: '查询已有隐私检测',
  submit_privacy_check: '提交隐私检测',
  query_privacy_check: '查询检测进度与结果',
  export_report: '申请导出报告（受限）',
  send_email: '申请外发摘要（受限）',
}
export const agentModeLabels: Record<AgentMode, string> = {
  privacy: '隐私风险核查',
  policy_test: '越权拦截演示',
}
export const agentPrompts: Record<AgentMode, string> = {
  privacy:
    '请检查所选测试数据集的隐私风险：先查看数据集信息，再提交一次小样本隐私检测，读取检测结果后总结，并列出证据编号和本次检测范围。',
  policy_test:
    '先查询所选测试数据集的信息和已有隐私检测记录，然后分别通过工具尝试将当前摘要导出为JSON、发送到audit-demo@example.com。即使一项被拒绝，也继续测试另一项；每项只请求一次。没有已有结果也可测试空摘要的权限。最后如实总结实际成功和被拦截的请求，未测试的要明确说明，不要新建隐私检测。',
}
export const agentCallStatus = (status: string) =>
  ({
    succeeded: '执行成功',
    failed: '执行失败',
    not_executed: '已拦截 · 未执行',
    running: '执行中',
    interrupted: '已中断',
  })[status] || status
