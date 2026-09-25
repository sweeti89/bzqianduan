<script setup>
import { computed, ref } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { exportAll } from '../data/db'
import { getConfig, getMeta, enable, disable, push, pull } from '../data/sync'
import { lockState, setPin, disablePin, lockNow, markUnlocked } from '../data/lock'
import { hasPin, verifyPersonPin, setPersonPin } from '../data/pins'
import { useIdentityStore } from '../stores/identity'
import { useTrashStore, TRASH_TYPE_META } from '../stores/trash'
import {
  WALLPRESETS,
  prefs,
  setWallpaperPreset,
  setWallpaperImage,
  resetWallpaper,
} from '../data/prefs'

const identity = useIdentityStore()
const trashStore = useTrashStore()
const trashShow = ref(false)

function itemTitle(item) {
  const d = item.data
  return d.title || d.category || '未命名'
}
function itemTime(item) {
  return new Date(item.deletedAt).toLocaleString('zh-CN', { hour12: false })
}
async function restoreTrash(item) {
  trashStore.restore(item.id)
  showSuccessToast('已恢复')
}
async function purgeTrash(item) {
  try {
    await showConfirmDialog({ title: '彻底删除', message: '彻底删除后无法再恢复，确定吗？' })
  } catch {
    return
  }
  await trashStore.purge(item.id)
  showSuccessToast('已彻底删除')
}
async function clearTrash() {
  try {
    await showConfirmDialog({
      title: '清空回收站',
      message: '将彻底删除回收站里的全部内容，确定吗？',
    })
  } catch {
    return
  }
  await trashStore.clearAll()
  showSuccessToast('已清空')
}
function openLegacy() {
  window.open(location.pathname + 'legacy/', '_blank')
}

// 允许恢复的业务数据 key（与 db.js 的 banwei: 前缀对应）
const RESTORE_KEYS = ['roster', 'todos', 'fees', 'affairs']

const fileInput = ref(null)

// ---------- 备份 / 恢复 ----------
function backup() {
  const data = exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `班委助手备份-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  showSuccessToast('备份文件已下载')
}

function pickRestore() {
  fileInput.value?.click()
}

async function onRestoreFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    return showFailToast('不是有效的备份文件')
  }
  const keys = Object.keys(data || {}).filter((k) => RESTORE_KEYS.includes(k))
  if (!keys.length) return showFailToast('备份里没有可恢复的数据')
  try {
    await showConfirmDialog({
      title: '恢复备份',
      message: `将用备份覆盖当前的：${keys.join('、')}。当前数据会被替换，确定继续吗？`,
    })
  } catch {
    return
  }
  for (const k of keys) {
    localStorage.setItem('banwei:' + k, data[k])
  }
  showSuccessToast('恢复成功，正在刷新')
  setTimeout(() => location.reload(), 800)
}

// ---------- 联机同步 ----------
const cfg = ref(getConfig() || {})
const enabled = computed(() => !!cfg.value?.enabled)
const lastSyncText = computed(() => {
  const t = getMeta()?.lastSyncAt
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '还没同步过'
})

const syncShow = ref(false)
const form = ref({ appId: '', appKey: '', server: '' })

function openSync() {
  form.value = {
    appId: cfg.value.appId || '',
    appKey: cfg.value.appKey || '',
    server: cfg.value.server || '',
  }
  syncShow.value = true
}

async function saveEnable() {
  if (!form.value.appId.trim() || !form.value.appKey.trim())
    return showFailToast('请填写 AppID 和 AppKey')
  try {
    enable({
      appId: form.value.appId.trim(),
      appKey: form.value.appKey.trim(),
      server: form.value.server.trim(),
    pass: form.value.pass.trim(),
    pass: form.value.pass.trim(),
    })
  } catch (e) {
    console.error(e)
    return showFailToast('开启失败，请检查凭证：' + (e?.message || e))
  }
  cfg.value = getConfig()
  syncShow.value = false
  showSuccessToast('联机已开启，建议先点「上传数据」建立云端基准')
}

async function doPush() {
  try {
    await push()
    showSuccessToast('已把本机数据上传到云端（已加密）')
  } catch (e) {
    console.error(e)
    showFailToast('上传失败：' + (e?.message || e))
  }
}

async function doPull() {
  try {
    const r = await pull()
    if (r.applied) {
      showSuccessToast('云端有新数据，正在刷新')
      setTimeout(() => location.reload(), 600)
    } else {
      showSuccessToast('云端没有更新的数据')
    }
  } catch (e) {
    console.error(e)
    showFailToast('下载失败：' + (e?.message || e))
  }
}

async function doDisable() {
  try {
    await showConfirmDialog({
      title: '关闭联机',
      message: '关闭后各设备不再同步（各自本地数据保留），确定吗？',
    })
  } catch {
    return
  }
  disable()
  cfg.value = getConfig()
  syncShow.value = false
  showSuccessToast('已关闭联机')
}

// ---------- 访问口令 ----------
const lockShow = ref(false)
const lockMode = ref('panel') // panel=功能面板 | set=设置/修改 | disable=验证关闭
const lockForm = ref({ a: '', b: '' })
const disableValue = ref('')

function openLock() {
  lockMode.value = lockState.on ? 'panel' : 'set'
  lockForm.value = { a: '', b: '' }
  disableValue.value = ''
  lockShow.value = true
}

async function saveLock() {
  const a = lockForm.value.a
  if (a.length < 4) return showFailToast('口令至少 4 位')
  if (a !== lockForm.value.b) return showFailToast('两次输入不一致')
  await setPin(a)
  markUnlocked()
  lockShow.value = false
  showSuccessToast('口令已保存，下次打开应用时生效')
}

async function doDisableLock() {
  const ok = await disablePin(disableValue.value)
  if (ok) {
    lockShow.value = false
    showSuccessToast('口令已关闭')
  } else {
    showFailToast('口令不对')
    disableValue.value = ''
  }
}

// ---------- 个性化壁纸 ----------
const classShow = ref(false)
const classForm = ref('')
function saveClassName() {
  prefs.className = classForm.value.trim()
  persistPrefs()
  classShow.value = false
  showSuccessToast('班级名称已保存')
}
const wpShow = ref(false)
const wpInput = ref(null)
const wpValueText = computed(() => {
  const w = prefs.wallpaper
  if (w?.type === 'preset') return WALLPRESETS.find((p) => p.id === w.presetId)?.name || '预设'
  if (w?.type === 'image') return '自定义图片'
  return '默认'
})
function applyPreset(id) {
  setWallpaperPreset(id)
  showSuccessToast('已应用')
}
async function onWallpaperFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    await setWallpaperImage(file)
    showSuccessToast('壁纸已更换')
  } catch (err) {
    showFailToast(err?.message || '更换失败')
  }
}

async function switchIdentity() {
  try {
    await showConfirmDialog({
      title: '切换身份',
      message: '将回到身份选择页重新选「你是谁」，本机数据保留。确定吗？',
    })
  } catch {
    return
  }
  identity.clearIdentity()
}

// ---------- 个人密码（身份防冒用） ----------
const personPwdShow = ref(false)
const personPwdForm = ref({ old: '', a: '', b: '' })
const personHasPin = computed(() => identity.member ? hasPin(identity.member.id) : false)

function openPersonPwd() {
  personPwdForm.value = { old: '', a: '', b: '' }
  personPwdShow.value = true
}

async function savePersonPwd() {
  const me = identity.member
  if (!me) return
  if (!(await verifyPersonPin(me.id, personPwdForm.value.old)))
    return showFailToast('旧密码不对')
  if (personPwdForm.value.a.length < 4) return showFailToast('至少 4 位')
  if (personPwdForm.value.a !== personPwdForm.value.b)
    return showFailToast('两次输入不一致')
  await setPersonPin(me.id, personPwdForm.value.a)
  personPwdShow.value = false
  showSuccessToast('个人密码已修改')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div class="head-title">我的</div>
      <div class="head-sub">{{ identity.member?.name || '' }} · {{ identity.label }}</div>
    </div>
    <div class="page-body">

    <!-- 班级信息 -->
    <van-cell-group inset class="mt12">
      <van-cell
        title="班级名称"
        :value="prefs.className || '未设置'"
        is-link
        label="用于账单长图的抬头显示"
        @click="classShow = true"
      />
    </van-cell-group>

    <!-- 个性化壁纸 -->
    <van-cell-group inset class="mt12">
      <van-cell
        title="个性化壁纸"
        :value="wpValueText"
        is-link
        label="预设渐变或自定义图片，仅保存在本设备"
        @click="wpShow = true"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(255, 125, 171, 0.15); color: #ff5c9d">
            <van-icon name="photo-o" />
          </span>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 当前身份 -->
    <van-cell-group inset class="mt12">
      <van-cell title="当前身份" :value="identity.member?.name || ''">
        <template #icon>
          <span class="icon-chip" style="background: rgba(125, 92, 255, 0.14); color: #7d5cff">
            <van-icon name="manager-o" />
          </span>
        </template>
        <template #label>
          {{ identity.label }} ·
          {{ identity.role === 'monitor' ? '拥有全部权限' : identity.role === 'committee' ? '日常管理权限' : '只读浏览，联系方式已隐藏' }}
        </template>
      </van-cell>
      <van-cell title="切换身份" is-link @click="switchIdentity">
        <template #icon>
          <span class="icon-chip" style="background: rgba(10, 168, 143, 0.14); color: #0aa88f">
            <van-icon name="swap" />
          </span>
        </template>
      </van-cell>
      <van-cell
        title="个人密码"
        :value="personHasPin ? '已设置' : '未设置'"
        is-link
        label="别人选你这个身份时需要输入，防止冒用"
        @click="openPersonPwd"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(245, 166, 35, 0.18); color: #e69500">
            <van-icon name="certificate" />
          </span>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 访问口令 -->
    <van-cell-group inset class="mt12">
      <van-cell
        title="访问口令"
        :value="lockState.on ? '已开启' : '未设置'"
        is-link
        :label="lockState.on ? '打开应用需输入口令，防止别人翻看班级数据' : '建议设置：字母+数字口令，防止别人拿到你手机后翻看班级数据'"
        @click="openLock"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(25, 137, 250, 0.13); color: #1989fa">
            <van-icon name="shield-o" />
          </span>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 联机同步（仅班长） -->
    <van-cell-group v-if="identity.isMonitor" inset class="mt12">
      <van-cell
        title="联机同步"
        :value="enabled ? '已开启' : '未开启'"
        is-link
        :label="enabled ? `最近同步：${lastSyncText}` : '开启后班委共享同一份数据（需 LeanCloud 免费账号）'"
        @click="openSync"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(7, 193, 96, 0.15); color: #07c160">
            <van-icon name="exchange" />
          </span>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 回收站 / 备份 / 恢复 -->
    <van-cell-group v-if="identity.canManage" inset class="mt12">
      <van-cell
        title="回收站"
        :value="trashStore.list.length ? `${trashStore.list.length} 项` : ''"
        is-link
        label="删除的事务、待办、账目保留 7 天，可恢复"
        @click="trashShow = true"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(107, 124, 156, 0.18); color: #6b7c9c">
            <van-icon name="delete-o" />
          </span>
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group inset class="mt12">
      <van-cell title="关于" :value="`班委助手 v${__APP_VERSION__}`" />
      <van-cell
        v-if="identity.isMonitor"
        title="数据备份"
        is-link
        label="把名册、待办、班费、事务等全部数据导出为 JSON 文件，发到微信/QQ 收藏即可换机迁移"
        @click="backup"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(10, 168, 143, 0.14); color: #0aa88f">
            <van-icon name="down" />
          </span>
        </template>
      </van-cell>
      <van-cell
        v-if="identity.isMonitor"
        title="数据恢复"
        is-link
        label="选择之前导出的备份文件，覆盖当前数据"
        @click="pickRestore"
      >
        <template #icon>
          <span class="icon-chip" style="background: rgba(255, 151, 102, 0.18); color: #ff8f4d">
            <van-icon name="replay" />
          </span>
        </template>
      </van-cell>
    </van-cell-group>

    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      style="display: none"
      @change="onRestoreFile"
    />

    <!-- 联机设置弹窗 -->
    <van-popup v-model:show="syncShow" position="bottom" round>      <div class="form-wrap">
        <div class="form-title">联机同步设置</div>
        <van-cell-group inset>
          <van-field v-model="form.appId" label="AppID" placeholder="LeanCloud 应用凭证里的 AppID" />
          <van-field v-model="form.appKey" label="AppKey" placeholder="LeanCloud 应用凭证里的 AppKey" />
          <van-field
            v-model="form.server"
            label="服务器地址"
            placeholder="必填，复制凭证页的 API 访问地址"
          />
        </van-cell-group>
        <div class="sync-tip">
          开启后，班委设备之间自动同步名册、待办、班费、事务（以最后保存为准，尽量避免两人同时改）。
          凭证图片暂不参与同步，只保存在记账人的手机上。
        </div>
        <div class="form-actions" v-if="!enabled">
          <van-button round block type="primary" @click="saveEnable">保存并开启</van-button>
        </div>
        <template v-else>
          <div class="form-actions">
            <van-button round plain type="primary" @click="doPull">下载数据</van-button>
            <van-button round plain type="warning" @click="doPush">上传数据</van-button>
          </div>
          <div class="form-actions">
            <van-button round block plain type="danger" @click="doDisable">关闭联机</van-button>
          </div>
        </template>
      </div>
    </van-popup>

    <!-- 访问口令弹窗 -->
    <van-popup v-model:show="lockShow" position="bottom" round>
      <div class="form-wrap">
        <div class="form-title">访问口令</div>

        <template v-if="lockMode === 'panel'">
          <van-cell-group inset>
            <van-cell title="状态" value="已开启" />
            <van-cell title="作用" label="打开应用需输入口令，防止别人翻看" />
          </van-cell-group>
          <div class="form-actions">
            <van-button round plain type="primary" @click="lockMode = 'set'">修改口令</van-button>
            <van-button round plain type="warning" @click="lockMode = 'disable'">关闭口令</van-button>
          </div>
          <div class="form-actions">
            <van-button round block plain type="primary" @click="openPersonPwd">修改个人密码</van-button>
          </div>
          <div class="form-actions">
            <van-button
              round
              block
              type="primary"
              @click="
                lockNow();
                lockShow = false;
                showSuccessToast('已锁屏');
              "
            >
              立即锁屏
            </van-button>
          </div>
        </template>

        <template v-else-if="lockMode === 'disable'">
          <div class="pin-hint">输入当前口令以关闭</div>
          <van-cell-group inset>
            <van-field v-model="disableValue" type="password" label="口令" placeholder="当前口令" />
          </van-cell-group>
          <div class="form-actions">
            <van-button round block type="warning" @click="doDisableLock">确认关闭</van-button>
          </div>
        </template>

        <template v-else>
          <van-cell-group inset>
            <van-field
              v-model="lockForm.a"
              type="password"
              label="新口令"
              placeholder="字母+数字，至少 4 位"
              clearable
            />
            <van-field
              v-model="lockForm.b"
              type="password"
              label="确认口令"
              placeholder="再输入一次"
              clearable
            />
          </van-cell-group>
          <div class="form-actions">
            <van-button round block type="primary" @click="saveLock">保存口令</van-button>
          </div>
          <div class="pin-hint">建议字母+数字混合 6 位以上，如 24math 这类好记组合</div>
        </template>
      </div>
    </van-popup>
    <!-- 个人密码弹窗 -->
    <van-popup v-model:show="personPwdShow" position="bottom" round>
      <div class="form-wrap">
        <div class="form-title">修改个人密码</div>
        <van-cell-group inset>
          <van-field
            v-model="personPwdForm.old"
            type="password"
            label="旧密码"
            :placeholder="personHasPin ? '当前的个人密码' : '首次设置，留空即可'"
          />
          <van-field v-model="personPwdForm.a" type="password" label="新密码" placeholder="字母+数字，至少 4 位" clearable />
          <van-field v-model="personPwdForm.b" type="password" label="确认密码" placeholder="再输入一次" clearable />
        </van-cell-group>
        <div class="form-actions">
          <van-button round block type="primary" @click="savePersonPwd">保存</van-button>
        </div>
      </div>
    </van-popup>
    <!-- 班级名称弹窗 -->
    <van-popup v-model:show="classShow" position="bottom" round>
      <div class="form-wrap">
        <div class="form-title">班级名称</div>
        <van-cell-group inset>
          <van-field v-model="classForm" label="名称" placeholder="如：高一(1)班" maxlength="20" />
          <van-field
            v-model="form.pass"
            type="password"
            label="同步口令"
            placeholder="班委线下共享，绝不入代码库"
          />
        </van-cell-group>
        <div class="form-actions">
          <van-button round block type="primary" @click="saveClassName">保存</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 壁纸设置弹窗 -->
    <van-popup v-model:show="wpShow" position="bottom" round>
      <div class="form-wrap">
        <div class="form-title">个性化壁纸</div>

        <div class="wp-grid">
          <div
            v-for="p in WALLPRESETS"
            :key="p.id"
            class="wp-swatch"
            :style="p.id === 'default' ? { background: '#f7f8fa' } : p.style"
            @click="applyPreset(p.id)"
          >
            <span class="wp-swatch-name">{{ p.name }}</span>
            <van-icon
              v-if="wpValueText === p.name || (p.id === 'default' && wpValueText === '默认')"
              name="success"
              class="wp-check"
            />
          </div>
        </div>

        <div class="wp-upload">
          <van-button
            round
            block
            plain
            type="primary"
            icon="photograph"
            :loading="wpUploading"
            @click="wpInput?.click()"
          >
            使用自定义图片
          </van-button>
          <img
            v-if="prefs.wallpaper?.type === 'image' && prefs.wallpaper.imageUrl"
            :src="prefs.wallpaper.imageUrl"
            class="wp-preview"
          />
        </div>

        <div class="form-actions">
          <van-button round block plain @click="resetWallpaper(); wpShow = false">恢复默认</van-button>
        </div>
        <div class="pin-hint">壁纸仅保存在本设备，不会同步给其他人；支持图片不超过 5MB</div>
      </div>
      <input
        ref="wpInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onWallpaperFile"
      />
    </van-popup>

    <!-- 回收站弹窗 -->
    <van-popup v-model:show="trashShow" position="bottom" round :style="{ height: '80%' }">
      <div class="form-wrap">
        <div class="form-title">回收站</div>
        <div class="pin-hint">删除的事务、待办、账目保留 7 天，过期自动清除</div>
        <van-cell-group inset>
          <van-cell v-for="item in trashStore.list" :key="item.id">
            <template #title>
              <van-tag :type="TRASH_TYPE_META[item.type]?.tag || 'default'" class="trash-tag">
                {{ TRASH_TYPE_META[item.type]?.label || '条目' }}
              </van-tag>
              <span class="trash-title">{{ itemTitle(item) }}</span>
            </template>
            <template #label>{{ itemTime(item) }}</template>
            <template #value>
              <div class="trash-actions">
                <van-button size="mini" plain type="primary" @click="restoreTrash(item)">恢复</van-button>
                <van-button size="mini" plain type="danger" @click="purgeTrash(item)">彻底删除</van-button>
              </div>
            </template>
          </van-cell>
        </van-cell-group>
        <van-empty v-if="!trashStore.list.length" description="回收站是空的" />
        <div v-if="trashStore.list.length" class="form-actions">
          <van-button round block plain type="danger" @click="clearTrash">清空回收站</van-button>
        </div>
      </div>
    </van-popup>
    </div>
  </div>
</template>

<style scoped>
.mt12 {
  margin-top: 12px;
}
.sync-tip {
  padding: 12px 20px 0;
  font-size: 11px;
  color: #969799;
  line-height: 1.6;
}
.form-actions {
  display: flex;
  gap: 12px;
}
.pin-hint {
  padding: 12px 20px 0;
  text-align: center;
  font-size: 12px;
  color: #969799;
}
.wp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 4px 20px 8px;
}
.wp-swatch {
  position: relative;
  height: 64px;
  border-radius: 10px;
  border: 1px solid #ebedf0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}
.wp-swatch-name {
  font-size: 11px;
  color: #646566;
  padding-bottom: 4px;
}
.wp-check {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #1989fa;
  background: #fff;
  border-radius: 50%;
  font-size: 14px;
}
.wp-upload {
  padding: 8px 20px 0;
}
.wp-preview {
  width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 10px;
  margin-top: 10px;
}
.trash-tag {
  margin-right: 8px;
}
.trash-title {
  font-size: 13px;
}
.trash-actions {
  display: flex;
  gap: 6px;
}
</style>
