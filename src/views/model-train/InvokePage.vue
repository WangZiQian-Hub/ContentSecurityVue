<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { VideoPlay, Delete, Document } from '@element-plus/icons-vue'
import PanelCard from '../../components/PanelCard.vue'
import WorkbenchKpis from './WorkbenchKpis.vue'
import { useModelWorkbench } from '../../stores/model-workbench'
import { percent, formatModelTime, type ModelCall } from '../../types/model-workbench'
import { isMock } from '../../api/request'
const store = useModelWorkbench(),
  route = useRoute()
const modelId = ref(
  String(route.query.modelId || store.data.calls[0]?.modelId || store.data.models[0]?.id || ''),
)
const serviceId = ref('')
const prompt = ref(''),
  temp = ref(0.7),
  maxLen = ref(1024)
const services = computed(() =>
  store.data.services.filter((s) => s.modelId === modelId.value && s.status === 'running'),
)
const service = computed(() => services.value.find((s) => s.id === serviceId.value))
const selected = ref<ModelCall | null>(null)
const page = ref(1)
watch(
  modelId,
  () => {
    serviceId.value =
      services.value.find((s) => s.id === route.query.serviceId)?.id || services.value[0]?.id || ''
    selected.value = null
  },
  { immediate: true },
)
watch(serviceId, () => {
  selected.value = null
})
const calls = computed(() =>
  store.data.calls.filter(
    (c) => c.modelId === modelId.value && (!serviceId.value || c.serviceId === serviceId.value),
  ),
)
const rows = computed(() => calls.value.slice((page.value - 1) * 8, page.value * 8))
selected.value = calls.value[0] || null
prompt.value = selected.value?.prompt || ''
watch([modelId, serviceId], () => {
  page.value = 1
})
const today = computed(() =>
  store.data.calls.filter(
    (c) =>
      new Date(c.createdAt).toLocaleDateString('zh-CN') === new Date().toLocaleDateString('zh-CN'),
  ),
)
const kpis = computed(() => {
  const c = today.value
  return [
    { label: '今日调用', value: c.length, unit: '次', icon: 'ChatDotRound' },
    {
      label: '调用成功率',
      value: percent(c.filter((x) => x.status === 'succeeded').length, c.length),
      icon: 'CircleCheckFilled',
    },
    {
      label: '平均响应',
      value: c.length
        ? (c.reduce((sum, x) => sum + x.elapsedMs, 0) / c.length / 1000).toFixed(2)
        : '暂无',
      unit: '秒',
      icon: 'Clock',
    },
    {
      label: '触发治理',
      value: c.filter((x) => x.originalOutput !== x.governedOutput && x.riskLevel !== 'low').length,
      unit: '次',
      icon: 'WarningFilled',
    },
    {
      label: '留痕完整率',
      value: percent(
        c.filter((x) => x.traceId && x.version && x.prompt && x.governedOutput).length,
        c.length,
      ),
      icon: 'Document',
    },
  ]
})
function example() {
  prompt.value =
    '请帮我整理这份联系人记录，用于公开发布。联系人：[姓名已遮蔽]，手机号：[号码已遮蔽]。'
}
function clear() {
  prompt.value = ''
  selected.value = null
}
async function invoke() {
  if (!prompt.value.trim() || !service.value)
    return void ElMessage.warning('请选择运行中的服务并填写输入内容')
  selected.value = null
  try {
    selected.value = await store.invoke({
      modelId: modelId.value,
      serviceId: serviceId.value,
      prompt: prompt.value.trim(),
      temp: temp.value,
      maxLen: maxLen.value,
    })
    page.value = 1
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '调用失败')
  }
}
const governed = computed(
  () =>
    selected.value &&
    selected.value.riskLevel !== 'low' &&
    selected.value.originalOutput !== selected.value.governedOutput,
)
</script>
<template>
  <WorkbenchKpis :items="kpis" />
  <div class="mw-grid mw-invoke-grid">
    <PanelCard title="调用配置" icon="Setting"
      ><el-form label-position="top"
        ><el-form-item label="模型"
          ><el-select v-model="modelId" aria-label="调用模型" :disabled="store.busy"
            ><el-option
              v-for="m in store.data.models"
              :key="m.id"
              :value="m.id"
              :label="m.name" /></el-select></el-form-item
        ><el-form-item label="运行服务及版本"
          ><el-select
            v-model="serviceId"
            aria-label="调用服务"
            :disabled="store.busy"
            no-data-text="暂无运行中的关联服务"
            ><el-option
              v-for="s in services"
              :key="s.id"
              :value="s.id"
              :label="`${s.name} ${s.version}`" /></el-select
        ></el-form-item>
        <div class="mw-row">
          <label for="mw-prompt">输入内容</label
          ><el-button :icon="Document" link type="primary" :disabled="store.busy" @click="example"
            >隐私保护示例</el-button
          >
        </div>
        <el-input
          id="mw-prompt"
          v-model="prompt"
          type="textarea"
          :rows="5"
          maxlength="2000"
          show-word-limit
          placeholder="请输入需要模型处理的内容"
          :disabled="store.busy"
        />
        <div class="mw-form-pair">
          <el-form-item label="采样温度"
            ><el-input-number
              v-model="temp"
              :min="0"
              :max="2"
              :step="0.1"
              :precision="1"
              :disabled="store.busy" /></el-form-item
          ><el-form-item label="最大生成长度"
            ><el-select v-model="maxLen" :disabled="store.busy"
              ><el-option
                v-for="n in [256, 512, 1024, 2048, 4096]"
                :key="n"
                :label="`${n} 个词元`"
                :value="n" /></el-select
          ></el-form-item>
        </div>
        <div class="mw-actions">
          <el-button
            type="primary"
            :icon="VideoPlay"
            :loading="store.busy"
            :disabled="!service || !prompt.trim()"
            @click="invoke"
            >开始调用</el-button
          ><el-button :icon="Delete" :disabled="store.busy" @click="clear">清空</el-button>
        </div></el-form
      >
      <div v-if="selected" class="mw-input-summary">
        <b>输入治理</b>
        <p>{{ selected.reconstruction || '未返回输入重构记录' }}</p>
      </div>
    </PanelCard>
    <div>
      <PanelCard title="治理结果" icon="Document"
        ><template #extra
          ><el-tag v-if="selected" type="success"
            >调用成功{{ isMock ? '（演示）' : '' }} ·
            {{ (selected.elapsedMs / 1000).toFixed(2) }} 秒</el-tag
          ></template
        >
        <template v-if="selected"
          ><div class="mw-info-strip">当前记录 {{ selected.id }} · {{ selected.version }}</div>
          <div class="mw-grid mw-halves mw-output-grid">
            <section>
              <h3>
                原始输出
                <el-tag :type="governed ? 'danger' : 'info'">{{
                  selected.riskLevel === 'high'
                    ? '高风险'
                    : selected.riskLevel === 'medium'
                      ? '中风险'
                      : selected.riskLevel === 'low'
                        ? '低风险'
                        : '风险待确认'
                }}</el-tag>
              </h3>
              <p>{{ selected.originalOutput }}</p>
            </section>
            <section>
              <h3>
                治理后输出 <el-tag type="success">{{ governed ? '已治理' : '无需干预' }}</el-tag>
              </h3>
              <p>{{ selected.governedOutput }}</p>
            </section>
          </div>
          <el-alert
            :title="`判定依据：${selected.reason}`"
            :type="governed ? 'warning' : 'info'"
            :closable="false"
          />
          <div v-if="isMock" class="mw-steps">
            <el-steps :active="5" finish-status="success" align-center
              ><el-step
                v-for="step in ['输入检测', '合规重构', '模型生成', '输出检测', '治理输出']"
                :key="step"
                :title="step"
            /></el-steps>
          </div>
          <router-link
            class="mw-link"
            :to="{
              path: '/compliance/full-chain',
              query: { taskId: selected.id, traceId: selected.traceId || undefined },
            }"
            >查看全链路追踪 →</router-link
          ></template
        ><el-empty
          v-else
          :description="
            store.busy ? '正在调用并等待治理结果' : '发起调用或选择历史记录查看治理结果'
          "
          :image-size="110"
        /> </PanelCard
      ><PanelCard title="最近调用" icon="Tickets"
        ><el-table :data="rows" border empty-text="暂无调用记录"
          ><el-table-column prop="id" label="调用编号" min-width="160" /><el-table-column
            prop="version"
            label="模型版本"
            width="95"
          /><el-table-column
            prop="prompt"
            label="输入摘要"
            min-width="175"
            show-overflow-tooltip
          /><el-table-column label="治理结果" width="100"
            ><template #default="{ row }"
              ><el-tag :type="row.riskLevel === 'low' ? 'info' : 'success'">{{
                row.riskLevel === 'low' ? '无需干预' : '已治理'
              }}</el-tag></template
            ></el-table-column
          ><el-table-column label="耗时" width="85"
            ><template #default="{ row }"
              >{{ (row.elapsedMs / 1000).toFixed(1) }} 秒</template
            ></el-table-column
          ><el-table-column label="时间" min-width="155"
            ><template #default="{ row }">{{
              formatModelTime(row.createdAt)
            }}</template></el-table-column
          ><el-table-column label="操作" width="70"
            ><template #default="{ row }"
              ><el-button link type="primary" :disabled="store.busy" @click="selected = row"
                >查看</el-button
              ></template
            ></el-table-column
          ></el-table
        ><el-pagination
          v-if="calls.length > 8"
          v-model:current-page="page"
          :page-size="8"
          :total="calls.length"
          layout="prev, pager, next"
      /></PanelCard>
    </div>
  </div>
</template>
