import { onScopeDispose, ref } from 'vue'
export function useEvaluationPolling(load: () => Promise<boolean>, terminal: () => boolean) {
  const active = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = 3000
  let epoch = 0
  async function tick(current: number) {
    const success = await load()
    if (!active.value || epoch !== current) return
    delay = success ? 3000 : Math.min(delay * 2, 30000)
    if (success && terminal()) {
      stop()
      return
    }
    timer = setTimeout(() => void tick(current), delay)
  }
  function start() {
    stop()
    active.value = true
    delay = 3000
    void tick(epoch)
  }
  function stop() {
    epoch++
    active.value = false
    clearTimeout(timer)
  }
  onScopeDispose(stop)
  return { start, stop, active }
}
