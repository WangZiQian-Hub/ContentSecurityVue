/** 路由执行器，决定不同网址应该显示哪些页面
1. 自动跳转到 /dashboard。
2. 根据 navigation.ts 批量生成页面路由。
3. 使用动态导入，让页面在需要时才加载。
4. 检查二级页签是否合法。
5. 未知地址跳回首页。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { isMock } from '../api/request'
import { navigation } from './navigation'
const views = {
  '/dashboard': () => import('../views/dashboard/DashboardPage.vue'),
  '/compliance': () => import('../views/compliance/CompliancePage.vue'),
  '/evaluation': () => import('../views/evaluation/EvaluationPage.vue'),
  '/scenario': () => import('../views/scenario/ScenarioPage.vue'),
  '/system': () => import('../views/system/SystemPage.vue'),
}
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('../views/LoginView.vue') },
    { path: '/', redirect: '/dashboard' },
    {
      path: '/model-train',
      component: () => import('../views/model-train/ModelPage.vue'),
      children: [
        { path: '', alias: 'training', name: 'model-training', component: () => import('../views/model-train/TrainingPage.vue') },
        { path: 'management', name: 'model-management', component: () => import('../views/model-train/ManagementPage.vue') },
        { path: 'evaluation', name: 'model-evaluation', component: () => import('../views/model-train/EvaluationPage.vue') },
        { path: 'deploy', name: 'model-deploy', component: () => import('../views/model-train/DeployPage.vue') },
        { path: 'invoke', name: 'model-invoke', component: () => import('../views/model-train/InvokePage.vue') },
        { path: ':pathMatch(.*)*', redirect: '/model-train' },
      ],
    },
    {
      path: '/data-governance',
      component: () => import('../views/data-governance/DataGovernancePage.vue'),
      children: [
        { path: '', alias: 'process', name: 'governance-process', component: () => import('../views/data-governance/DataProcessPage.vue') },
        { path: 'value-analysis', name: 'governance-value', component: () => import('../views/data-governance/DataValuePage.vue') },
        { path: 'anomaly', name: 'governance-anomaly', component: () => import('../views/data-governance/DataAnomalyPage.vue') },
        { path: 'risk-classification', name: 'governance-risk', component: () => import('../views/data-governance/DataRiskPage.vue') },
        { path: ':pathMatch(.*)*', redirect: '/data-governance' },
      ],
    },
    {
      path: '/data-resource',
      component: () => import('../views/data-resource/DataResourcePage.vue'),
      children: [
        {
          path: '',
          name: 'resource-overview',
          component: () => import('../views/data-resource/ResourceOverviewPage.vue'),
        },
        {
          path: 'ingest',
          name: 'resource-ingest',
          component: () => import('../views/data-resource/DataIngestPage.vue'),
        },
        {
          path: 'datasets',
          name: 'resource-datasets',
          component: () => import('../views/data-resource/DatasetManagePage.vue'),
        },
        {
          path: 'statistics',
          name: 'resource-statistics',
          component: () => import('../views/data-resource/ResourceStatisticsPage.vue'),
        },
        { path: ':pathMatch(.*)*', redirect: '/data-resource' },
      ],
    },
    ...navigation
      .filter((item) => !['/data-resource', '/data-governance', '/model-train'].includes(item.path))
      .map((item) => ({
        path: `${item.path}/:tab?`,
        component: views[item.path as keyof typeof views],
        beforeEnter: (to: { params: Record<string, unknown> }) =>
          !to.params.tab || item.tabs.some((tab) => tab.path === to.params.tab) ? true : item.path,
      })),
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

export default router

/** 平台登录守卫（#9）：真实接口模式下未登录一律先去登录页；mock 模式保持免登录演示。 */
router.beforeEach((to) => {
  if (isMock) return true
  const token = sessionStorage.getItem('accessToken')
  if (to.path === '/login') return token ? '/dashboard' : true
  if (!token) return { path: '/login', query: to.fullPath === '/dashboard' ? {} : { redirect: to.fullPath } }
  return true
})
