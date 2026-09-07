import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubEditor } from '../src/editor/github-client';
import type { Project } from '../src/data/projects';
const initial: Project[] = [{id:'demo',slug:'demo',title:'Demo',year:'2026',description:'',location:'',cover:'a',images:[{id:'a',src:'/images/a.jpg',width:10,height:20,alt:'A'},{id:'b',src:'/images/b.jpg',width:10,height:20,alt:'B'}]}];
function fixture() {
  let projects=structuredClone(initial), head='head-1', pending=projects, parent='', counter=1;
  let failPatch=false;
  const requests: {path:string;method:string;body:any;authorization:string}[]=[];
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const encode=(value:unknown)=>({encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')});
  const fetcher:typeof fetch=async(url,options={})=>{
    const path=new URL(String(url)).pathname, method=options.method??'GET', body=options.body?JSON.parse(String(options.body)):undefined;
    const authorization=new Headers(options.headers).get('Authorization')??'';
    requests.push({path,method,body,authorization});
    if(!authorization.match(/^Bearer (target|source)$/))return json({},401);
    if(path.includes('/bo-photography/')) {
      assert.equal(method,'GET'); assert.equal(authorization,'Bearer source');
      if(path.endsWith('/git/ref/heads/main'))return json({object:{sha:'source-head'}});
      if(path.endsWith('/contents/src/data/photos.json'))return json(encode([{id:'remote-photo',image:'/images/one.jpg',series:'one',alt:'Remote photo'}]));
      if(path.endsWith('/contents/src/data/series.json'))return json(encode([{slug:'one',title:'One'}]));
      if(path.endsWith('/git/trees/source-head'))return json({truncated:false,tree:[{path:'public/images/one.jpg',sha:'source-blob',mode:'100644',type:'blob'}]});
      if(path.endsWith('/git/blobs/source-blob'))return new Response(new Uint8Array([1,2,3]));
    }
    assert.equal(authorization,'Bearer target');
    if(path.endsWith('/bo-david-portfolio'))return json({permissions:{push:true}});
    if(path.endsWith('/git/ref/heads/main'))return json({object:{sha:head}});
    if(path.endsWith('/contents/src/data/projects.json'))return json(encode(projects));
    if(path.includes('/git/commits/')&&method==='GET')return json({tree:{sha:'base-tree'}});
    if(path.endsWith('/git/blobs')&&method==='POST')return json({sha:'uploaded-blob'});
    if(path.endsWith('/git/trees')&&method==='POST'){assert.equal(body.base_tree,'base-tree');pending=JSON.parse(body.tree.find((entry:any)=>entry.path==='src/data/projects.json').content);return json({sha:'new-tree'});}
    if(path.endsWith('/git/commits')&&method==='POST'){parent=body.parents[0];return json({sha:'head-'+(++counter)});}
    if(path.endsWith('/git/refs/heads/main')&&method==='PATCH') {
      assert.equal(body.force,false);
      if(failPatch||parent!==head)return json({},422);
      head=body.sha;projects=pending;return json({object:{sha:head}});
    }
    throw new Error('Unexpected request: '+method+' '+path);
  };
  const published=Object.fromEntries(initial[0].images.map(p=>[p.id,{base:'/generated/'+p.id,original:p.src}]));
  return {client:new GitHubEditor(published,fetcher,async()=>({width:10,height:20})),requests,get projects(){return projects;},get head(){return head;},conflict(){failPatch=true;}};
}
test('online editor authenticates, persists complete ordering atomically and rejects stale writes',async()=>{
  const f=fixture();await assert.rejects(f.client.connect('invalid'),/连接失败/);
  await f.client.connect('target','source');
  const saved=await f.client.edit('/order','demo',{ids:['b','a'],cover:'b'});
  assert.deepEqual(saved.projects[0].images.map(p=>p.id),['b','a']);assert.equal(saved.projects[0].cover,'b');
  const stable=f.head;await f.client.edit('/order','demo',{ids:['b','a'],cover:'b'});assert.equal(f.head,stable);
  f.conflict();await assert.rejects(f.client.edit('/order','demo',{ids:['a','b'],cover:'a'}),/不会被覆盖/);
  assert.deepEqual(f.projects[0].images.map(p=>p.id),['b','a']);assert.equal(f.projects[0].cover,'b');
  f.client.disconnect();await assert.rejects(f.client.load(),/连接失败/);
});
test('online upload saves original and metadata in the same commit and provides immediate preview',async()=>{
  const f=fixture();await f.client.connect('target');
  const saved=await f.client.edit('/upload','demo',{},new File([new Uint8Array([1,2,3])],'photo.png',{type:'image/png'}));
  assert.equal(saved.projects[0].images.length,3);const photo=saved.projects[0].images[2];
  assert.match(photo.src,/^\/images\/originals\/demo\/demo-[a-f0-9-]+\.png$/);
  assert.match(saved.thumbnails[photo.id],/^blob:/);
  const tree=f.requests.find(r=>r.path.endsWith('/git/trees'))!;
  assert.equal(tree.body.tree.length,2);assert.equal(tree.body.tree[0].path,'public'+photo.src);
  f.client.disconnect();
});
test('online GitHub sync uses a separate read-only source credential and does not duplicate on repeat',async()=>{
  const f=fixture();await f.client.connect('target','source');
  async function finish(){const deadline=Date.now()+3000;while(f.client.job.state==='running'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.equal(f.client.job.state,'complete',f.client.job.message);}
  f.client.startSync();await finish();assert.equal(f.projects.length,2);
  const imported=f.projects[1];assert.equal(imported.title,'Unassigned');assert.equal(imported.images.length,1);
  const head=f.head;f.client.startSync();await finish();assert.equal(f.head,head);assert.equal(f.projects[1].images.length,1);
  assert.match(f.client.job.message,/新增 0 张，更新 0 张/);
  assert.ok(f.requests.filter(r=>r.path.includes('/bo-photography/')).every(r=>r.method==='GET'));
  f.client.disconnect();
});
