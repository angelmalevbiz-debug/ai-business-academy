import type {Website,WebsiteDesign} from './website-domain';
import {AppError} from './auth';

type Site=Pick<Website,'name'|'offer'|'style'>;
type Base={id:string;name:string;terms:RegExp;keywords:string;accent:string;background:string;ink:string;surface:string;radius:number;layout:WebsiteDesign['layout'];font:WebsiteDesign['font'];sectionStyle:NonNullable<WebsiteDesign['sectionStyle']>};
type Row=[string,string,RegExp,string,string,string,string,string,number,Base['layout'],Base['font'],Base['sectionStyle']];
// Authored art directions, not model training or copied brand identities.
// Each direction specifies content rhythm as well as palette and photo subject.
const rows:Row[]=[
 ['dental','Дентална практика',/стоматолог|дентал|зъб|dental|dentist/iu,'dental clinic interior','#19676b','#f1f8f6','#153d42','#dceeea',24,'split','modern','rows'],
 ['medical','Медицинска практика',/лекар|клиника|медицин|clinic|medical|doctor/iu,'medical clinic reception interior','#236a88','#f4f8fc','#183746','#e1edf5',24,'split','modern','rows'],
 ['physio','Движение и възстановяване',/физиотерап|кинезитерап|physio|rehabilitation/iu,'physiotherapy exercise studio','#426f5a','#f4f5eb','#273b30','#e2e8d9',32,'editorial','modern','editorial'],
 ['law','Адвокатска кантора',/адвокат|правни|lawyer|legal|attorney/iu,'law office library books','#77512c','#f5f1e9','#292e36','#e8e1d6',12,'split','editorial','rows'],
 ['finance','Финанси и счетоводство',/счетовод|финансов|accounting|finance|bookkeep/iu,'accounting office desk','#315aa1','#f3f5fa','#1c2d49','#e0e6f2',16,'split','modern','rows'],
 ['consulting','Бизнес консултации',/консулт|consulting|consultant|strategy/iu,'business meeting architecture','#6b493d','#f4f1ec','#292923','#e5e0d7',20,'editorial','editorial','editorial'],
 ['software','Софтуерен продукт',/софтуер|software|saas|разработка|приложени|програмиран/iu,'software workspace computer','#4e57b7','#f5f4fc','#29263d','#e8e5f4',20,'split','geometric','cards'],
 ['agency','Креативна агенция',/агенция|маркетинг|agency|marketing|branding/iu,'creative design studio workspace','#bd3827','#faf3eb','#34271e','#f0e2d5',20,'editorial','geometric','editorial'],
 ['architecture','Архитектура',/архитект|architecture|architect/iu,'modern architecture building interior','#825f43','#f5f1eb','#292a26','#e6e1d7',24,'editorial','modern','editorial'],
 ['interior','Интериорно студио',/интериор|interior|обзавеждан/iu,'contemporary interior living room','#79624a','#f4eee7','#37302a','#e8ddd0',36,'editorial','editorial','bands'],
 ['photography','Фотографско портфолио',/снимк|фото|photograph|camera/iu,'photography studio camera','#b83b25','#f5f2eb','#222c29','#e3e7de',28,'immersive','modern','editorial'],
 ['film','Видео и продукция',/видео|филм|video|film|cinema/iu,'cinematography film camera studio','#a83627','#f5f0e9','#2f2827','#e9ddd6',16,'immersive','geometric','rows'],
 ['coffee','Кафе и печива',/кафе|coffee|пекар|bakery|кондитер/iu,'artisan coffee bakery interior','#a94b29','#f8f1e7','#35251c','#efe2cf',32,'editorial','editorial','editorial'],
 ['restaurant','Ресторант',/ресторан|restaurant|bistro|бистро|кухня/iu,'restaurant dining food table','#8d392e','#fbf3e7','#3b2a24','#efdecc',28,'immersive','editorial','rows'],
 ['wine','Вино и дегустации',/винар|вино|wine|vineyard/iu,'vineyard wine cellar','#823b46','#f8f0e9','#37282a','#eadcd5',20,'editorial','editorial','rows'],
 ['hotel','Хотел и гостоприемство',/хотел|hotel|къща за гости|guest house|resort/iu,'hotel room hospitality interior','#7a6242','#f7f1e7','#302d25','#eae2d5',32,'immersive','editorial','bands'],
 ['travel','Пътувания и приключения',/туриз|пътува|travel|tourism|adventure|екскурз/iu,'mountain hiking landscape travel','#326b64','#edf5ef','#1e3c34','#d8e9df',32,'immersive','modern','bands'],
 ['estate','Недвижими имоти',/имоти|недвижим|real estate|property/iu,'modern residential architecture house','#5e6653','#f5f4ed','#29352e','#e2e6da',24,'split','modern','cards'],
 ['construction','Строителство',/строител|construction|renovation/iu,'construction architecture building detail','#a84e21','#f7f1e8','#30302b','#e9e2d6',12,'split','geometric','rows'],
 ['furniture','Мебели и дърво',/мебел|дърводел|furniture|carpentry|woodwork/iu,'furniture wood workshop chair','#835533','#f6f0e7','#362d25','#eaddce',20,'editorial','editorial','editorial'],
 ['bicycle','Вело ателие',/велосип|вело|bicycle|bike/iu,'bicycle workshop repair','#c34725','#f5f0e8','#192a28','#e4e9df',28,'split','modern','rows'],
 ['automotive','Автомобилен сервиз',/авто|car repair|car service|automotive/iu,'automotive repair workshop','#b6442e','#f3f0e9','#222d31','#e2e5e5',24,'split','geometric','rows'],
 ['plumbing','ВиК услуги',/водопровод|канал|вик услуги|plumb/iu,'plumber tools water pipes','#24678b','#f1f6f9','#223945','#dfeaf0',16,'split','modern','rows'],
 ['electronics','Техника и електроника',/електроник|техника|джаджи|компют|лаптоп|electronics|computer shop|laptop|gadgets/iu,'computer shop electronics','#2762bd','#f7f8fa','#111c2e','#e9edf4',26,'split','geometric','cards'],
 ['electric','Електро услуги',/електро|електри|electrician|electrical installation/iu,'electrician tools electrical installation','#805e18','#f8f4e6','#353122','#ede5c9',16,'split','geometric','rows'],
 ['repair','Майсторски услуги',/ремонт|repair|workshop/iu,'craftsman tools workshop','#ae4c26','#f5f1e9','#27302b','#e4e8dc',28,'split','modern','rows'],
 ['fitness','Тренировки и сила',/фитнес|fitness|спорт|gym|трениров|training/iu,'fitness gym training','#42651f','#f3f5eb','#27351d','#e1e8d4',24,'immersive','geometric','bands'],
 ['yoga','Йога и движение',/йога|yoga|pilates|пилатес/iu,'yoga studio natural light','#666b43','#f5f3e9','#333a2c','#e5e7d6',40,'editorial','editorial','editorial'],
 ['beauty','Студио за красота',/красот|beauty|козмет|spa/iu,'spa beauty interior','#80515c','#f8f0f2','#392933','#ebdce3',48,'editorial','editorial','bands'],
 ['hair','Фризьор и бръснар',/фризьор|бръснар|barber|hair salon/iu,'barber hair salon interior','#8a482e','#f7f0e6','#342c24','#ebdfcf',28,'split','modern','rows'],
 ['flowers','Цветя и градини',/растени|градин|plant|garden|цветя|flower/iu,'botanical garden flowers','#356748','#f2f5e9','#213b2b','#dfe8d4',40,'split','editorial','editorial'],
 ['fashion','Мода и облекло',/мода|дрех|fashion|clothing|boutique/iu,'fashion fabric clothing studio','#79414f','#f9f2f0','#35262d','#eddfdf',20,'editorial','editorial','editorial'],
 ['jewelry','Бижута и занаяти',/бижут|jewell?ery|accessories/iu,'jewelry gold silver detail','#85651f','#f9f5e8','#3b3423','#eee6cf',24,'editorial','editorial','rows'],
 ['ceramics','Керамика и ръчна изработка',/керамик|ръчно|ceramic|pottery|handmade/iu,'handmade ceramic pottery workshop','#9c523b','#f8efe5','#3a2d25','#edddcc',32,'editorial','editorial','editorial'],
 ['education','Обучения и умения',/обучени|академи|education|academy|course/iu,'education creative workshop learning','#3d5aa1','#f4f5fb','#283248','#e2e6f3',24,'split','modern','cards'],
 ['language','Езиково студио',/езиков|language|translation|превод/iu,'language books library desk','#3a686b','#f2f6f3','#253b3d','#dfeae4',24,'split','modern','rows'],
 ['pets','Грижа за животни',/ветеринар|домашни любимци|veterinar|pet care|dog groom/iu,'veterinary clinic pet care','#3b7270','#f0f7f2','#243f37','#deece3',32,'split','modern','cards'],
 ['cleaning','Почистване',/почиств|cleaning|laundry|химическо чист/iu,'clean modern home interior','#286b80','#f0f7fa','#233d49','#deebf1',28,'split','modern','rows'],
 ['events','Събития и празници',/сватб|събити|wedding|event|celebration/iu,'wedding event table flowers','#8b4658','#faf1ef','#3b2932','#eedee1',40,'immersive','editorial','bands'],
 ['logistics','Логистика и транспорт',/логист|транспорт|доставк|logistic|transport|delivery/iu,'logistics warehouse delivery','#335d92','#f1f5fa','#24354b','#dfe7f2',16,'split','modern','rows'],
 ['technology','Продуктово студио',/технолог|дизайн|design|technology|product/iu,'product design studio workspace','#4f578c','#f3f4fa','#2b3046','#e3e5f1',24,'split','modern','cards'],
];
export const WEBSITE_DESIGN_BASES:Base[]=rows.map(([id,name,terms,keywords,accent,background,ink,surface,radius,layout,font,sectionStyle])=>({id,name,terms,keywords,accent,background,ink,surface,radius,layout,font,sectionStyle}));
type Variant={id:string;name:string;layout?:Base['layout'];sectionStyle?:Base['sectionStyle'];imageTreatment:NonNullable<WebsiteDesign['imageTreatment']>;density:NonNullable<WebsiteDesign['density']>;buttonStyle:NonNullable<WebsiteDesign['buttonStyle']>};
// Each variant changes more than color: hero geometry, content grouping, image
// proportions, density and the button family are coordinated as a whole.
const variants:Variant[]=[
 {id:'signature',name:'Авторска композиция',imageTreatment:'rounded',density:'balanced',buttonStyle:'pill'},
 {id:'journal',name:'Редакционно представяне',layout:'editorial',sectionStyle:'editorial',imageTreatment:'arch',density:'airy',buttonStyle:'soft'},
 {id:'panorama',name:'Панорамна история',layout:'split',sectionStyle:'bands',imageTreatment:'wide',density:'airy',buttonStyle:'pill'},
 {id:'focus',name:'Фокус върху предложението',layout:'split',sectionStyle:'rows',imageTreatment:'framed',density:'compact',buttonStyle:'square'},
 {id:'immersive',name:'Голям визуален акцент',layout:'immersive',sectionStyle:'rows',imageTreatment:'rounded',density:'balanced',buttonStyle:'soft'},
 {id:'showcase',name:'Витрина',layout:'split',sectionStyle:'cards',imageTreatment:'rounded',density:'airy',buttonStyle:'soft'},
 {id:'atlas',name:'Визуален разказ',layout:'editorial',sectionStyle:'bands',imageTreatment:'framed',density:'balanced',buttonStyle:'square'},
 {id:'essential',name:'Само най-важното',layout:'split',sectionStyle:'editorial',imageTreatment:'rounded',density:'compact',buttonStyle:'pill'},
];
export const WEBSITE_DESIGN_RECIPE_COUNT=WEBSITE_DESIGN_BASES.length*variants.length;
export type WebsiteDesignSystem={id:string;name:string;industryId:string;design:WebsiteDesign;accent:string;theme:'light'|'dark'};
function businessBase(site:Site){const name=site.name.toLocaleLowerCase('bg'),offer=site.offer.toLocaleLowerCase('bg');const scored=WEBSITE_DESIGN_BASES.map(base=>{const inName=name.match(base.terms),inOffer=offer.match(base.terms);return {base,score:inName?100+inName[0].length:inOffer?inOffer[0].length:0};}).sort((a,b)=>b.score-a.score);return scored[0].score?scored[0].base:WEBSITE_DESIGN_BASES.at(-1)!;}
function recipe(base:Base,variant:Variant,site:Site):WebsiteDesignSystem{
 const dark=site.style!=='editorial',theme=dark?'dark':'light';
 const id=`${base.id}:${variant.id}`;const design:WebsiteDesign={systemId:id,systemName:base.name+' · '+variant.name,keywords:base.keywords,font:base.font,layout:variant.layout||base.layout,sectionStyle:variant.sectionStyle||base.sectionStyle,imageTreatment:variant.imageTreatment,density:variant.density,buttonStyle:variant.buttonStyle,radius:base.radius,motion:'subtle',background:dark?'#12191d':base.background,ink:dark?'#f3f5f1':base.ink,surface:dark?'#253035':base.surface};
 return {id,name:variant.name,industryId:base.id,design,accent:site.style==='bold'?'#f4ca3f':dark?'#c4dcac':base.accent,theme};
}
export function listWebsiteDesignSystems(site:Site):WebsiteDesignSystem[]{const base=businessBase(site);return variants.map(variant=>recipe(base,variant,site));}
export function selectWebsiteDesignSystem(site:Site,systemId?:string):WebsiteDesignSystem{
 if(systemId){const [baseId,variantId,...rest]=systemId.split(':'),base=WEBSITE_DESIGN_BASES.find(b=>b.id===baseId),variant=variants.find(v=>v.id===variantId);if(rest.length||!base||!variant)throw new AppError('Този дизайн не е наличен. Избери от предложените варианти.');return recipe(base,variant,site);}
 // Keep the signature as a stable first design; names personalize detail rhythm
 // without making a category select the wrong photograph subject or theme.
 const base=businessBase(site),hash=[...site.name].reduce((n,c)=>(n*31+c.codePointAt(0)!)>>>0,0),result=recipe(base,variants[0],site);
 result.design.buttonStyle=hash%2?'pill':'soft';result.design.density=hash%3===0?'airy':'balanced';return result;
}
