import { beforeEach, describe, expect, it, vi } from 'vitest'
const backend = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./request', () => backend)
import { agentTraceHttp } from './agent-traces'
describe('agent trace HTTP boundary', () => {
  beforeEach(() => {
    backend.request.mockReset().mockResolvedValue({})
  })
  it('uses aggregate endpoints, shared tasks and opaque payload strings', async () => {
    await agentTraceHttp.workspace({ batchId: 'b', sourceId: 'f' })
    await agentTraceHttp.detail('b/id', 'trace/id', { snapshotId: 's' })
    await agentTraceHttp.execute(
      {
        capabilityCode: 'agent_trace_ingest',
        name: 'parse',
        input: { batchId: 'b', expectedVersion: 2, fileIds: ['f'] },
      },
      'stable-key',
    )
    await agentTraceHttp.ticket('artifact/id', 'download-key')
    expect(backend.request.mock.calls.map((c) => c[0].url)).toEqual([
      '/compliance/agent-traces/workspace',
      '/compliance/agent-traces/batches/b%2Fid/samples/trace%2Fid',
      '/tasks/execute',
      '/compliance/agent-traces/artifacts/artifact%2Fid/download-tickets',
    ])
    expect(backend.request.mock.calls[2][0].headers['X-Request-Id']).toBe('stable-key')
  })
  it('never falls back to mock on HTTP failure', async () => {
    backend.request.mockRejectedValue(new Error('backend down'))
    await expect(agentTraceHttp.workspace({})).rejects.toThrow('backend down')
  })
  it('deletes with encoded identifiers, batch version and retry key', async () => {
    await agentTraceHttp.deleteBatch('b/id', 3, 'delete-key')
    await agentTraceHttp.removeFile('b/id', 'f/id', 4, 'remove-key')
    expect(backend.request.mock.calls.map(c => c[0].url)).toEqual([
      '/compliance/agent-traces/batches/b%2Fid',
      '/compliance/agent-traces/batches/b%2Fid/files/f%2Fid',
    ])
    expect(backend.request.mock.calls[0][0]).toMatchObject({ method: 'DELETE', data: { expectedVersion: 3 }, headers: { 'X-Request-Id': 'delete-key' } })
    expect(backend.request.mock.calls[1][0].data).toEqual({ expectedVersion: 4 })
  })
  it('uploads file bytes through FormData, not recursive JSON conversion', async () => {
    const file = new File(['{}'], 'run.json')
    await agentTraceHttp.upload(file, 'file-key')
    expect(backend.request.mock.calls[0][0].data.get('file')).toBeInstanceOf(Blob)
    expect(backend.request.mock.calls[0][0].url).toBe('/files')
  })
})
