"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Brain, Buildings, ChatsCircle, FilmSlate, MagnifyingGlass, PencilLine, PaperPlaneTilt, Strategy, Stack, ArrowsOutSimple, ArrowUpRight, FileText } from "@phosphor-icons/react";
import type * as THREE from "three";
import styles from "./workflow-world.module.css";

export type WorkflowDepartment = 'content'|'sales'|'deals'|'operations'|'intelligence'|'support'|'finance';
export type WorkflowWorldProps = {
  selected: string | null;
  onSelect: (role: string | null) => void;
  activeRole?: string | null;
  completedRoles?: string[];
  paused: boolean;
  department?: WorkflowDepartment | null;
  onDepartmentSelect?: (department: WorkflowDepartment | null) => void;
  artifacts?: {id:string;role:string;title:string;revision:number;status:string}[];
  onArtifactSelect?: (id:string)=>void;
};

const departments = [
  {id:'content',label:'Съдържание',x:0,z:-20},
  {id:'sales',label:'Продажби',x:-21,z:-18},
  {id:'deals',label:'Сделки',x:21,z:-18},
  {id:'operations',label:'Операции',x:-22,z:5},
  {id:'intelligence',label:'Пазар',x:22,z:5},
  {id:'support',label:'Поддръжка',x:-11,z:26},
  {id:'finance',label:'Финанси',x:11,z:26},
] as const;

const stations = [
  { id: "chief", label: "Координатор", place:"Преглед", icon: Stack, x: 0, z: -12.5 },
  { id: "research", label: "Анализатор", place:"Проучване", icon: MagnifyingGlass, x: -13, z: -8 },
  { id: "strategy", label: "Стратег", place:"План", icon: Strategy, x: 0, z: 13 },
  { id: "copy", label: "Автор", place:"Сценарии", icon: PencilLine, x: 12, z: -8 },
  { id: "art", label: "Арт директор", place:"Монтаж", icon: FilmSlate, x: -12, z: 9 },
  { id: "community", label: "Общност", place:"Отговори", icon: ChatsCircle, x: -23, z: 1 },
  { id: "publish", label: "Издател", place:"Публикуване", icon: PaperPlaneTilt, x: 13, z: 10 },
];

type Controller = {
  move: (id: string | null, immediately?: boolean) => void;
  update: () => void;
  dispose: () => void;
};

export default function WorkflowWorld({ selected, onSelect, activeRole = null, completedRoles = [], paused, department, onDepartmentSelect, artifacts=[],onArtifactSelect }: WorkflowWorldProps) {
  const [localDepartment,setLocalDepartment] = useState<WorkflowDepartment|null>(null);
  const currentDepartment = department === undefined ? localDepartment : department;
  const chooseDepartment = (id:WorkflowDepartment|null) => { if(onDepartmentSelect) onDepartmentSelect(id); else { setLocalDepartment(id); onSelect(null); } };
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const controller = useRef<Controller | null>(null);
  const latest = useRef({ selected, activeRole, completedRoles, paused, department:currentDepartment,artifacts });
  useLayoutEffect(() => { latest.current = { selected, activeRole, completedRoles, paused, department:currentDepartment,artifacts }; }, [selected, activeRole, completedRoles, paused, currentDepartment,artifacts]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};

    async function initialize() {
      const [T,{RoomEnvironment}] = await Promise.all([import("three"),import("three/addons/environments/RoomEnvironment.js")]);
      if (cancelled || !host.current || !frame.current) return;
      const element = host.current;
      const sceneFrame = frame.current;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        setState("unavailable");
        return;
      }

      const scene = new T.Scene();
      renderer.setClearColor(0x000000,0);
      const camera = new T.PerspectiveCamera(39, 1, 0.1, 450);
      const look = new T.Vector3(0, 0.8, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      renderer.domElement.setAttribute("aria-hidden", "true");
      element.appendChild(renderer.domElement);

      // A single baked studio reflection gives metal an environment to reflect.
      // It adds no animation pass and is released with the scene.
      const studio = new RoomEnvironment();
      const reflections = new T.PMREMGenerator(renderer);
      const environment = reflections.fromScene(studio,.04,.1,100,{size:128});
      scene.environment = environment.texture;
      scene.environmentIntensity = .55;
      studio.dispose();
      reflections.dispose();

      const material = (color: string, metalness = 0.35, roughness = 0.48) => new T.MeshStandardMaterial({ color, metalness, roughness });
      const charcoal = material("#2b4362", 0.22);
      const steel = material("#a2aab7", 0.7, 0.3);
      const darkSteel = material("#4b6383", 0.65, 0.38);
      const paper = material("#f6f5f1", 0, 0.85);
      const screen = material("#070a10", 0.25, 0.6);
      const blue = new T.MeshBasicMaterial({ color: "#559fff" });
      const red = new T.MeshBasicMaterial({ color: "#f12649" });
      const groundMaterial = material("#213754", 0.18, 0.6);
      const roleMaterials = new Map<string, { signal: THREE.MeshBasicMaterial; marker:THREE.Mesh }>();
      const textures:THREE.Texture[]=[];

      function box(width: number, height: number, depth: number, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) {
        const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      }

      scene.add(new T.HemisphereLight("#dce8ff", "#25262b", 2.4));
      const key = new T.DirectionalLight("#ffffff", 3.6);
      key.position.set(-25, 48, 20);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -40;
      key.shadow.camera.right = 40;
      key.shadow.camera.top = 44;
      key.shadow.camera.bottom = -40;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 110;
      key.shadow.bias = -0.001;
      scene.add(key);
      const rim = new T.DirectionalLight("#6f9bd8", 2);
      rim.position.set(8, 7, -12);
      scene.add(rim);

      // One spatial process, not seven copies of an office. Business direction is
      // the selected context; these are the actual roles that work on its result.
      box(57,.65,42,groundMaterial,-3,-.55,1);
      box(57.15,.08,42.15,darkSteel,-3,-.94,1);
      box(4,.025,34,darkSteel,0,-.18,1);
      box(43,.025,3,darkSteel,-1,-.18,0);
      box(56.5,.035,.07,steel,-3,-.2,21.65);
      box(.07,.035,41.5,steel,-31.25,-.2,1);

      // A raised shared-context hub. Nothing spins when the scene is idle.
      box(4.8,.25,4.1,charcoal,0,.04,0);
      box(4.35,.05,3.7,steel,0,.2,0);
      box(.6,1.1,.6,darkSteel,0,.76,0);
      const brainGeometry = new T.IcosahedronGeometry(1.5,1);
      const brainWire=new T.LineSegments(new T.EdgesGeometry(brainGeometry),new T.LineBasicMaterial({color:'#7db9ff',transparent:true,opacity:.9}));
      brainWire.position.set(0,2.8,0);brainWire.rotation.set(.12,.32,.18);scene.add(brainWire);
      const brainCore=new T.Mesh(new T.IcosahedronGeometry(.92,0),material('#234f83',.58,.35));
      brainCore.position.copy(brainWire.position);brainCore.rotation.copy(brainWire.rotation);scene.add(brainCore);
      const ring=new T.Mesh(new T.TorusGeometry(2.05,.022,5,64),blue);ring.rotation.x=Math.PI/2;ring.position.y=.27;scene.add(ring);
      brainGeometry.dispose();

      const roomBoards=new Map<string,{canvas:HTMLCanvasElement;texture:THREE.CanvasTexture;context:CanvasRenderingContext2D}>();
      function boardSurface(role:string,w:number,h:number,parent:THREE.Object3D,x:number,y:number,z:number,light=false){
        box(w+.18,h+.18,.18,darkSteel,x,y,z,parent);
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
        const context=canvas.getContext('2d');
        if(!context){box(w,h,.03,light?paper:screen,x,y,z+.12,parent);return;}
        const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.push(texture);
        const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));
        mesh.position.set(x,y,z+.115);parent.add(mesh);
        roomBoards.set(role,{canvas,texture,context});
      }
      function wall(w:number,h:number,parent:THREE.Object3D,x=0,z=-4.7){
        box(w,h,.24,charcoal,x,h/2+.2,z,parent);
        box(w,.06,.3,steel,x,h+.24,z,parent);
      }
      function bay(role:string,w:number,d:number,raised=0){
        const station=stations.find(item=>item.id===role)!;
        const group=new T.Group();group.position.set(station.x,raised,station.z);scene.add(group);
        box(w,.18,d,charcoal,0,-.04,0,group);
        box(w-.15,.025,d-.15,darkSteel,0,.065,0,group);
        box(w-.32,.025,d-.32,groundMaterial,0,.086,0,group);
        const signal=new T.MeshBasicMaterial({color:'#758497'});
        const marker=box(w*.65,.045,.09,signal,0,.13,d/2-.15,group);
        roleMaterials.set(role,{signal,marker});
        return group;
      }
      function desk(parent:THREE.Object3D,x:number,z:number,w=3.1){
        box(w,.16,1.5,steel,x,1.25,z,parent);
        box(.13,1.2,1.2,darkSteel,x-w*.4,.6,z,parent);
        box(.13,1.2,1.2,darkSteel,x+w*.4,.6,z,parent);
        box(w*.68,.035,.4,screen,x,1.36,z+.35,parent);
      }
      function monitor(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number){
        box(w+.12,h+.12,.14,darkSteel,x,y,z,parent);
        box(w,h,.035,screen,x,y,z+.095,parent);
        box(.13,.5,.14,steel,x,y-h/2-.15,z,parent);
        box(.65,.045,.4,steel,x,y-h/2-.4,z,parent);
      }
      function shelf(parent:THREE.Object3D,x:number,z:number,w=5){
        box(.16,4.8,.9,darkSteel,x-w/2,2.45,z,parent);
        box(.16,4.8,.9,darkSteel,x+w/2,2.45,z,parent);
        for(let row=0;row<4;row++){
          box(w,.12,.95,steel,x,.5+row*1.35,z,parent);
          for(let book=0;book<9;book++)box(.28,.8,.66,book%3===0?paper:charcoal,x-w/2+.35+book*(w-.65)/9,.95+row*1.35,z,parent);
        }
      }

      // Research: a gallery of vertical sources, two control monitors, one large
      // source board. Blank frames are architecture, not fabricated video posts.
      const research=bay('research',14,11);
      wall(14,8,research,0,-5.35);
      boardSurface('research',12.5,5.6,research,0,4.8,-5.15);
      for(const side of[-1,1]){
        box(.15,4.9,4.5,charcoal,side*6.8,2.65,-2.8,research);
        for(let i=0;i<3;i++){
          const frame=box(1.32,2.1,.13,darkSteel,side*(4.95-i*.18),2.8,-1.1+i*2.3,research);
          frame.rotation.y=side*.55;
          const pane=box(1.12,1.88,.025,screen,side*(4.9-i*.18),2.8,-.99+i*2.3,research);pane.rotation.y=side*.55;
        }
      }
      desk(research,-2.1,2.4,3.6);desk(research,2.1,2.4,3.6);
      monitor(research,-2.1,2.24,2.1,2.25,1.25);monitor(research,2.1,2.24,2.1,2.25,1.25);

      // Writers: a light manuscript wall, physical script shelving and long table.
      const writer=bay('copy',13,11);
      wall(13,7.7,writer,0,-5.35);
      boardSurface('copy',8.2,5.4,writer,-1.5,4.5,-5.15,true);
      shelf(writer,4.4,-4.4,3.1);shelf(writer,4.4,.1,3.1);
      desk(writer,-1.5,1.7,6.7);
      for(let i=0;i<4;i++){box(.95,.025,1.1,paper,-3.1+i*1.08,1.37,1.6,writer);box(.65,.02,.035,darkSteel,-3.1+i*1.08,1.39,1.8,writer);}
      monitor(writer,-1.6,2.35,1.35,2.2,1.2);

      // Coordinator: a raised review platform with a legible decision screen.
      const chief=bay('chief',10,7,.45);
      wall(10,7.2,chief,0,-3.35);
      boardSurface('chief',8.65,4.6,chief,0,4.2,-3.15);
      desk(chief,0,1.3,6);
      for(let i=0;i<3;i++)box(1.25,.035,.95,paper,-1.5+i*1.5,1.38,1.4,chief);
      box(8,.18,.8,darkSteel,0,-.1,3.7,chief);
      box(8,.18,.8,darkSteel,0,-.28,4.45,chief);

      // Editing: a panoramic screen and authored timeline rails, rather than
      // fake charts. The selected saved art-direction artifact fills the wall.
      const editing=bay('art',15,11);
      wall(15,7.6,editing,0,-5.35);
      boardSurface('art',13.4,4.65,editing,0,4.65,-5.15);
      box(13,.1,1,darkSteel,0,1.55,-4.8,editing);
      for(let track=0;track<3;track++){
        box(12.5,.1,.17,steel,0,1.68+track*.28,-4.55,editing);
        box(2.2,.13,.2,track===1?red:paper,-4.2+track*2.8,1.68+track*.28,-4.42,editing);
      }
      desk(editing,0,1.6,7);
      monitor(editing,-2.05,2.45,1.3,2.3,1.35);monitor(editing,.35,2.45,1.3,2.3,1.35);
      box(1.05,2.1,1.4,charcoal,4.9,1.05,1.7,editing);
      for(let i=0;i<3;i++)box(.5,.025,.15,steel,4.9,1.6+i*.23,2.42,editing);
      box(.12,3.9,.12,steel,-5.7,2.0,1.3,editing);
      box(1.3,.9,.6,charcoal,-5.7,4.25,1.3,editing);
      const lens=new T.Mesh(new T.CylinderGeometry(.3,.35,.4,16),darkSteel);lens.rotation.x=Math.PI/2;lens.position.set(-5.7,4.25,1.75);editing.add(lens);

      // Publishing: a shipping dock, packaging table and physical output rack.
      // No packages are marked sent or scheduled without actual external state.
      const shipping=bay('publish',15,11);
      wall(15,7.1,shipping,0,-5.35);
      boardSurface('publish',12.8,4.7,shipping,0,4.25,-5.15);
      box(12,.35,2.4,darkSteel,0,1.05,1.1,shipping);
      box(11.8,.08,2.15,screen,0,1.27,1.1,shipping);
      for(let i=0;i<20;i++)box(.035,.07,2,steel,-5.5+i*.58,1.34,1.1,shipping);
      box(.12,1.05,1.9,steel,-4.8,.5,1.1,shipping);box(.12,1.05,1.9,steel,4.8,.5,1.1,shipping);
      for(let i=0;i<3;i++){box(1.25,.75,1.35,charcoal,-3.6+i*3.4,1.77,1.1,shipping);box(.15,.025,1.38,paper,-3.6+i*3.4,2.17,1.1,shipping);}
      box(1.8,3.9,1.4,darkSteel,5.8,2,-1.5,shipping);

      // Community: a tall inbox/archive wall with real response text on its board.
      const community=bay('community',8,10);
      wall(8,8.6,community,0,-4.8);
      boardSurface('community',6.7,5.2,community,0,5.4,-4.6);
      for(let column=0;column<3;column++)for(let row=0;row<3;row++){
        box(2.05,.55,1.4,darkSteel,-2.2+column*2.2,.5+row*.78,-2.9,community);
        box(1.8,.035,.9,paper,-2.2+column*2.2,.82+row*.78,-2.65,community);
      }
      desk(community,0,2.2,5.2);monitor(community,0,2.3,1.9,2.4,1.3);

      // Strategy: an open white worktable with a full-width plan screen.
      const strategy=bay('strategy',10.5,9);
      wall(10.5,6.9,strategy,0,-4.3);
      boardSurface('strategy',9.2,4.8,strategy,0,4.15,-4.1,true);
      box(7.9,.18,3.7,paper,0,1.1,.6,strategy);
      box(.18,1.02,2.9,steel,-3.15,.52,.6,strategy);box(.18,1.02,2.9,steel,3.15,.52,.6,strategy);
      for(let i=0;i<4;i++){
        box(1.08,.025,1.55,charcoal,-2.6+i*1.75,1.22,.6,strategy);
        box(.5,.025,.035,steel,-2.6+i*1.75,1.25,.8,strategy);
      }

      // Routing lines describe the handoff topology; they are not activity.
      const routeMaterial=new T.LineBasicMaterial({color:'#71849d',transparent:true,opacity:.55});
      for(const station of stations){
        const route=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0,-.08,0),new T.Vector3(station.x*.45,-.08,station.z*.4),new T.Vector3(station.x,-.08,station.z)]),routeMaterial);scene.add(route);
      }
      function paintBoards(){
        for(const [role,entry]of roomBoards){
          const {context,canvas,texture}=entry;
          const station=stations.find(item=>item.id===role)!;
          const actual=latest.current.artifacts.find(item=>item.role===role&&item.status!=='rejected');
          const light=role==='copy'||role==='strategy';
          context.fillStyle=light?'#f4f4f1':'#10151e';context.fillRect(0,0,canvas.width,canvas.height);
          context.textBaseline='top';context.fillStyle=light?'#111318':'#f4f5f9';
          context.font='700 65px "Manrope Variable", sans-serif';context.fillText(station.place,42,35,940);
          context.fillStyle=light?'#3d4654':'#b8c5d7';context.font='400 29px "Manrope Variable", sans-serif';
          if(actual){
            const words=actual.title.split(/\s+/);let line='',row=0;
            context.font='600 44px "Manrope Variable", sans-serif';context.fillStyle=light?'#172235':'#f4f5f9';
            for(const word of words){const next=line?line+' '+word:word;if(context.measureText(next).width>930&&line){context.fillText(line,42,154+row*62);line=word;row++;if(row===3)break;}else line=next;}
            if(row<3)context.fillText(line,42,154+row*62,930);
            context.font='400 28px "Manrope Variable", sans-serif';context.fillStyle=light?'#4c5667':'#b8c5d7';
            context.fillText('v'+actual.revision+' · '+(actual.status==='approved'?'Одобрено':'За преглед'),42,414,900);
          }else{
            context.fillText('Няма запазен резултат',42,170,930);
            context.strokeStyle=light?'#d0d4da':'#303b4b';context.lineWidth=2;
            for(let line=0;line<3;line++){context.beginPath();context.moveTo(42,267+line*48);context.lineTo(890-line*95,267+line*48);context.stroke();}
          }
          texture.needsUpdate=true;
        }
      }
      paintBoards();
      // Bake static workstation boxes into material batches. Role signal materials stay
      // separate so a real job/selection update changes their state without rebuilding.
      scene.updateMatrixWorld(true);
      const batches = new Map<THREE.Material, THREE.Mesh<THREE.BoxGeometry>[]>();
      scene.traverse(object => {
        if (!(object instanceof T.Mesh) || !(object.geometry instanceof T.BoxGeometry) || Array.isArray(object.material)) return;
        if([...roleMaterials.values()].some(entry=>entry.marker===object))return;
        const mesh = object as THREE.Mesh<THREE.BoxGeometry>;
        const batch = batches.get(object.material) || [];
        batch.push(mesh);
        batches.set(object.material, batch);
      });
      for (const [mat, meshes] of batches) {
        const batch = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, meshes.length);
        batch.castShadow = true;
        batch.receiveShadow = true;
        meshes.forEach((mesh, index) => {
          const { width: boxWidth, height: boxHeight, depth: boxDepth } = mesh.geometry.parameters;
          batch.setMatrixAt(index, mesh.matrixWorld.clone().multiply(new T.Matrix4().makeScale(boxWidth, boxHeight, boxDepth)));
          mesh.removeFromParent();
          mesh.geometry.dispose();
        });
        batch.instanceMatrix.needsUpdate = true;
        scene.add(batch);
      }

      let raf = 0;
      let ready = false;
      let disposed = false;
      let broken = false;
      let visible = true;
      let width = 1;
      let height = 1;
      let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      let paints = 0;
      let bufferRatio=0;
      let moving: { start: number; position: THREE.Vector3; look: THREE.Vector3; endPosition: THREE.Vector3; endLook: THREE.Vector3 } | null = null;

      function setBuffer(inMotion:boolean){const ratio=Math.min(window.devicePixelRatio||1,inMotion?1.3:2,Math.sqrt((inMotion?950000:2000000)/(width*height)));if(Math.abs(bufferRatio-ratio)>.015){bufferRatio=ratio;renderer.setDrawingBufferSize(width,height,ratio);}}

      const targetFor = (id: string | null) => {
        const aspect = width / height;
        const angle = T.MathUtils.degToRad(camera.fov / 2);
        if (!id || (id !== "brain" && !stations.some(station => station.id === id))) {
          const contextIndex=departments.findIndex(item=>item.id===latest.current.department);
          const distance = Math.max(40 / (2 * Math.tan(angle)), 58 / (2 * Math.tan(angle) * aspect)) * 1.02;
          const point=new T.Vector3(-3,1.6,1.4);
          const bearing=contextIndex<0?.44:.25+contextIndex*.045;
          return { look:point, position: new T.Vector3(bearing,.88,1.24).normalize().multiplyScalar(distance).add(point) };
        }
        const station = stations.find(item => item.id === id);
        const point = new T.Vector3(station?.x||0,id==='brain'?2.5:2.9,(station?.z||0)-(id==='brain'?0:.7));
        const distance = id==='brain'?(aspect<.8?14:11):(width<760?23:21);
        return { look: point, position: point.clone().add(new T.Vector3(.23,.72,1.15).normalize().multiplyScalar(distance)) };
      };

      function render() {
        if (disposed || broken || !visible || document.hidden) return;
        camera.lookAt(look);
        camera.updateMatrixWorld();
        renderer.render(scene, camera);
        paints += 1;
        sceneFrame.dataset.renderCount = String(paints);
        sceneFrame.dataset.drawCalls = String(renderer.info.render.calls);
        sceneFrame.dataset.triangles = String(renderer.info.render.triangles);
        sceneFrame.dataset.paintState = "ready";
        sceneFrame.dataset.paintedSelection = latest.current.selected || "overview";
        sceneFrame.dataset.paintedDepartment = latest.current.department || 'overview';
        sceneFrame.dataset.worldModel='functional-factory';
        sceneFrame.dataset.roomCount=String(stations.length);
        sceneFrame.dataset.paintedCamera = camera.position.toArray().map(value => value.toFixed(3)).join(",");
        const occupied:{x:number;y:number;width:number;height:number}[]=[];
        const measurements=Array.from(labels.current,([id,button])=>({id,button,width:button.offsetWidth,height:button.offsetHeight}));
        for (const {id,button,width:labelWidth,height:labelHeight} of measurements) {
          const station = stations.find(item => item.id === id);
          const point = new T.Vector3(station?.x||0,id==='brain'?4.5:5.4,station?.z||0).project(camera);
          const x = (point.x + 1) * width / 2;
          const y = (1 - point.y) * height / 2;
          const halfWidth = labelWidth / 2;
          const bounds={x:x-halfWidth,y:y-labelHeight,width:labelWidth,height:labelHeight};
          const collision=occupied.some(item=>bounds.x<item.x+item.width+7&&bounds.x+bounds.width+7>item.x&&bounds.y<item.y+item.height+7&&bounds.y+bounds.height+7>item.y);
          const show = !collision&&point.z > -1 && point.z < 1 && x - halfWidth > 8 && x + halfWidth < width - 8 && y - labelHeight > 70 && y < height - 35;
          button.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;
          button.style.visibility = show ? "visible" : "hidden";
          if(show)occupied.push(bounds);
        }
        if (!ready) { ready = true; setState("ready"); }
      }

      function tick(now: number) {
        raf = 0;
        if (!moving || disposed || !visible || document.hidden) return;
        const fraction = Math.min(1, (now - moving.start) / 740);
        const ease = 1-Math.pow(1-fraction,4);
        camera.position.lerpVectors(moving.position, moving.endPosition, ease);
        camera.position.y += Math.sin(Math.PI * fraction) * 0.48;
        look.lerpVectors(moving.look, moving.endLook, ease);
        if(fraction>=1)setBuffer(false);
        render();
        if (fraction < 1) raf = requestAnimationFrame(tick);
        else moving = null;
      }

      function move(id: string | null, immediately = false) {
        if (disposed || broken) return;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        const target = targetFor(id);
        if (immediately || reduced || latest.current.paused || !ready) {
          moving = null;
          setBuffer(false);
          camera.position.copy(target.position);
          look.copy(target.look);
          render();
        } else {
          setBuffer(true);
          moving = { start: performance.now(), position: camera.position.clone(), look: look.clone(), endPosition: target.position, endLook: target.look };
          if (visible && !document.hidden) raf = requestAnimationFrame(tick);
        }
      }

      function update() {
        paintBoards();
        for (const [id, entry] of roleMaterials) {
          const current = latest.current.selected === id;
          const active = latest.current.activeRole === id;
          const completed = latest.current.completedRoles.includes(id);
          entry.signal.color.set(current || active ? "#f12649" : completed ? "#ffffff" : "#7b899d");
          entry.marker.visible=true;
        }
        if (!moving) render();
      }

      function resize() {
        const bounds = element.getBoundingClientRect();
        if (bounds.width < 1 || bounds.height < 1) return;
        width = bounds.width;
        height = bounds.height;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        bufferRatio=0;setBuffer(Boolean(moving));
        move(latest.current.selected, true);
      }

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(element);
      const intersection = new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        visible = entry.isIntersecting;
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
        else if (visible) move(latest.current.selected, true);
      });
      intersection.observe(element);
      const visibility = () => {
        if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
        else if (!document.hidden) move(latest.current.selected, true);
      };
      const motion = () => { reduced = media.matches; move(latest.current.selected, true); };
      const lost = (event: Event) => {
        event.preventDefault();
        broken = true;
        if (raf) cancelAnimationFrame(raf);
        moving = null;
        setState("unavailable");
        sceneFrame.dataset.paintState = "unavailable";
      };
      document.addEventListener("visibilitychange", visibility);
      media.addEventListener("change", motion);
      renderer.domElement.addEventListener("webglcontextlost", lost);
      resize();
      update();

      dispose = () => {
        disposed = true;
        if (raf) cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        intersection.disconnect();
        document.removeEventListener("visibilitychange", visibility);
        media.removeEventListener("change", motion);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        scene.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) geometries.add(mesh.geometry);
          if (Array.isArray(mesh.material)) mesh.material.forEach(item => materials.add(item));
          else if (mesh.material) materials.add(mesh.material);
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(item => item.dispose());
        textures.forEach(item=>item.dispose());
        environment.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      controller.current = { move, update, dispose };
    }

    initialize().catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; dispose(); controller.current = null; };
  }, []);

  useEffect(() => { controller.current?.update();controller.current?.move(selected); }, [selected,currentDepartment]);
  const completedKey = completedRoles.join("|");
  const artifactKey=artifacts.map(item=>item.id+':'+item.revision+':'+item.status+':'+item.title).join('|');
  useEffect(() => { controller.current?.update(); }, [selected, activeRole, completedKey,artifactKey]);
  useEffect(() => { if (paused) controller.current?.move(selected, true); }, [paused, selected]);
  const selectedArtifact=artifacts.find(item=>item.role===selected&&item.status!=='rejected');

  return (
    <figure ref={frame} className={styles.world} data-state={state} data-renderer={state === "unavailable" ? "fallback" : "three"} data-selected={selected || "overview"} aria-label="Карта на работния екип">
      <div ref={host} className={styles.canvas} />
      <div className={styles.toolbar}>
        <button type="button" onClick={() => {chooseDepartment(null);onSelect(null);}} aria-label="Цялата компания" aria-pressed={selected === null&&!currentDepartment}><ArrowsOutSimple size={17} /><span>Целият процес</span></button>
        <span className={styles.structure}>{currentDepartment?departments.find(item=>item.id===currentDepartment)?.label:'От идея до резултат'}</span>
      </div>
      {state === "loading" && <p className={styles.status} role="status">Подготвя се работното пространство…</p>}
      {state === "unavailable" && <p className={styles.status} role="status">3D изгледът не е наличен. Избери екип от списъка.</p>}
      <div className={styles.labels} role="group" aria-label="Места в системата">
        {[...stations, { id: "brain", label: "Бранд мозък", place:"Твоят бранд", icon: Brain }].map(station => {
          const Icon = station.icon;
          return <button ref={button => { if (button) labels.current.set(station.id, button); else labels.current.delete(station.id); }} key={station.id} type="button" className={styles.station} data-selected={selected === station.id} data-active={activeRole === station.id} data-brain={station.id === "brain"} data-role={station.id} onClick={() => onSelect(station.id)} aria-label={`Място: ${station.label}`} aria-pressed={selected === station.id} title={station.place}><Icon size={17} weight={selected === station.id ? "fill" : "regular"} /><span>{station.place}</span>{activeRole === station.id && <i role="img" aria-label="Има активна задача" />}</button>;
        })}
      </div>
      <nav className={styles.destinations} aria-label="Избери екип">
        {!currentDepartment?departments.map(item=><button className={styles.fallbackDirection} key={item.id} onClick={()=>chooseDepartment(item.id)}><Buildings size={17}/>{item.label}</button>):<button className={styles.fallbackDirection} onClick={()=>chooseDepartment(null)}><Buildings size={17}/>Всички отдели</button>}
        <button type="button" data-selected={selected === "brain"} onClick={() => onSelect("brain")} aria-pressed={selected === "brain"}><Brain size={18} />Бранд мозък</button>
        {stations.map(station => { const Icon = station.icon; return <button key={station.id} type="button" data-selected={selected === station.id} onClick={() => onSelect(station.id)} aria-pressed={selected === station.id}><Icon size={18} />{station.label}</button>; })}
      </nav>
      {selectedArtifact&&onArtifactSelect?<button className={styles.artifact} onClick={()=>onArtifactSelect(selectedArtifact.id)}><FileText size={20}/><span><strong>{selectedArtifact.title}</strong><small>v{selectedArtifact.revision} · {selectedArtifact.status==='approved'?'Одобрено':'За преглед'}</small></span><ArrowUpRight size={19}/></button>:null}
      <figcaption className={styles.caption}>{selected?'Избери друго място или отвори резултата.':'Избери с какво да започнем.'}</figcaption>
    </figure>
  );
}
