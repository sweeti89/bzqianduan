<script setup>
import { computed, ref, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { showSuccessToast } from 'vant'
import { useAffairStore, AFFAIR_STATUS } from '../stores/affairs'
import { useTodoStore } from '../stores/todos'
import { useFeesStore } from '../stores/fees'
import { useIdentityStore } from '../stores/identity'
import { useTrashStore } from '../stores/trash'
import AffairForm from '../components/AffairForm.vue'
import TodoForm from '../components/TodoForm.vue'
import AnimatedNumber from '../components/AnimatedNumber.vue'

const router = useRouter()
const identity = useIdentityStore()
const affairs = useAffairStore()
const todoStore = useTodoStore()
const fees = useFeesStore()
const trashStore = useTrashStore()

const today = dayjs().format('YYYY-MM-DD')
const todayText = dayjs().format('M月D日 dddd')

const canManage = computed(() => identity.canManage)

// 可见性：个人条目只有创建者自己能看到
const visibleAffairs = computed(() =>
  affairs.sorted.filter((a) => a.scope !== 'personal' || a.ownerId === identity.memberId)
)
const visibleTodos = computed(() =>
  todoStore.sorted.filter((t) => t.type !== '个人' || t.ownerId === identity.memberId)
)

const pendingTodos = computed(() => visibleTodos.value.filter((t) => !t.done))
const doneTodos = computed(() => visibleTodos.value.filter((t) => t.done))
const pendingAffairs = computed(() => visibleAffairs.value.filter((a) => a.status !== 'ended'))
const doneAffairs = computed(() => visibleAffairs.value.filter((a) => a.status === 'ended'))

// 事务状态筛选
const affairFilter = ref('all') // all | notstarted | doing | ended
const filteredAffairs = computed(() => {
  let list = visibleAffairs.value.filter((a) => a.scope !== 'personal')
  if (affairFilter.value !== 'all') list = list.filter((a) => a.status === affairFilter.value)
  return list
})

const showDoneTodos = ref(false)

// 表单与新建流程状态
const affairFormShow = ref(false)
const editingAffair = ref(null)
const affairFormScope = ref('class')
const todoFormShow = ref(false)

// 今日提醒：过期/今天的待办 + 临近截止事务（已结束的不提醒）
const todayTodos = computed(() =>
  pendingTodos.value.filter((t) => t.date && t.date <= today.value).slice(0, 5)
)
const dueAffairs = computed(() =>
  pendingAffairs.value
    .filter((a) => a.deadline && a.deadline <= dayjs().add(3, 'day').format('YYYY-MM-DD'))
    .slice(0, 5)
)
const hasReminders = computed(() => todayTodos.value.length + dueAffairs.value.length > 0)

// 新建类型选择面板
const sheetShow = ref(false)
const sheetActions = [
  { name: '新建待办', value: 'todo' },
  { name: '新建班级事务', value: 'class' },
  { name: '新建个人事务（仅自己可见）', value: 'personal' },
]
function onSheetSelect(action) {
  sheetShow.value = false
  // 互斥：打开一个表单前先关闭另一个
  affairFormShow.value = false
  todoFormShow.value = false
  if (action.value === 'todo') {
    todoFormShow.value = true
    return
  }
  editingAffair.value = null
  affairFormScope.value = action.value
  affairFormShow.value = true
}

// 点提醒 → 滚动到对应模块
function gotoRemind(kind) {
  document
    .getElementById(kind === 'todos' ? 'module-todos' : 'module-affairs')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function todoTag(t) {
  if (t.date < today.value) return { type: 'danger', text: '已过期' }
  if (t.date === today.value) return { type: 'warning', text: '今天' }
  return null
}
function affairTag(a) {
  if (a.status === 'ended') return { type: 'success', text: '已结束' }
  return deadlineTag(a) || { type: 'primary', text: '进行中' }
}
function deadlineTag(a) {
  if (!a.deadline) return null
  if (a.deadline < today.value) return { type: 'danger', text: '已过期' }
  if (a.deadline === today.value) return { type: 'warning', text: '今天截止' }
  return { type: 'primary', text: a.deadline }
}
function progress(a) {
  const total = a.members.length
  const checked = a.members.filter((m) => m.checked).length
  return { total, checked, pct: total ? Math.round((checked / total) * 100) : 0 }
}

async function copyUndone(a) {
  if (!canManage.value) return
  const names = a.members.filter((m) => !m.checked).map((m) => m.name)
  if (!names.length) return showSuccessToast('都交齐了，没有未交名单')
  const text = `【${a.title}】未交名单（${names.length}人）：${names.join('、')}`
  try {
    await navigator.clipboard.writeText(text)
    showSuccessToast('未交名单已复制，去群里催交吧')
  } catch {
    showSuccessToast('复制失败，请手动记录')
  }
}

function openEditAffair(a) {
  if (!canManage.value) return
  if (a.scope === 'personal' && a.ownerId !== identity.memberId) return
  editingAffair.value = a
  affairFormShow.value = true
}
function removeAffair(a) {
  if (!canManage.value) return
  trashStore.add('affair', a)
  affairs.remove(a.id)
}
function toggleTodo(t) {
  if (canManage.value) todoStore.toggle(t.id)
}
function removeTodo(t) {
  if (!canManage.value) return
  trashStore.add('todo', t)
  todoStore.remove(t.id)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="head-title">工作台</div>
      <div class="head-sub">今天 {{ todayText }} · {{ identity.member?.name || '' }}（{{ identity.label }}）</div>
    </div>

    <!-- 速览横条 -->
    <div class="wb-cards stagger">
      <div class="wb-card" @click="router.push('/fees')">
        <template v-if="fees.initialBalance == null">
          <div class="wb-num wb-dim">未设置</div>
          <div class="wb-label">班费余额 · 点击查看</div>
        </template>
        <template v-else>
          <div class="wb-num">¥<AnimatedNumber :value="fees.balance" /></div>
          <div class="wb-label">班费余额 · 本月支出 ¥{{ fees.monthExpense.toFixed(2) }}</div>
        </template>
      </div>
      <div class="wb-card" @click="gotoRemind('affairs')">
        <div class="wb-num" :class="{ 'wb-warn': dueAffairs.length }">
          {{ pendingAffairs.length }} 件
        </div>
        <div class="wb-label">
          进行中事务<template v-if="dueAffairs.length"> · {{ dueAffairs.length }} 件临近截止</template>
        </div>
      </div>
    </div>

    <!-- 今日提醒 -->
    <template v-if="hasReminders">
      <div class="module-head">
        <span class="module-title">今日提醒</span>
      </div>
      <div class="module-panel">
        <van-cell
          v-for="t in todayTodos"
          :key="t.id"
          :title="t.title"
          is-link
          @click="gotoRemind('todos')"
        >
          <template #label>
            <van-tag plain :type="t.type === '班级' ? 'primary' : 'default'">{{ t.type }}</van-tag>
          </template>
          <template #value>
            <van-tag :type="todoTag(t).type">{{ todoTag(t).text }}</van-tag>
          </template>
        </van-cell>
        <van-cell
          v-for="a in dueAffairs"
          :key="a.id"
          :title="a.title"
          :label="`负责人 ${a.owner || '—'}`"
          is-link
          @click="gotoRemind('affairs')"
        >
          <template #value>
            <van-tag :type="affairTag(a).type" :plain="affairTag(a).type === 'primary'">
              {{ affairTag(a).text }}
            </van-tag>
          </template>
        </van-cell>
      </div>
    </template>

    <!-- ===== 模块一：待办 ===== -->
    <div class="module" id="module-todos">
      <div class="module-head">
        <span class="module-title">待办</span>
        <span v-if="pendingTodos.length" class="module-count">{{ pendingTodos.length }} 项未完成</span>
      </div>
      <div class="module-panel">
        <div v-if="!pendingTodos.length && !doneTodos.length" class="module-empty">
          <van-icon name="todo-list-o" />
          <span>暂无待办<template v-if="canManage">，点右下角 + 新建</template></span>
        </div>
        <template v-else>
          <van-swipe-cell v-for="t in pendingTodos" :key="t.id">
            <div class="todo-row" @click="toggleTodo(t)">
              <span class="todo-circle"></span>
              <div class="todo-body">
                <div class="todo-name">{{ t.title }}</div>
                <div class="todo-meta">
                  <van-tag plain :type="t.type === '班级' ? 'primary' : 'default'">{{ t.type }}</van-tag>
                  <span v-if="todoTag(t)" class="meta-text" :class="{ overdue: todoTag(t).type === 'danger' }">
                    {{ todoTag(t).text }}
                  </span>
                  <span v-else-if="t.date" class="meta-text">{{ t.date }}</span>
                </div>
              </div>
              <span
                v-if="canManage"
                class="row-del"
                title="删除（移入回收站）"
                @click.stop="removeTodo(t)"
              >
                <van-icon name="delete-o" />
              </span>
            </div>
            <template #right>
              <van-button
                v-if="canManage"
                square
                type="danger"
                text="删除"
                class="btn-swipe"
                @click.stop="removeTodo(t)"
              />
            </template>
          </van-swipe-cell>
          <div v-if="doneTodos.length" class="done-toggle" @click="showDoneTodos = !showDoneTodos">
            <van-icon :name="showDoneTodos ? 'arrow-up' : 'arrow-down'" />
            已完成 {{ doneTodos.length }}
          </div>
          <template v-if="showDoneTodos">
            <van-swipe-cell v-for="t in doneTodos" :key="t.id">
              <div class="todo-row" @click="toggleTodo(t)">
                <span class="todo-circle on"><van-icon name="success" /></span>
                <div class="todo-body">
                  <div class="todo-name done">{{ t.title }}</div>
                </div>
                <span class="row-actions" v-if="canManage">
                  <span class="row-undo" title="取消完成" @click.stop="toggleTodo(t)">
                    <van-icon name="revoke" />
                  </span>
                  <span class="row-del" title="删除（移入回收站）" @click.stop="removeTodo(t)">
                    <van-icon name="delete-o" />
                  </span>
                </span>
              </div>
              <template #right>
                <van-button
                  v-if="canManage"
                  square
                  type="danger"
                  text="删除"
                  class="btn-swipe"
                  @click.stop="removeTodo(t)"
                />
              </template>
            </van-swipe-cell>
          </template>
        </template>
      </div>
    </div>

    <!-- ===== 模块二：事务 ===== -->
    <div class="module" id="module-affairs">
      <div class="module-head">
        <span class="module-title">事务</span>
        <div class="filter-chips">
          <span class="fchip" :class="{ on: affairFilter === 'all' }" @click="affairFilter = 'all'">全部</span>
          <span class="fchip" :class="{ on: affairFilter === 'notstarted' }" @click="affairFilter = 'notstarted'">未开始</span>
          <span class="fchip" :class="{ on: affairFilter === 'doing' }" @click="affairFilter = 'doing'">进行中</span>
          <span class="fchip" :class="{ on: affairFilter === 'ended' }" @click="affairFilter = 'ended'">已结束</span>
        </div>
      </div>
      <div class="module-panel">
        <div v-if="!filteredAffairs.length" class="module-empty">
          <van-icon name="orders-o" />
          <span>该状态下没有事务<template v-if="canManage">，点右下角 + 新建</template></span>
        </div>
        <div class="stagger">
          <van-swipe-cell v-for="a in filteredAffairs" :key="a.id">
            <div
              class="affair-card"
              :style="{ borderLeft: `3px solid ${AFFAIR_STATUS[a.status]?.color || '#c8c9cc'}` }"
              @click="openEditAffair(a)"
            >
              <div class="affair-head">
                <span class="affair-title" :class="{ done: a.status === 'ended' }">{{ a.title }}</span>
                <van-tag v-if="a.scope === 'personal'" plain type="default">个人</van-tag>
                <van-tag :type="AFFAIR_STATUS[a.status]?.tag || 'default'">
                  {{ AFFAIR_STATUS[a.status]?.label || '进行中' }}
                </van-tag>
                <van-tag v-if="deadlineTag(a)" :type="deadlineTag(a).type" :plain="deadlineTag(a).type === 'primary'">
                  {{ deadlineTag(a).text }}
                </van-tag>
                <span
                  v-if="canManage"
                  class="row-del"
                  title="删除（移入回收站）"
                  @click.stop="removeAffair(a)"
                >
                  <van-icon name="delete-o" />
                </span>
              </div>
              <div v-if="a.scope === 'class'" class="affair-meta">
                负责人 {{ a.owner || '—' }}<template v-if="a.deadline"> · 截止 {{ a.deadline }}</template>
              </div>
              <div v-else-if="a.deadline" class="affair-meta">截止 {{ a.deadline }}</div>
              <div v-if="a.note" class="affair-note">{{ a.note }}</div>
              <template v-if="a.scope === 'class' && a.members.length">
                <van-progress :percentage="progress(a).pct" stroke-width="5" class="affair-bar" />
                <div class="affair-progress-row">
                  <span>已交 {{ progress(a).checked }}/{{ progress(a).total }}</span>
                  <van-button
                    v-if="canManage"
                    size="mini"
                    plain
                    type="primary"
                    @click.stop="copyUndone(a)"
                  >
                    复制未交名单
                  </van-button>
                </div>
              </template>
            </div>
            <template #right>
              <van-button
                v-if="canManage"
                square
                type="danger"
                text="删除"
                class="btn-swipe"
                @click.stop="removeAffair(a)"
              />
            </template>
          </van-swipe-cell>
        </div>
      </div>
    </div>

    <div v-if="canManage" class="fab" @click="sheetShow = true">
      <van-icon name="plus" />
    </div>
    <van-action-sheet
      v-model:show="sheetShow"
      :actions="sheetActions"
      cancel-text="取消"
      close-on-click-action
      @select="onSheetSelect"
    />
    <AffairForm v-model:show="affairFormShow" :affair="editingAffair" :default-scope="affairFormScope" />
    <TodoForm v-model:show="todoFormShow" />
  </div>
</template>

<style scoped>
.page-head {
  padding: 24px 20px 14px;
}
.head-title {
  font-size: 26px;
  font-weight: 800;
  color: #323233;
  letter-spacing: 0.5px;
}
.head-sub {
  margin-top: 5px;
  font-size: 12px;
  color: #969799;
}
.wb-cards {
  display: flex;
  gap: 10px;
  padding: 4px 12px 4px;
}
.wb-card {
  flex: 1;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(30, 60, 114, 0.1);
}
.wb-num {
  font-size: 20px;
  font-weight: 700;
}
.wb-warn {
  color: #ee9a01;
}
.wb-dim {
  font-size: 16px;
  color: #969799;
}
.wb-label {
  margin-top: 4px;
  font-size: 11px;
  color: #969799;
}
.module {
  margin: 16px 12px 0;
}
.module-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 8px;
  flex-wrap: wrap;
}
.module-title {
  font-size: 15px;
  font-weight: 700;
}
.module-count {
  font-size: 11px;
  color: #969799;
}
.module-panel {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(30, 60, 114, 0.06);
  overflow: hidden;
}
.module-empty {
  padding: 26px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #c8c9cc;
  font-size: 13px;
}
.module-empty .van-icon {
  font-size: 30px;
}
.todo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #f5f6f8;
  cursor: pointer;
}
.todo-circle {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid #c8c9cc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  transition: all 0.2s;
}
.todo-circle.on {
  background: #07c160;
  border-color: #07c160;
}
.todo-body {
  flex: 1;
  min-width: 0;
}
.todo-name {
  font-size: 14px;
  line-height: 1.4;
  word-break: break-all;
}
.todo-name.done {
  color: #c8c9cc;
  text-decoration: line-through;
}
.todo-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.meta-text {
  font-size: 11px;
  color: #969799;
}
.meta-text.overdue {
  color: #ee0a24;
  font-weight: 600;
}
.done-toggle {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: #969799;
  cursor: pointer;
  background: #fafbfc;
}
.done-toggle .van-icon {
  margin-right: 4px;
}
.affair-card {
  margin: 0;
  padding: 12px 14px;
  background: transparent;
  border-radius: 0;
  cursor: pointer;
  border-bottom: 1px solid #f5f6f8;
}
.filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}
.fchip {
  padding: 3px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #ebedf0;
  color: #646566;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.fchip.on {
  background: rgba(25, 137, 250, 0.1);
  border-color: rgba(25, 137, 250, 0.4);
  color: #1989fa;
  font-weight: 600;
}
.affair-head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.affair-head .affair-title {
  margin-right: auto;
}
.affair-title {
  font-size: 15px;
  font-weight: 600;
}
.affair-title.done {
  color: #c8c9cc;
  text-decoration: line-through;
}
.affair-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #969799;
}
.affair-note {
  margin-top: 6px;
  font-size: 12px;
  color: #646566;
  line-height: 1.5;
}
.affair-bar {
  margin-top: 10px;
}
.affair-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: #969799;
}
.btn-swipe {
  height: 100%;
}
</style>
