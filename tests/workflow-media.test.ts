import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {access,mkdir,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {AppError,createMember,createSession,SESSION_COOKIE} from '../lib/auth';
import {closeDb,getDb} from '../lib/db';
import {changeWorkflowMediaJob,cleanWorkflowMediaDeletions,createWorkflowMediaJob,getWorkflowMediaState,markWorkflowMediaForDeletion,mediaMemberKey,privateMediaPath,readWorkflowMediaExport,uploadWorkflowVideo,workflowMediaFile,workflowMediaRoot} from '../lib/workflow-media';
import type {Member} from '../lib/domain';
import {NextRequest} from 'next/server';
import {GET as MEDIA_GET,PUT as MEDIA_PUT,POST as MEDIA_POST} from '../app/api/workflow/media/route';
import {GET as FILE_GET,HEAD as FILE_HEAD} from '../app/api/workflow/media/[id]/route';
import {parseMediaRange} from '../lib/workflow-media-http';
import {deleteAccount,exportAccountData} from '../lib/privacy';
import {claimWorkflowMediaJob,runWorkflowMediaJob} from '../lib/workflow-media-runner';

const directory=mkdtempSync(join(tmpdir(),'academy-real-media-'));
process.env.COMMUNITY_DB_PATH=join(directory,'media.db');
process.env.COMMUNITY_MEDIA_PATH=join(directory,'private-media');
process.env.WORKFLOW_MEDIA_DISABLED='1';
const fixture=join(directory,'actual-test-video.mp4');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-f','lavfi','-i','color=c=black:s=160x90:r=24:d=1','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',fixture],{timeout:20000,windowsHide:true,stdio:'pipe'});
const video=readFileSync(fixture),password='Private video isolated test password 2026';
const create=()=>createMember({name:'Media isolation fixture',email:`media-${randomUUID()}@example.test`,password,ageBand:'18+'});
const body=(bytes:Uint8Array)=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}});
const upload=(user:Member,name='test-source.mp4')=>uploadWorkflowVideo(user,{name,type:'video/mp4',length:video.length,body:body(video)});
const render=(assetId:string,requestId=randomUUID())=>({assetId,requestId,start:0,end:1,aspect:'9:16',layout:'fit',captionText:''});
const notFound=(error:unknown)=>error instanceof AppError&&error.status===404;

after(()=>{closeDb();const absolute=resolve(directory),temporary=resolve(tmpdir());assert.ok(absolute.startsWith(temporary+'\\')||absolute.startsWith(temporary+'/'));rmSync(absolute,{recursive:true,force:true});});

test('a real MP4 upload is probed, stored privately and returned without filesystem paths',async()=>{
  const user=await create(),id=await upload(user,'original-video.mp4');
  const state=await getWorkflowMediaState(user);
  assert.equal(state.assets.length,1);assert.equal(state.assets[0].id,id);
  assert.equal(state.assets[0].width,160);assert.equal(state.assets[0].height,90);
  assert.ok(state.assets[0].duration>=.99&&state.assets[0].duration<=1.1);
  assert.equal(state.assets[0].sourceUrl,`/api/workflow/media/${id}?kind=source`);
  assert.equal(JSON.stringify(state).includes(directory),false);
  const source=await workflowMediaFile(user,id,'source');
  assert.equal(source.size,video.length);assert.equal(source.mime,'video/mp4');
  assert.ok(source.path.startsWith(join(workflowMediaRoot(),mediaMemberKey(user.id))));
  await access(source.path);
});

test('another member, an administrator and a guest cannot obtain another member’s source or job',async()=>{
  const owner=await create(),other=await create(),id=await upload(owner);
  const jobId=createWorkflowMediaJob(owner,render(id));
  const admin={...other,role:'admin' as const};
  for(const actor of [other,admin]){
    assert.deepEqual((await getWorkflowMediaState(actor)).assets,[]);
    await assert.rejects(workflowMediaFile(actor,id,'source'),notFound);
    await assert.rejects(workflowMediaFile(actor,jobId,'output'),notFound);
    assert.throws(()=>createWorkflowMediaJob(actor,render(id)),notFound);
    assert.throws(()=>changeWorkflowMediaJob(actor,{jobId,expectedVersion:1},'cancel'),notFound);
  }
  assert.deepEqual((await getWorkflowMediaState(null)).jobs,[]);
  await assert.rejects(workflowMediaFile(null,id,'source'),(error:unknown)=>error instanceof AppError&&error.status===401);
});

test('upload rejects forged containers, unsupported types, declared oversize and incomplete streams without saved assets',async()=>{
  const user=await create(),invalid=Buffer.alloc(36);invalid.write('ftyp',4);invalid.write('mp42',8);
  await assert.rejects(uploadWorkflowVideo(user,{name:'fake.mp4',type:'video/mp4',length:invalid.length,body:body(invalid)}),/не се разчита/);
  await assert.rejects(uploadWorkflowVideo(user,{name:'raw.txt',type:'text/plain',length:video.length,body:body(video)}),(error:unknown)=>error instanceof AppError&&error.status===413);
  await assert.rejects(uploadWorkflowVideo(user,{name:'huge.mp4',type:'video/mp4',length:251*1024*1024,body:body(video)}),(error:unknown)=>error instanceof AppError&&error.status===413);
  await assert.rejects(uploadWorkflowVideo(user,{name:'cut-off.mp4',type:'video/mp4',length:video.length+10,body:body(video)}),/не завърши/);
  const directories=await readdir(join(workflowMediaRoot(),mediaMemberKey(user.id)));
  assert.deepEqual(directories,[]);assert.deepEqual((await getWorkflowMediaState(user)).assets,[]);
});

test('render intent retries idempotently and validates owner media, trim, format and caption before queuing',async()=>{
  const user=await create(),id=await upload(user),request=render(id),jobId=createWorkflowMediaJob(user,request);
  assert.equal(createWorkflowMediaJob(user,request),jobId);
  assert.throws(()=>createWorkflowMediaJob(user,{...request,aspect:'1:1'}),/други настройки/);
  for(const invalid of [{start:-1},{end:2},{start:.9,end:1},{end:Infinity},{aspect:'4:5'},{layout:'arbitrary'},{captionText:'x'.repeat(181)},{requestId:'missing-intent'}])assert.throws(()=>createWorkflowMediaJob(user,{...render(id),...invalid}),AppError);
  const state=await getWorkflowMediaState(user);assert.equal(state.jobs.length,1);
  assert.equal(state.jobs[0].status,'queued');assert.equal(state.jobs[0].outputUrl,null);
  assert.equal(state.jobs[0].progress,0);
});

test('cancel and retry are version checked; a new attempt cannot be inferred as a completed render',async()=>{
  const user=await create(),id=await upload(user),jobId=createWorkflowMediaJob(user,render(id));
  changeWorkflowMediaJob(user,{jobId,expectedVersion:1},'cancel');
  let current=(await getWorkflowMediaState(user)).jobs[0];assert.equal(current.status,'cancelled');assert.equal(current.version,2);assert.equal(current.outputUrl,null);
  assert.throws(()=>changeWorkflowMediaJob(user,{jobId,expectedVersion:1},'retry'),/променена/);
  changeWorkflowMediaJob(user,{jobId,expectedVersion:2},'retry');
  current=(await getWorkflowMediaState(user)).jobs[0];assert.equal(current.status,'queued');assert.equal(current.version,3);
  assert.throws(()=>changeWorkflowMediaJob(user,{jobId,expectedVersion:3},'retry'),/не е приложимо/);
  await assert.rejects(workflowMediaFile(user,jobId,'output'),notFound);
});

test('three pending renders form a real bounded queue and storage keys cannot escape the private media root',async()=>{
  const user=await create(),id=await upload(user);
  for(let index=0;index<3;index++)createWorkflowMediaJob(user,render(id));
  assert.throws(()=>createWorkflowMediaJob(user,render(id)),/трите текущи/);
  for(const key of ['../outside','C:/outside/file',`${mediaMemberKey(user.id)}/${id}/../outside`,`${mediaMemberKey(user.id)}/${id}//source`,`${mediaMemberKey(user.id)}/${id}/source\\escape`])assert.throws(()=>privateMediaPath(key));
});

test('a validated ready output resolves only for its owner and account export omits private storage paths',async()=>{
  const user=await create(),id=await upload(user),jobId=createWorkflowMediaJob(user,render(id));
  const outputKey=`${mediaMemberKey(user.id)}/${id}/renders/${jobId}/video.mp4`,path=privateMediaPath(outputKey);
  await mkdir(dirname(path),{recursive:true});await writeFile(path,video);
  getDb().prepare("UPDATE workflow_media_jobs SET status='ready',progress=100,output_key=?,output_bytes=?,version=version+1 WHERE id=?").run(outputKey,video.length,jobId);
  const state=await getWorkflowMediaState(user);assert.equal(state.jobs[0].outputUrl,`/api/workflow/media/${jobId}?kind=output`);
  const file=await workflowMediaFile(user,jobId,'output');assert.equal(file.size,video.length);assert.equal(file.mime,'video/mp4');
  const exported=await readWorkflowMediaExport(user.id);assert.equal(exported.assets.length,1);assert.equal(exported.jobs.length,1);
  assert.equal(JSON.stringify(exported).includes(outputKey),false);assert.equal(JSON.stringify(exported).includes(directory),false);
});

test('durable account purge stops owned jobs, removes owned files and leaves other media untouched',async()=>{
  const owner=await create(),other=await create(),assetId=await upload(owner),otherId=await upload(other);
  createWorkflowMediaJob(owner,render(assetId));const ownerSource=await workflowMediaFile(owner,assetId,'source'),otherSource=await workflowMediaFile(other,otherId,'source');
  markWorkflowMediaForDeletion(owner.id);assert.equal((await getWorkflowMediaState(owner)).jobs[0].status,'cancelled');
  assert.ok(getDb().prepare('SELECT member_key FROM workflow_media_purge WHERE member_key=?').get(mediaMemberKey(owner.id)));
  getDb().prepare('DELETE FROM members WHERE id=?').run(owner.id);await cleanWorkflowMediaDeletions();
  await assert.rejects(access(ownerSource.path));await access(otherSource.path);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_media_assets WHERE member_id=?').get(owner.id)!.n,0);
  assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_media_purge WHERE member_key=?').get(mediaMemberKey(owner.id))!.n,0);
});

test('HTTP metadata and private file routes enforce sessions, byte ranges, download headers and owner isolation',async()=>{
  const owner=await create(),other=await create(),assetId=await upload(owner);
  const cookie=`${SESSION_COOKIE}=${createSession(owner.id)}`,otherCookie=`${SESSION_COOKIE}=${createSession(other.id)}`;
  const context={params:Promise.resolve({id:assetId})};
  const request=(headers:Record<string,string>={},method='GET')=>new NextRequest(`http://127.0.0.1:3101/api/workflow/media/${assetId}?kind=source`,{method,headers:{cookie,...headers}});
  const anonymous=await MEDIA_GET(new NextRequest('http://127.0.0.1:3101/api/workflow/media'));assert.deepEqual((await anonymous.json()).assets,[]);
  assert.equal((await FILE_GET(request({cookie:''}),context)).status,401);
  assert.equal((await FILE_GET(request({cookie:otherCookie}),context)).status,404);
  const range=await FILE_GET(request({range:'bytes=0-15'}),context);assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),`bytes 0-15/${video.length}`);assert.equal((await range.arrayBuffer()).byteLength,16);assert.equal(range.headers.get('Cache-Control'),'private, no-store');
  const suffix=await FILE_GET(request({range:'bytes=-10'}),context);assert.equal((await suffix.arrayBuffer()).byteLength,10);
  const invalid=await FILE_GET(request({range:'bytes=999999-'}),context);assert.equal(invalid.status,416);assert.equal(invalid.headers.get('Content-Range'),`bytes */${video.length}`);
  const head=await FILE_HEAD(request({},'HEAD'),context);assert.equal(head.status,200);assert.equal(head.body,null);assert.equal(head.headers.get('Content-Length'),String(video.length));
  const download=await FILE_HEAD(new NextRequest(`http://127.0.0.1:3101/api/workflow/media/${assetId}?kind=source&download=1`,{method:'HEAD',headers:{cookie}}),context);assert.match(download.headers.get('Content-Disposition')||'',/^attachment;/);
  for(const invalidRange of ['bytes=','bytes=0-1,3-4','bytes=-0','bytes=2-1','bytes=9007199254740999-'])assert.throws(()=>parseMediaRange(invalidRange,video.length),(error:unknown)=>error instanceof AppError&&error.status===416);
});

test('HTTP media writes reject foreign origins, absent sessions and malformed action bodies before changing work',async()=>{
  process.env.APP_ORIGIN='http://127.0.0.1:3101';const owner=await create(),cookie=`${SESSION_COOKIE}=${createSession(owner.id)}`;
  const request=(data:unknown,origin='http://127.0.0.1:3101',session=cookie)=>new NextRequest('http://127.0.0.1:3101/api/workflow/media',{method:'POST',headers:{origin,cookie:session,'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await MEDIA_POST(request({action:'render'},'https://other.test'))).status,403);
  assert.equal((await MEDIA_POST(request({action:'render'},undefined,''))).status,401);
  assert.equal((await MEDIA_POST(request([]))).status,400);
  assert.equal((await MEDIA_POST(request({action:'inventedSuccess'}))).status,400);
  const huge=await MEDIA_POST(new NextRequest('http://127.0.0.1:3101/api/workflow/media',{method:'POST',headers:{origin:process.env.APP_ORIGIN,cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'render',noise:'x'.repeat(9000)})}));assert.equal(huge.status,413);
  const badUpload=await MEDIA_PUT(new NextRequest('http://127.0.0.1:3101/api/workflow/media',{method:'PUT',headers:{origin:'https://other.test',cookie,'Content-Type':'video/mp4'},body:video}));assert.equal(badUpload.status,403);
  assert.deepEqual((await getWorkflowMediaState(owner)).jobs,[]);
});

test('the real account export contains media metadata synchronously and account deletion purges files',async()=>{
  const owner=await create(),id=await upload(owner),jobId=createWorkflowMediaJob(owner,render(id)),source=await workflowMediaFile(owner,id,'source');
  const exported=JSON.parse(JSON.stringify(exportAccountData(owner)));
  assert.equal(exported.workflow.media.assets[0].id,id);assert.equal(exported.workflow.media.jobs[0].id,jobId);
  assert.equal(JSON.stringify(exported.workflow.media).includes('storage_key'),false);
  await deleteAccount(owner,{password,confirmation:'DELETE'});
  await assert.rejects(access(source.path));assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM workflow_media_jobs WHERE member_id=?').get(owner.id)!.n,0);
});

test('an actual Node worker render survives deep Windows ownership paths and marks ready only after 1080p output validation',async()=>{
  // Remove earlier isolated test queue entries so the worker claims this test's job.
  getDb().prepare("UPDATE workflow_media_jobs SET status='cancelled' WHERE status IN ('queued','running')").run();
  const owner=await create(),id=await upload(owner),jobId=createWorkflowMediaJob(owner,render(id));
  const claim=claimWorkflowMediaJob();assert.ok(claim);assert.equal(claim.id,jobId);
  await runWorkflowMediaJob(claim);
  const actual=(await getWorkflowMediaState(owner)).jobs[0];assert.equal(actual.status,'ready');assert.equal(actual.progress,100);assert.ok(actual.outputUrl);
  const output=await workflowMediaFile(owner,jobId,'output');
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output.path],{timeout:15000,windowsHide:true}).toString());
  const picture=probe.streams.find((item:{codec_type:string})=>item.codec_type==='video');assert.equal(picture.width,1080);assert.equal(picture.height,1920);assert.equal(picture.codec_name,'h264');
  assert.ok(Math.abs(Number(probe.format.duration)-1)<.1);
  execFileSync('ffmpeg',['-v','error','-nostdin','-i',output.path,'-f','null','-'],{timeout:15000,windowsHide:true,stdio:'pipe'});
});

test('a cancelled lease cannot publish an otherwise valid renderer output',async()=>{
  const owner=await create(),id=await upload(owner),jobId=createWorkflowMediaJob(owner,render(id)),claim=claimWorkflowMediaJob();assert.ok(claim);assert.equal(claim.id,jobId);
  const running=(await getWorkflowMediaState(owner)).jobs[0];changeWorkflowMediaJob(owner,{jobId,expectedVersion:running.version},'cancel');
  await runWorkflowMediaJob(claim);
  const current=(await getWorkflowMediaState(owner)).jobs[0];assert.equal(current.status,'cancelled');assert.equal(current.outputUrl,null);
  await assert.rejects(workflowMediaFile(owner,jobId,'output'),notFound);
});
