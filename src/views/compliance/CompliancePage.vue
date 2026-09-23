<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import DataChart from '../../components/DataChart.vue'
import ResourceTable from '../../components/ResourceTable.vue'
import CapabilityForm from '../../components/CapabilityForm.vue'
const nodes = [
  '原始数据',
  '清洗治理',
  '数据集版本',
  '模型训练',
  '模型版本',
  '模型推理',
  '内容输出',
  '场景应用',
]
</script>
<template>
  <KpiStrip kind="compliance" /><PanelCard title="全链路追踪总览" icon="School"
    ><div class="audit-chain">
      <div v-for="(node, index) in nodes" :key="node">
        <div class="orb" :class="`tone-${index % 6}`">
          <AppIcon
            :name="['Coin', 'Brush', 'Coin', 'Cpu', 'Box', 'Setting', 'Document', 'Grid'][index]"
          />
        </div>
        <h3>{{ node }}</h3>
        <el-tag :type="index === 3 ? 'danger' : index === 5 ? 'warning' : 'success'" size="small">{{
          index === 3 ? '风险' : index === 5 ? '告警' : '正常'
        }}</el-tag>
        <p>
          {{
            [
              '多源数据接入',
              '数据清洗、脱敏',
              '版本追踪与对比',
              '训练过程监控',
              '模型版本管理',
              '推理过程审计',
              '生成内容检测',
              '应用效果监控',
            ][index]
          }}
        </p>
      </div>
    </div></PanelCard
  >
  <div class="grid three">
    <PanelCard title="数据谱系追踪" icon="Coin"
      ><div class="lineage">
        <div>
          <span v-for="name in ['互联网数据', '行业数据', '业务数据', '合成数据']" :key="name"
            >{{ name }} ↘</span
          >
        </div>
        <div class="orb tone-0"><AppIcon name="Coin" /></div>
        <div>
          <span v-for="name in ['训练数据集', '验证数据集', '测试数据集', '推理数据集']" :key="name"
            >↗ {{ name }}</span
          >
        </div>
      </div>
      <CapabilityForm capability="lineage_audit" title="查询数据谱系" /></PanelCard
    ><PanelCard title="推理路径审计" icon="DataAnalysis"
      ><div class="audit-steps">
        <div
          v-for="(name, index) in [
            '用户输入',
            '输入安全检测',
            '模型推理',
            '输出内容检测',
            '模型输出',
          ]"
          :key="name"
        >
          <AppIcon :name="['UserFilled', 'Checked', 'Box', 'Document', 'ChatDotRound'][index]" />
          <section>
            <b>{{ name }}</b>
            <p>
              {{
                [
                  '今天天气怎么样？',
                  '内容合规检测、风险过滤',
                  '调用大语言模型进行推理',
                  '有害内容识别、合规审核',
                  '今天天气晴朗，适合外出活动。',
                ][index]
              }}
            </p>
          </section>
          <el-tag size="small" :type="index === 2 ? 'danger' : 'success'">{{
            index === 2 ? '风险' : '正常'
          }}</el-tag>
        </div>
      </div></PanelCard
    >
    <div>
      <PanelCard title="神经元激活审计" icon="Cpu"
        ><DataChart kind="heatmap" :height="190" /></PanelCard
      ><PanelCard title="合规风险预警" icon="Checked" link="/compliance/risk-alert"
        ><ResourceTable resource="alerts"
      /></PanelCard>
    </div>
  </div>
</template>
