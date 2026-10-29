import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AppError } from '../lib/auth';
import type { ReservedWorkflowStep } from '../lib/workflow-store';
import { buildWorkflowContextPackage } from '../lib/workflow-context';

function sample():ReservedWorkflowStep {
  const timestamp='2026-10-27T12:00:00Z';
  return {ownerId:'owner-a',token:'private-lease-token',run:{id:'run-a',projectId:'project-a',templateId:'content',status:'running',currentStep:1,totalSteps:7,brainVersion:4,error:null,createdAt:timestamp,updatedAt:timestamp},project:{id:'project-a',templateId:'content',title:'Един работен процес',brief:'Покажи едно запитване и проверката му.',createdAt:timestamp,updatedAt:timestamp},brain:{id:'brain-a',version:4,name:'Академия',audience:'Начинаещи',voice:'Просто и конкретно',offer:'Практически умения',notes:'Без фалшиви резултати',guardrails:'Само чернова. Без изпращане.',updatedAt:timestamp},inputs:[{id:'artifact-a',projectId:'project-a',runId:'run-a',role:'chief',title:'Бриф',content:'a'.repeat(2300),revision:2,status:'approved',feedback:'Покажи проверката.',provenance:'ai',provider:'ollama',model:'qwen3:8b',sourceId:null,createdAt:timestamp,updatedAt:timestamp}],role:'research',stepIndex:1,feedback:'Не измисляй статистика.'};
}

test('context package scopes the actual run, cites immutable source hashes and uses the copied SDK workspace type',()=>{
  const value=sample(),context=buildWorkflowContextPackage(value);
  assert.deepEqual(context.authorizationEnvelope,{actorId:'owner-a',workspaceId:'academy:owner-a',projectId:'project-a',runId:'run-a',operation:'workflow.draft',permissions:['draft:create'],externalActionsAllowed:false});
  assert.equal(context.sections.brandSnapshot.version,4);assert.equal(context.sourcePackages.length,3);assert.equal(context.freshness.mode,'immutable_run_snapshot');
  const artifact=context.sourcePackages.find(source=>source.kind==='workflow_artifact')!;
  assert.equal(artifact.sha256,createHash('sha256').update(value.inputs[0].content).digest('hex'));
  assert.equal(context.sections.previousArtifacts[0].excerpt.length,1000);assert.equal(context.filteredObjectSummary.omittedCharacters,1300);assert.equal(context.budget.excerpted,true);
  assert.equal(context.budget.used,JSON.stringify(context).length);assert.ok(context.budget.used<=15500);assert.equal(JSON.stringify(context).includes('private-lease-token'),false);
});

test('context assembly is replayable and a later source edit does not mutate its old snapshot',()=>{
  const value=sample(),first=buildWorkflowContextPackage(value),again=buildWorkflowContextPackage(value);assert.deepEqual(first,again);
  value.brain.voice='Сменен глас';value.inputs[0].content='Сменено съдържание';
  const changed=buildWorkflowContextPackage(value);assert.notEqual(changed.contentSha256,first.contentSha256);assert.equal(first.sections.brandSnapshot.voice,'Просто и конкретно');assert.equal(first.sections.previousArtifacts[0].excerpt,'a'.repeat(1000));
});

test('another project or run is rejected instead of being silently added to shared context',()=>{
  for(const field of ['projectId','runId'] as const){const value=sample();value.inputs[0][field]='another-private-space';assert.throws(()=>buildWorkflowContextPackage(value),(error:unknown)=>error instanceof AppError&&error.status===403);}
  const value=sample();value.run.projectId='another-project';assert.throws(()=>buildWorkflowContextPackage(value),AppError);
});

test('an oversized brief or brand is rejected without silently cutting its rules',()=>{
  const value=sample();value.brain.guardrails='Задължително правило '.repeat(1200);
  assert.throws(()=>buildWorkflowContextPackage(value),(error:unknown)=>error instanceof AppError&&error.status===400&&/Съкрати/.test(error.message));
  assert.throws(()=>buildWorkflowContextPackage(sample(),999),AppError);assert.throws(()=>buildWorkflowContextPackage(sample(),16001),AppError);
});
