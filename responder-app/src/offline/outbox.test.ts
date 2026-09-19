import { afterEach,describe,expect,it,vi } from 'vitest'
import { enqueue,flushOutbox,listOutbox } from './outbox'
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals()})
function login(){localStorage.setItem('faind.user',JSON.stringify({userId:'user-a'}));localStorage.setItem('faind.accessToken','token')}
describe('offline outbox',()=>{
 it('replays the exact request and removes it only after server success',async()=>{login();vi.stubGlobal('crypto',{randomUUID:()=> 'request-id'});const fetch=vi.fn().mockResolvedValue(new Response('',{status:201}));vi.stubGlobal('fetch',fetch);enqueue('/notify/test','POST',{clientRequestId:'command-id',message:'risk'});expect(listOutbox()).toHaveLength(1);await expect(flushOutbox()).resolves.toEqual({sent:1,pending:0});expect(fetch).toHaveBeenCalledWith('/notify/test',expect.objectContaining({method:'POST',body:JSON.stringify({clientRequestId:'command-id',message:'risk'})}));expect(listOutbox()).toHaveLength(0)})
 it('retains retryable failures and never sends another user outbox',async()=>{login();vi.stubGlobal('crypto',{randomUUID:()=> 'a'});enqueue('/a','POST',{});localStorage.setItem('faind.user',JSON.stringify({userId:'user-b'}));vi.stubGlobal('crypto',{randomUUID:()=> 'b'});enqueue('/b','POST',{});const fetch=vi.fn().mockResolvedValue(new Response('',{status:503}));vi.stubGlobal('fetch',fetch);await expect(flushOutbox()).resolves.toEqual({sent:0,pending:1});expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('/b');expect(listOutbox()).toHaveLength(2)})
})
