<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>
<template>
  <section class="ev-panel">
    <header class="ev-panel-heading">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="ev-actions"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>
