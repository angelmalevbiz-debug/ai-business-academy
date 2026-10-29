/**
 * Local TypeScript adaptation of Optimal Engine's ScopeEnvelope / SourcePackage /
 * ContextPackage pattern. Copyright 2026 MIOSA LLC and contributors, Apache-2.0.
 * Modified for Academy's owner-scoped SQLite workflow snapshots, 2026-10-27.
 * This is not the Elixir retrieval engine or a claim that it is running.
 * See lib/vendor/optimal-engine/LICENSE, NOTICE and docs/workflow/OPTIMAL_ENGINE_AUDIT.md.
 */
import { createHash } from 'node:crypto';
import { AppError } from './auth';
import type { ReservedWorkflowStep } from './workflow-store';
import { asWorkspaceId } from './vendor/optimal-engine/types';

const hash = (value:string) => createHash('sha256').update(value).digest('hex');

export function buildWorkflowContextPackage(input:ReservedWorkflowStep, maxCharacters=15_500) {
  if (!input.ownerId || !input.project.id || input.run.projectId!==input.project.id) throw new AppError('Контекстът няма валиден собственик и проект.',403);
  if (!Number.isInteger(maxCharacters)||maxCharacters<1000||maxCharacters>16000) throw new AppError('Лимитът на контекста трябва да е между 1000 и 16000 знака.',400);
  if (input.inputs.some(item=>item.projectId!==input.project.id||item.runId!==input.run.id)) throw new AppError('Резултат от друг проект не може да се използва тук.',403);

  const brain={id:input.brain.id,version:input.brain.version,name:input.brain.name,audience:input.brain.audience,voice:input.brain.voice,offer:input.brain.offer,notes:input.brain.notes,guardrails:input.brain.guardrails,updatedAt:input.brain.updatedAt};
  const project={id:input.project.id,templateId:input.project.templateId,recipeId:input.project.recipeId||null,title:input.project.title,brief:input.project.brief};
  const prior=input.inputs.map(item=>({id:item.id,role:item.role,title:item.title,revision:item.revision,status:item.status,provenance:item.provenance,sourceId:item.sourceId,excerpt:item.content.slice(0,1000),omittedCharacters:Math.max(0,item.content.length-1000),feedback:item.feedback,contentSha256:hash(item.content),updatedAt:item.updatedAt}));
  const sourcePackages=[
    {id:`brand:${brain.id}:v${brain.version}`,kind:'brand_snapshot',revision:brain.version,sha256:hash(JSON.stringify(brain)),sourceId:brain.id},
    {id:`brief:${project.id}`,kind:'project_brief',revision:null,sha256:hash(project.brief),sourceId:project.id},
    ...prior.map(item=>({id:`artifact:${item.id}:v${item.revision}`,kind:'workflow_artifact',revision:item.revision,sha256:item.contentSha256,sourceId:item.sourceId||item.id})),
  ];
  const value={
    schema:'academy.context-package.v1',
    authorizationEnvelope:{actorId:input.ownerId,workspaceId:asWorkspaceId(`academy:${input.ownerId}`),projectId:project.id,runId:input.run.id,operation:'workflow.draft',permissions:['draft:create'],externalActionsAllowed:false},
    requestIntent:input.role,
    freshness:{mode:'immutable_run_snapshot',brainVersion:brain.version,runUpdatedAt:input.run.updatedAt},
    sourcePackages,
    sections:{brandSnapshot:brain,project,previousArtifacts:prior,revisionFeedback:input.feedback},
    filteredObjectSummary:{crossProjectInputs:0,omittedCharacters:prior.reduce((sum,item)=>sum+item.omittedCharacters,0)},
    budget:{unit:'characters',maximum:maxCharacters,used:0,excerpted:prior.some(item=>item.omittedCharacters>0)},
    contentSha256:hash(JSON.stringify({brain,project,prior,feedback:input.feedback})),
  };
  // Include the envelope/provenance overhead in the actual serialized budget.
  // Never silently truncate brand rules or the user's project brief.
  for(let pass=0;pass<3;pass++)value.budget.used=JSON.stringify(value).length;
  if(value.budget.used>maxCharacters)throw new AppError('Контекстът е твърде дълъг. Съкрати брифа или общия контекст на бранда; правилата и източниците няма да бъдат отрязани автоматично.',400);
  return value;
}
