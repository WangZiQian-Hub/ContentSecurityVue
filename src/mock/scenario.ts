import type {
  AnalysisRecord,
  ScenarioCode,
  ScenarioMaterial,
  ScenarioModel,
  ScenarioResult,
} from '../types/scenario'
/* 场景应用的演示数据。
 *
 * 模型服务（8001）未就绪时用它支撑页面演示：六个场景各有一套完整结果，
 * 字段结构与文档第 4.2 / 4.3 节一致，因此结果区的渲染路径与真实数据完全相同。
 * 文档第 3 行已声明示例不代表真实模型已执行，这里同样只用于演示。
 */
const NOW = '2026-10-09T09:59:58+00:00'
const CIT = (sourceId: string, quote: string) => ({ sourceId, quote })

export const scenarioDemoModels: ScenarioModel[] = [
  {
    modelId: 'model-demo-content',
    upstreamModelId: 'demo-content-model',
    name: '内容安全分析模型（演示）',
    description: '演示数据，不代表真实模型输出',
    baseUrl: 'https://provider.example/v1',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    modelId: 'model-demo-multimodal',
    upstreamModelId: 'demo-multimodal-model',
    name: '多模态审核模型（演示）',
    description: '演示数据，不代表真实模型输出',
    baseUrl: 'https://provider.example/v1',
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const DEMO_RESULTS: Record<ScenarioCode, ScenarioResult> = {
  public_opinion: {
    scenarioCode: 'public_opinion',
    summary: '公众对社区活动安排存在分歧，整体情绪以观望为主，尚未形成明显对立',
    riskLevel: 'medium',
    evidence: [CIT('input', '部分居民对活动时间与场地分配存在不同意见')],
    recommendations: ['在官方渠道统一发布活动安排说明', '对集中质疑点做一次性回应，避免反复解释'],
    limitations: ['仅依据提交的正文材料，未采集其他平台舆情数据'],
    insufficientMaterials: false,
    details: {
      type: 'public_opinion',
      sentiment: 'mixed',
      sentimentEvidence: [CIT('input', '部分居民对活动时间与场地分配存在不同意见')],
      issues: [
        {
          text: '活动时间与部分居民作息冲突',
          evidence: [CIT('input', '部分居民对活动时间与场地分配存在不同意见')],
        },
        {
          text: '场地分配标准未公开，居民认为缺少依据',
          evidence: [CIT('input', '场地分配存在不同意见')],
        },
      ],
      controversies: [
        { text: '是否应按人数比例重新分配场地', evidence: [CIT('input', '相关讨论在社区群内引发关注')] },
      ],
      communicationAdvice: [
        '公布场地分配的具体标准与依据',
        '说明活动时间的确定过程',
        '保留意见反馈渠道并公示处理结果',
      ],
    },
  },
  hot_events: {
    scenarioCode: 'hot_events',
    summary: '事件脉络基本清晰，但灾后处置结果缺少公开信息',
    riskLevel: 'medium',
    evidence: [CIT('m1', '发布暴雨橙色预警')],
    recommendations: ['补充发布灾后处置进展', '统一各渠道发布口径'],
    limitations: ['缺少灾后处置阶段的材料，趋势判断依据不足'],
    insufficientMaterials: false,
    details: {
      type: 'hot_events',
      eventSummary: '某地暴雨预警发布与应急响应过程回顾，从预警发布到响应启动共经历两个阶段。',
      timeline: [
        { text: '发布暴雨橙色预警', time: '2026-07-01', sourceId: 'm1', evidence: [CIT('m1', '发布暴雨橙色预警')] },
        { text: '启动Ⅱ级应急响应', time: '2026-07-02', sourceId: 'm2', evidence: [CIT('m2', '启动Ⅱ级响应')] },
        { text: '组织人员转移安置', time: '2026-07-03', sourceId: 'm3', evidence: [CIT('m3', '组织转移安置工作')] },
      ],
      focalPoints: [{ text: '预警发布是否及时', evidence: [CIT('m1', '发布暴雨橙色预警')] }],
      contradictions: [{ text: '响应启动时间的说法不完全一致', evidence: [CIT('m2', '启动Ⅱ级响应')] }],
      informationGaps: ['缺少灾后处置与恢复阶段的公开材料', '转移安置的具体人数未公布'],
      trend: {
        text: '材料显示应对节奏逐步加快',
        evidence: [CIT('m1', '发布暴雨橙色预警'), CIT('m2', '启动Ⅱ级响应')],
      },
    },
  },
  cross_cultural: {
    scenarioCode: 'cross_cultural',
    summary: '原文整体表达得体，个别用语在目标文化语境下可能产生歧义',
    riskLevel: 'low',
    evidence: [CIT('input', '文化交流活动')],
    recommendations: ['对外发布前由熟悉目标语种的同事复核'],
    limitations: ['仅依据提交正文，未收集目标受众的实际反馈'],
    insufficientMaterials: false,
    details: {
      type: 'cross_cultural',
      culturalContexts: [
        { text: '该活动在当地属于正式公共事务', evidence: [CIT('input', '文化交流活动')] },
      ],
      ambiguities: [{ text: '个别措辞可能被理解为单方面决定', evidence: [CIT('input', '活动说明')] }],
      expressionSuggestions: ['改用更中性的表述说明安排过程', '补充征求意见的环节描述'],
      translation: {
        targetLanguage: 'en',
        text: 'The community has been arranging public activities in a multi-ethnic residential area.',
      },
    },
  },
  ethnic_governance: {
    scenarioCode: 'ethnic_governance',
    summary: '分歧集中在活动安排的信息公开程度，暂未发现对立性表达',
    riskLevel: 'medium',
    evidence: [CIT('input', '部分居民对活动时间与场地分配存在不同意见')],
    recommendations: ['由社区牵头召开一次居民议事会', '在公告中补充安排依据'],
    limitations: ['仅依据提交的正文材料，未涉及其他渠道信息'],
    insufficientMaterials: false,
    details: {
      type: 'ethnic_governance',
      issues: [
        {
          text: '活动时间与场地分配缺少公开标准',
          evidence: [CIT('input', '部分居民对活动时间与场地分配存在不同意见')],
        },
        { text: '意见反馈渠道不明确', evidence: [CIT('input', '相关讨论在社区群内引发关注')] },
      ],
      misunderstandings: [
        { text: '部分居民认为安排已最终确定、无法更改', evidence: [CIT('input', '相关讨论在社区群内引发关注')] },
      ],
      conflictExpressions: [{ text: '讨论中出现情绪化表述', evidence: [CIT('input', '引发关注')] }],
      coordinationAdvice: [
        '公布场地分配标准与依据',
        '明确意见反馈渠道与处理时限',
        '组织居民代表参与后续活动安排讨论',
      ],
    },
  },
  smart_government: {
    scenarioCode: 'smart_government',
    summary: '提交材料明确了身份证明的提交要求',
    riskLevel: 'low',
    evidence: [CIT('policy-1', '申请人应提交身份证明。')],
    recommendations: ['核对材料是否为当前适用版本'],
    limitations: ['仅依据提交的测试材料'],
    insufficientMaterials: false,
    details: {
      type: 'smart_government',
      answer: '申请人应提交身份证明。',
      policyClaims: [{ text: '申请人应提交身份证明。', evidence: [CIT('policy-1', '申请人应提交身份证明。')] }],
      processingPoints: [],
      insufficientMaterials: false,
    },
  },
  cyber_security: {
    scenarioCode: 'cyber_security',
    summary: '未发现明确的网络攻击特征，但存在账号信息暴露的迹象',
    riskLevel: 'low',
    evidence: [CIT('input', '异常登录记录')],
    recommendations: ['提醒相关人员更换口令并开启二次验证'],
    limitations: ['未进行实际的网络扫描，仅依据提交材料判断'],
    insufficientMaterials: false,
    details: {
      type: 'cyber_security',
      riskTypes: [{ text: '账号信息可能暴露', evidence: [CIT('input', '异常登录记录')] }],
      suspiciousSigns: [
        { text: '存在可关联到个人的账号标识', evidence: [CIT('input', '异常登录记录')] },
      ],
      handlingAdvice: ['立即更换相关账号口令', '开启二次验证', '排查账号近期登录记录'],
    },
  },
}

/** 每个场景被分析的正文，对应保存记录里的 input.content。
 *  结果区会把它显示在「分析对象」里，回看历史时才说得清结论是针对什么得出的。 */
const DEMO_CONTENT: Record<ScenarioCode, string> = {
  public_opinion:
    '近期社区在讨论公共活动的时间与场地分配问题，部分居民对活动时间与场地分配存在不同意见，相关讨论在社区群内引发关注。',
  hot_events:
    '材料记录了某地暴雨从预警发布、启动应急响应到组织人员转移安置的完整过程，希望梳理事件脉络与信息缺口。',
  cross_cultural:
    '我们计划在下月举办一场面向多国参与者的文化交流活动，需要对外发布一份活动说明，请评估表述是否妥当。',
  ethnic_governance:
    '某社区在推进多民族聚居区的公共活动安排时，部分居民对活动时间与场地分配存在不同意见，相关讨论在社区群内引发关注。',
  smart_government: '申请时需要提交什么？',
  cyber_security:
    '近期发现部分账号存在异常登录记录，相关账号描述与排查线索整理如下，请判断风险类型与处置方式。',
}

/** 引用里出现非 input 的 source_id 时，必须能在材料里找到对应条目。 */
const DEMO_MATERIALS: Partial<Record<ScenarioCode, ScenarioMaterial[]>> = {
  hot_events: [
    { id: 'm1', title: '预警通报', time: '2026-07-01', content: '发布暴雨橙色预警，提示相关区域做好防范。' },
    { id: 'm2', title: '响应通知', time: '2026-07-02', content: '启动Ⅱ级响应，要求各部门到岗到位。' },
    { id: 'm3', title: '安置简报', time: '2026-07-03', content: '组织转移安置工作，具体人数待统计。' },
  ],
  smart_government: [
    { id: 'policy-1', title: '办事指南（测试材料）', time: '2026-10-09', content: '申请人应提交身份证明。' },
  ],
}

/** 模型完整回答的原文。
 *
 * 对应记录里的 original_output。文档第 281 行说明该字段目前只用于生成治理，
 * 场景分析为 null；这里放演示文本是为了让页面能展示这个位置的设计，
 * 真实返回是否有值取决于模型服务是否开始输出原始回答。 */
const DEMO_RAW_ANSWER: Record<ScenarioCode, string> = {
  public_opinion:
    '从材料看，公众讨论集中在公共活动的时间与场地分配上。情感倾向整体偏混合：一方面居民希望了解安排依据，另一方面讨论仍在社区群内进行，尚未形成明显对立。\n\n主要议题有两项：一是活动时间与部分居民作息冲突；二是场地分配标准未公开，居民认为缺少依据。争议点在于是否应按人数比例重新分配场地。\n\n沟通建议：公布场地分配的具體标准与依据，说明活动时间的确定过程，并保留意见反馈渠道、公示处理结果。以上判断仅依据提交的正文材料。',
  hot_events:
    '本次事件脉络如下：7月1日发布暴雨橙色预警，提示相关区域做好防范；7月2日启动Ⅱ级响应，要求各部门到岗到位；7月3日组织转移安置工作。从三份材料看，应对节奏逐步加快。\n\n关注焦点是预警发布是否及时。材料之间也存在一处不一致：响应启动时间的说法不完全一致。\n\n信息缺口有两处：一是缺少灾后处置与恢复阶段的公开材料，二是转移安置的具体人数尚未公布。由于缺少后续阶段材料，趋势判断依据不足。',
  cross_cultural:
    '原文整体表达得体，属于正式公共事务的表述范围，没有发现冒犯性用语。\n\n文化背景方面，"文化交流活动"在当地属于正式公共事务的表达。歧义点在于"活动说明"这一措辞，可能被理解为单方面决定。\n\n表达建议：改用更中性的表述说明安排过程，并补充征求意见的环节描述。\n\n参考译文（en）：The community has been arranging public activities in a multi-ethnic residential area.',
  ethnic_governance:
    '材料反映的分歧集中在活动安排的信息公开程度，暂未发现对立性表达。\n\n主要议题有两点：一是活动时间与场地分配缺少公开标准；二是意见反馈渠道不明确。可能的误解点在于，部分居民认为安排已最终确定、无法更改。讨论中出现了情绪化表述。\n\n协调建议：公布场地分配标准与依据；明确意见反馈渠道与处理时限；组织居民代表参与后续活动安排讨论。以上判断仅依据提交的正文材料，未涉及其他渠道信息。',
  smart_government:
    '根据提交的办事指南，申请人应提交身份证明。\n\n政策依据为办事指南中的原文："申请人应提交身份证明。"材料中未提及其他办理要求，因此没有额外的办理要点。\n\n建议在正式答复前核对所用材料是否为当前适用版本。',
  cyber_security:
    '经梳理，未发现明确的网络攻击特征。\n\n风险类型方面，主要是账号信息可能暴露。可疑迹象为存在可关联到个人的账号标识，材料中提到了异常登录记录。\n\n处置建议：立即更换相关账号口令；开启二次验证；排查账号近期登录记录。\n\n需要说明的是，以上判断仅依据提交材料，未进行实际的网络扫描。',
}

export function scenarioDemoResult(code: ScenarioCode): ScenarioResult {
  return structuredClone(DEMO_RESULTS[code])
}

export function scenarioDemoRecord(code: ScenarioCode, id: string): AnalysisRecord {
  const materials = DEMO_MATERIALS[code]
  return {
    id,
    kind: 'scenario',
    scenarioCode: code,
    modelId: scenarioDemoModels[0]!.modelId,
    input: {
      modelId: scenarioDemoModels[0]!.modelId,
      scenarioCode: code,
      content: DEMO_CONTENT[code],
      language: 'zh',
      ...(materials ? { materials } : {}),
    },
    createdAt: NOW,
    status: 'succeeded',
    stage: code,
    result: scenarioDemoResult(code),
    originalOutput: DEMO_RAW_ANSWER[code],
    calls: [{ stage: code, callId: `call-demo-${code}`, status: 'success', errorCode: null }],
    errorCode: null,
    errorMessage: null,
    elapsedMs: 2140,
    finishedAt: NOW,
  }
}

/** 每个场景给三条历史记录，状态各不相同，用于演示记录表与「查看」回看。 */
export function scenarioDemoRecords(code: ScenarioCode): AnalysisRecord[] {
  return [
    scenarioDemoRecord(code, `analysis-demo-${code}-1`),
    { ...scenarioDemoRecord(code, `analysis-demo-${code}-2`), status: 'failed', result: null, stage: 'governance', errorCode: 'provider_timeout', errorMessage: 'Model provider timed out', elapsedMs: 120000 },
    { ...scenarioDemoRecord(code, `analysis-demo-${code}-3`), elapsedMs: 1870 },
  ]
}

/** 按 ID 取记录时必须在同一批演示记录里查，否则失败记录被「查看」会显示成成功。 */
export function scenarioDemoRecordById(id: string): AnalysisRecord {
  const code = (id.replace(/^analysis-demo-/, '').replace(/-\d+$/, '') ||
    'public_opinion') as ScenarioCode
  const list = scenarioDemoRecords(code)
  return list.find((item) => item.id === id) ?? list[0]!
}
