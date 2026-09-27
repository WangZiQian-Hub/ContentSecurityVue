<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import ContextSelector from './components/ContextSelector.vue'
import StateBadge from './components/StateBadge.vue'
import AuditReviewDialog from './components/AuditReviewDialog.vue'
import type { AbnormalNeuron } from '../../types/compliance'
const store = useComplianceStore(),
  selected = ref(''),
  reviewOpen = ref(false),
  open = inject<(id: string) => void>('complianceEvidence')!
const result = computed(() =>
  store.audit?.result.kind === 'neuron_audit' ? store.audit.result : null,
)
const hasMatrix = computed(
  () =>
    result.value?.availability === 'available' &&
    !!result.value.captureId &&
    result.value.heatmap.length > 0,
)
function color(value: number | null | undefined) {
  if (value == null) return '#eef1f5'
  return value >= 2.5
    ? '#ed4764'
    : value <= -2.5
      ? '#2455ba'
      : value > 0
        ? '#edafc0'
        : value < 0
          ? '#9ab8eb'
          : '#f1eef4'
}
function select(item: AbnormalNeuron) {
  selected.value = `${item.layer}-${item.index}`
  if (item.evidenceRefs[0]) open(item.evidenceRefs[0])
}
function cell(layer: number, index: number) {
  selected.value = `${layer}-${index}`
  const item = result.value?.abnormalNeurons.find((n) => n.layer === layer && n.index === index)
  if (item) select(item)
}
</script>
<template>
  <ContextSelector kind="model" label="模型" capability="neuron_audit" />
  <div v-if="hasMatrix && result" class="compliance-split">
    <PanelCard title="采样单元激活矩阵" icon="Grid"
      ><template #extra
        ><span class="compliance-muted"
          >{{ result.unit }}；阈值 |z| ≥ {{ result.threshold }}</span
        ></template
      >
      <div class="compliance-heat-scroll">
        <div
          class="compliance-heatmap"
          :style="{
            gridTemplateColumns: `70px repeat(${result.neuronIndices.length}, minmax(22px,1fr))`,
          }"
        >
          <template v-for="(layer, row) in result.layerIndices" :key="layer"
            ><span class="compliance-layer">Layer {{ layer }}</span
            ><button
              v-for="(index, col) in result.neuronIndices"
              :key="index"
              :style="{ background: color(result.heatmap[row]?.[col]) }"
              :class="{
                abnormal: result.abnormalNeurons.some(
                  (n) => n.layer === layer && n.index === index,
                ),
                selected: selected === `${layer}-${index}`,
              }"
              :aria-label="`L${layer} / ${index} = ${result.heatmap[row]?.[col] ?? '未采集'}`"
              :title="`L${layer} / ${index} = ${result.heatmap[row]?.[col] ?? '未采集'}`"
              @click="cell(layer, index)"
            >
              <span v-if="result.heatmap[row]?.[col] == null">—</span>
            </button></template
          ><span>单元索引</span
          ><small v-for="index in result.neuronIndices" :key="index">{{ index }}</small>
        </div>
      </div>
      <div class="compliance-legend">
        <span>−3.0</span><i></i><span>+3.0</span><span>边框：超阈值；灰色：未采集</span>
      </div>
      <p class="compliance-muted">
        {{ result.observedCount }} 个采样单元；{{ result.abnormalNeurons.length }} 个超阈值（{{
          result.ratio === null ? '未知' : `${(result.ratio * 100).toFixed(2)}%`
        }}）。未采样区域不作推断。
      </p></PanelCard
    >
    <div class="compliance-stack">
      <PanelCard title="超阈值单元" icon="Warning"
        ><el-table :data="result.abnormalNeurons" @row-click="select"
          ><el-table-column label="层 / 单元"
            ><template #default="{ row }"
              ><el-button type="primary" link @click.stop="select(row)"
                >L{{ row.layer }} / {{ row.index }}</el-button
              ></template
            ></el-table-column
          ><el-table-column prop="value" label="z 值" width="75" /><el-table-column
            prop="concept"
            label="关联概念"
        /></el-table>
        <p class="compliance-muted">点击单元定位矩阵，并打开捕获证据。</p></PanelCard
      ><PanelCard title="证据适用范围" icon="Shield"
        ><dl class="compliance-details">
          <dt>捕获对象</dt>
          <dd>{{ result.inferenceId }}</dd>
          <dt>捕获记录</dt>
          <dd>{{ result.captureId }}</dd>
          <dt>模型版本</dt>
          <dd>{{ result.modelVersion }}</dd>
          <dt>归一化基线</dt>
          <dd>{{ result.normalizationBaseline }}</dd>
          <dt>算法版本</dt>
          <dd>{{ store.audit?.adapterVersion }}</dd>
          <dt>复核状态</dt>
          <dd><StateBadge :state="store.audit?.reviewStatus" /></dd>
        </dl>
        <p class="compliance-note">异常激活仅提供关联线索，不直接证明风险原因。</p>
        <el-button @click="reviewOpen = true">人工复核</el-button></PanelCard
      >
    </div>
  </div>
  <el-empty
    v-else-if="!store.loading && !store.error"
    :description="
      result?.unavailableReason || '不支持内部捕获 / 尚未采集：请选择精确模型版本与捕获记录'
    "
  />
  <p class="compliance-muted">精确版本 / 捕获的新建审计扩展尚未联调，目前仅查询已保存结果。</p>
  <AuditReviewDialog v-model="reviewOpen" />
</template>
