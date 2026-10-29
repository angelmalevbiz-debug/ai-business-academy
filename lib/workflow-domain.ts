export type WorkflowRoleId = 'chief' | 'research' | 'strategy' | 'copy' | 'art' | 'publish' | 'community';
export type WorkflowTemplateId = 'content' | 'sales' | 'deals' | 'operations' | 'intelligence' | 'support' | 'finance';
export type WorkflowRunStatus = 'ready' | 'running' | 'awaiting_approval' | 'completed' | 'blocked' | 'failed' | 'cancelled';
export interface BrandBrain {
  id: string; version: number; name: string; audience: string; voice: string;
  offer: string; notes: string; guardrails: string; updatedAt: string;
}
export interface WorkflowRole { id: WorkflowRoleId; name: string; purpose: string }
export interface WorkflowTemplate {
  id: WorkflowTemplateId; name: string; description: string; roles: WorkflowRoleId[]; outcome: string; adultOnly?: boolean;
}
export interface WorkflowProject {
  id: string; templateId: WorkflowTemplateId; title: string; brief: string; createdAt: string; updatedAt: string;
  recipeId?: string | null;
}
export interface WorkflowRecipe {
  id:string; templateId:WorkflowTemplateId; title:string; description:string; outcome:string;
  tags:string[]; roles:WorkflowRoleId[]; requiredInputs:string[]; connections:string[];
  readyWithoutConnections:boolean; brief:string;
  outputKind:'video'|'text'|'plan'|'analysis'|'reply'|'proposal';
}
export interface WorkflowPlanItem {
  id:string;projectId:string;day:string;phase:'film'|'review';status:'planned'|'done';
  version:number;createdAt:string;updatedAt:string;
}
export interface WorkflowBriefRefinement {
  original:string; proposed:string; changes:string[]; missingInputs:string[];
  provider:'ollama'|'openai'; model:string;
}
export interface WorkflowMemoryHit {
  kind:'brain'|'artifact';id:string;title:string;excerpt:string;citation:string;
  projectId:string|null;revision:number;updatedAt:string;
}
export interface WorkflowRun {
  id: string; projectId: string; templateId: WorkflowTemplateId; status: WorkflowRunStatus;
  currentStep: number; totalSteps: number; brainVersion: number; error: string | null;
  createdAt: string; updatedAt: string;
  autoStatus?: 'off' | 'queued' | 'running' | 'paused' | 'completed' | 'failed';
}
export interface WorkflowArtifact {
  id: string; projectId: string; runId: string; role: WorkflowRoleId; title: string; content: string;
  revision: number; status: 'draft' | 'approved' | 'rejected'; feedback: string;
  provenance: 'ai' | 'imported' | 'human' | 'compiled'; provider: string | null; model: string | null;
  sourceId: string | null; createdAt: string; updatedAt: string;
}
export interface WorkflowEvent { id: string; projectId: string; runId: string | null; kind: string; message: string; createdAt: string }
export interface WorkflowCapability {
  provider: 'ollama' | 'openai' | 'none'; model: string | null; configured: boolean;
  /** Explicit model for written-copy recipes; null uses the general model. */
  copyModel?: string | null;
  status: 'ready' | 'configured_unverified' | 'needs_setup' | 'unavailable';
  message: string; networkChecked: boolean; publishing: false; editing: false;
  worker?: {available:boolean;message:string;lastSeen:string|null};
}
export interface WorkflowState {
  brain: BrandBrain | null; projects: WorkflowProject[]; runs: WorkflowRun[];
  artifacts: WorkflowArtifact[]; events: WorkflowEvent[];
  capability: WorkflowCapability; templates: WorkflowTemplate[]; roles: WorkflowRole[];
  recipes: WorkflowRecipe[];
  planItems:WorkflowPlanItem[];
}
export const WORKFLOW_ROLES: WorkflowRole[] = [
  {id:'chief',name:'Координатор',purpose:'Подрежда задачата, входните данни и решенията за одобрение.'},
  {id:'research',name:'Анализатор',purpose:'Разделя доказаното от предположенията и липсващите данни.'},
  {id:'strategy',name:'Стратег',purpose:'Избира следващия конкретен ход според целта.'},
  {id:'copy',name:'Автор',purpose:'Подготвя текст в гласа на бранда.'},
  {id:'art',name:'Арт директор',purpose:'Подготвя кадри, монтажен план и надписи за изпълнение.'},
  {id:'publish',name:'Издател',purpose:'Сглобява пакета за преглед и бъдещо публикуване.'},
  {id:'community',name:'Общност',purpose:'Предлага отговори и следващи разговори за преглед.'},
];
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {id:'content',name:'Съдържание',description:'От идея до сценарий и пакет за публикуване.',roles:['chief','research','strategy','copy','art','publish','community'],outcome:'Сценарий, кадри, надписи и отговори за одобрение.'},
  {id:'sales',name:'Продажби',description:'От клиентска нужда до ясна оферта.',roles:['chief','research','strategy','copy'],outcome:'Въпроси, предложение и последващ разговор.',adultOnly:true},
  {id:'deals',name:'Сделки',description:'Подготви разговор и прегледай условията.',roles:['chief','research','strategy','copy'],outcome:'Карта на интересите, условия и чернова за преговори.',adultOnly:true},
  {id:'operations',name:'Операции',description:'Превърни повтаряща се задача в работен процес.',roles:['chief','research','strategy','art'],outcome:'Процедура, отговорници и тестови случаи.'},
  {id:'intelligence',name:'Пазар',description:'Сравни наличните източници и пропуските.',roles:['chief','research','strategy'],outcome:'Сравнение с посочени източници и следваща проверка.'},
  {id:'support',name:'Поддръжка',description:'Подготви полезен отговор на реален въпрос.',roles:['chief','research','copy','community'],outcome:'Чернова на отговор и кога да се включи човек.'},
  {id:'finance',name:'Финанси',description:'Разбери числата и какво още липсва.',roles:['chief','research','strategy'],outcome:'Преглед на предоставени данни и въпроси към специалист.',adultOnly:true},
];
