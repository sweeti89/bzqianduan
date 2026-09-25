<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

// 数字滚动：值变化时用 rAF 做缓动过渡
const props = defineProps({
  value: { type: Number, required: true },
  duration: { type: Number, default: 600 },
  decimals: { type: Number, default: 2 },
})

const display = ref(Number.isFinite(props.value) ? props.value : 0)
let raf = null
onBeforeUnmount(() => cancelAnimationFrame(raf))

watch(
  () => props.value,
  (to, from) => {
    const target = Number.isFinite(to) ? to : 0
    const base = Number.isFinite(from) ? from : 0
    if (target === base) return
    cancelAnimationFrame(raf)
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / props.duration)
      const eased = 1 - Math.pow(1 - p, 3)
      display.value = base + (target - base) * eased
      if (p < 1) raf = requestAnimationFrame(tick)
      else display.value = target
    }
    raf = requestAnimationFrame(tick)
  }
)
</script>

<template>
  <span>{{ display.toFixed(decimals) }}</span>
</template>
