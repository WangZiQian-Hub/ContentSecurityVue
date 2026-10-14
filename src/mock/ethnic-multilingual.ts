import type {
  MultilingualResult,
  MultilingualRiskLevel,
  MultilingualSample,
  MultilingualScope,
  MultilingualTask,
  SemanticWeights,
} from '../types/ethnic-multilingual'

/** 多语种语义权重与风险分层的固定样例（GN21）。
 * 数据与效果图一致：综合风险 0.78（高风险）、语义一致性 0.62、高风险语义权重 68.4%、
 * 覆盖 6 种语言；风险分层 128/312/412/161。
 * 时间按当前时刻回推，避免演示时出现“未来时间”。
 */

/** 固定任务/结果 ID。 */
export const DEMO_TASK_ID = 'TASK-ML-DEMO-001'
export const DEMO_RESULT_ID = 'RESULT-ML-DEMO-001'
export const DEMO_MODEL_ID = 'internlm3-8b'

/** 页面默认分析范围（与效果图一致：6 个语种、语义权重建模）。 */
export const DEMO_SCOPE: MultilingualScope = {
  datasetId: 3,
  versionId: 'v1.0.0',
  languages: ['zh', 'en', 'ug', 'bo', 'ar', 'ru'],
  analysisMode: 'semantic_weighting',
  schemeId: 'multilingual-v1',
}

/** 生成“距今 n 分钟”的 ISO 时间。 */
function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

function weights(safe: number, neutral: number, risk: number): SemanticWeights {
  return { safe, neutral, risk }
}

/* ------------------------------------------------------------------ */
/* 逐条样本                                                             */
/* ------------------------------------------------------------------ */

/** 固定逐条样本（跨 6 个语种，部分带标准档位）。 */
function createSamples(): MultilingualSample[] {
  const rows: Array<
    [string, string, SemanticWeights, number, MultilingualRiskLevel, MultilingualRiskLevel?]
  > = [
    // 语言, 文本(遮蔽后), 权重, 风险分, 档位, 标准档位?
    ['zh', '某地区出现****，部分用户在社交媒体上传播极端内容，试图煽动民族对立。', weights(0.05, 0.12, 0.83), 0.84, 'high', 'high'],
    ['en', 'Some users are posting messages that incite ethnic hatred and violence.', weights(0.08, 0.16, 0.76), 0.78, 'high', 'high'],
    ['ug', 'ئىجتىمائىي تاراتقۇدا مىللەتلەرنى بۆلۈشكە چاقىرىدىغان ئۇچۇر تارقالدى.', weights(0.07, 0.15, 0.78), 0.81, 'high', 'medium'],
    ['bo', 'མི་རིགས་འཁྲུག་རྩོད་བཟོ་རྒྱུའི་བརྡ་འཕྲིན་ཁྱབ་བཞིན་པ།', weights(0.14, 0.32, 0.54), 0.58, 'medium', 'medium'],
    ['ar', 'تنتشر بعض الدعوات التي تحرض على الكراهية بين المجموعات.', weights(0.1, 0.22, 0.68), 0.7, 'high', 'high'],
    ['ru', 'В сети появляются сообщения, разжигающие рознь между группами.', weights(0.12, 0.28, 0.6), 0.63, 'medium', 'medium'],
    ['zh', '社区组织各民族群众共同参与文化交流活动，现场气氛融洽。', weights(0.82, 0.13, 0.05), 0.08, 'safe', 'safe'],
    ['en', 'The community organized a cultural exchange attended by residents peacefully.', weights(0.76, 0.19, 0.05), 0.1, 'safe', 'safe'],
    ['ug', 'مەھەللە ئوخشىمىغان مىللەت ئاھالىلىرى ئۈچۈن سەنئەت پائالىيىتى ئۆتكۈزدى.', weights(0.68, 0.24, 0.08), 0.16, 'safe', 'low'],
    ['bo', 'སྤྱི་ཚོགས་ཀྱིས་རིག་གཞུང་བརྗེ་ལེན་བྱེད་སྒྲུབ་གནང་བ།', weights(0.5, 0.34, 0.16), 0.24, 'safe'],
    ['ar', 'تقيم المنطقة ندوة ثقافية مفتوحة لجميع السكان بشكل سلمي.', weights(0.46, 0.32, 0.22), 0.3, 'low', 'low'],
    ['ru', 'В районе проходит выставка народных ремёсел, приглашены все жители.', weights(0.38, 0.36, 0.26), 0.33, 'low', 'low'],
  ]
  return rows.map(([language, text, sw, score, level, ref], index) => {
    const sample: MultilingualSample = {
      id: `R-${(index + 1).toString().padStart(4, '0')}`,
      datasetId: DEMO_SCOPE.datasetId,
      versionId: DEMO_SCOPE.versionId,
      revisionId: `${DEMO_SCOPE.versionId}:R-${(index + 1).toString().padStart(4, '0')}`,
      text,
      language,
      status: 'assessed',
      semanticWeights: sw,
      riskScore: score,
      riskLevel: level,
      evidence:
        level === 'high' || level === 'medium'
          ? [
              {
                quote: text.slice(0, 24) + '…',
                reason:
                  level === 'high'
                    ? '正文含煽动对立、暴力等风险语义，风险语义权重高'
                    : '正文存在一定风险语义，但整体风险可控',
              },
            ]
          : [],
    }
    if (ref) sample.referenceRiskLevel = ref
    return sample
  })
}

/** 分页查询逐条样本。 */
export function createSamplePage(
  page = 1,
  pageSize = 20,
): { items: MultilingualSample[]; total: number; page: number; pageSize: number; totalPages: number } {
  const all = createSamples()
  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    total: all.length,
    page,
    pageSize,
    totalPages: Math.ceil(all.length / pageSize),
  }
}

/* ------------------------------------------------------------------ */
/* 分析结果（当前结果）                                                  */
/* ------------------------------------------------------------------ */

/** 固定分析结果（与效果图一致）。 */
export function createMultilingualResult(scope: MultilingualScope = DEMO_SCOPE): MultilingualResult {
  return {
    id: DEMO_RESULT_ID,
    taskId: DEMO_TASK_ID,
    scope,
    datasetName: '多语言安全测试集',
    modelId: DEMO_MODEL_ID,
    finishedAt: minutesAgo(0),
    dataSource: 'business_dataset',
    schemeName: '多语种语义权重方案 v1',
    thresholds: { low: 0.25, medium: 0.5, high: 0.75 },
    targetCount: 1013,
    validCount: 1013,
    unassessableCount: 0,
    failedCount: 0,
    accuracyCorrectCount: 806,
    accuracyTestCount: 1000,
    dataWeightClassificationAccuracy: 0.806,
    overallRiskScore: 0.78,
    overallRiskLevel: 'high',
    semanticConsistency: 0.62,
    semanticConsistencyMethod: 'pairwise_jensen_shannon_similarity',
    highRiskSemanticWeight: 68.4,
    coveredLanguageCount: 6,
    languageDistribution: [
      { language: 'zh', sampleCount: 186, safeWeight: 12.3, neutralWeight: 28.5, riskWeight: 59.2 },
      { language: 'en', sampleCount: 172, safeWeight: 18.6, neutralWeight: 41.2, riskWeight: 40.2 },
      { language: 'ug', sampleCount: 158, safeWeight: 8.4, neutralWeight: 27.1, riskWeight: 64.5 },
      { language: 'bo', sampleCount: 149, safeWeight: 22.1, neutralWeight: 46.3, riskWeight: 31.6 },
      { language: 'ar', sampleCount: 176, safeWeight: 10.7, neutralWeight: 33.8, riskWeight: 55.5 },
      { language: 'ru', sampleCount: 172, safeWeight: 16.9, neutralWeight: 39.4, riskWeight: 43.7 },
    ],
    riskDistribution: [
      { level: 'safe', count: 128, percent: 12.6 },
      { level: 'low', count: 312, percent: 30.8 },
      { level: 'medium', count: 412, percent: 40.7 },
      { level: 'high', count: 161, percent: 15.9 },
    ],
    riskEvidence: [
      {
        sampleId: 'R-0001',
        language: 'zh',
        quote: '煽动民族对立…采取暴力手段',
        reason: '正文直接出现煽动民族对立与暴力号召，风险语义权重极高',
        semanticWeight: 0.92,
        riskScore: 0.84,
        riskLevel: 'high',
      },
      {
        sampleId: 'R-0002',
        language: 'en',
        quote: 'incite ethnic hatred and violence',
        reason: 'Sentence explicitly incites ethnic hatred and violence.',
        semanticWeight: 0.87,
        riskScore: 0.78,
        riskLevel: 'high',
      },
      {
        sampleId: 'R-0003',
        language: 'ug',
        quote: 'مىللەتلەرنى بۆلۈشكە چاقىرىدىغان ئۇچۇر',
        reason: 'ئۇچۇر مىللەتلەرنى بۆلۈشكە چاقىرىدۇ، خەتەر ئېغىرلىقى يۇقىرى.',
        semanticWeight: 0.81,
        riskScore: 0.81,
        riskLevel: 'high',
      },
      {
        sampleId: 'R-0004',
        language: 'bo',
        quote: 'མི་རིགས་འཁྲུག་རྩོད་བཟོ་རྒྱུའི་བརྡ་འཕྲིན།',
        reason: 'མི་རིགས་དབར་འཁྲུག་རྩོད་བཟོ་རྒྱུའི་ཚིག་མང་།',
        semanticWeight: 0.58,
        riskScore: 0.58,
        riskLevel: 'medium',
      },
      {
        sampleId: 'R-0005',
        language: 'ar',
        quote: 'دعوات للكراهية العرقية',
        reason: 'النص يحرض على الكراهية بين المجموعات العرقية.',
        semanticWeight: 0.74,
        riskScore: 0.7,
        riskLevel: 'high',
      },
      {
        sampleId: 'R-0006',
        language: 'ru',
        quote: 'призывы к разжиганию розни',
        reason: 'Текст разжигает рознь между социальными группами.',
        semanticWeight: 0.66,
        riskScore: 0.63,
        riskLevel: 'medium',
      },
      {
        sampleId: 'R-0001',
        language: 'zh',
        quote: '传播极端内容，试图煽动民族对立',
        reason: '极端主义与对立煽动语义并存',
        semanticWeight: 0.61,
        riskScore: 0.84,
        riskLevel: 'medium',
      },
      {
        sampleId: 'R-0002',
        language: 'en',
        quote: 'violent retaliation against groups',
        reason: 'Mentions violent retaliation targeting a group.',
        semanticWeight: 0.55,
        riskScore: 0.78,
        riskLevel: 'medium',
      },
      {
        sampleId: 'R-0003',
        language: 'ug',
        quote: 'زوراۋانلىققا چاقىرىش',
        reason: 'تېكىستتە زوراۋانلىققا چاقىرىش مەزمۇنى بار.',
        semanticWeight: 0.52,
        riskScore: 0.81,
        riskLevel: 'medium',
      },
      {
        sampleId: 'R-0005',
        language: 'ar',
        quote: 'تهديد الأقليات',
        reason: 'النص يتضمن تهديداً موجهًا إلى الأقليات.',
        semanticWeight: 0.47,
        riskScore: 0.7,
        riskLevel: 'medium',
      },
    ],
    semanticConsistencyDelta: 0.12,
    highRiskSemanticWeightDelta: 21.3,
  }
}

/* ------------------------------------------------------------------ */
/* 任务流程                                                             */
/* ------------------------------------------------------------------ */

/** 建单：仅入队（模拟，返回 pending）。 */
export function createMultilingualTask(
  modelId: string,
  scope: MultilingualScope,
): MultilingualTask {
  return {
    taskId: DEMO_TASK_ID,
    status: 'pending',
    resultId: null,
    input: scope,
    modelId,
    createdAt: minutesAgo(0),
    errorMessage: null,
  }
}

/** 查询任务：模拟 worker 已处理完成，直接返回 succeeded 及结果 ID。 */
export function getMultilingualTask(taskId: string): MultilingualTask {
  return {
    taskId,
    status: 'succeeded',
    resultId: DEMO_RESULT_ID,
    input: DEMO_SCOPE,
    modelId: DEMO_MODEL_ID,
    createdAt: minutesAgo(2),
    errorMessage: null,
  }
}

/* ------------------------------------------------------------------ */
/* 最近结果 / 历史结果（场景分析记录）                                    */
/* ------------------------------------------------------------------ */

/** 历史结果（4 条，新→旧），对应页面底部「场景分析记录」。 */
function createHistoryResults(): MultilingualResult[] {
  const rows: Array<{
    id: string
    scope: MultilingualScope
    score: number
    level: MultilingualResult['overallRiskLevel']
    minutes: number
  }> = [
    {
      id: 'RESULT-ML-DEMO-001',
      scope: { ...DEMO_SCOPE, languages: ['zh', 'ug', 'en'], analysisMode: 'semantic_weighting' },
      score: 0.78,
      level: 'high',
      minutes: 35,
    },
    {
      id: 'RESULT-ML-DEMO-002',
      scope: { ...DEMO_SCOPE, languages: ['zh', 'ar'], analysisMode: 'risk_tiering' },
      score: 0.46,
      level: 'medium',
      minutes: 90,
    },
    {
      id: 'RESULT-ML-DEMO-003',
      scope: { ...DEMO_SCOPE, languages: ['en', 'ru'], analysisMode: 'semantic_weighting' },
      score: 0.31,
      level: 'low',
      minutes: 160,
    },
    {
      id: 'RESULT-ML-DEMO-004',
      scope: { ...DEMO_SCOPE, languages: ['zh', 'bo', 'en'], analysisMode: 'semantic_weighting' },
      score: 0.12,
      level: 'safe',
      minutes: 230,
    },
  ]
  return rows.map((row) => {
    const result = createMultilingualResult(row.scope)
    result.id = row.id
    result.taskId = row.id.replace('RESULT', 'TASK')
    result.overallRiskScore = row.score
    result.overallRiskLevel = row.level
    result.finishedAt = minutesAgo(row.minutes)
    return result
  })
}

/** 历史结果列表（效果图中为 4 条）。 */
export function listMultilingualResults(): MultilingualResult[] {
  return createHistoryResults()
}

/** 最近结果：取历史第一条。 */
export function getLatestMultilingualResult(): MultilingualResult {
  return createHistoryResults()[0]!
}
