import { listResources } from './resource'
export function listMetrics() {
  return listResources('metrics')
}
