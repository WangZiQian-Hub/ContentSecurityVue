<script setup lang="ts">
import KpiStrip from '../../../components/KpiStrip.vue'
import { PROCESS_KIND } from '../../../types/data-governance'
import { formatProcessKpi, processKpiDescriptions } from '../../../utils/process-kpis'
</script>

<template>
  <KpiStrip :kind="PROCESS_KIND" hide-comparison :title-descriptions="processKpiDescriptions">
    <template #value="{ item, items }">
      <span
        :title="item.id === 'process-2' ? `${item.value.toLocaleString('zh-CN')} 条次` : undefined"
        >{{ formatProcessKpi(item, items).value
        }}<small
          >{{ formatProcessKpi(item, items).unit }}{{ formatProcessKpi(item, items).suffix }}</small
        ></span
      >
    </template>
  </KpiStrip>
</template>
