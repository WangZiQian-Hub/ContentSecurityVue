<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue'
defineProps<{ items: { label: string; value: string | number; unit?: string; icon: string }[] }>()
</script>
<template>
  <div class="mw-kpis">
    <article v-for="(item, index) in items" :key="item.label" class="mw-kpi">
      <span :class="['mw-kpi-icon', `tone-${index}`]"><AppIcon :name="item.icon" /></span>
      <div>
        <h3>{{ item.label }}</h3>
        <strong
          >{{ item.value }} <small>{{ item.unit }}</small></strong
        >
      </div>
    </article>
  </div>
</template>
