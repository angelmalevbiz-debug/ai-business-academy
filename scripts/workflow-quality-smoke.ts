import {writeFileSync} from 'node:fs';
import {getWorkflowCapability,generateWorkflowOutput} from '../lib/workflow-runner';
import type {ReservedWorkflowStep} from '../lib/workflow-store';

async function main(){
  process.env.WORKFLOW_AI_PROVIDER='ollama';
  process.env.WORKFLOW_AI_MODEL='qwen3:14b';
  const capability=await getWorkflowCapability(true);
  const base:ReservedWorkflowStep={ownerId:'synthetic-quality-owner',token:'quality-token',run:{id:'quality-run',projectId:'quality-project',templateId:'content',status:'running',currentStep:3,totalSteps:7,brainVersion:1,error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},project:{id:'quality-project',templateId:'content',title:'Покажи как месим хляба сутрин',brief:'Измислен бранд. Кратко видео за месене на хляб с квас. Имам телефон, кухня и 20 минути за снимане. Няма предоставени данни за гледания и клиенти. Не добавяй съставки или техники, които не са предоставени.',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},brain:{id:'quality-brand',version:1,name:'Тестова пекарна',audience:'Хора от квартала',voice:'Просто, човешки и без измислени факти',offer:'Хляб с квас всяка сутрин',notes:'Измислен бранд за проверка.',guardrails:'Не измисляй съставки, резултати или реални клиенти.',updatedAt:new Date().toISOString()},inputs:[],role:'copy',stepIndex:3,feedback:''};
  const results=[];
  for(const role of ['copy','publish','research'] as const){
    const start=Date.now();
    const output=await generateWorkflowOutput({...base,role,stepIndex:role==='research'?1:role==='copy'?3:5},capability);
    results.push({role,...output,elapsedMs:Date.now()-start});
    console.log(JSON.stringify({role,title:output.title,characters:output.content.length,elapsedMs:Date.now()-start}));
  }
  writeFileSync('docs/workflow/quality-14b-examples.json',JSON.stringify({checkedAt:new Date().toISOString(),syntheticBrand:true,actualNetworkGeneration:true,model:capability.model,results},null,2)+'\n');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Quality smoke failed');process.exitCode=1;});
