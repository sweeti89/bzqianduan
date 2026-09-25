import { createRouter, createWebHashHistory } from 'vue-router'
import Workbench from '../views/Workbench.vue'
import Roster from '../views/Roster.vue'
import Fees from '../views/Fees.vue'
import Profile from '../views/Profile.vue'

// 用 hash 模式：打包后直接双击 dist/index.html 或放任意静态目录都能跑
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'workbench', component: () => import('../views/Workbench.vue'), meta: { title: '工作台' } },
    { path: '/roster', name: 'roster', component: () => import('../views/Roster.vue'), meta: { title: '班级名册' } },
    { path: '/fees', name: 'fees', component: () => import('../views/Fees.vue'), meta: { title: '班费' } },
    { path: '/profile', name: 'profile', component: () => import('../views/Profile.vue'), meta: { title: '我的' } },
    // 旧版"事务"页已并入工作台，老链接跳回首页
    { path: '/affairs', redirect: '/' },
  ],
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 班委助手` : '班委助手'
})

export default router
