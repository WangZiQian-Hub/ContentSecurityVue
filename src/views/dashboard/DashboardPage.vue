/** 综合态势页面 
包含：
- 平台总体 KPI。
- 项目核心任务链。
- 六个场景应用入口。
- 最近任务。
- 算力、存储、网络和调度底座介绍。
*/

<script setup lang="ts">
import KpiStrip from '../../components/KpiStrip.vue'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import TaskTable from '../../components/TaskTable.vue'
const chain = [
  {
    name: '高价值发现',
    icon: 'Coin',
    text: '跨文化语料多维价值表征\n高价值语料识别',
    path: '/data-governance/value-analysis',
  },
  {
    name: '异常追踪',
    icon: 'Search',
    text: '异常数据识别\n因果追踪',
    path: '/data-governance/anomaly',
  },
  {
    name: '风险治理',
    icon: 'WarningFilled',
    text: '语义风险分级分类\n分层识别',
    path: '/data-governance/risk-classification',
  },
  { name: '合规审计', icon: 'Checked', text: '训练动态监控\n推理路径审计', path: '/compliance' },
  {
    name: '场景验证与应用',
    icon: 'DataAnalysis',
    text: '支持多行业多场景\n规模化应用',
    path: '/scenario',
  },
]
const scenes = [
  {
    name: '跨平台舆情分析',
    sub: '多平台舆情监测与分析',
    icon: 'ChatDotRound',
    path: 'public-opinion',
  },
  { name: '热点事件跟踪', sub: '热点事件发现与态势研判', icon: 'Sunrise', path: 'hot-events' },
  { name: '跨文化交流', sub: '跨语言内容理解与监测', icon: 'Football', path: 'cross-cultural' },
  {
    name: '多民族社会治理',
    sub: '多民族文化内容治理',
    icon: 'UserFilled',
    path: 'ethnic-governance',
  },
  {
    name: '智能政务',
    sub: '政务内容安全与智能服务',
    icon: 'OfficeBuilding',
    path: 'smart-government',
  },
  { name: '网络空间安防', sub: '网络空间安全态势感知', icon: 'Checked', path: 'cyber-security' },
]
const infrastructureDetails = [
  '为数据清洗、内容识别和模型训练等任务统一分配 CPU、GPU、NPU 与 DCU 算力，按任务负载弹性调度，提升数据处理效率。',
  '集中存放原始数据、治理结果、训练样本和模型文件，按对象、文件与 NFS 等方式管理，为数据集使用和结果追溯提供支撑。',
  '连接数据接入、治理、训练和评估环节，利用高速网络与统一调度传输任务数据，并对不同业务的资源使用进行隔离。',
]
</script>
<template>
  <KpiStrip />
  <PanelCard title="项目核心任务链" icon="Connection"
    ><template #extra>
      <span class="title-description">聚焦数据价值发现与风险治理，构建安全可控的内容治理闭环</span>
      <span class="muted">从高价值发现到合规审计，支撑多场景应用与规模化落地</span></template
    >
    <div class="core-chain">
      <template v-for="(item, index) in chain" :key="item.name"
        ><router-link :to="item.path" class="chain-node"
          ><div class="orb" :class="`tone-${index}`"><AppIcon :name="item.icon" /></div>
          <h3>{{ item.name }}</h3>
          <p>{{ item.text }}</p></router-link
        ><span v-if="index < chain.length - 1" class="chain-arrow"></span></template
      >
    </div></PanelCard
  >
  <div class="grid two">
    <PanelCard title="场景应用入口" icon="Menu" link="/scenario"
      ><div class="scene-grid">
        <router-link
          v-for="(scene, index) in scenes"
          :key="scene.path"
          :to="`/scenario/${scene.path}`"
          class="scene-tile"
          ><AppIcon :name="scene.icon" :class="`text-tone-${index % 3}`" />
          <div>
            <h3>{{ scene.name }}</h3>
            <p>{{ scene.sub }}</p>
          </div></router-link
        >
      </div></PanelCard
    ><PanelCard title="最近任务" icon="Download" link="/evaluation/tasks"><TaskTable /></PanelCard>
  </div>
  <PanelCard title="一体化平台支撑能力" icon="HelpFilled"
    ><template #extra>
      <span class="title-description">构建数据、模型、治理、合规一体化的内容安全治理体系</span>
      <span class="muted">以统一算力底座为基础，为上层业务提供全栈能力支撑</span>
    </template>
    <div class="infrastructure">
      <h2>
        <AppIcon name="Coin" /> 算力一体化服务底座
        <small>统一资源 · 弹性调度 · 安全可信 · 支撑全栈业务</small>
      </h2>
      <div class="grid three">
        <div
          v-for="(name, index) in ['统一计算资源', '统一存储资源', '统一网络与调度']"
          :key="name"
          class="infrastructure-card"
          tabindex="0"
          :aria-describedby="`infrastructure-detail-${index}`"
        >
          <AppIcon :name="['Cpu', 'Coin', 'Share'][index]" />
          <section>
            <h3>{{ name }}</h3>
            <p>
              {{ ['CPU / GPU / NPU / DCU', '对象、文件、NFS 等', 'IB / RoCE / 统一调度'][index] }}
            </p>
            <small>{{ ['高性能 · 弹性扩展 · 多元异构', '海量存储 · 高可靠 · 高并发', '高速互联 · 智能调度 · 安全隔离'][index] }}</small>
          </section>
          <div :id="`infrastructure-detail-${index}`" class="infrastructure-detail" role="tooltip">
            <strong>{{ name }}</strong>
            <p>{{ infrastructureDetails[index] }}</p>
          </div>
        </div>
      </div>
    </div></PanelCard
  >
</template>
