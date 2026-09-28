<script setup lang="ts">
import { reactive } from 'vue'
import type { Formula, RevisionDefinition, Stage } from '../../../types/evaluation'
const props = defineProps<{ definition: RevisionDefinition; busy: boolean }>()
const emit = defineEmits<{ save: [definition: RevisionDefinition]; cancel: [] }>()
const form = reactive<RevisionDefinition>(JSON.parse(JSON.stringify(props.definition)))
const formulas: { code: Formula; name: string; text: string }[] = [
  { code: 'recall', name: '召回率', text: 'TP / (TP + FN)' },
  { code: 'accuracy', name: '准确率', text: '(TP + TN) / (TP + TN + FP + FN)' },
  { code: 'fpr', name: '误报率', text: 'FP / (FP + TN)' },
  { code: 'coverage', name: '覆盖率', text: '命中的应覆盖单元 / 应覆盖单元' },
  { code: 'risk_reduction', name: '风险减少率', text: '(基线风险数 − 治理后风险数) / 基线风险数' },
  { code: 'chain_restore', name: '链路还原率', text: '正确还原标准节点数 / 标准节点数' },
  { code: 'count', name: '数量核验', text: '按冻结范围计数' },
  { code: 'trace_complete', name: '三阶段核验', text: '数据、训练、输出三个阶段均正确关联' },
  { code: 'matrix', name: '覆盖矩阵核验', text: '冻结执行矩阵全部覆盖' },
  { code: 'needs_definition', name: '口径待确认', text: '待确认' },
]
function changeFormula() {
  form.formula = formulas.find((f) => f.code === form.formulaCode)?.text || ''
  form.unit =
    form.formulaCode === 'count'
      ? 'count'
      : ['trace_complete', 'matrix'].includes(form.formulaCode)
        ? 'boolean'
        : 'ratio'
  form.thresholds.forEach((t) => {
    t.unit = form.unit
  })
}
function addStage(stage: Stage) {
  form.thresholds.push({
    stage,
    comparator: form.unit === 'boolean' ? 'all' : 'gte',
    value: form.unit === 'boolean' ? 1 : 0,
    unit: form.unit,
  })
}
const splitLines = (value: string) =>
  value
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)
</script>
<template>
  <el-form label-position="top" @submit.prevent="emit('save', form)">
    <div class="ev-form-grid">
      <el-form-item label="计算方法" required
        ><el-select v-model="form.formulaCode" @change="changeFormula"
          ><el-option
            v-for="item in formulas"
            :key="item.code"
            :value="item.code"
            :label="item.name" /></el-select
      ></el-form-item>
      <el-form-item label="公式版本" required
        ><el-input v-model="form.formulaVersion"
      /></el-form-item>
      <el-form-item label="计算公式" class="ev-span"
        ><el-input :model-value="form.formula" readonly
      /></el-form-item>
      <el-form-item label="分母定义" required
        ><el-input v-model="form.denominatorDefinition"
      /></el-form-item>
      <el-form-item label="标准正类"
        ><el-input v-model="form.positiveClass" placeholder="例如：应触发预警的风险样本"
      /></el-form-item>
      <el-form-item label="适用对象" required
        ><el-input v-model="form.applicableObjects"
      /></el-form-item>
      <el-form-item label="测试方式"
        ><el-select v-model="form.testMethod"
          ><el-option label="自动计算" value="automatic" /><el-option
            label="前后对照"
            value="paired" /><el-option label="证据核验" value="evidence" /></el-select
      ></el-form-item>
    </div>
    <h3>阶段目标 <small class="ev-muted">比率按 0–1 保存，例如 95% 填 0.95</small></h3>
    <div v-for="(target, index) in form.thresholds" :key="target.stage" class="ev-toolbar">
      <span>{{ target.stage === 'final' ? '完成期' : '中期' }}</span
      ><el-select v-model="target.comparator"
        ><el-option label="≥" value="gte" /><el-option label="≤" value="lte" /><el-option
          label="等于"
          value="eq" /><el-option label="全部满足" value="all" /></el-select
      ><el-input-number
        v-model="target.value"
        :min="0"
        :max="form.unit === 'ratio' || form.unit === 'boolean' ? 1 : undefined"
        :step="form.unit === 'ratio' ? 0.01 : 1"
      /><el-button link type="danger" @click="form.thresholds.splice(index, 1)"
        >不设该阶段目标</el-button
      >
    </div>
    <div class="ev-toolbar">
      <el-button
        v-if="!form.thresholds.some((t) => t.stage === 'midterm')"
        @click="addStage('midterm')"
        >添加中期目标</el-button
      ><el-button
        v-if="!form.thresholds.some((t) => t.stage === 'final')"
        @click="addStage('final')"
        >添加完成期目标</el-button
      >
    </div>
    <h3>集合、计数与匹配规则</h3>
    <div v-for="(parameter, index) in form.parameters" :key="index" class="ev-toolbar">
      <el-input v-model="parameter.name" placeholder="规则名称" /><el-input
        v-model="parameter.value"
        placeholder="规则值"
      /><el-button link type="danger" @click="form.parameters.splice(index, 1)">移除</el-button>
    </div>
    <el-button size="small" @click="form.parameters.push({ name: '', value: '' })"
      >添加规则</el-button
    >
    <div class="ev-form-grid" style="margin-top: 20px">
      <el-form-item label="所需输入（每行一项）"
        ><el-input
          type="textarea"
          :rows="3"
          :model-value="form.inputRequirements.join('\n')"
          @update:model-value="form.inputRequirements = splitLines($event)"
      /></el-form-item>
      <el-form-item label="必需证据（每行一项）"
        ><el-input
          type="textarea"
          :rows="3"
          :model-value="form.requiredEvidence.join('\n')"
          @update:model-value="form.requiredEvidence = splitLines($event)"
      /></el-form-item>
      <el-form-item label="定义依据（每行一项）" class="ev-span"
        ><el-input
          type="textarea"
          :model-value="form.sourceDocumentRefs.join('\n')"
          @update:model-value="form.sourceDocumentRefs = splitLines($event)"
      /></el-form-item>
    </div>
    <div class="ev-footer">
      <el-button @click="emit('cancel')">取消编辑</el-button
      ><el-button type="primary" :loading="busy" @click="emit('save', form)">保存草稿</el-button>
    </div>
  </el-form>
</template>
