/** 路由执行器，决定不同网址应该显示哪些页面
1. 自动跳转到 /dashboard。
2. 根据 navigation.ts 批量生成页面路由。
3. 使用动态导入，让页面在需要时才加载。
4. 检查二级页签是否合法。
5. 未知地址跳回首页。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { navigation } from './navigation'
const views = {
  '/dashboard': () => import('../views/dashboard/DashboardPage.vue'),
  '/data-resource': () => import('../views/data-resource/DataResourcePage.vue'),
  '/data-governance': () => import('../views/data-governance/DataGovernancePage.vue'),
  '/model-training': () => import('../views/model-train/ModelPage.vue'),
  '/model-train': () => import('../views/model-train/ModelPage.vue'),
  '/compliance': () => import('../views/compliance/CompliancePage.vue'),
  '/evaluation': () => import('../views/evaluation/EvaluationPage.vue'),
  '/scenario': () => import('../views/scenario/ScenarioPage.vue'),
  '/system': () => import('../views/system/SystemPage.vue'),
}
export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    ...navigation.map((item) => ({
      path: `${item.path}/:tab?`,
      component: views[item.path as keyof typeof views],
      beforeEnter: (to: { params: Record<string, unknown> }) =>
        !to.params.tab || item.tabs.some((tab) => tab.path === to.params.tab) ? true : item.path,
    })),
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})
