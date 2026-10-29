import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createMember} from '../lib/auth';
import {closeDb} from '../lib/db';
import {approveWorkflowRun,createWorkflowProject,getWorkflowState,mutateWorkflowArtifact,saveWorkflowBrain} from '../lib/workflow-store';
import {getWorkflowCapability,runWorkflowStep} from '../lib/workflow-runner';

async function main(){
  const directory=mkdtempSync(join(tmpdir(),'academy-real-local-smoke-'));
  process.env.COMMUNITY_DB_PATH=join(directory,'smoke.db');
  process.env.WORKFLOW_AI_PROVIDER='ollama';
  process.env.WORKFLOW_AI_MODEL='qwen3:8b';
  const started=Date.now();
  try{
    const capability=await getWorkflowCapability(true);
    assert.equal(capability.configured,true,capability.message);
    const user=await createMember({name:'Изолиран AI тест',email:`smoke-${randomUUID()}@example.test`,password:randomUUID()+randomUUID(),ageBand:'18+'});
    saveWorkflowBrain(user,{expectedVersion:0,name:'Тестова пекарна',audience:'Хора от квартала',voice:'Кратко, човешки и без хвалби',offer:'Хляб с квас всяка сутрин',notes:'Измислен бранд за проверка на интеграцията. Няма предоставена статистика за продажби или гледания.',guardrails:'Без измислени резултати и без твърдение за публикуване.'});
    createWorkflowProject(user,{templateId:'content',title:'Как се прави хлябът сутрин',brief:'Подготви бриф за кратко видео, което показва месенето на хляб. Разполагам с телефон, собствена кухня и 20 минути за заснемане.',requestId:randomUUID()});
    const before=getWorkflowState(user,capability),run=before.runs[0];
    const stepTimings:{role:string;elapsedMs:number}[]=[];
    for(let index=0;index<7;index++){
      const stepStarted=Date.now();
      await runWorkflowStep(user,{runId:run.id,requestId:randomUUID()});
      const state=getWorkflowState(user,capability),artifact=state.artifacts.find(item=>item.runId===run.id&&item.role===state.roles[index].id)!;
      assert.ok(artifact);stepTimings.push({role:artifact.role,elapsedMs:Date.now()-stepStarted});
      console.log(JSON.stringify({role:artifact.role,outputCharacters:artifact.content.length,elapsedMs:Date.now()-stepStarted}));
    }
    const after=getWorkflowState(user,await getWorkflowCapability());
    assert.equal(after.artifacts.length,7);
    assert.equal(after.artifacts[0].provenance,'ai');
    assert.equal(after.artifacts[0].provider,'ollama');
    assert.equal(after.artifacts[0].model,'qwen3:8b');
    assert.equal(after.artifacts[0].status,'draft');
    assert.equal(after.runs[0].status,'awaiting_approval');
    const final=after.artifacts.find(item=>item.role==='community')!;
    assert.ok(final);
    approveWorkflowRun(user,{runId:run.id,expectedArtifacts:after.artifacts.map(item=>({id:item.id,revision:item.revision}))});
    assert.equal(getWorkflowState(user,capability).runs[0].status,'completed');
    const first=getWorkflowState(user,capability).artifacts.find(item=>item.role==='chief')!;
    mutateWorkflowArtifact(user,{artifactId:first.id,expectedRevision:first.revision,content:first.content+'\nЧовек добавя: видеото трябва да е до 15 секунди.'},'editArtifact');
    const changed=getWorkflowState(user,capability);
    assert.equal(changed.runs[0].status,'ready');assert.equal(changed.runs[0].currentStep,1);
    assert.ok(changed.artifacts.filter(item=>item.id!==first.id).every(item=>item.status==='rejected'));
    const report={checkedAt:new Date().toISOString(),provider:'ollama',model:'qwen3:8b',actualNetworkGeneration:true,isolatedSyntheticBrand:true,roles:after.artifacts.map(item=>item.role),artifacts:after.artifacts.map(item=>({role:item.role,title:item.title,characters:item.content.length,status:item.status,provenance:item.provenance})),stepTimings,finalStatusBeforeApproval:after.runs[0].status,explicitBundleApprovalCompleted:true,humanEditInvalidatedDownstream:true,elapsedMs:Date.now()-started,externalPublishing:false,limits:'Six real structured role generations and one deterministic handoff compiler, with bundle approval/edit invalidation. Not seven external service integrations; no actual learner or business outcome is established.'};
    mkdirSync('docs/workflow',{recursive:true});
    writeFileSync('docs/workflow/local-generation-examples.json',JSON.stringify({syntheticBrand:true,purpose:'Actual local-model outputs retained for human quality inspection, not customer results or seeded product content.',artifacts:after.artifacts.map(item=>({role:item.role,title:item.title,content:item.content,sha256:createHash('sha256').update(item.content).digest('hex')}))},null,2)+'\n');
    writeFileSync('docs/workflow/local-generation-smoke.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }finally{
    closeDb();const path=resolve(directory),base=resolve(tmpdir());
    if(!path.startsWith(base+'\\')&&!path.startsWith(base+'/'))throw new Error('Unsafe temporary cleanup path');
    rmSync(path,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Local generation smoke failed');process.exitCode=1;});
