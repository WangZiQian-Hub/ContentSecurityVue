import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { View } from '../types/agent-traces'

/** Tab changes resolve the destination projection afresh; explicit step links retain their scope. */
export function agentTraceTabQuery(current: LocationQuery, view: View): LocationQueryRaw {
  return {
    view,
    ...(typeof current.batchId === 'string' && current.batchId
      ? { batchId: current.batchId }
      : {}),
  }
}
