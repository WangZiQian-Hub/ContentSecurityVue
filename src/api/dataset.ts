import { listResources } from './resource'
/** 后端接入时，在本层把 Dataset DTO 映射成页面展示模型。 */
export function listDatasets() {
  return listResources('datasets')
}
