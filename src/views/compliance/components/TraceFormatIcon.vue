<script setup lang="ts">
import AppIcon from '../../../components/AppIcon.vue'
import openaiLogo from '../../../assets/openai-logo.svg'
defineProps<{ code: string }>()
</script>
<template>
  <img
    v-if="code === 'openai_messages'"
    :src="openaiLogo"
    width="40"
    height="40"
    alt=""
    aria-hidden="true"
  />
  <AppIcon v-else-if="code === 'langchain_trace'" name="Link" />
  <AppIcon v-else name="Document" />
</template>
