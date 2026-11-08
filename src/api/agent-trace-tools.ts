import { request } from './request'
import type { ToolsOptions,ToolsOverview,ToolsOption,ToolsParams } from '../types/agent-trace-tools'
import type { PageResult } from '../types'
const root='/compliance/agent-traces', id=encodeURIComponent
export const toolsHttp={
 workspace:(params:ToolsParams,signal?:AbortSignal)=>request<ToolsOptions>({url:`${root}/workspace`,params:{...params,view:'tools',include:'options'},signal,silent:true}),
 samples:(batch:string,params:ToolsParams,signal?:AbortSignal)=>request<PageResult<ToolsOption>>({url:`${root}/batches/${id(batch)}/samples`,params:{...params,view:'tools'},signal,silent:true}),
 detail:(batch:string,trace:string,params:ToolsParams,signal?:AbortSignal)=>request<ToolsOverview>({url:`${root}/batches/${id(batch)}/samples/${id(trace)}`,params:{...params,view:'tools'},signal,silent:true})
}
