import {NextRequest} from 'next/server';
import {AppError,rateLimit} from '@/lib/auth';
import {createWebsite,getWebsite,listWebsites,saveWebsite,restoreWebsiteBuild} from '@/lib/website-store';
import {composeWebsite,createCompleteWebsite} from '@/lib/website-composition';
import {generateWebsite} from '@/lib/website-generation';
import {getWebsiteLocalCapability,refineWebsite} from '@/lib/website-local-agent';
import {applyWebsiteDesignAction} from '@/lib/website-design-actions';
import {listWebsiteDesignSystems,WEBSITE_DESIGN_BASES,WEBSITE_DESIGN_RECIPE_COUNT} from '@/lib/website-design-catalog';
import {body,failure,json,member,origin} from './http';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
export async function GET(request:NextRequest){try{const user=member(request),id=request.nextUrl.searchParams.get('id');if(request.nextUrl.searchParams.get('designs')==='1'){const site=getWebsite(user,id);return json({systems:listWebsiteDesignSystems(site),directions:WEBSITE_DESIGN_BASES.length,recipes:WEBSITE_DESIGN_RECIPE_COUNT});}if(request.nextUrl.searchParams.get('capability')==='1')return json({capability:await getWebsiteLocalCapability(request.nextUrl.searchParams.get('refresh')==='1')});return json(id?{website:getWebsite(user,id)}:{websites:listWebsites(user)});}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{origin(request);const user=member(request);rateLimit(`website-write:${user.id}`,100);const data=await body(request);if(data.action==='build')return json(await createCompleteWebsite(user,data),201);if(data.action==='restore-build')return json({website:restoreWebsiteBuild(user,data)});if(data.action==='complete')return json(await composeWebsite(user,{...data,complete:true}));if(data.action==='create')return json({website:createWebsite(user,data)},201);if(data.action==='save')return json({website:saveWebsite(user,data)});if(data.action==='design')return json(await applyWebsiteDesignAction(user,data));if(data.action==='compose')return json(await composeWebsite(user,data));if(data.action==='generate')return json({website:await generateWebsite(user,data)});if(data.action==='refine')return json({website:await refineWebsite(user,data)});throw new AppError('Избери създаване, запис или генериране.');}catch(error){return failure(error);}}
