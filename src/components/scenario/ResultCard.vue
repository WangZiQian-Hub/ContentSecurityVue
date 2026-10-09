<template>
  <!-- 结果区里的卡片容器：论断卡与情感倾向共用同一套外观。
       抽出来是为了避免两处各写一份样式，改一处漏一处。 -->
  <div class="result-card"><slot /></div>
</template>
<style scoped>
.result-card {
  padding: 11px 13px;
  border: 1px solid #e5e9f2;
  border-left: 3px solid #c9d8f5;
  border-radius: 6px;
  background: #fbfcfe;
}
</style>
