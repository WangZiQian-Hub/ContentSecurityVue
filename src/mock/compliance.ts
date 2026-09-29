import type * as C from '../types/compliance'
import type { ComplianceApi } from '../api/compliance'
import { processOptions, processTasks } from './data-governance'
import { governanceResources } from './governance-resources'
import { createModelDemo } from './model-workbench'

// Isolated, deterministic design fixtures. Never a fallback for HTTP failures.
export const demoRefs = {
  model: 'demo_model_20260921_0024',
  training: 'demo_training_20260921_2408',
  call: 'demo_call_20260927_9081',
  trace: 'demo_trace_20260927_0017',
  capture: 'demo_capture_20260927_0118',
  alert: 'demo_alert_20260921_2309',
  checkpoint: 'demo_evidence_checkpoint_0012',
}
const time = '2026-09-27T10:30:00+08:00'
const historical = '2026-09-21T10:26:08+08:00'
const ref = (
  entityType: string,
  entityId: C.EntityId,
  displayId: string,
  label: string,
  versionId: string | null = null,
): C.SubjectRef => ({ entityType, entityId, displayId, label, versionId })
const model = ref('model', demoRefs.model, 'M-024', '内容安全模型', 'v1.4.0')
const training = ref('training_task', demoRefs.training, 'TRAIN-2408', '内容安全微调', 'v1.4.0')
const call = ref('model_call', demoRefs.call, 'CALL-9081', '安全内容调用', 'v1.4.0')
const subjects = [
  ref('dataset', 27, 'dsv_000027', '源版本', 'dsv_000027'),
  ref('task', 'demo_governance_8832', 'TASK-8832', '脱敏任务'),
  ref('dataset', 31, 'dsv_000031', '训练版本', 'dsv_000031'),
  training,
  model,
]
const evidenceIds = [
  'demo_evidence_0301',
  'demo_evidence_0302',
  demoRefs.checkpoint,
  'demo_evidence_0303',
]
const gap: C.Gap = {
  reason: 'TRAIN-2408 / CP-12 缺少训练数据快照引用',
  evidenceRefs: [demoRefs.checkpoint],
  alertId: demoRefs.alert,
}
export const demoLineage: C.Lineage = {
  nodes: subjects.map((subject, index) => ({
    ...subject,
    id: `node-${index}`,
    type: subject.entityType,
  })),
  edges: evidenceIds.map((evidence, index) => ({
    id: `edge-${index}`,
    fromId: `node-${index}`,
    toId: `node-${index + 1}`,
    relation: ['输入数据引用', '输出版本登记', '训练数据绑定', '训练产物登记'][index]!,
    verificationState: index === 2 ? 'missing' : 'verified',
    evidenceRefs: [evidence],
    missingReason: index === 2 ? 'CP-12 未写入 snapshot_ref' : null,
    trainingTaskId: index === 2 ? demoRefs.training : null,
  })),
  gaps: [gap],
}

function datasetLineageCandidates(): C.ContextCandidate[] {
  return governanceResources().flatMap((dataset) =>
    dataset.versions.map((version) => ({
      sourceKind: 'dataset',
      sourceId: dataset.id,
      subjectRef: ref('dataset', dataset.id, version.id, dataset.name, version.id),
      modelVersion: version.id,
      captureId: null,
      label: `${dataset.name} / ${version.id} · 数据版本`,
    })),
  )
}

function modelLineageCandidates(): C.ContextCandidate[] {
  return createModelDemo().models.flatMap((modelAsset) =>
    modelAsset.versions.map((modelVersion) => ({
      sourceKind: 'model',
      sourceId: modelAsset.id,
      subjectRef: ref(
        'model',
        modelAsset.id,
        modelAsset.id,
        modelAsset.name,
        modelVersion.version,
      ),
      modelVersion: modelVersion.version,
      captureId: null,
      label: `${modelAsset.name} / ${modelVersion.version} · 模型版本`,
    })),
  )
}

function trainingLineageCandidates(): C.ContextCandidate[] {
  return createModelDemo().training.map((task) => ({
    sourceKind: 'training_task',
    sourceId: task.id,
    subjectRef: ref('training_task', task.id, task.id, task.name, task.id),
    modelVersion: task.id,
    captureId: null,
    label: `${task.name} · 训练任务`,
  }))
}

function datasetLineage(): C.LineageNode[] {
  return governanceResources().flatMap((dataset) =>
    dataset.versions.map((version) => ({
      id: `dataset:${dataset.id}:${version.id}`,
      type: 'dataset',
      entityType: 'dataset',
      entityId: dataset.id,
      displayId: version.id,
      label: dataset.name,
      versionId: version.id,
    })),
  )
}

function datasetVersionNode(datasetId: number | string, versionId: string) {
  return datasetLineage().find(
    (node) =>
      String(node.entityId) === String(datasetId) && node.versionId === versionId,
  )
}

function lineageGraph(): C.Lineage {
  const nodes = datasetLineage()
  const edges: C.LineageEdge[] = []
  const modelDemo = createModelDemo()
  const addNode = (node: C.LineageNode) => {
    if (!nodes.some((item) => item.id === node.id)) nodes.push(node)
  }
  const edge = (
    id: string,
    fromId: string,
    toId: string,
    relation: string,
    evidenceId: string,
    verificationState: C.VerificationState = 'verified',
    missingReason: string | null = null,
    trainingTaskId: string | null = null,
  ): void => {
    edges.push({
      id,
      fromId,
      toId,
      relation,
      verificationState,
      evidenceRefs: [evidenceId],
      missingReason,
      trainingTaskId,
    })
  }

  for (const task of processTasks) {
    if (!task.outputVersion) continue
    const taskNodeId = `task:${task.taskId}`
    addNode({
      id: taskNodeId,
      type: 'task',
      entityType: 'task',
      entityId: task.taskId,
      displayId: task.taskId,
      label: '数据清洗任务',
      versionId: null,
    })
    const input = datasetVersionNode(task.input.datasetId, task.input.datasetVersionId)
    if (input)
      edge(
        `lineage:process:${task.taskId}:input`,
        input.id,
        taskNodeId,
        '输入数据引用',
        `lineage_evidence_process_${task.taskId}_input`,
      )
    const output = governanceResources()
      .flatMap((dataset) => dataset.versions.map((version) => ({ dataset, version })))
      .find(({ version }) => version.id === task.outputVersion)
    if (output) {
      const outputNode = datasetVersionNode(output.dataset.id, output.version.id)
      if (outputNode)
        edge(
          `lineage:process:${task.taskId}:output`,
          taskNodeId,
          outputNode.id,
          '输出版本登记',
          `lineage_evidence_process_${task.taskId}_output`,
        )
    }
  }

  const trainingNodes = new Map<string, string>()
  for (const task of modelDemo.training) {
    const taskNodeId = `training:${task.id}`
    trainingNodes.set(task.id, taskNodeId)
    addNode({
      id: taskNodeId,
      type: 'training_task',
      entityType: 'training_task',
      entityId: task.id,
      displayId: task.id,
      label: task.name,
      versionId: task.id,
    })
    const input = datasetVersionNode(task.datasetId, task.datasetVersion)
    edge(
      `lineage:training:${task.id}:input`,
      input?.id || `dataset:${task.datasetId}:${task.datasetVersion}`,
      taskNodeId,
      '训练数据绑定',
      `lineage_evidence_training_${task.id}_input`,
      input ? 'verified' : 'missing',
      input ? null : '缺少训练数据快照引用',
      task.id,
    )
  }

  for (const modelAsset of modelDemo.models) {
    for (const modelVersion of modelAsset.versions) {
      const modelNodeId = `model:${modelAsset.id}:${modelVersion.version}`
      addNode({
        id: modelNodeId,
        type: 'model',
        entityType: 'model',
        entityId: modelAsset.id,
        displayId: modelAsset.id,
        label: modelAsset.name,
        versionId: modelVersion.version,
      })
      if (modelVersion.taskId && trainingNodes.has(modelVersion.taskId))
        edge(
          `lineage:training:${modelVersion.taskId}:output:${modelVersion.version}`,
          trainingNodes.get(modelVersion.taskId)!,
          modelNodeId,
          '训练产物登记',
          `lineage_evidence_training_${modelVersion.taskId}_output_${modelVersion.version}`,
        )
    }
  }

  return { nodes, edges, gaps: [] }
}

function lineageEvidence(evidenceId: string, edge: C.LineageEdge, graph: C.Lineage): C.Evidence | null {
  const processTask = processTasks.find((task) =>
    evidenceId.startsWith(`lineage_evidence_process_${task.taskId}_`),
  )
  const modelDemo = processTask ? null : createModelDemo()
  const trainingTask = modelDemo?.training.find((task) =>
    evidenceId.startsWith(`lineage_evidence_training_${task.id}_`),
  )
  if (!processTask && !trainingTask) return null

  const missing = (key: string, label: string, value: string | null, reason: string) => ({
    key,
    label,
    value: value || `缺失：${reason}`,
    state: value ? ('verified' as const) : ('missing' as const),
  })
  const trainingOutput = trainingTask
    ? (() => {
        const checkpoints = trainingTask.checkpoints.length
          ? ` · 检查点 ${trainingTask.checkpoints.length} 个`
          : ''
        if (trainingTask.status === 'pending') {
          return { value: '尚未开始训练', state: 'missing' as const }
        }
        if (trainingTask.status === 'running') {
          return {
            value: `已训练 ${trainingTask.epoch} / ${trainingTask.epochs} 轮${checkpoints}`,
            state: 'missing' as const,
          }
        }
        if (trainingTask.status === 'succeeded') {
          return {
            value: `已完成 ${trainingTask.epochs} 轮${checkpoints}`,
            state: 'verified' as const,
          }
        }
        return { value: '训练失败，未产出', state: 'missing' as const }
      })()
    : null
  const fields = processTask
    ? [
        missing('input', '输入', processTask.input.datasetVersionId, '输入数据版本'),
        missing(
          'time',
          '时间',
          processTask.finishedAt || processTask.createdAt,
          '任务时间',
        ),
        missing(
          'interface',
          '接口',
          [
            processTask.ruleName,
            ...processTask.input.rules.map(
              (code) => processOptions.rules.find((rule) => rule.code === code)?.label || code,
            ),
          ].filter(Boolean).join(' → '),
          '处理模板和规则',
        ),
        missing('version', '版本', processTask.outputVersion, '输出数据版本'),
        missing(
          'output',
          '输出',
          processTask.totalCount > 0
            ? `${processTask.processedCount} / ${processTask.totalCount} 条`
            : null,
          '处理条数',
        ),
      ]
    : [
        missing('input', '输入', trainingTask!.datasetVersion, '训练数据版本'),
        missing(
          'time',
          '时间',
          trainingTask!.status === 'pending' ? '尚未开始' : trainingTask!.updatedAt,
          '训练更新时间',
        ),
        missing('interface', '接口', trainingTask!.method || null, '训练方式'),
        missing('version', '版本', trainingTask!.targetVersion, '目标模型版本'),
        {
          key: 'output',
          label: '输出',
          value: trainingOutput!.value,
          state: trainingOutput!.state,
        },
      ]
  const subject =
    graph.nodes.find(
      (node) => node.id === (edge.relation === '输出版本登记' || edge.relation === '训练产物登记' ? edge.toId : edge.fromId),
    ) || graph.nodes.find((node) => node.id === edge.toId)!
  const occurredAt = processTask
    ? processTask.finishedAt || processTask.createdAt
    : trainingTask!.updatedAt
  return {
    id: evidenceId,
    displayId: evidenceId.replace('lineage_evidence_', 'LIN-'),
    sourceModule: processTask ? 'data-governance' : 'model-training',
    subjectRef: structuredClone(subject),
    occurredAt,
    sourceTraceId: processTask?.traceId || null,
    versionRef: subject.versionId,
    redactedFields: fields,
    integrityState: fields.some((field) => field.state === 'missing') ? 'missing' : 'verified',
    allowedActions: ['copy', 'open_source'],
  }
}
export const demoOverview: C.Overview = {
  asOf: time,
  scope: 'all',
  scopeDescription:
    '数据 → 治理 → 训练 → 模型 → 推理 → 应用；只统计策略规定应有的交接关系，不适用阶段不计入。',
  expectedCount: 308,
  missingCount: 7,
  pendingReviewsCount: 3,
  completedAuditsCount: 86,
  handoffs: [
    '数据版本 → 治理任务',
    '治理版本 → 训练任务',
    '训练产物 → 模型版本',
    '模型版本 → 推理输出',
    '推理输出 → 场景回执',
  ].map((label, index) => ({
    kind: `handoff-${index}`,
    label,
    expectedCount: [128, 52, 18, 86, 24][index]!,
    verifiedCount: [128, 51, 18, 83, 21][index]!,
    missingCount: [0, 1, 0, 3, 3][index]!,
    unavailableCount: 0,
    missingReason: [null, '检查点数据快照', null, '调用版本引用', '场景回执引用'][index]!,
    target: index < 3 ? 'lineage' : index === 3 ? 'reasoning-audit' : 'full-chain',
    subjectRef: index < 3 ? model : call,
  })),
}
const ruleChecks: C.RuleCheck[] = [
  '训练数据版本绑定',
  '数据调用范围检查',
  '模型产物版本检查',
  '检查点留痕检查',
].map((label, index) => ({
  key: `check-${index}`,
  label,
  required: true,
  state: index === 3 ? 'missing' : 'verified',
  evidenceRefs: [evidenceIds[index === 3 ? 2 : index === 2 ? 3 : index]!],
  missingReason: index === 3 ? 'CP-12 的 snapshot_ref 为空，无法核验使用版本' : null,
  ruleId: 'snapshot-required',
  ruleVersion: 'RULE-04',
  occurredAt: `2026-09-21T${['10:12:03', '10:18:11', '10:23:26', '10:26:08'][index]}+08:00`,
  detail: [
    '输入版本与授权记录已关联',
    '读取范围与登记的数据版本一致',
    '训练目标模型版本已登记',
    '需追加数据快照引用后重新核验',
  ][index]!,
}))
export const demoNeuron: C.NeuronResult = {
  kind: 'neuron_audit',
  availability: 'available',
  unavailableReason: null,
  modelVersion: 'v1.4.0',
  inferenceId: demoRefs.call,
  captureId: demoRefs.capture,
  layerIndices: [4, 8, 12, 16, 20, 24, 28, 32],
  neuronIndices: Array.from({ length: 24 }, (_, i) => 100 + i),
  unit: '标准化激活 z 值',
  normalizationBaseline: 'BASE-04 / 同版本安全语料基线',
  threshold: 2.5,
  heatmap: Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 24 }, (_, col) =>
      row === 1 && col === 6
        ? 2.9
        : row === 3 && col === 12
          ? -2.8
          : row === 5 && col === 18
            ? 2.7
            : [-1.2, 0.4, 1.1, -0.5, 0.8, -0.8][(row * 5 + col * 3 + Math.floor(col / 3)) % 6]!,
    ),
  ),
  abnormalNeurons: [
    { layer: 8, index: 106, value: 2.9, concept: '隐私线索', evidenceRefs: ['demo_evidence_0501'] },
    {
      layer: 16,
      index: 112,
      value: -2.8,
      concept: '隐私线索',
      evidenceRefs: ['demo_evidence_0502'],
    },
    { layer: 24, index: 118, value: 2.7, concept: '待复核', evidenceRefs: ['demo_evidence_0503'] },
  ],
  observedCount: 192,
  ratio: 0.015625,
}
export const demoAudits: C.AuditDetail[] = [
  {
    id: 'demo_audit_0430',
    displayId: 'AUD-0430',
    capabilityCode: 'training_monitor',
    subjectRef: training,
    reviewStatus: 'pending',
    reviewReason: '检查点数据快照缺失',
    version: 1,
    taskId: 'demo_task_audit_0430',
    executionStatus: 'succeeded',
    complianceStatus: 'alarm',
    adapterVersion: 'design-fixture-v1',
    dataOrigin: '示例数据',
    evidenceRefs: [demoRefs.checkpoint],
    allowedActions: [],
    result: {
      kind: 'training_monitor',
      checks: ruleChecks,
      checkpoints: [
        {
          id: 'demo_checkpoint_0012',
          label: 'CP-12',
          expectedVersion: 'dsv_000031',
          snapshotRef: null,
          ruleVersion: 'RULE-04',
          evidenceRefs: [demoRefs.checkpoint],
        },
      ],
    },
  },
  {
    id: 'demo_audit_0431',
    displayId: 'AUD-0431',
    capabilityCode: 'neuron_audit',
    subjectRef: model,
    reviewStatus: 'pending',
    reviewReason: '激活异常仅构成关联线索',
    version: 1,
    taskId: 'demo_task_audit_0431',
    executionStatus: 'succeeded',
    complianceStatus: 'risk',
    adapterVersion: 'design-fixture-v1',
    dataOrigin: '示例数据',
    evidenceRefs: ['demo_evidence_0501'],
    allowedActions: [],
    result: demoNeuron,
  },
  {
    id: 'demo_audit_0432',
    displayId: 'AUD-0432',
    capabilityCode: 'reasoning_audit',
    subjectRef: call,
    reviewStatus: 'pending',
    reviewReason: '需核对输出规则命中证据',
    version: 1,
    taskId: 'demo_task_audit_0432',
    executionStatus: 'succeeded',
    complianceStatus: 'risk',
    adapterVersion: 'design-fixture-v1',
    dataOrigin: '示例数据',
    evidenceRefs: ['demo_evidence_0412'],
    allowedActions: [],
    result: {
      kind: 'reasoning_audit',
      auditResult: '原输出存在规则命中；治理后输出另行留痕，仍需人工复核。',
      steps: ['输入登记', '输入风险检测', '模型调用', '输出风险检测', '治理后输出'].map(
        (label, index) => ({
          id: `step-${index}`,
          label,
          detail: [
            '请求与脱敏输入摘要已关联',
            '输入检测结果已记录',
            '精确模型版本 v1.4.0 已关联',
            'RULE-04：原输出包含隐私信息',
            '隐私片段已遮蔽，治理输出单独记录',
          ][index]!,
          occurredAt: `2026-09-27T09:24:${12 + index}.100+08:00`,
          verificationState: 'verified',
          riskLevel: index === 3 ? 'high' : null,
          evidenceRefs: [`demo_evidence_0${409 + index}`],
        }),
      ),
      riskNodes: [
        {
          stepId: 'step-3',
          ruleRef: 'RULE-04 / privacy-02',
          description: '原输出命中隐私规则',
          evidenceRefs: ['demo_evidence_0412', 'demo_evidence_0413'],
          alertId: 'demo_alert_20260927_2308',
        },
      ],
      activation: {
        modelId: demoRefs.model,
        modelVersion: 'v1.4.0',
        inferenceId: demoRefs.call,
        captureId: demoRefs.capture,
      },
    },
  },
]
export const demoTrace: C.TraceResult = {
  currentTraceId: demoRefs.trace,
  auditRef: 'demo_audit_0440',
  complianceStatus: 'alarm',
  conclusion: '存在 1 处版本留痕缺口：TRAIN-2408 / CP-12。当前输出已有记录，历史训练来源尚待补证。',
  gaps: [gap],
  checks: ['输入', '时间', '接口', '版本', '输出'].map((label, index) => ({
    key: ['input', 'time', 'interface', 'version', 'output'][index]!,
    label,
    required: true,
    state: index === 3 ? 'missing' : 'verified',
    evidenceRefs: index === 3 ? [demoRefs.checkpoint] : ['demo_evidence_0411'],
    missingReason: index === 3 ? gap.reason : null,
  })),
  records: [
    ...subjects,
    call,
    ref('output', 'demo_output_9081', 'OUT-9081', '内容输出'),
    ref('scenario', 'demo_application_0331', 'APP-331', '场景回执'),
  ].map((subject, index) => ({
    stage: [
      '原始数据',
      '清洗治理',
      '训练数据版本',
      '训练过程',
      '模型版本',
      '模型推理',
      '内容输出',
      '场景应用',
    ][index]!,
    recordScope: index < 5 ? 'provenance' : 'current',
    subjectRef: subject,
    sourceTraceId: index < 5 ? 'demo_trace_historical_20260921' : demoRefs.trace,
    occurredAt: index < 5 ? historical : '2026-09-27T09:24:12+08:00',
    evidenceRefs: [
      [
        'demo_evidence_0301',
        'demo_evidence_0302',
        'demo_evidence_0305',
        demoRefs.checkpoint,
        'demo_evidence_0303',
        'demo_evidence_0411',
        'demo_evidence_0413',
        'demo_evidence_0414',
      ][index]!,
    ],
    verificationState: index === 3 ? 'missing' : 'verified',
  })),
}
export function createComplianceDemo(): ComplianceApi {
  const alerts: C.AlertDetail[] = Array.from({ length: 12 }, (_, index) => ({
    id: index === 0 ? demoRefs.alert : `demo_alert_20260927_${2309 - index}`,
    displayId: `ALT-${2309 - index}`,
    subjectRef: index === 0 ? training : index === 3 ? demoTrace.records[7]!.subjectRef : call,
    description: [
      'CP-12 快照引用缺失',
      '原始输出命中隐私规则',
      '调用模型版本未关联',
      '场景回执引用缺失',
      '审计日志时间戳缺失',
    ][index % 5]!,
    riskLevel: index === 0 ? 'high' : index % 5 === 4 ? 'low' : 'medium',
    currentStatus: index % 3 === 1 ? 'processing' : 'pending',
    stage: index === 0 ? 'training' : index === 3 ? 'application' : 'inference',
    ruleRef: index === 0 ? 'RULE-04 / snapshot-required' : 'RULE-04 / privacy-02',
    evidenceRefs: [index === 0 ? demoRefs.checkpoint : 'demo_evidence_0412'],
    supplementaryEvidenceRefs: [],
    assigneeId: index % 3 === 1 ? 'demo-reviewer' : null,
    version: 3,
    events: [
      {
        id: `event-${index}`,
        description: '系统检测产生事件；保留原始规则与证据',
        actorId: '示例检测器',
        occurredAt: index === 0 ? historical : time,
      },
    ],
    allowedActions: index % 3 === 1 ? ['evidence', 'resolve'] : ['claim'],
    resolveBlockers: ['缺少有效补证引用，RULE-04 尚未通过复核'],
    traceId: demoRefs.trace,
  }))
  const clone = <T>(value: T): T => structuredClone(value)
  const page = <T>(items: T[], number = 1, size = 5): C.CompliancePage<T> => ({
    items: clone(items.slice((number - 1) * size, number * size)),
    total: items.length,
    page: number,
    pageSize: size,
    totalPages: Math.ceil(items.length / size),
  })
  const missing = (): never => {
    throw Object.assign(new Error('未找到该对象的示例记录'), { response: { status: 404 } })
  }
  const candidates: C.ContextCandidate[] = [
    {
      sourceKind: 'model',
      sourceId: demoRefs.model,
      subjectRef: model,
      modelVersion: 'v1.4.0',
      captureId: demoRefs.capture,
      label: 'M-024 / v1.4.0 · CAP-118（独立设计示例）',
    },
    {
      sourceKind: 'training_task',
      sourceId: demoRefs.training,
      subjectRef: training,
      modelVersion: 'v1.4.0',
      captureId: null,
      label: 'TRAIN-2408 · 内容安全微调（独立设计示例）',
    },
    {
      sourceKind: 'model_call',
      sourceId: demoRefs.call,
      subjectRef: call,
      modelVersion: 'v1.4.0',
      captureId: demoRefs.capture,
      label: 'CALL-9081 · TRC-017（独立设计示例）',
    },
  ]
  const unresolved = (
    resolution: C.ComplianceContext['resolution'],
    list: C.ContextCandidate[] = [],
  ): C.ComplianceContext => ({
    resolution,
    subjectRef: null,
    taskId: null,
    inferenceId: null,
    traceId: null,
    modelId: null,
    modelVersion: null,
    captureId: null,
    candidates: clone(list),
  })
  return {
    async overview(query) {
      if (query.scope !== 'all' || query.from > time || query.to <= time)
        return {
          ...clone(demoOverview),
          scope: query.scope,
          scopeDescription: '当前筛选没有已登记的示例关系',
          expectedCount: 0,
          missingCount: 0,
          pendingReviewsCount: 0,
          completedAuditsCount: 0,
          handoffs: [],
        }
      return clone(demoOverview)
    },
    async lineage(query) {
      const graph = lineageGraph()
      const root = graph.nodes.find(
        (node) =>
          String(node.entityId) === String(query.entityId) &&
          node.entityType === query.entityType &&
          (!query.versionId || query.versionId === node.versionId),
      )
      if (!root) {
        if (
          !subjects.some(
            (s) =>
              String(s.entityId) === String(query.entityId) &&
              s.entityType === query.entityType &&
              (!query.versionId || query.versionId === s.versionId),
          )
        )
          return missing()
        const fallbackRoot = demoLineage.nodes.find(
          (n) => String(n.entityId) === String(query.entityId) && n.entityType === query.entityType,
        )!
        const ids = new Set([fallbackRoot.id])
        let changed = true
        while (changed) {
          changed = false
          for (const edge of demoLineage.edges) {
            if (
              (query.direction !== 'downstream' && ids.has(edge.toId) && !ids.has(edge.fromId)) ||
              (query.direction !== 'upstream' && ids.has(edge.fromId) && !ids.has(edge.toId))
            ) {
              ids.add(edge.fromId)
              ids.add(edge.toId)
              changed = true
            }
          }
        }
        const fallbackEdges = demoLineage.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId))
        return clone({
          nodes: demoLineage.nodes.filter((n) => ids.has(n.id)),
          edges: fallbackEdges,
          gaps: fallbackEdges.some((e) => e.verificationState === 'missing') ? [gap] : [],
        })
      }
      const ids = new Set([root.id])
      let changed = true
      while (changed) {
        changed = false
        for (const edge of graph.edges) {
          if (
            (query.direction !== 'downstream' && ids.has(edge.toId) && !ids.has(edge.fromId)) ||
            (query.direction !== 'upstream' && ids.has(edge.fromId) && !ids.has(edge.toId))
          ) {
            ids.add(edge.fromId)
            ids.add(edge.toId)
            changed = true
          }
        }
      }
      const edges = graph.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId))
      return clone({
        nodes: graph.nodes.filter((n) => ids.has(n.id)),
        edges,
        gaps: edges
          .filter((e) => e.verificationState === 'missing')
          .map((e) => ({
            reason: e.missingReason || '谱系关系缺少核验依据',
            evidenceRefs: e.evidenceRefs,
            alertId: null,
          })),
      })
    },
    async contexts(query) {
      if (query.sourceKind === 'dataset') {
        const datasetCandidates = datasetLineageCandidates()
        if (query.sourceId === undefined)
          return unresolved(
            datasetCandidates.length ? 'ambiguous' : 'not_found',
            datasetCandidates,
          )
        const datasetCandidate = datasetCandidates.find(
          (candidate) => String(candidate.sourceId) === String(query.sourceId),
        )
        return datasetCandidate
          ? unresolved('resolved', [datasetCandidate])
          : unresolved('not_found')
      }
      if (query.sourceKind === 'model' || query.sourceKind === 'training_task') {
        const typeCandidates =
          query.sourceKind === 'model' ? modelLineageCandidates() : trainingLineageCandidates()
        if (query.sourceId === undefined)
          return unresolved(typeCandidates.length ? 'ambiguous' : 'not_found', typeCandidates)
        const typeCandidate = typeCandidates.find(
          (candidate) => String(candidate.sourceId) === String(query.sourceId),
        )
        if (typeCandidate && query.sourceKind === 'model')
          return unresolved(
            'ambiguous',
            typeCandidates.filter(
              (candidate) => String(candidate.sourceId) === String(query.sourceId),
            ),
          )
        if (typeCandidate)
          return {
            ...unresolved('resolved', [typeCandidate]),
            subjectRef: structuredClone(typeCandidate.subjectRef),
            modelId: query.sourceKind === 'model' ? typeCandidate.sourceId : null,
            modelVersion: typeCandidate.modelVersion,
          }
      }
      if (query.sourceId === undefined)
        return unresolved(
          'ambiguous',
          candidates.filter((c) => c.sourceKind === query.sourceKind),
        )
      const match =
        candidates.find(
          (c) => c.sourceKind === query.sourceKind && String(c.sourceId) === String(query.sourceId),
        ) ||
        (query.sourceKind === 'trace' && query.sourceId === demoRefs.trace
          ? candidates[2]
          : undefined)
      if (match) {
        if (query.traceId && query.traceId !== demoRefs.trace) return unresolved('conflict')
        return {
          resolution: 'resolved',
          subjectRef: clone(match.subjectRef),
          taskId:
            match.sourceKind === 'training_task'
              ? 'demo_task_training_2408'
              : 'demo_task_call_9081',
          inferenceId: match.sourceKind === 'training_task' ? null : demoRefs.call,
          traceId:
            match.sourceKind === 'training_task'
              ? 'demo_trace_historical_20260921'
              : demoRefs.trace,
          modelId: demoRefs.model,
          modelVersion: match.modelVersion,
          captureId: match.captureId,
          candidates: clone([match]),
        }
      }
      // Read-only mapping of existing workspace fixture identity. No invented audit/capture links.
      const existing = createModelDemo()
      const source =
        query.sourceKind === 'model'
          ? existing.models.find((m) => m.id === query.sourceId)
          : query.sourceKind === 'training_task'
            ? existing.training.find((t) => t.id === query.sourceId)
            : query.sourceKind === 'model_call'
              ? existing.calls.find((c) => c.id === query.sourceId)
              : undefined
      if (!source) return unresolved('not_found')
      if (
        query.sourceKind === 'model_call' &&
        query.traceId &&
        'traceId' in source &&
        source.traceId !== query.traceId
      )
        return unresolved('conflict')
      if (query.sourceKind === 'model' && 'versions' in source)
        return unresolved(
          'ambiguous',
          source.versions.map((v) => ({
            sourceKind: 'model',
            sourceId: source.id,
            subjectRef: ref('model', source.id, source.id, source.name, v.version),
            modelVersion: v.version,
            captureId: null,
            label: `${source.name} / ${v.version} · 未采集激活`,
          })),
        )
      return {
        ...unresolved('resolved'),
        subjectRef: ref(query.sourceKind, source.id, source.id, '已有工作台对象'),
        modelId: 'modelId' in source ? source.modelId : source.id,
        modelVersion: 'version' in source ? source.version : null,
        traceId: 'traceId' in source ? source.traceId : null,
      }
    },
    async audits(query) {
      if (
        (query.scope && query.scope !== 'all') ||
        (query.from && query.from > time) ||
        (query.to && query.to <= time)
      )
        return page([], query.page, query.pageSize)
      return page(
        demoAudits.filter(
          (a) =>
            (!query.capabilityCode || a.capabilityCode === query.capabilityCode) &&
            (!query.subjectType || a.subjectRef.entityType === query.subjectType) &&
            (query.subjectId === undefined ||
              String(a.subjectRef.entityId) === String(query.subjectId)) &&
            (!query.versionId || a.subjectRef.versionId === query.versionId) &&
            (!query.captureId ||
              (a.result.kind === 'neuron_audit' && a.result.captureId === query.captureId)) &&
            (!query.reviewStatus || a.reviewStatus === query.reviewStatus),
        ),
        query.page,
        query.pageSize,
      )
    },
    async audit(auditId) {
      return clone(demoAudits.find((a) => a.id === auditId) ?? missing())
    },
    async trace(traceId) {
      return traceId === demoRefs.trace ? clone(demoTrace) : missing()
    },
    async alerts(query) {
      return page(
        alerts.filter(
          (a) =>
            (!query.riskLevel || a.riskLevel === query.riskLevel) &&
            (!query.status || query.status.split(',').includes(a.currentStatus)) &&
            (!query.stage || query.stage === a.stage) &&
            (!query.subjectType || a.subjectRef.entityType === query.subjectType) &&
            (query.subjectId === undefined ||
              String(a.subjectRef.entityId) === String(query.subjectId)),
        ),
        query.page,
        query.pageSize,
      )
    },
    async alert(alertId) {
      return clone(alerts.find((a) => a.id === alertId) ?? missing())
    },
    async evidence(evidenceId) {
      const dynamicGraph = lineageGraph()
      const dynamicEdges = dynamicGraph.edges.filter((edge) => edge.evidenceRefs.includes(evidenceId))
      const known = new Set([
        'demo_evidence_0305',
        ...evidenceIds,
        ...Array.from({ length: 6 }, (_, i) => `demo_evidence_0${409 + i}`),
        ...demoNeuron.abnormalNeurons.flatMap((n) => n.evidenceRefs),
        ...dynamicGraph.edges.flatMap((edge) => edge.evidenceRefs),
      ])
      if (!known.has(evidenceId)) return missing()
      const dynamicEdge = dynamicEdges[0]
      if (dynamicEdge) {
        const evidence = lineageEvidence(evidenceId, dynamicEdge, dynamicGraph)
        if (evidence) return evidence
      }
      const cp = evidenceId === demoRefs.checkpoint
      const historicalIndex = evidenceIds.indexOf(evidenceId)
      const historicalSubject =
        historicalIndex === 0
          ? subjects[0]!
          : historicalIndex === 1
            ? subjects[1]!
            : historicalIndex === 3
              ? model
              : training
      const isDatasetVersion = evidenceId === 'demo_evidence_0305'
      const isHistorical = historicalIndex >= 0 || isDatasetVersion
      const sourceModule = cp
        ? 'model-training'
        : historicalIndex === 0
          ? 'data-resource'
          : historicalIndex === 1
            ? 'data-governance'
            : historicalIndex === 3
              ? 'model-management'
              : isDatasetVersion
                ? 'data-resource'
                : evidenceId === 'demo_evidence_0414'
                  ? 'scenario'
                  : 'model-invoke'
      const sourceSubject = isDatasetVersion
        ? subjects[2]!
        : isHistorical
          ? historicalSubject
          : evidenceId === 'demo_evidence_0413'
            ? demoTrace.records[6]!.subjectRef
            : evidenceId === 'demo_evidence_0414'
              ? demoTrace.records[7]!.subjectRef
              : call
      return {
        id: evidenceId,
        displayId: cp ? 'EVD-CP12' : evidenceId.replace('demo_evidence_', 'EVD-'),
        sourceModule,
        subjectRef: clone(sourceSubject),
        occurredAt: isHistorical ? historical : time,
        sourceTraceId: isHistorical ? 'demo_trace_historical_20260921' : demoRefs.trace,
        versionRef:
          cp || evidenceId === 'demo_evidence_0302' ? 'dsv_000031' : sourceSubject.versionId,
        redactedFields: cp
          ? [
              {
                key: 'training_task_id',
                label: '训练任务',
                value: demoRefs.training,
                state: 'verified',
              },
              { key: 'checkpoint_id', label: '检查点', value: 'CP-12', state: 'verified' },
              { key: 'snapshot_ref', label: '快照引用', value: null, state: 'missing' },
            ]
          : [
              {
                key: 'excerpt',
                label: '脱敏证据摘要',
                value: '仅展示经授权的示例摘要；个人身份字段已遮蔽。',
                state: 'verified',
              },
            ],
        integrityState: cp ? 'missing' : 'verified',
        allowedActions: ['copy', 'open_source'],
      }
    },
    async alertAction(alertId, action, data) {
      const alert = alerts.find((a) => a.id === alertId) ?? missing()
      if (alert.version !== data.expectedVersion)
        throw Object.assign(new Error('示例版本冲突，请刷新'), { response: { status: 409 } })
      if (!alert.allowedActions.includes(action)) throw new Error('当前状态不允许此操作')
      if (action === 'resolve')
        throw new Error('示例未提供通过规则核验的补证，不能关闭；未执行后端写入')
      if (action === 'evidence')
        throw new Error('设计示例为只读证据，没有可追加的有效补证；请联调真实后端')
      alert.currentStatus = 'processing'
      alert.assigneeId = '示例复核员（仅内存演示）'
      alert.version++
      alert.allowedActions = ['evidence', 'resolve']
      alert.events.push({
        id: 'demo-claim',
        actorId: alert.assigneeId,
        description: '示例认领，未写入后端',
        occurredAt: time,
      })
      return clone(alert)
    },
    async review() {
      throw new Error('示例审计只读，人工复核需接入后端持久化')
    },
    async execute() {
      throw new Error('演示模式不执行审计算法，请切换真实接口并接入后端')
    },
    async task() {
      return missing()
    },
  }
}
