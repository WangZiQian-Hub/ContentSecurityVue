import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { View } from '../types/agent-traces'

/** Demo links cannot resolve against the real backend after a reload. */
export function hasDemoTraceScope(query: LocationQuery): boolean {
  return ['batchId', 'snapshotId', 'sourceId', 'traceId', 'eventId'].some(
    (key) => typeof query[key] === 'string' && query[key].startsWith('mock_'),
  )
}

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
