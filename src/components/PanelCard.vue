/** 通用白色内容面板
它提供：
- 面板标题。
- 标题图标。
- 可选的“查看更多”链接。
- 中间业务内容插槽。
- 可替换的右上角内容插槽。
*/

<script setup lang="ts"> 
import AppIcon from './AppIcon.vue'  
defineProps<{ title: string; icon?: string; link?: string }>()  
</script>
<template>
  <section class="panel">  
    <header class="panel-heading">  
      <h2><AppIcon :name="icon" />{{ title }}</h2>  
      <slot name="extra"><router-link v-if="link" :to="link">查看更多 ›</router-link></slot>
    </header>
    <div class="panel-content"><slot /></div>
  </section>
</template>
