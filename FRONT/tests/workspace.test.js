import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../src/api/index.js';
import { createWorkspaceApi } from '../src/workspace.js';
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };
const json = (body, status=200) => new Response(JSON.stringify(body), {status});
const group = { id: 7, name: '<Люди & музыка>', owner_id: 1, members_count: 1 };
function setup({extended=false,storage=memory(),privateStorage=memory()}={}) {
 const calls=[];
 const services=createServices({fetchImpl:async (url,options) => {
  calls.push(url);
  if(url.endsWith('/openapi.json')) return json({paths:extended?{'/communities':{get:{}},'/communities/{community_id}/invitation':{get:{}}}:{}});
  if(url.endsWith('/playlist')) return json([{id:1,title:'Song',artist:'Artist',score:-1}]);
  if(url.endsWith('/vote')) return json({ok:true});
  if(url.endsWith('/join')) return json(group);
  if(url.endsWith('/invitation')) return json({invite_token:'server-code'});
  if(url.endsWith('/communities') && options.method==='POST')return json({...group,invite_token:'private-code'});
  if(url.endsWith('/communities'))return json([group]);
  return json(group);
 }});
 const workspace=createWorkspaceApi(services,{storage,privateStorage});
 return {services,workspace,calls,storage,privateStorage};
}
test('published API: remembers groups and private invitation without requesting absent endpoints',async()=>{
 const {workspace,calls,storage}=setup();await workspace.initialize({id:1});
 assert.deepEqual(await workspace.list(),[]);
 const created=await workspace.create({name:'Music'});
 assert.equal((await workspace.list())[0].id,7);
 assert.equal((await workspace.invitation(created.id)).invite_token,'private-code');
 assert.equal(storage.getItem('universe.workspace.v1:default:1').includes('private-code'),false);
 assert.equal(calls.some(url=>url.includes('/invitation')),false);
});
test('workspace survives reload, isolates accounts, and remembers invitation on join',async()=>{
 const {workspace,services,storage,privateStorage}=setup();await workspace.initialize({id:1});
 await workspace.join('original-token');
 const restored=createWorkspaceApi(services,{storage,privateStorage});await restored.initialize({id:1});
 assert.equal((await restored.list())[0].id,7);assert.equal((await restored.invitation(7)).invite_token,'original-token');
 await restored.initialize({id:2});assert.deepEqual(await restored.list(),[]);
 await assert.rejects(restored.invitation(7),/исходное приглашение/);
});
test('published API: vote state supports a negative vote, cancellation and reload',async()=>{
 const {workspace,services,storage}=setup();await workspace.initialize({id:1});
 await workspace.vote(1,-1);assert.equal((await workspace.tracks(7))[0].my_vote,-1);
 const restored=createWorkspaceApi(services,{storage});await restored.initialize({id:1});
 assert.equal((await restored.tracks(7))[0].my_vote,-1);
 await restored.vote(1,0);assert.equal((await restored.tracks(7))[0].my_vote,0);
});
test('extended API: uses server group list and invitation when supported',async()=>{
 const {workspace,calls}=setup({extended:true});await workspace.initialize({id:1});
 assert.equal(workspace.localGroups,false);assert.equal((await workspace.list())[0].id,7);
 assert.equal((await workspace.invitation(7)).invite_token,'server-code');
 assert.equal(calls.some(url=>url.endsWith('/invitation')),true);
});
test('403 for a remembered group removes it; a server failure remains visible',async()=>{
 const storage=memory();storage.setItem('universe.workspace.v1:default:1',JSON.stringify({ids:[7]}));
 let forbidden=true;
 const services=createServices({fetchImpl:async(url)=>url.endsWith('/openapi.json')?json({paths:{}}):json({detail:'No access'},forbidden?403:500)});
 const workspace=createWorkspaceApi(services,{storage});await workspace.initialize({id:1});assert.deepEqual(await workspace.list(),[]);
 storage.setItem('universe.workspace.v1:default:1',JSON.stringify({ids:[7]}));forbidden=false;await workspace.initialize({id:1});
 await assert.rejects(workspace.list(),{status:500});
});
