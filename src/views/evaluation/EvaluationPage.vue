<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import ResourceTable from '../../components/ResourceTable.vue'
import TaskTable from '../../components/TaskTable.vue'
import DataChart from '../../components/DataChart.vue'
import CapabilityForm from '../../components/CapabilityForm.vue'
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <KpiStrip kind="evaluation" />
  <div class="grid three">
    <PanelCard :title="route.params.tab === 'tasks' ? '测试任务' : '指标管理'" icon="Coin"
      ><TaskTable v-if="route.params.tab === 'tasks'" /><ResourceTable
        v-else
        resource="metrics" /></PanelCard
    ><PanelCard title="测试执行" icon="Setting"
      ><div class="test-progress">
        <h3>多模态内容安全评估测试 <el-tag size="small">执行中</el-tag></h3>
        <p>当前运行任务 · 演示进度</p>
        <el-progress :percentage="67" :stroke-width="12" />
        <div class="progress-stats">
          <div><b>1,280</b>测试用例总数</div>
          <div><b>980</b>已完成</div>
          <div><b>921</b>通过</div>
          <div><b>59</b>失败</div>
        </div>
      </div>
      <CapabilityForm capability="evaluation" title="新建测试任务" /></PanelCard
    ><PanelCard title="测试结果概览" icon="CircleCheckFilled"
      ><DataChart kind="donut" :height="200" />
      <div class="score">
        综合评估得分 <strong>92.3 <small>分</small></strong
        ><el-tag type="success">优秀</el-tag>
      </div>
      <DataChart kind="bar" :height="185"
    /></PanelCard>
  </div>
  <PanelCard title="测试结果与记录" icon="Document" link="/evaluation/records"
    ><ResourceTable resource="test-records" searchable
  /></PanelCard>
</template>
