<script setup>
import { computed, ref } from 'vue'
import * as XLSX from 'xlsx'
import { showFailToast, showSuccessToast, showImagePreview, showToast } from 'vant'
import { useFeesStore } from '../stores/fees'
import { useIdentityStore } from '../stores/identity'
import { prefs } from '../data/prefs'
import { useTrashStore } from '../stores/trash'
import FeeForm from '../components/FeeForm.vue'
import AnimatedNumber from '../components/AnimatedNumber.vue'
import { generateBillImage } from '../utils/billImage'

const identity = useIdentityStore()
const fees = useFeesStore()
const trashStore = useTrashStore()

const tab = ref('all')
const formShow = ref(false)
const editing = ref(null) // null = 记一笔
const balanceShow = ref(false)
const balanceInput = ref('')

const list = computed(() => {
  if (tab.value === '支出') return fees.sortedRecords.filter((r) => r.type === '支出')
  if (tab.value === '收入') return fees.sortedRecords.filter((r) => r.type === '收入')
  return fees.sortedRecords
})

function openAdd() {
  if (!identity.canManage) return
  editing.value = null
  formShow.value = true
}

// 删除 → 移入回收站（凭证保留，可恢复）
function archiveFee(r) {
  trashStore.add('fee', r)
  fees.archiveRecord(r.id)
}

// 生成账单长图 → 全屏预览，长按保存/转发
function shareBill() {
  if (!fees.records.length) return showFailToast('还没有收支记录')
  const url = generateBillImage({
    initialBalance: fees.initialBalance ?? 0,
    balance: fees.balance,
    totalIncome: fees.totalIncome,
    totalExpense: fees.totalExpense,
    records: fees.sortedRecords,
    className: prefs.className || '',
  })
  showImagePreview({ images: [url], closeable: true })
  showToast('长按图片可保存或转发')
}

function openEdit(r) {
  if (!identity.canManage) return
  editing.value = r
  formShow.value = true
}

function openBalance() {
  balanceInput.value = fees.initialBalance == null ? '' : String(fees.initialBalance)
  balanceShow.value = true
}

function saveBalance() {
  const v = Number(balanceInput.value)
  if (Number.isNaN(v) || v < 0) return showFailToast('请输入正确的金额')
  fees.setInitialBalance(v)
  balanceShow.value = false
  showSuccessToast('期初余额已保存')
}

function amountText(r) {
  return `${r.type === '支出' ? '-' : '+'}¥${r.amount.toFixed(2)}`
}

function exportExcel() {
  if (!fees.records.length) return showFailToast('还没有收支记录')
  const rows = [
    ['日期', '类型', '分类', '金额', '经办人', '备注'],
    ['—', '期初余额', '', fees.initialBalance ?? 0, '', ''],
    ...fees.sortedRecords.map((r) => [
      r.date,
      r.type,
      r.category,
      r.type === '支出' ? -r.amount : r.amount,
      r.handler,
      r.note,
    ]),
    ['—', '当前余额', '', fees.balance, '', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 24 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '班费收支')
  XLSX.writeFile(wb, '班费收支明细.xlsx')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="head-title">班费</div>
      <div class="head-sub">收支透明 · 每一笔都有据可查</div>
    </div>
    <div class="page-body">

    <!-- 余额卡片 -->
    <div class="balance-card">
      <template v-if="fees.initialBalance == null">
        <div class="balance-empty">还没有设置期初余额</div>
        <div class="balance-hint">
          {{ identity.isMonitor ? '把你们已经核算好的班费总数填进来作为记账起点' : '期初余额由班长设置' }}
        </div>
        <van-button
          v-if="identity.isMonitor"
          size="small"
          round
          plain
          type="primary"
          class="balance-btn"
          @click="openBalance"
        >
          设置期初余额
        </van-button>
      </template>
      <template v-else>
        <div class="balance-label">当前余额</div>
        <div class="balance-num">¥<AnimatedNumber :value="fees.balance" /></div>
        <div class="balance-sub">
          期初
          <span v-if="identity.isMonitor" class="link" @click="openBalance">¥{{ fees.initialBalance.toFixed(2) }}</span>
          <span v-else>¥{{ fees.initialBalance.toFixed(2) }}</span>
          · 本月支出 ¥{{ fees.monthExpense.toFixed(2) }}
          · 本月收入 ¥{{ fees.monthIncome.toFixed(2) }}
        </div>
      </template>
    </div>

    <!-- 支出分类 -->
    <template v-if="fees.byCategory.length">
      <div class="section-title">支出分类</div>
      <div class="cat-box stagger">
        <div v-for="c in fees.byCategory" :key="c.name" class="cat-item">
          <div class="cat-row">
            <span>{{ c.name }}</span>
            <span>¥{{ c.amount.toFixed(2) }}</span>
          </div>
          <div class="cat-track">
            <div class="cat-fill" :style="{ width: (c.amount / (fees.byCategory[0].amount || 1)) * 100 + '%' }"></div>
          </div>
        </div>
      </div>
    </template>

    <div v-if="identity.canManage" class="toolbar">
      <van-button size="small" type="primary" icon="plus" @click="openAdd">记一笔</van-button>
      <van-button
        v-if="identity.isMonitor"
        size="small"
        plain
        type="primary"
        icon="description"
        @click="shareBill"
      >
        生成账单图
      </van-button>
      <van-button
        v-if="identity.isMonitor"
        size="small"
        plain
        type="primary"
        icon="upgrade"
        @click="exportExcel"
      >
        导出 Excel
      </van-button>
    </div>

    <van-tabs v-model:active="tab" sticky>
      <van-tab title="全部" name="all" />
      <van-tab title="支出" name="支出" />
      <van-tab title="收入" name="收入" />
    </van-tabs>

    <van-empty
      v-if="!list.length"
      description="还没有收支记录，点「记一笔」开始记账"
    />
    <div class="stagger">
      <van-swipe-cell v-for="r in list" :key="r.id">
      <van-cell @click="openEdit(r)">
        <template #title>
          {{ r.category || '未分类' }}
        </template>
        <template #label>
          {{ r.date }} · 经办 {{ r.handler || '—' }}<template v-if="r.attachments?.length"> · 凭证{{ r.attachments.length }}</template><template v-if="r.note"> · {{ r.note }}</template>
        </template>
        <template #value>
          <span :class="r.type === '支出' ? 'exp' : 'inc'">{{ amountText(r) }}</span>
        </template>
      </van-cell>
      <template #right>
        <van-button
          v-if="identity.isMonitor"
          square
          type="danger"
          text="删除"
          class="btn-swipe"
          @click.stop="archiveFee(r)"
        />
      </template>
    </van-swipe-cell>
    </div>

    <FeeForm v-model:show="formShow" :record="editing" />

    <!-- 期初余额弹窗 -->
    <van-popup v-model:show="balanceShow" position="bottom" round>
      <div class="form-wrap">
        <div class="form-title">期初余额</div>
        <van-cell-group inset>
          <van-field
            v-model="balanceInput"
            label="金额"
            type="number"
            placeholder="如 5000"
            required
          />
        </van-cell-group>
        <div class="form-actions">
          <van-button round block type="primary" @click="saveBalance">保存</van-button>
        </div>
      </div>
    </van-popup>
    </div>
  </div>
</template>

<style scoped>
.balance-card {
  position: relative;
  overflow: hidden;
  margin: 4px 12px 12px;
  padding: 18px 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #1989fa, #39a0ff);
  color: #fff;
  box-shadow: 0 6px 16px rgba(25, 137, 250, 0.28);
}
/* 卡片上的光斑装饰 */
.balance-card::before,
.balance-card::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  pointer-events: none;
}
.balance-card::before {
  width: 150px;
  height: 150px;
  top: -50px;
  right: -30px;
}
.balance-card::after {
  width: 90px;
  height: 90px;
  bottom: -36px;
  left: -20px;
}
.balance-card > * {
  position: relative;
  z-index: 1;
}
.balance-empty {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
}
.balance-hint {
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 12px;
}
.balance-btn {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.8);
}
.balance-label {
  font-size: 13px;
  opacity: 0.9;
}
.balance-num {
  font-size: 34px;
  font-weight: 700;
  margin: 6px 0 10px;
}
.balance-sub {
  font-size: 12px;
  opacity: 0.92;
}
.link {
  text-decoration: underline dotted;
}
.section-title {
  padding: 4px 16px 8px;
  font-size: 14px;
  font-weight: 600;
}
.cat-box {
  margin: 0 12px 12px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.cat-item + .cat-item {
  margin-top: 10px;
}
.cat-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 4px;
}
.cat-track {
  height: 6px;
  border-radius: 3px;
  background: #f2f3f5;
  overflow: hidden;
}
.cat-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #1989fa, #39a0ff);
}
.exp {
  color: #ee0a24;
  font-weight: 600;
}
.inc {
  color: #07c160;
  font-weight: 600;
}
.btn-swipe {
  height: 100%;
}
</style>
