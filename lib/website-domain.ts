export const WEBSITE_STYLES = ['editorial', 'studio', 'bold'] as const;
export const WEBSITE_SECTION_TYPES = ['hero', 'services', 'products', 'about', 'gallery', 'process', 'faq', 'pricing', 'location', 'contact', 'cta'] as const;
export type WebsiteStyle = typeof WEBSITE_STYLES[number];
export type WebsiteSectionType = typeof WEBSITE_SECTION_TYPES[number];
export interface WebsiteTile {title:string;body:string;image?:string;buttonLabel?:string;buttonUrl?:string}
export interface WebsiteSection {id:string;type:WebsiteSectionType;title:string;body:string;items?:string[];tiles?:WebsiteTile[];questions?:{question:string;answer:string}[];image?:string;buttonLabel?:string;buttonUrl?:string}
export interface WebsiteBusinessDetails {about:string;process:string[];questions:{question:string;answer:string}[];address:string;hours:string;pricing:string[]}
export interface WebsiteVisualDocument {html:string;css:string;designCss?:string}
export interface WebsiteDesign {layout:'split'|'immersive'|'editorial';font:'modern'|'editorial'|'geometric';background:string;ink:string;surface:string;radius:number;motion:'subtle'|'none';keywords:string;systemId?:string;systemName?:string;sectionStyle?:'cards'|'rows'|'bands'|'editorial';imageTreatment?:'rounded'|'arch'|'framed'|'wide';density?:'airy'|'balanced'|'compact';buttonStyle?:'pill'|'soft'|'square';serviceColumns?:1|2|3}
export interface WebsitePhotoCredit {assetUrl:string;title:string;author:string;sourceUrl:string;license:string;licenseUrl:string}
export interface WebsiteDocument {title:string;description:string;accent:string;theme:'light'|'dark';sections:WebsiteSection[];visual?:WebsiteVisualDocument;design?:WebsiteDesign;photoCredits?:WebsitePhotoCredit[];businessKind?:'retail'|'hospitality'|'service'|'portfolio'|'general';compositionVersion?:number}
export interface Website {id:string;name:string;businessStage:'new'|'existing';offer:string;audience:string;contact:string;brief:string;style:WebsiteStyle;businessDetails?:WebsiteBusinessDetails;document:WebsiteDocument;revision:number;previousBuildRevision?:number;createdAt:string;updatedAt:string;generation:{provider:string;model:string;at:string}|null}
export interface WebsiteAsset {id:string;url:string;name:string;mime:string;bytes:number;width:number;height:number}
