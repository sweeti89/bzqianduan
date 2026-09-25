<script setup>
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import LockScreen from './components/LockScreen.vue'
import IdentityPicker from './components/IdentityPicker.vue'
import { lockState } from './data/lock'
import { useIdentityStore } from './stores/identity'
import { prefs, wallpaperStyle } from './data/prefs'

const identity = useIdentityStore()
const wpStyle = computed(() => wallpaperStyle())
</script>

<template>
  <!-- 自定义壁纸层（在所有内容之下） -->
  <div class="wallpaper-layer" :style="wpStyle"></div>
  <div class="app-shell">
    <LockScreen v-if="lockState.on && !lockState.unlocked" />
    <IdentityPicker v-else-if="!identity.memberId" />
    <template v-else>
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in" :duration="{ enter: 220, leave: 150 }">
          <KeepAlive :max="4">
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
      <van-tabbar route safe-area-inset-bottom>
        <van-tabbar-item to="/" icon="home-o">工作台</van-tabbar-item>
        <van-tabbar-item to="/roster" icon="contact-o">名册</van-tabbar-item>
        <van-tabbar-item to="/fees" icon="gold-coin-o">班费</van-tabbar-item>
        <van-tabbar-item to="/profile" icon="user-o">我的</van-tabbar-item>
      </van-tabbar>
    </template>
  </div>
</template>
