import { createExecutionMock,executionSamples } from './agent-trace-execution'
import { describe,it,expect } from 'vitest'
import { toolsMock,toolsFixture } from './agent-trace-tools'
describe('工具交互审计',()=>{
 it('普通首条样本有调用，完整演示排在首位，空样本明确标注',async()=>{expect(toolsFixture('mock_trace_1').metrics.callCount).toBe(7);const options=await toolsMock.workspace({batchId:'mock_batch_demo'});expect(options.sampleOptions.items[0]?.traceId).toBe('mock_trace_0');const empty=await toolsMock.samples('mock_batch_demo',{q:'0399'});expect(empty.items[0]?.scenarioLabel).toContain('无工具调用');expect(toolsFixture('mock_trace_199').calls.total).toBe(0)})

 it('每个工具调用定位到同一样本的真实思维事件',async()=>{const execution=createExecutionMock();for(const sample of executionSamples){const tools=toolsFixture(sample.traceId);for(const call of tools.sequence.items){const target=await execution.detail(tools.scope.batchId,tools.traceId,{...tools.scope,section:'overview',eventId:call.eventId});expect(target.selection?.eventId).toBe(call.eventId);expect(target.scope.snapshotId).toBe(tools.scope.snapshotId);expect(target.scope.projectionVersion).toBe(tools.scope.projectionVersion);expect(target.summary.displayId).toBe(tools.summary.traceDisplayId)}}})
 it('状态互斥、行为可重叠且阻断没有执行耗时',()=>{const d=toolsFixture();expect(d.metrics.callCount).toBe(d.metrics.successCount+d.metrics.errorCount+d.metrics.notExecutedCount);expect(d.selection?.permissionDecision).toBe('denied');expect(d.selection?.durationMs).toBeNull();expect(d.metrics.inefficientCount).toBe(2)})
 it('真实分页与空批次',async()=>{expect((await toolsMock.samples('mock_batch_demo',{page:4,pageSize:50})).items).toHaveLength(50);expect((await toolsMock.samples('mock_batch_empty',{})).total).toBe(0);expect((await toolsMock.samples('mock_batch_demo',{q:'0042'})).items[0]?.traceId).toBe('mock_trace_0')})
 it('跨样本ID拒绝且禁止未授权原始事件',async()=>{await expect(toolsMock.detail('mock_batch_empty','mock_trace_0',{})).rejects.toThrow();await expect(toolsMock.detail('mock_batch_demo','mock_trace_3',{callId:'call_5',includeRaw:true})).rejects.toThrow('权限')})
})
