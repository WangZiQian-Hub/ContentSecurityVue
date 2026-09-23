<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import ResourceTable from '../../components/ResourceTable.vue'
const route = useRoute()
const resource = computed(
  () =>
    ({ roles: 'roles', 'model-config': 'models', logs: 'logs' })[String(route.params.tab)] ||
    'users',
)
const title = computed(
  () =>
    ({ roles: '角色权限', 'model-config': '模型接入配置', logs: '系统日志' })[
      String(route.params.tab)
    ] || '用户管理',
)
</script>
<template>
  <KpiStrip kind="system" /><PanelCard :title="title" icon="Setting"
    ><ResourceTable :resource="resource" searchable
  /></PanelCard>
  <div class="grid three">
    <PanelCard title="身份与权限" icon="UserFilled"
      ><p>统一用户身份、角色分配与业务操作权限。</p>
      <el-tag type="info">演示管理员</el-tag></PanelCard
    ><PanelCard title="模型服务配置" icon="Connection"
      ><p>支持 OpenAI-compatible 模型服务接入。</p>
      <el-tag>等待后端服务接入</el-tag></PanelCard
    ><PanelCard title="系统运行状态" icon="Monitor"
      ><p>前端应用运行正常，所有模块已完成初始化。</p>
      <el-tag type="success">前端就绪</el-tag></PanelCard
    >
  </div>
</template>
