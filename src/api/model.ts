import { listResources } from './resource'
/** 模型资源接口；真实模型注册/部署需后端提供对应动作契约。 */
export function listModels() {
  return listResources('models')
}
