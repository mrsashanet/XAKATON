import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../src/api/index.js';
import { createPlayer } from '../src/player.js';
const file = () => new File([new Uint8Array([1,2,3])], 'sample.mp3', { type: 'audio/mpeg' });
test('MP3 upload uses multipart with JWT; binary audio is not decoded as JSON', async () => {
  const calls = [];
  const api = createServices({ fetchImpl: async (url, options) => {
    calls.push({ url, ...options });
    if (options.method === 'GET') return new Response(new Uint8Array([1,2,3]), {headers:{'Content-Type':'audio/mpeg'}});
    return new Response(JSON.stringify({id:1}), {status:201});
  }});
  api.session.set('jwt', 'alice');
  await api.tracks.upload({ title:' Song ',artist:' Artist ',communityId:7,file:file() });
  assert.equal(calls[0].headers.Authorization,'Bearer jwt');
  assert.equal(calls[0].headers['Content-Type'],undefined);
  assert.equal(calls[0].body.get('title'),'Song');assert.equal(calls[0].body.get('community_id'),'7');
  assert.equal(calls[0].body.get('file').name,'sample.mp3');
  const blob=await api.tracks.audio(1);
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[1,2,3]);
  assert.equal(calls[1].headers.Authorization,'Bearer jwt');
});
test('invalid/empty/oversized MP3 rejected before upload; 401 on audio clears session', async()=>{
  const api=createServices({fetchImpl:async()=>new Response(JSON.stringify({detail:'Expired'}),{status:401})});
  const data={title:'Song',artist:'Artist',communityId:1};
  assert.throws(()=>api.tracks.upload({...data,file:new File(['bad'],'file.wav')}),/MP3/);
  assert.throws(()=>api.tracks.upload({...data,file:new File([],'empty.mp3')}),/пустой/);
  assert.throws(()=>api.tracks.upload({...data,file:{name:'big.mp3',size:31*1024*1024}}),/30 МБ/);
  api.session.set('jwt','alice');await assert.rejects(api.tracks.audio(1),{status:401});
  assert.equal(api.session.getSnapshot().token,null);
});
class FakeAudio extends EventTarget {
  constructor(){super();this.paused=true;this.currentTime=0;this.duration=18;this.volume=1;this.src='';}
  async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
  pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
  load(){}
  removeAttribute(){this.src='';}
}
const track=(id)=>({id,title:`Song ${id}`,artist:'Artist',file_url:`${id}.mp3`,community_id:7});
function setup(fetch=async()=>new Blob(['mp3'])){
 const audio=new FakeAudio(),revoked=[],errors=[];let token='jwt',n=0;
 const player=createPlayer({audio,tracksApi:{audio:fetch},getToken:()=>token,onError:message=>errors.push(message),urls:{createObjectURL:()=>`blob:${++n}`,revokeObjectURL:url=>revoked.push(url)}});
 return {audio,player,revoked,errors,logout:()=>{token=null;player.stop();}};
}
test('player plays, pauses, seeks, changes volume and releases object URLs',async()=>{
 const {player,audio,revoked}=setup();await player.play(track(1),[track(1),track(2)]);
 assert.equal(player.snapshot().playing,true);
 audio.dispatchEvent(new Event('loadedmetadata'));audio.duration=17;audio.dispatchEvent(new Event('durationchange'));assert.equal(player.snapshot().duration,17);player.seek(8);assert.equal(audio.currentTime,8);
 player.volume(.2);assert.equal(audio.volume,.2);
 await player.toggle();assert.equal(player.snapshot().playing,false);
 await player.toggle();assert.equal(player.snapshot().playing,true);
 player.stop();assert.equal(audio.paused,true);assert.equal(audio.src,'');assert.deepEqual(revoked,['blob:1']);
});
test('next/previous skip tracks without audio; ended advances',async()=>{
 const {player,audio}=setup();const queue=[track(1),{...track(2),file_url:null},track(3)];
 await player.play(track(1),queue);await player.next();assert.equal(player.snapshot().track.id,3);
 player.seek(6);await player.next(-1);assert.equal(audio.currentTime,0);assert.equal(player.snapshot().track.id,3);
 await player.next(-1);assert.equal(player.snapshot().track.id,1);
 audio.dispatchEvent(new Event('ended'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(player.snapshot().track.id,3);
});
test('a late audio response cannot replace a newer track',async()=>{
 const pending=new Map();const {player,audio}=setup(id=>new Promise(resolve=>pending.set(id,resolve)));
 const a=player.play(track(1)),b=player.play(track(2));
 pending.get(2)(new Blob(['new']));await b;pending.get(1)(new Blob(['old']));await a;
 assert.equal(player.snapshot().track.id,2);assert.equal(audio.src,'blob:1');
});
test('logout during loading cancels playback and leaves no active track',async()=>{
 let resolve;const {player,audio,logout}=setup(()=>new Promise(done=>{resolve=done}));
 const request=player.play(track(1));logout();resolve(new Blob(['old']));await request;
 assert.equal(player.snapshot().track,null);assert.equal(audio.paused,true);assert.equal(audio.src,'');
});
test('audio failure shows an error and keeps the player stopped',async()=>{
 const {player,errors}=setup(async()=>{throw new Error('Нет доступа')});await player.play(track(1));
 assert.equal(player.snapshot().playing,false);assert.equal(player.snapshot().track,null);assert.deepEqual(errors,['Нет доступа']);
});
