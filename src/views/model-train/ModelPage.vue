<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import DataChart from '../../components/DataChart.vue'
import CapabilityForm from '../../components/CapabilityForm.vue'
import ResourceTable from '../../components/ResourceTable.vue'
import TaskTable from '../../components/TaskTable.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <KpiStrip kind="model" />
  <div class="model-categories">
    <router-link
      v-for="(name, index) in ['自主基础模型', '行业大模型', '开源模型']"
      :key="name"
      to="/model-train/management"
      :class="`tone-${index}`"
      ><AppIcon :name="['Box', 'OfficeBuilding', 'Share'][index]" />
      <div>
        <h2>{{ name }}</h2>
        <p>
          {{
            [
              '构建自主可控的基础大模型能力',
              '面向重点行业的领域大模型',
              '集成主流开源模型，安全可控',
            ][index]
          }}
        </p>
      </div>
      <span>›</span></router-link
    >
  </div>
  <PanelCard v-if="route.params.tab === 'tasks'" title="训练任务" icon="Tickets"
    ><TaskTable
  /></PanelCard>
  <div class="grid model-grid">
    <PanelCard
      :title="route.params.tab === 'checkpoints' ? '模型检查点 · epoch 7' : '模型训练'"
      icon="Setting"
      ><div class="grid two training-content">
        <div>
          <h3>内容安全识别模型 v2.0 <el-tag size="small" type="success">训练中</el-tag></h3>
          <p>训练进度</p>
          <el-progress :percentage="68" />
          <dl>
            <dt>运行状态</dt>
            <dd class="positive">● 训练中（示例）</dd>
            <dt>当前轮次</dt>
            <dd>7 / 10</dd>
            <dt>已用时长</dt>
            <dd>3小时28分钟</dd>
            <dt>训练数据</dt>
            <dd>内容安全多模态数据集</dd>
            <dt>模型版本</dt>
            <dd>v2.0.1</dd>
            <dt>训练框架</dt>
            <dd>PyTorch 2.1</dd>
            <dt>运行资源</dt>
            <dd>A100 × 4</dd>
          </dl>
        </div>
        <div>
          <h3>训练损失曲线</h3>
          <DataChart :height="225" />
        </div></div></PanelCard
    ><PanelCard
      :title="route.path.startsWith('/model-training') ? '训练监控调用' : '模型调用'"
      icon="VideoPlay"
      ><CapabilityForm
        :capability="
          route.path.startsWith('/model-training') ? 'training_monitor' : 'model_risk_governance'
        "
        :text-input="!route.path.startsWith('/model-training')"
        :title="route.path.startsWith('/model-training') ? '查询训练状态' : '开始调用'"
    /></PanelCard>
  </div>
  <div class="grid model-bottom">
    <PanelCard title="模型管理" icon="Box" link="/model-train/management"
      ><ResourceTable resource="models" /></PanelCard
    ><PanelCard title="模型评估" icon="PieChart" link="/model-train/evaluation"
      ><div class="quality-grid">
        <div v-for="(label, index) in ['精确率', '召回率', 'F1 值', '稳定性']" :key="label">
          <span>{{ label }}</span
          ><strong>{{ [92.3, 89.6, 90.9, 96.1][index] }}<small>%</small></strong>
          <p class="positive">↑ +2.1%</p>
        </div>
      </div></PanelCard
    ><PanelCard title="模型部署" icon="Box" link="/model-train/deploy"
      ><div class="deployment">
        <p>服务状态 <b class="positive">● 运行中</b></p>
        <p>实例数量 <b>8 个</b></p>
        <p>健康状态 <b>98.5%</b></p>
      </div></PanelCard
    >
  </div>
</template>
