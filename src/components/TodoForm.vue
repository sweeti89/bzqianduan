<script setup>
import { ref, watch } from 'vue'
import { showToast } from 'vant'
import { useTodoStore } from '../stores/todos'
import { useIdentityStore } from '../stores/identity'

const show = defineModel('show', { type: Boolean, default: false })
const store = useTodoStore()
const identity = useIdentityStore()

const form = ref({ title: '', date: '', type: '个人' })
const calShow = ref(false)
const minDate = new Date(new Date().setFullYear(new Date().getFullYear() - 2))
const maxDate = new Date(new Date().setFullYear(new Date().getFullYear() + 2))

watch(show, (v) => {
  if (v) form.value = { title: '', date: '', type: '个人' }
})

function onConfirmDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  form.value.date = `${y}-${m}-${day}`
  calShow.value = false
}

function onSubmit() {
  const title = form.value.title.trim()
  if (!title) return showToast('请填写内容')
  store.add({ title, date: form.value.date, type: form.value.type, ownerId: identity.memberId })
  show.value = false
  showToast('已添加')
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round>
    <div class="form-wrap">
      <div class="form-title">添加待办</div>
      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field v-model="form.title" label="内容" placeholder="要做什么？" required maxlength="50" />
          <van-field
            :model-value="form.date"
            label="日期"
            placeholder="可选，用于排序和过期提醒"
            readonly
            is-link
            @click="calShow = true"
          />
          <van-field label="类型">
            <template #input>
              <van-radio-group v-model="form.type" direction="horizontal">
                <van-radio name="个人">个人</van-radio>
                <van-radio name="班级">班级</van-radio>
              </van-radio-group>
            </template>
          </van-field>
        </van-cell-group>
        <div v-if="form.date" class="date-clear">
          <van-tag closeable type="primary" @close="form.date = ''">{{ form.date }}，点 × 清除</van-tag>
        </div>
        <div class="form-actions">
          <van-button round block type="primary" native-type="submit">保存</van-button>
        </div>
      </van-form>
    </div>
    <van-calendar
      v-model:show="calShow"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onConfirmDate"
    />
  </van-popup>
</template>

<style scoped>
.date-clear {
  padding: 10px 32px 0;
}
.form-actions {
  display: flex;
  padding-top: 4px;
}
</style>
