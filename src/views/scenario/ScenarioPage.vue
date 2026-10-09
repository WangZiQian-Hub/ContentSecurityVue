<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import TaskTable from '../../components/TaskTable.vue'
import ScenarioResult from '../../components/scenario/ScenarioResult.vue'
import ScenarioRecords from '../../components/scenario/ScenarioRecords.vue'
import { llmTokenConfigured } from '../../api/governance-llm'
import {
  describeModels,
  isScenarioDemo,
  listScenarioModels,
  runScenario,
  useScenarioLlm,
} from '../../api/scenario'
import { navigation } from '../../router/navigation'
import {
  toScenarioCode,
  type AnalysisRecord,
  type ScenarioMaterial,
  type ScenarioModel,
  type ScenarioOutcome,
} from '../../types/scenario'
/* 场景应用：六个页签共用本页面，按路由页签名映射到文档第 4.1 节的场景编码。
   模型模式下输入区与结果区直连模型服务；业务后端模式沿用统一能力入口，
   并把结果区回退为原始结果展示（该接口不返回分析结构）。 */
const route = useRoute()
const llmMode = useScenarioLlm()
/** 演示模式：模型服务未就绪时用本地样例支撑演示，页面会明确标注。 */
const demo = isScenarioDemo()
const scenarioCode = computed(() => toScenarioCode(route.params.tab))
/** 页签缺省时按第一个场景处理，与页签高亮规则保持一致。 */
const activeCode = computed(() => scenarioCode.value || 'public_opinion')
const name = computed(
  () =>
    navigation
      .find((item) => item.path === '/scenario')
      ?.tabs.find((tab) => tab.path === route.params.tab)?.title || '舆情分析',
)

const models = ref<ScenarioModel[]>([])
const modelsReady = ref(false)
const modelsHint = ref('')
const selectedModel = ref('')
const content = ref('')
/** 正文语言，对应请求字段 language。文档第 105 行要求传语言代码，不能传「中文」这类名称。 */
const contentLanguage = ref('zh')
const materials = ref<ScenarioMaterial[]>([])
const targetLanguage = ref('en')

/** 文档第 105 行：语言用 2–8 位字母的代码，可接 - 分隔的字母数字段，
 *  不能传「中文」「英语」这类名称。允许自由输入其他代码，但必须符合这个格式。 */
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/
/** 常用目标语言，其余代码可在下拉框里直接输入。 */
const targetLanguageOptions = [
  { label: '英语 (en)', value: 'en' },
  { label: '日语 (ja)', value: 'ja' },
  { label: '韩语 (ko)', value: 'ko' },
  { label: '俄语 (ru)', value: 'ru' },
  { label: '法语 (fr)', value: 'fr' },
  { label: '德语 (de)', value: 'de' },
  { label: '西班牙语 (es)', value: 'es' },
  { label: '阿拉伯语 (ar)', value: 'ar' },
  { label: '繁体中文 (zh-Hant)', value: 'zh-Hant' },
]
const running = ref(false)
const outcome = ref<ScenarioOutcome | null>(null)
const records = ref<InstanceType<typeof ScenarioRecords> | null>(null)

const canSubmit = computed(
  () => content.value.trim().length > 0 && (!llmMode || modelsReady.value),
)

/** 文档第 4.1 节的硬性限制；本地先拦一遍，避免把明显不合法的请求发出去。 */
function validate() {
  if (llmMode && !modelsReady.value)
    return modelsHint.value || '模型目录不可用，请先填写令牌或联系模型接入同学。'
  if (llmMode && !selectedModel.value) return '请先选择模型。'
  if (llmMode && selectedModel.value.length > 128) return '模型 ID 不能超过 128 字符。'
  if (!content.value.trim()) return '请输入待分析的正文。'
  if (content.value.length > 50000) return '正文不能超过 50000 字符。'
  const ids = materials.value.map((item) => item.id.trim())
  if (ids.some((id) => !id)) return '参考材料的 ID 不能为空。'
  if (ids.includes('input')) return '材料 ID 不能使用保留值 input。'
  if (new Set(ids).size !== ids.length) return '参考材料的 ID 不能重复。'
  if (materials.value.length > 50) return '参考材料最多 50 条。'
  if (ids.some((id) => id.length > 128)) return '材料 ID 不能超过 128 字符。'
  if (materials.value.some((item) => (item.title ?? '').length > 128))
    return '材料标题不能超过 128 字符。'
  if (materials.value.some((item) => (item.time ?? '').length > 128))
    return '材料时间不能超过 128 字符。'
  if (materials.value.some((item) => !item.content.trim())) return '参考材料的正文不能为空。'
  if (materials.value.some((item) => item.content.length > 50000))
    return '单条材料的正文不能超过 50000 字符。'
  if (
    activeCode.value === 'cross_cultural' &&
    !LANGUAGE_PATTERN.test(contentLanguage.value.trim())
  )
    return '内容语言要填语言代码（如 zh、en、zh-CN），不能填「中文」这类名称。'
  if (
    activeCode.value === 'cross_cultural' &&
    targetLanguage.value.trim() &&
    !LANGUAGE_PATTERN.test(targetLanguage.value.trim())
  )
    return '目标语言要填语言代码（如 en、ja、pt-BR），不能填「英语」这类名称。'
  const total = content.value.length + materials.value.reduce((n, m) => n + m.content.length, 0)
  if (total > 200000) return '正文与所有材料正文合计不能超过 200000 字符。'
  return ''
}

async function loadModels() {
  modelsReady.value = false
  try {
    const list = await listScenarioModels()
    models.value = list
    const state = describeModels(list)
    modelsReady.value = state.ready
    modelsHint.value = state.message
    if (state.ready && !list.some((item) => item.modelId === selectedModel.value))
      selectedModel.value = list[0]!.modelId
  } catch (cause) {
    // 目录读取失败的原因各不相同（没有令牌、不是模型服务、目录为空），
    // 直接把接口层给出的说明显示出来，不要统一成一句笼统的话。
    models.value = []
    modelsReady.value = false
    modelsHint.value = cause instanceof Error ? cause.message : '模型目录读取失败。'
  }
}

/** 令牌栏挂在全局布局里，页面通过响应式标记感知令牌变化并重新取模型目录。
 *  业务后端模式不显示模型下拉框，无需请求目录。 */
function loadModelsIfPossible() {
  if (!llmMode) return
  if (demo || llmTokenConfigured.value) void loadModels()
}

function addMaterial() {
  materials.value.push({ id: `material-${materials.value.length + 1}`, content: '' })
}

async function submit() {
  const problem = validate()
  if (problem) {
    ElMessage.warning(problem)
    return
  }
  running.value = true
  try {
    const result = await runScenario({
      modelId: selectedModel.value,
      scenarioCode: activeCode.value,
      content: content.value,
      language: contentLanguage.value,
      materials: materials.value.filter((item) => item.id.trim() && item.content.trim()),
      targetLanguage: activeCode.value === 'cross_cultural' ? targetLanguage.value : undefined,
    })
    outcome.value = result
    if (result.mode === 'llm') {
      ElMessage[result.record.status === 'succeeded' ? 'success' : 'warning'](
        result.record.status === 'succeeded' ? '场景分析完成' : '分析未完成，记录已保存',
      )
      void records.value?.reload()
    }
  } catch {
    // 请求层已弹出可读错误；已执行的失败会在 runScenario 里带回记录并写入 outcome。
  } finally {
    running.value = false
  }
}

function showRecord(record: AnalysisRecord) {
  outcome.value = { mode: 'llm', result: record.result, record }
}

watch(scenarioCode, () => {
  outcome.value = null
})
onMounted(loadModelsIfPossible)
watch(llmTokenConfigured, loadModelsIfPossible)
</script>
<template>
  <KpiStrip kind="governance" />
  <div class="scenario-banner">
    <span>SCENARIO APPLICATION</span>
    <h2>{{ name }} · 内容安全治理工作台</h2>
    <p>融合数据分析、风险识别与合规干预，为行业场景提供一体化安全能力。</p>
  </div>

  <!-- 演示数据提示：用自定义样式而不是 el-alert 的 info 类型，
       默认 info 是灰字浅底，压在浅色页面上几乎看不见。 -->
  <div v-if="demo" class="demo-banner">
    <b>当前为演示数据，不代表真实模型输出</b>
    <span>内置样例仅用于撑起页面演示；接入模型服务后移除 VITE_SCENARIO_DEMO 开关即可切换为真实分析。</span>
  </div>

  <div class="scenario-layout">
    <PanelCard :title="`${name}验证`" icon="ChatDotRound">
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item v-if="llmMode" label="选择模型">
          <el-select
            v-model="selectedModel"
            class="full"
            :disabled="!modelsReady"
            :placeholder="modelsReady ? '请选择模型' : '模型目录不可用'"
          >
            <el-option
              v-for="item in models"
              :key="item.modelId"
              :label="item.name"
              :value="item.modelId"
            />
          </el-select>
          <p v-if="modelsHint" class="hint warn">{{ modelsHint }}</p>
          <p v-else class="hint">模型目录由模型服务维护，这里只做选择。</p>
        </el-form-item>

        <el-form-item label="输入内容">
          <el-input
            v-model="content"
            type="textarea"
            :rows="6"
            maxlength="50000"
            show-word-limit
            placeholder="填写待分析的正文。政务、热点等场景建议在下方补充参考材料。"
          />
        </el-form-item>

        <!-- 内容语言只在跨文化交流出现：其余五个场景正文默认中文，不需要让用户选。
             language 字段仍然照常发送（取默认值 zh）。 -->
        <el-form-item v-if="activeCode === 'cross_cultural'" label="内容语言">
          <el-select
            v-model="contentLanguage"
            class="full"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入语言代码"
          >
            <el-option label="中文 (zh)" value="zh" />
            <el-option label="英语 (en)" value="en" />
          </el-select>
          <p class="hint">正文本身的语言。要填语言代码（zh、en），不能填「中文」这类名称。</p>
        </el-form-item>

        <el-form-item v-if="activeCode === 'cross_cultural'" label="目标语言">
          <el-select
            v-model="targetLanguage"
            class="full"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入语言代码"
          >
            <el-option
              v-for="item in targetLanguageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="hint">要翻译成的语言。可直接输入任意代码（如 pt-BR）。留空则不返回译文。</p>
        </el-form-item>

        <el-form-item v-if="llmMode" label="参考材料（可选）">
          <div class="materials">
            <div v-for="(item, index) in materials" :key="index" class="material">
              <div class="material-head">
                <el-input v-model="item.id" placeholder="材料 ID" />
                <el-input v-model="item.title" placeholder="标题（可选）" />
                <el-input v-model="item.time" placeholder="时间（可选）" />
                <el-button link type="danger" @click="materials.splice(index, 1)">删除</el-button>
              </div>
              <el-input
                v-model="item.content"
                type="textarea"
                :rows="3"
                placeholder="材料正文；热点场景的时间轴与趋势需要带时间的材料"
              />
            </div>
            <el-button class="full" @click="addMaterial">+ 添加参考材料</el-button>
          </div>
        </el-form-item>

        <el-button
          class="full"
          type="primary"
          native-type="submit"
          :loading="running"
          :disabled="!canSubmit"
        >
          开始场景分析
        </el-button>
      </el-form>
    </PanelCard>

    <ScenarioResult v-if="outcome" :outcome="outcome" />
    <PanelCard v-else title="分析结果" icon="DataAnalysis">
      <div class="result-empty">
        <b>尚未分析</b>
        <p>选择模型并填写正文后，点击「开始场景分析」。</p>
      </div>
    </PanelCard>
  </div>

  <ScenarioRecords
    v-if="llmMode"
    ref="records"
    class="scenario-records"
    :scenario-code="scenarioCode"
    @open="showRecord"
  />
  <PanelCard v-else class="scenario-records" title="场景治理任务" icon="Tickets">
    <TaskTable />
  </PanelCard>
</template>
<style scoped>
.scenario-layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 15px;
  align-items: start;
  margin-bottom: 15px;
}
@media (max-width: 1180px) {
  .scenario-layout {
    grid-template-columns: 1fr;
  }
}
.scenario-records {
  display: block;
}
.full {
  width: 100%;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #7d91b0;
}
.hint.warn {
  color: #c07816;
}
.materials {
  width: 100%;
}
.material {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #e5e9f2;
  border-radius: 6px;
  background: #fbfcfe;
}
.material-head {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.result-empty {
  padding: 56px 20px;
  text-align: center;
  color: #96a1b3;
}
.result-empty b {
  display: block;
  margin-bottom: 6px;
  color: #5b6779;
  font-size: 15px;
}
.demo-banner {
  margin-bottom: 15px;
  padding: 12px 16px;
  border: 1px solid #f0d9a8;
  border-left: 4px solid #ed7b2f;
  border-radius: 6px;
  background: #fff8e6;
}
.demo-banner b {
  display: block;
  margin-bottom: 4px;
  color: #8a5a12;
  font-size: 14px;
}
.demo-banner span {
  color: #9c7628;
  font-size: 12.5px;
  line-height: 1.7;
}
</style>
