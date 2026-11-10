import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { View } from '../types/agent-traces'

/** Carry the shared snapshot/sample; each destination resolves its own projection. */
export function agentTraceTabQuery(current: LocationQuery, view: View): LocationQueryRaw {
  return {
    view,
    ...Object.fromEntries(
      ['batchId', 'snapshotId', 'traceId', 'eventId'].flatMap((key) =>
        typeof current[key] === 'string' && current[key] ? [[key, current[key]]] : [],
      ),
    ),
  }
}
