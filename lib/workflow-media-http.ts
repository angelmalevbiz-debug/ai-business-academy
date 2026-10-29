import type {NextRequest} from 'next/server';
import {AppError} from './auth';
export function assertMediaOrigin(request:NextRequest){
  const actual=request.headers.get('origin');let expected=process.env.APP_ORIGIN;
  if(expected){try{const url=new URL(expected);if(url.origin!==expected||!['https:','http:'].includes(url.protocol))throw new Error();}catch{throw new AppError('Видео услугата няма валиден адрес.',503);}}
  else{if(process.env.NODE_ENV==='production')throw new AppError('Видео услугата няма настроен адрес.',503);const url=new URL(request.url);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new AppError('Неразрешен адрес.',403);expected=url.origin;}
  if(actual!==expected)throw new AppError('Действието трябва да е от този сайт.',403);
}
export function parseMediaRange(value:string|null,size:number){
  if(!value)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!match[1]&&!match[2])throw new AppError('Невалиден откъс от файла.',416);
  const suffix=!match[1],start=suffix?Math.max(0,size-Number(match[2])):Number(match[1]),end=suffix?size-1:match[2]?Math.min(size-1,Number(match[2])):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size||size<1)throw new AppError('Откъсът не е наличен.',416);return{start,end};
}
