export interface WorkflowMediaAsset {
  id:string;name:string;mime:string;bytes:number;duration:number;width:number;height:number;createdAt:string;sourceUrl:string;
}
export interface WorkflowMediaParameters {start:number;end:number;aspect:'9:16'|'1:1'|'16:9';layout:'fit'|'fill';captionText:string}
export interface WorkflowMediaJob extends WorkflowMediaParameters {
  id:string;assetId:string;assetName:string;status:'queued'|'running'|'ready'|'failed'|'cancelled';progress:number;
  version:number;createdAt:string;outputUrl:string|null;error:string|null;
}
export interface WorkflowMediaState {
  assets:WorkflowMediaAsset[];jobs:WorkflowMediaJob[];
  capability:{upload:boolean;render:boolean;worker:boolean;message:string};
}
