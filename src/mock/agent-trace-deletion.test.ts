import { describe, it, expect } from 'vitest'
import { createAgentTraceMock } from './agent-traces'

describe('轨迹批次与待解析文件删除', () => {
  it('只能删除空批次，有文件的示例批次保持不变', async () => {
    const api = createAgentTraceMock()
    const old = (await api.workspace({})).batch!
    await expect(api.deleteBatch(old.batchId, old.batchVersion, 'delete-nonempty')).rejects.toThrow('还有文件')
    const empty = await api.createBatch('空批次', 'create-empty')
    await api.deleteBatch(empty.batchId, empty.batchVersion, 'delete-empty')
    expect((await api.workspace({})).batch?.batchId).toBe(old.batchId)
    const next = await api.createBatch('新批次', 'create-next')
    expect((await api.workspace({ batchId: next.batchId })).batch?.name).toBe('新批次')
  })
  it('移除待解析文件，拒绝旧版本，保持其他批次和共享文件可用', async () => {
    const api = createAgentTraceMock()
    const initial = (await api.workspace({})).batch!
    const created = await api.createBatch('待上传', 'create')
    const file = await api.upload(new File(['{}'], 'trace.json'), 'upload')
    const bound = await api.bind(created.batchId, 1, [{ fileId: file.fileId, formatOverride: 'auto' }], 'bind')
    await expect(api.deleteBatch(created.batchId, bound.batch.batchVersion, 'delete-with-file')).rejects.toThrow('还有文件')
    await expect(api.removeFile(created.batchId, file.fileId, 1, 'stale')).rejects.toThrow('版本')
    await api.removeFile(created.batchId, file.fileId, bound.batch.batchVersion, 'remove')
    expect((await api.workspace({ batchId: created.batchId })).files.total).toBe(0)
    expect((await api.workspace({ batchId: initial.batchId })).summary.parsedTraceCount).toBe(200)
  })
  it('已解析文件无法单独删除', async () => {
    const api = createAgentTraceMock(), w = await api.workspace({})
    await expect(api.removeFile(w.batch!.batchId, w.files.items[0]!.fileId, w.batch!.batchVersion, 'remove-parsed')).rejects.toThrow('解析')
  })
})
