<script setup>
import { computed, ref, watch } from 'vue'
import * as XLSX from 'xlsx'
import { showFailToast, showSuccessToast } from 'vant'
import { useRosterStore, HEADER_MAP } from '../stores/roster'
import { useIdentityStore } from '../stores/identity'
import MemberForm from '../components/MemberForm.vue'

const store = useRosterStore()
const identity = useIdentityStore()
const search = ref('')
const activeNames = ref([])
const formShow = ref(false)
const editing = ref(null) // null = 新增
const fileInput = ref(null)

const groups = computed(() => store.dormGroups)
const stats = computed(() => store.stats)

// 名册刚导入、分组很少时默认展开
watch(
  groups,
  (g) => {
    if (g.length && activeNames.value.length === 0 && g.length <= 3) {
      activeNames.value = g.map((x) => x.dorm)
    }
  },
  { immediate: true }
)

const searching = computed(() => search.value.trim().length > 0)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return store.members.filter((m) =>
    [m.name, m.studentId, m.dorm, m.phone, m.duty].some((v) =>
      String(v || '').toLowerCase().includes(q)
    )
  )
})

function openAdd() {
  if (!identity.isMonitor) return
  editing.value = null
  formShow.value = true
}

function openEdit(m) {
  if (!identity.canManage) return
  editing.value = m
  formShow.value = true
}

function dutyTag(m) {
  return (m.duty || '').trim()
}

// ---------- Excel 导入 / 导出 ----------
const HEADERS = ['姓名', '学号', '性别', '宿舍', '手机号', '职务', '备注']
const SAMPLE = ['张三', '2024010101', '男', '1-301', '13800000000', '班长', '示例行，导入前请删除']

function writeBook(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = HEADERS.map(() => ({ wch: 14 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '班级名册')
  XLSX.writeFile(wb, filename)
}

function exportTemplate() {
  writeBook([HEADERS, SAMPLE], '名册导入模板.xlsx')
}

function exportExcel() {
  if (!store.members.length) return showFailToast('名册是空的')
  const rows = [
    HEADERS,
    ...store.members.map((m) => [m.name, m.studentId, m.gender, m.dorm, m.phone, m.duty, m.note]),
  ]
  writeBook(rows, '班级名册.xlsx')
}

function pickFile() {
  fileInput.value?.click()
}

const str = (v) => String(v ?? '').trim()

// 解析并映射列；没识别到「姓名」列返回 null
function tryParse(buf, opts) {
  const wb = XLSX.read(buf, opts)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length < 2) return { empty: true }
  const headers = rows[0].map((h) => str(h).toLowerCase())
  const colOf = {}
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    const idx = headers.findIndex((h) => aliases.some((a) => h === a.toLowerCase()))
    if (idx >= 0) colOf[field] = idx
  }
  if (colOf.name === undefined) return null
  const pick = (r, f) => (colOf[f] !== undefined ? str(r[colOf[f]]) : '')
  const list = rows
    .slice(1)
    .map((r) => ({
      name: pick(r, 'name'),
      studentId: pick(r, 'studentId'),
      gender: pick(r, 'gender'),
      dorm: pick(r, 'dorm'),
      phone: pick(r, 'phone'),
      duty: pick(r, 'duty'),
      note: pick(r, 'note'),
    }))
    .filter((m) => m.name)
  return { empty: !list.length, list }
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const buf = await file.arrayBuffer()
    // Excel 导出的 CSV 可能是 UTF-8 也可能是 GBK（ANSI），先按 UTF-8 试，表头识别失败再按 GBK 重试
    let parsed = tryParse(buf, { type: 'array' })
    if (parsed === null) parsed = tryParse(buf, { type: 'array', codepage: 936 })
    if (parsed === null) {
      return showFailToast('没有识别到「姓名」列，请用「下载模板」里的表头')
    }
    if (parsed.empty) return showFailToast('表格里没有有效数据行')
    const res = store.importMembers(parsed.list)
    showSuccessToast(
      `新增 ${res.added} 人，更新 ${res.updated} 人${res.skipped ? `，跳过重复 ${res.skipped} 条` : ''}`
    )
  } catch (err) {
    console.error(err)
    showFailToast('文件解析失败，建议另存为 .xlsx 再导入')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="head-title">班级名册</div>
      <div class="head-sub">共 {{ stats.total }} 人 · {{ stats.dormCount }} 个宿舍 · 班委 {{ stats.committeeCount }} 人</div>
    </div>
    <div class="page-body">
      <van-search v-model="search" placeholder="搜索姓名 / 学号 / 宿舍 / 职务" />

    <div v-if="identity.isMonitor" class="toolbar">
      <van-button size="small" type="primary" icon="plus" @click="openAdd">添加</van-button>
      <van-button size="small" plain type="primary" icon="down" @click="pickFile">导入 Excel</van-button>
      <van-button size="small" plain icon="description" @click="exportTemplate">下载模板</van-button>
      <van-button size="small" plain icon="upgrade" @click="exportExcel">导出 Excel</van-button>
    </div>

    <!-- 搜索时：平铺结果 -->
    <van-cell-group v-if="searching" inset class="stagger">
      <template v-if="filtered.length">
        <van-cell
          v-for="m in filtered"
          :key="m.id"
          is-link
          :title="m.name"
          :label="`学号 ${m.studentId || '—'} · 宿舍 ${m.dorm || '—'}`"
          @click="openEdit(m)"
        >
          <template #value>
            <van-tag v-if="dutyTag(m)" type="primary">{{ dutyTag(m) }}</van-tag>
          </template>
        </van-cell>
      </template>
      <van-empty v-else description="没有匹配的成员" />
    </van-cell-group>

    <!-- 默认：按宿舍分组折叠 -->
    <template v-else>
      <van-empty
        v-if="!groups.length"
        image="search"
        description="还没有成员：先「下载模板」填好，再「导入 Excel」"
      />
      <van-collapse v-else v-model="activeNames" class="stagger">
        <van-collapse-item v-for="g in groups" :key="g.dorm" :name="g.dorm">
          <template #title>
            <span class="dorm-name">{{ g.dorm }}</span>
            <van-tag plain type="primary" class="ml8">{{ g.list.length }} 人</van-tag>
          </template>
          <van-cell
            v-for="m in g.list"
            :key="m.id"
            is-link
            :title="m.name"
            :label="`学号 ${m.studentId || '—'}${identity.role !== 'member' && m.phone ? ' · ' + m.phone : ''}`"
            @click="openEdit(m)"
          >
            <template #value>
              <van-tag v-if="dutyTag(m)" type="primary">{{ dutyTag(m) }}</van-tag>
            </template>
          </van-cell>
        </van-collapse-item>
      </van-collapse>
    </template>

    <input
      ref="fileInput"
      type="file"
      accept=".xlsx,.xls,.csv"
      style="display: none"
      @change="onFile"
    />
    <MemberForm
      v-model:show="formShow"
      :member="editing"
      :can-edit-duty="identity.isMonitor"
      :can-delete="identity.isMonitor"
    />
    </div>
  </div>
</template>

<style scoped>
.dorm-name {
  font-weight: 600;
}
.ml8 {
  margin-left: 8px;
}
</style>
