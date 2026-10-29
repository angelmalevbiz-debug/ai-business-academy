"use client";

import { useEffect, useRef, useState } from "react";
import type { BufferGeometry, Material } from "three";
import styles from "./journey-scene.module.css";

export type JourneySceneNode = {
  id: string;
  label: string;
  done: boolean;
};

type SceneProps = {
  nodes: JourneySceneNode[];
  selected: number;
  onSelect: (index: number) => void;
  overview: boolean;
  reducedMotion: boolean;
  paused: boolean;
};
type SceneState = Omit<SceneProps, "onSelect">;
type SceneController = {
  update: (state: SceneState) => void;
  dispose: () => void;
};

/** A physical route through a sculpted island. Frames are requested only for camera changes. */
export default function JourneyScene(props: SceneProps) {
  const { nodes, selected, onSelect, overview, reducedMotion, paused } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const controllerRef = useRef<SceneController | null>(null);
  const stateRef = useRef<SceneState>({
    nodes,
    selected,
    overview,
    reducedMotion,
    paused,
  });
  const signature = nodes.map((node) => node.id).join("|");
  const [renderState, setRenderState] = useState<{
    signature: string;
    status: "loading" | "webgl" | "fallback";
  }>({ signature, status: "loading" });
  const renderer =
    renderState.signature === signature ? renderState.status : "loading";

  useEffect(() => {
    const state = { nodes, selected, overview, reducedMotion, paused };
    stateRef.current = state;
    controllerRef.current?.update(state);
  }, [nodes, selected, overview, reducedMotion, paused]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    let controller: SceneController | null = null;

    async function createScene() {
      const sceneStartedAt = performance.now();
      const THREE = await import("three");
      if (host) host.dataset.moduleLoadMs = (performance.now() - sceneStartedAt).toFixed(2);
      const geometryStartedAt = performance.now();
      if (cancelled || !host || !canvas) return;
      const context = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        powerPreference: "default",
      });
      if (!context) throw new Error("WebGL2 unavailable");
      const webgl = new THREE.WebGLRenderer({
        canvas,
        context,
        antialias: true,
      });
      webgl.outputColorSpace = THREE.SRGBColorSpace;
      webgl.toneMapping = THREE.ACESFilmicToneMapping;
      webgl.toneMappingExposure = 1.0;
      webgl.shadowMap.enabled = true;
      webgl.shadowMap.type = THREE.PCFShadowMap;
      webgl.shadowMap.autoUpdate = false;
      webgl.shadowMap.needsUpdate = true;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#08090d");
      scene.fog = new THREE.Fog("#0d111a", 42, 130);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 150);
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const geometry = <T extends BufferGeometry>(value: T): T => {
        geometries.add(value);
        return value;
      };
      const material = <T extends Material>(value: T): T => {
        materials.add(value);
        return value;
      };

      const sky = new THREE.Mesh(
        geometry(new THREE.SphereGeometry(100, 24, 16)),
        material(
          new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            toneMapped: false,
            uniforms: {
              zenith: { value: new THREE.Color("#050609") },
              horizon: { value: new THREE.Color("#172337") },
              floor: { value: new THREE.Color("#050609") },
            },
            vertexShader:
              "varying vec3 vWorld; void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
            fragmentShader:
              "uniform vec3 zenith;uniform vec3 horizon;uniform vec3 floor;varying vec3 vWorld;void main(){float h=normalize(vWorld).y;vec3 col=mix(horizon,zenith,smoothstep(0.0,0.7,h));col=mix(col,floor,smoothstep(0.0,0.4,-h));gl_FragColor=vec4(col,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
          }),
        ),
      );
      scene.add(sky);
      scene.add(new THREE.HemisphereLight("#e9edf4", "#252a33", 1.25));
      const sun = new THREE.DirectionalLight("#edf1f7", 2.2);
      sun.position.set(-9, 17, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -14;
      sun.shadow.camera.right = 14;
      sun.shadow.camera.top = 12;
      sun.shadow.camera.bottom = -12;
      sun.shadow.normalBias = 0.045;
      sun.shadow.bias = -0.00015;
      sun.shadow.radius = 2;
      scene.add(sun);
      const rim = new THREE.DirectionalLight("#7893ba", 0.65);
      rim.position.set(7, 8, -13);
      scene.add(rim);

      function noise2(x: number, z: number) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const hash = (a: number, b: number) => {
          let value = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
          value = Math.imul(value ^ (value >>> 13), 1274126177);
          return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
        };
        const sx = x - ix;
        const sz = z - iz;
        const u = sx * sx * (3 - 2 * sx);
        const v = sz * sz * (3 - 2 * sz);
        return (
          THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
            THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u),
            v,
          ) *
            2 -
          1
        );
      }
      function fractal(x: number, z: number, ridged = false) {
        let sum = 0;
        let amplitude = 0.55;
        let frequency = 1;
        for (let octave = 0; octave < 4; octave++) {
          const value = noise2(
            x * frequency + octave * 13.7,
            z * frequency - octave * 5.9,
          );
          sum += (ridged ? 1 - Math.abs(value) : value) * amplitude;
          frequency *= 2.07;
          amplitude *= 0.48;
        }
        return sum;
      }
      const peaks = [[-3.8, -1.0, 2.4], [-0.5, -2.1, 3.4], [2.3, -3.5, 4.2], [5.2, -4.8, 2.7]];
      function heightAt(x: number, z: number) {
        const radius = Math.sqrt((x / 11) ** 2 + (z / 7.6) ** 2);
        const edge = 1 - THREE.MathUtils.smoothstep(radius, 0.84, 1.03);
        const climb = THREE.MathUtils.clamp((x + 8) / 15, 0, 1);
        const ridgeDistance =
          z - (0.2 - x * 0.57 + noise2(x * 0.3, 6.1) * 0.35);
        const ridge = Math.exp(-Math.pow(Math.abs(ridgeDistance), 1.4) / 2.1);

        let peak = 0;
        for (const [px, pz, rise] of peaks) peak += rise * Math.exp(-Math.hypot((x - px) / 1.3, (z - pz) / 1.1) * 1.2);
        const folds =
          (fractal(x * 0.9, z * 0.9) * 0.75 +
            fractal(x * 0.8, z * 0.8, true) * 0.42) *
          ridge;
        const foothills =
          Math.pow((fractal(x * 0.33 + 4, z * 0.33 - 2) + 1) / 2, 2) * 0.9;
        return (
          -0.95 +
          edge *
            (0.3 +
              (0.85 + climb * 5.2) * ridge +
              peak +
              folds +
              foothills +
              fractal(x * 1.5, z * 1.5, true) * 0.12)
        );
      }

      const rings = 76;
      const segments = 144;
      const positions: number[] = [0, heightAt(0, 0), 0];
      const colors: number[] = [];
      const indices: number[] = [];
      for (let ring = 1; ring <= rings; ring++) {
        const radius = ring / rings;
        for (let angleIndex = 0; angleIndex < segments; angleIndex++) {
          const angle = (angleIndex / segments) * Math.PI * 2;
          const coastline =
            1 +
            noise2(Math.cos(angle) * 2.4, Math.sin(angle) * 2.4) * 0.1 +
            noise2(Math.cos(angle) * 5.3 + 10, Math.sin(angle) * 5.3 + 10) *
              0.025;
          const x = Math.cos(angle) * 11 * radius * coastline;
          const z = Math.sin(angle) * 7.6 * radius * coastline;
          positions.push(x, heightAt(x, z), z);
        }
      }
      for (let angleIndex = 0; angleIndex < segments; angleIndex++) {
        indices.push(0, 1 + ((angleIndex + 1) % segments), 1 + angleIndex);
      }
      for (let ring = 1; ring < rings; ring++) {
        for (let angleIndex = 0; angleIndex < segments; angleIndex++) {
          const a = 1 + (ring - 1) * segments + angleIndex;
          const b = 1 + (ring - 1) * segments + ((angleIndex + 1) % segments);
          const c = a + segments;
          const d = b + segments;
          indices.push(a, b, c, b, d, c);
        }
      }
      const terrainGeometry = geometry(new THREE.BufferGeometry());
      terrainGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      terrainGeometry.setIndex(indices);
      terrainGeometry.computeVertexNormals();
      const normals = terrainGeometry.getAttribute("normal");
      const low = new THREE.Color("#222833");
      const high = new THREE.Color("#66758d");
      const frost = new THREE.Color("#edf0f4");
      const tint = low.clone();
      for (let index = 0; index < positions.length; index += 3) {
        const x = positions[index];
        const y = positions[index + 1];
        const z = positions[index + 2];
        const vertex = index / 3;
        const slope = Math.hypot(normals.getX(vertex), normals.getZ(vertex)) / Math.max(0.05, normals.getY(vertex));
        tint.copy(low).lerp(
            high,
            THREE.MathUtils.clamp(
              THREE.MathUtils.smoothstep(y, -0.5, 5.6) +
                noise2(x * 1.7, z * 1.7) * 0.07,
              0,
              1,
            ),
          );
        tint.lerp(
          frost,
          THREE.MathUtils.smoothstep(y, 4.3, 6.8) *
            THREE.MathUtils.clamp(1 - slope * 0.22, 0.2, 1),
        );
        colors.push(tint.r, tint.g, tint.b);
      }
      terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const terrain = new THREE.Mesh(
        terrainGeometry,
        material(
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.88,
            metalness: 0.12,
            flatShading: true,
          }),
        ),
      );
      terrain.castShadow = true;
      terrain.receiveShadow = true;
      scene.add(terrain);
      // Let the interface paint between the height field and the remaining static scene work.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) {
        geometries.forEach((value) => value.dispose());
        materials.forEach((value) => value.dispose());
        webgl.dispose();
        scene.clear();
        return;
      }
      const rangeMaterial = material(terrain.material.clone());
      rangeMaterial.transparent = true;
      rangeMaterial.depthWrite = false;
      rangeMaterial.onBeforeCompile = (shader) => {
        shader.vertexShader =
          "varying float vRidgeHeight;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvRidgeHeight=position.y;",
        );
        shader.fragmentShader =
          "varying float vRidgeHeight;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <alphatest_fragment>",
          "diffuseColor.a *= smoothstep(0.3,2.3,vRidgeHeight);\n#include <alphatest_fragment>",
        );
      };
      // Far silhouettes reuse a coarser sample of the same terrain, in one draw.
      const farPositions: number[] = positions.slice(0, 3);
      const farColors: number[] = colors.slice(0, 3);
      const farIndices: number[] = [];
      const farRings = 19;
      const farSegments = 48;
      for (let ring = 1; ring <= farRings; ring++) {
        for (let segment = 0; segment < farSegments; segment++) {
          const source = 1 + (ring * 4 - 1) * segments + segment * 3;
          farPositions.push(...positions.slice(source * 3, source * 3 + 3));
          farColors.push(...colors.slice(source * 3, source * 3 + 3));
        }
      }
      for (let segment = 0; segment < farSegments; segment++) farIndices.push(0, 1 + ((segment + 1) % farSegments), 1 + segment);
      for (let ring = 1; ring < farRings; ring++) {
        for (let segment = 0; segment < farSegments; segment++) {
          const a = 1 + (ring - 1) * farSegments + segment;
          const b = 1 + (ring - 1) * farSegments + ((segment + 1) % farSegments);
          farIndices.push(a, b, a + farSegments, b, b + farSegments, a + farSegments);
        }
      }
      const farGeometry = geometry(new THREE.BufferGeometry());
      farGeometry.setAttribute("position", new THREE.Float32BufferAttribute(farPositions, 3));
      farGeometry.setAttribute("color", new THREE.Float32BufferAttribute(farColors, 3));
      farGeometry.setIndex(farIndices);
      farGeometry.computeVertexNormals();
      const instanceTransform = new THREE.Object3D();
      const ranges = new THREE.InstancedMesh(farGeometry, rangeMaterial, 3);
      [[-22, -34, 1.4, 0.5], [0, -43, 1.8, -0.45], [26, -38, 1.5, 1.7]].forEach(([x, z, scale, rotation], index) => {
        instanceTransform.position.set(x, -2, z);
        instanceTransform.scale.set(scale, scale * 0.8, scale);
        instanceTransform.rotation.set(0, rotation, 0);
        instanceTransform.updateMatrix();
        ranges.setMatrixAt(index, instanceTransform.matrix);
      });
      ranges.computeBoundingSphere();
      scene.add(ranges);
      // One continuous basalt surface replaces the floating cut edge.
      const ground = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1000, 1000)), material(new THREE.MeshBasicMaterial({ color: "#080a0e" })));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.02;
      ground.receiveShadow = false;
      scene.add(ground);

      const rockGeometry = geometry(new THREE.IcosahedronGeometry(1, 0));
      const rockMaterial = material(
        new THREE.MeshStandardMaterial({
          color: "#232833",
          roughness: 0.95,
          metalness: 0.08,
          flatShading: true,
        }),
      );
      const outcrops = [
        [-6.0, 5.0, 0.3],
        [-5.6, 5.2, 0.17],
        [-2.8, 3.8, 0.4],
        [-2.4, 3.9, 0.21],
        [1.8, 2.0, 0.38],
        [2.2, 2.2, 0.2],
        [5.1, 0.2, 0.42],
        [5.5, 0.3, 0.23],
      ];
      const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, outcrops.length);
      outcrops.forEach(([x, z, size], index) => {
        instanceTransform.position.set(x, heightAt(x, z) - size * 0.3, z);
        instanceTransform.scale.set(size * 1.5, size * 0.8, size * 1.1);
        instanceTransform.rotation.set(index * 0.37, index * 1.13, index * 0.28);
        instanceTransform.updateMatrix();
        rocks.setMatrixAt(index, instanceTransform.matrix);
      });
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      rocks.computeBoundingSphere();
      scene.add(rocks);

      const layout = [
        [-7, 4.6],
        [-4.5, 3.3],
        [-1.7, 1.7],
        [1.1, 0.2],
        [3.8, -1.7],
        [6.2, -2.8],
      ];
      const nodePoints = stateRef.current.nodes.map((_, index, all) => {
        const fraction = all.length > 1 ? index / (all.length - 1) : 0;
        const slot = fraction * (layout.length - 1);
        const a = layout[Math.floor(slot)];
        const b = layout[Math.min(layout.length - 1, Math.ceil(slot))];
        const x = THREE.MathUtils.lerp(a[0], b[0], slot % 1);
        const z = THREE.MathUtils.lerp(a[1], b[1], slot % 1);
        return new THREE.Vector3(x, heightAt(x, z) + 0.27, z);
      });
      const selectionLight = new THREE.PointLight("#e51c38", 2.2, 7, 2.1);
      selectionLight.position.copy(nodePoints[stateRef.current.selected] || nodePoints[0] || new THREE.Vector3());
      selectionLight.position.y += 0.65;
      scene.add(selectionLight);
      const baseGeometry = geometry(new THREE.CylinderGeometry(0.73, 0.77, 0.34, 4, 1));
      const bases = new THREE.InstancedMesh(baseGeometry, material(new THREE.MeshStandardMaterial({ color: "#454b55", metalness: 0.5, roughness: 0.46, flatShading: true })), nodePoints.length);
      const capGeometry = geometry(new THREE.CylinderGeometry(0.56, 0.61, 0.10, 4, 1));
      const caps = new THREE.InstancedMesh(capGeometry, material(new THREE.MeshStandardMaterial({ color: "#d8dce2", metalness: 0.35, roughness: 0.48, flatShading: true })), nodePoints.length);
      const instanceColor = new THREE.Color();
      nodePoints.forEach((point, index) => {
        instanceTransform.position.copy(point);
        instanceTransform.scale.set(1, 1, 1);
        instanceTransform.rotation.set(0, Math.PI / 6, 0);
        instanceTransform.updateMatrix();
        bases.setMatrixAt(index, instanceTransform.matrix);
        instanceTransform.position.y += 0.27;
        instanceTransform.updateMatrix();
        caps.setMatrixAt(index, instanceTransform.matrix);
        caps.setColorAt(index, instanceColor.set(index === stateRef.current.selected ? "#c91635" : stateRef.current.nodes[index]?.done ? "#eceef2" : "#aeb7c4"));
      });
      bases.castShadow = true;
      bases.receiveShadow = true;
      caps.castShadow = true;
      for (const mesh of [bases, caps]) { mesh.computeBoundingSphere(); scene.add(mesh); }
      if (nodePoints.length > 1) {
        const curve = new THREE.CatmullRomCurve3(nodePoints);
        let surfacePoints = curve
          .getPoints(240)
          .map(
            (point) =>
              new THREE.Vector3(
                point.x,
                heightAt(point.x, point.z) + 0.09,
                point.z,
              ),
          );
        for (let pass = 0; pass < 2; pass++) {
          const previous = surfacePoints;
          surfacePoints = previous.map((point, index) => {
            let weightedHeight = 0;
            for (let offset = -2; offset <= 2; offset++) {
              const neighbor = previous[
                THREE.MathUtils.clamp(index + offset * 2, 0, previous.length - 1)
              ];
              weightedHeight += neighbor.y * (3 - Math.abs(offset));
            }
            return new THREE.Vector3(
              point.x,
              Math.max(weightedHeight / 9, heightAt(point.x, point.z) + 0.07),
              point.z,
            );
          });
        }
        const route = new THREE.Mesh(
          geometry(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(surfacePoints),
              240,
              0.032,
              8,
              false,
            ),
          ),
          material(
            new THREE.MeshStandardMaterial({
              color: "#c9d0dc",
              emissive: "#3478c5",
              emissiveIntensity: 0.14,
              roughness: 0.5,
              metalness: 0.18,
            }),
          ),
        );
        route.castShadow = true;
        scene.add(route);
      }

      let width = 1;
      let height = 1;
      let renderRatio = -1;
      let motionPixelBudget = 1_000_000;
      let lastMotionTime = 0;
      let slowMotionFrames = 0;
      let visible = true;
      let disposed = false;
      let lost = false;
      let frame = 0;
      let resizePaintFrame = 0;
      let paintDirty = true;
      let visibilityCheckedAt = 0;
      let startedAt = 0;
      let motionDuration = 620;
      let transitionLift = 0;
      let transitionSweep = 0;
      let moving = false;
      let renderCount = 0;
      let orbitActive = false;
      let pointerId: number | null = null;
      let pointerStartX = 0;
      let pointerStartY = 0;
      let pointerType = "";
      let startTheta = 0;
      let startPhi = 0;
      let canonicalTheta = 0;
      let occlusionDirty = true;
      const occludedNodes = nodePoints.map(() => false);
      const frameCpuTimes: number[] = [];
      const orbitSpherical = new THREE.Spherical();
      const target = new THREE.Vector3();
      const fromPosition = new THREE.Vector3();
      const fromTarget = new THREE.Vector3();
      const goalPosition = new THREE.Vector3();
      const goalTarget = new THREE.Vector3();
      const transitionSide = new THREE.Vector3();
      const projected = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const labelPoints = nodePoints.map((point) =>
        point.clone().add(new THREE.Vector3(0, 1.1, 0)),
      );
      let current = stateRef.current;
      let previousPoseOverview = current.overview;

      function updateResolution(interacting: boolean) {
        const budget = interacting ? motionPixelBudget : 1_800_000;
        host!.dataset.motionPixelBudget = `${motionPixelBudget}`;
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          width > 760 ? 2 : 1.6,
          Math.sqrt(budget / (width * height)),
        );
        if (
          Math.abs(renderRatio - ratio) > 0.001 ||
          canvas!.width !== Math.floor(width * ratio) ||
          canvas!.height !== Math.floor(height * ratio)
        ) {
          renderRatio = ratio;
          webgl.setDrawingBufferSize(width, height, ratio);
          host!.dataset.pixelRatio = ratio.toFixed(3);
          host!.dataset.bufferPixels = `${canvas!.width * canvas!.height}`;
        }
        host!.dataset.renderQuality = interacting ? "motion" : "still";
      }

      function markPaintPending() {
        paintDirty = true;
        host!.dataset.paintState = "pending";
      }

      function intersectsViewport(bounds: DOMRect) {
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.right > 0 &&
          bounds.left < window.innerWidth &&
          bounds.bottom > 0 &&
          bounds.top < window.innerHeight
        );
      }

      function scheduleResizePaint() {
        cancelAnimationFrame(resizePaintFrame);
        resizePaintFrame = 0;
        if (disposed || lost || document.hidden) return;
        resizePaintFrame = requestAnimationFrame(() => {
          resizePaintFrame = 0;
          if (disposed || lost || document.hidden || !paintDirty) return;
          visible = intersectsViewport(host!.getBoundingClientRect());
          visibilityCheckedAt = performance.now();
          if (visible) resumeVisiblePose();
        });
      }

      function showLabels() {
        camera.updateMatrixWorld();
        const settled = !moving && !orbitActive;
        if (settled && occlusionDirty) {
          labelPoints.forEach((point, index) => {
            direction.copy(point).sub(camera.position);
            let occluded = false;
            // March the authored height field instead of testing every triangle.
            for (let sample = 1; sample < 48; sample++) {
              const fraction = sample / 48;
              const x = camera.position.x + direction.x * fraction;
              const z = camera.position.z + direction.z * fraction;
              if ((x / 11.8) ** 2 + (z / 8.2) ** 2 > 1) continue;
              if (heightAt(x, z) > camera.position.y + direction.y * fraction + 0.12) { occluded = true; break; }
            }
            occludedNodes[index] = occluded;
          });
          occlusionDirty = false;
        }
        labelPoints.forEach((point, index) => {
          const button = nodeRefs.current[index];
          if (!button) return;
          projected.copy(point).project(camera);
          const distance = point.distanceTo(camera.position);
          const occluded = settled && occludedNodes[index];
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * height;
          const shown =
            projected.z > -1 &&
            projected.z < 1 &&
            x > 24 &&
            x < width - 24 &&
            y > 26 &&
            y < height - 26 &&
            !occluded;
          button.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%)`;
          button.style.visibility = shown ? "visible" : "hidden";
          button.tabIndex = shown ? 0 : -1;
          button.dataset.projected = shown ? "visible" : "hidden";
          button.style.zIndex = `${100 - Math.round(distance)}`;
        });
      }
      function draw() {
        if (disposed || lost || !visible || document.hidden) return;
        const cpuStart = performance.now();
        updateResolution(moving || orbitActive);
        camera.lookAt(target);
        sky.position.copy(camera.position);
        webgl.render(scene, camera);
        showLabels();
        host!.dataset.drawCalls = `${webgl.info.render.calls}`;
        host!.dataset.triangles = `${webgl.info.render.triangles}`;
        host!.dataset.renderCount = `${++renderCount}`;
        const cpuTime = performance.now() - cpuStart;
        host!.dataset.frameCpuMs = cpuTime.toFixed(2);
        if (renderCount > 3) {
          frameCpuTimes.push(cpuTime);
          if (frameCpuTimes.length > 30) frameCpuTimes.shift();
          host!.dataset.averageFrameCpuMs = (
            frameCpuTimes.reduce((sum, time) => sum + time, 0) /
            frameCpuTimes.length
          ).toFixed(2);
        }
        host!.dataset.cameraPosition = camera.position
          .toArray()
          .map((number) => number.toFixed(3))
          .join(",");
        host!.dataset.cameraTarget = target
          .toArray()
          .map((number) => number.toFixed(3))
          .join(",");
        host!.dataset.paintedCamera = orbitActive
          ? "orbit"
          : moving
            ? "moving"
            : current.overview
              ? "overview"
              : "focus";
        host!.dataset.paintedSelected = current.nodes[current.selected]?.id || "";
        host!.dataset.paintedWidth = `${canvas!.width}`;
        host!.dataset.paintedHeight = `${canvas!.height}`;
        paintDirty = false;
        host!.dataset.paintState = "ready";
      }
      function adaptMotionQuality(time: number) {
        if (lastMotionTime && time - lastMotionTime > 26) slowMotionFrames++;
        else slowMotionFrames = 0;
        lastMotionTime = time;
        if (slowMotionFrames >= 2 && motionPixelBudget > 450_000) {
          motionPixelBudget = Math.max(450_000, Math.floor(motionPixelBudget * 0.72));
          slowMotionFrames = 0;
        }
      }
      function drawOrbit(time: number) {
        frame = 0;
        if (disposed || lost || !visible || document.hidden) return;
        if (orbitActive) adaptMotionQuality(time);
        camera.position.setFromSpherical(orbitSpherical).add(target);
        draw();
      }
      function endOrbit() {
        const capture = pointerId;
        pointerId = null;
        if (capture !== null && canvas!.hasPointerCapture(capture))
          canvas!.releasePointerCapture(capture);
        if (!orbitActive) return;
        orbitActive = false;
        occlusionDirty = true;
        delete host!.dataset.interaction;
        host!.dataset.camera = current.overview ? "overview" : "focus";
        if (!frame && visible && !document.hidden && !disposed && !lost)
          frame = requestAnimationFrame(drawOrbit);
      }
      function pointerDown(event: PointerEvent) {
        if (
          disposed ||
          lost ||
          !visible ||
          !event.isPrimary ||
          event.button !== 0 ||
          pointerId !== null
        )
          return;
        pointerId = event.pointerId;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        pointerType = event.pointerType;
        orbitSpherical.setFromVector3(camera.position.clone().sub(target));
        startTheta = orbitSpherical.theta;
        startPhi = orbitSpherical.phi;
        canvas!.setPointerCapture(event.pointerId);
      }
      function pointerMove(event: PointerEvent) {
        if (event.pointerId !== pointerId) return;
        const dx = event.clientX - pointerStartX;
        const dy = event.clientY - pointerStartY;
        if (!orbitActive) {
          if (Math.hypot(dx, dy) < 6) return;
          if (pointerType === "touch" && Math.abs(dy) > Math.abs(dx)) {
            endOrbit();
            return;
          }
          orbitActive = true;
          moving = false;
          lastMotionTime = 0;
          slowMotionFrames = 0;
          cancelAnimationFrame(frame);
          frame = 0;
          orbitSpherical.setFromVector3(camera.position.clone().sub(target));
          startTheta = orbitSpherical.theta;
          startPhi = orbitSpherical.phi;
          host!.dataset.interaction = "orbit";
          host!.dataset.camera = "orbit";
          occlusionDirty = true;
        }
        const yawLimit = current.overview ? 0.6 : 0.4;
        orbitSpherical.theta = THREE.MathUtils.clamp(
          startTheta - dx * 0.004,
          canonicalTheta - yawLimit,
          canonicalTheta + yawLimit,
        );
        orbitSpherical.phi = THREE.MathUtils.clamp(
          startPhi + (pointerType === "touch" ? 0 : dy * 0.003),
          0.45,
          1.15,
        );
        if (!frame) frame = requestAnimationFrame(drawOrbit);
      }
      function pointerEnd(event: PointerEvent) {
        if (event.pointerId === pointerId) endOrbit();
      }
      function animate(time: number) {
        frame = 0;
        if (disposed || lost || !visible || document.hidden) return;
        adaptMotionQuality(time);
        const fraction = Math.min(1, (time - startedAt) / motionDuration);
        const ease = fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
        const arc = Math.sin(Math.PI * ease);
        camera.position.lerpVectors(fromPosition, goalPosition, ease);
        camera.position.y += arc * transitionLift;
        camera.position.addScaledVector(transitionSide, arc * transitionSweep);
        target.lerpVectors(fromTarget, goalTarget, ease);
        target.y += arc * transitionLift * 0.12;
        if (fraction >= 1) {
          moving = false;
          occlusionDirty = true;
        }
        draw();
        if (fraction < 1) frame = requestAnimationFrame(animate);
        else {
          moving = false;
          host!.dataset.camera = current.overview ? "overview" : "focus";
        }
      }
      function choosePose(immediate: boolean, preserveMotion = false) {
        const remaining = preserveMotion && moving ? Math.max(120, motionDuration - (performance.now() - startedAt)) : null;
        motionDuration = remaining ?? (previousPoseOverview !== current.overview ? 820 : 660);
        previousPoseOverview = current.overview;
        markPaintPending();
        endOrbit();
        occlusionDirty = true;
        camera.aspect = width / height;
        camera.clearViewOffset();
        if (width > 760) {
          camera.setViewOffset(width, height, -width * 0.17, 0, width, height);
        } else if (!current.overview) {
          const verticalOffset = window.innerHeight <= 680 ? 0.29 : 0.30;
          camera.setViewOffset(
            width,
            height,
            0,
            height * verticalOffset,
            width,
            height,
          );
        }
        camera.updateProjectionMatrix();
        const point =
          nodePoints[
            Math.max(0, Math.min(nodePoints.length - 1, current.selected))
          ] || new THREE.Vector3();
        if (current.overview) {
          let fit = width / height < 1 ? Math.min(1.7, height / width) : 1;
          goalPosition.set(16 * fit, 12 * fit, 22 * fit);
          goalTarget.set(0, width < 760 ? 2.1 : 0.9, 0);
          const fitCamera = camera.clone();
          const marginX = 1 - 80 / width;
          const marginY = 1 - 100 / height;
          for (let attempt = 0; attempt < 12; attempt++) {
            fitCamera.position.copy(goalPosition);
            fitCamera.lookAt(goalTarget);
            fitCamera.updateMatrixWorld();
            const fits = labelPoints.every((anchor) => {
              const screen = anchor.clone().project(fitCamera);
              return (
                Math.abs(screen.x) < marginX && Math.abs(screen.y) < marginY
              );
            });
            if (fits) break;
            fit *= 1.1;
            goalPosition.set(16 * fit, 12 * fit, 22 * fit);
          }
        } else {
          const angle = current.selected * 0.12;
          const distance = width / height < 0.75 ? 1.15 : 1;
          goalPosition.set(
            point.x + Math.cos(angle) * 6.4 * distance,
            point.y + 5.5 * distance,
            point.z + (8.2 - Math.sin(angle) * 2) * distance,
          );
          goalTarget.copy(point).add(new THREE.Vector3(0, 0.35, 0));
        }
        canonicalTheta = new THREE.Spherical().setFromVector3(
          goalPosition.clone().sub(goalTarget),
        ).theta;
        const travelX = goalPosition.x - camera.position.x;
        const travelZ = goalPosition.z - camera.position.z;
        const travelDistance = Math.hypot(travelX, goalPosition.y - camera.position.y, travelZ);
        transitionSide.set(-travelZ, 0, travelX).normalize();
        transitionLift = THREE.MathUtils.clamp(travelDistance * 0.055, 0.28, 1.25);
        transitionSweep = THREE.MathUtils.clamp(travelDistance * 0.022, 0.12, 0.52);
        host!.dataset.cameraState = current.overview ? "overview" : "focused";
        host!.dataset.selected = current.nodes[current.selected]?.id || "";
        cancelAnimationFrame(frame);
        frame = 0;
        if (immediate || current.reducedMotion || current.paused) {
          moving = false;
          camera.position.copy(goalPosition);
          target.copy(goalTarget);
          host!.dataset.camera = current.overview ? "overview" : "focus";
          draw();
        } else {
          fromPosition.copy(camera.position);
          fromTarget.copy(target);
          startedAt = performance.now();
          lastMotionTime = 0;
          slowMotionFrames = 0;
          moving = true;
          host!.dataset.camera = "moving";
          if (visible && !document.hidden)
            frame = requestAnimationFrame(animate);
        }
      }
      function update(state: SceneState) {
        const poseChanged = state.overview !== current.overview || state.selected !== current.selected;
        const completionChanged = state.nodes.some((node, index) => node.done !== current.nodes[index]?.done);
        const stopMotion = moving && (state.reducedMotion || state.paused);
        current = state;
        if (!poseChanged && !completionChanged && !stopMotion) return;
        markPaintPending();
        nodePoints.forEach((_, index) => {
          caps.setColorAt(index, instanceColor.set(index === current.selected ? "#c91635" : current.nodes[index]?.done ? "#eceef2" : "#aeb7c4"));
        });
        const activePoint = nodePoints[current.selected] || nodePoints[0];
        if (activePoint) {
          selectionLight.position.copy(activePoint);
          selectionLight.position.y += 0.65;
        }
        if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
        if (poseChanged || stopMotion) choosePose(false);
        else if (!orbitActive) draw();
      }
      function resumeVisiblePose() {
        if (moving && !current.paused && !current.reducedMotion) {
          // Resize has already retargeted the journey. Its own next frame paints the new buffer.
          if (!frame) frame = requestAnimationFrame(animate);
        } else choosePose(true);
      }
      function resize() {
        const bounds = host!.getBoundingClientRect();
        width = Math.max(1, bounds.width);
        height = Math.max(1, bounds.height);
        visible = intersectsViewport(bounds);
        visibilityCheckedAt = performance.now();
        const shadowSize = width > 760 ? 2048 : 1024;
        if (sun.shadow.mapSize.x !== shadowSize) {
          sun.shadow.mapSize.set(shadowSize, shadowSize);
          sun.shadow.map?.dispose();
          sun.shadow.map = null;
          webgl.shadowMap.needsUpdate = true;
        }
        host!.dataset.shadowSize = `${shadowSize}`;
        choosePose(!moving || current.paused || current.reducedMotion, true);
        scheduleResizePaint();
      }
      function visibilityChanged() {
        if (document.hidden) {
          endOrbit();
          cancelAnimationFrame(frame);
          frame = 0;
          cancelAnimationFrame(resizePaintFrame);
          resizePaintFrame = 0;
        } else {
          markPaintPending();
          scheduleResizePaint();
        }
      }
      function contextLost(event: Event) {
        event.preventDefault();
        lost = true;
        endOrbit();
        cancelAnimationFrame(frame);
        cancelAnimationFrame(resizePaintFrame);
        resizePaintFrame = 0;
        setRenderState({ signature, status: "fallback" });
        nodeRefs.current.forEach((button) => {
          if (button) button.style.visibility = "hidden";
        });
      }
      const resizeObserver = new ResizeObserver(resize);
      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          let latest: IntersectionObserverEntry | undefined;
          for (const entry of entries) {
            if (entry.target === host && (!latest || entry.time >= latest.time))
              latest = entry;
          }
          if (!latest || latest.time < visibilityCheckedAt) return;
          visible = latest.isIntersecting;
          if (visible) resumeVisiblePose();
          else {
            endOrbit();
            cancelAnimationFrame(frame);
            frame = 0;
            cancelAnimationFrame(resizePaintFrame);
            resizePaintFrame = 0;
          }
        },
        { threshold: 0.01 },
      );

      controller = {
        update,
        dispose() {
          if (disposed) return;
          disposed = true;
          endOrbit();
          cancelAnimationFrame(frame);
          cancelAnimationFrame(resizePaintFrame);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          document.removeEventListener("visibilitychange", visibilityChanged);
          canvas!.removeEventListener("webglcontextlost", contextLost);
          canvas!.removeEventListener("pointerdown", pointerDown);
          canvas!.removeEventListener("pointermove", pointerMove);
          canvas!.removeEventListener("pointerup", pointerEnd);
          canvas!.removeEventListener("pointercancel", pointerEnd);
          canvas!.removeEventListener("lostpointercapture", pointerEnd);
          window.removeEventListener("resize", resize);
          for (const mesh of [ranges, rocks, bases, caps]) mesh.dispose();
          geometries.forEach((value) => value.dispose());
          materials.forEach((value) => value.dispose());
          sun.shadow.map?.dispose();
          webgl.dispose();
          if (!lost) webgl.forceContextLoss();
          scene.clear();
        },
      };
      host.dataset.sceneBuildMs = (performance.now() - sceneStartedAt).toFixed(2);
      host.dataset.geometryBuildMs = (performance.now() - geometryStartedAt).toFixed(2);
      const shaderStartedAt = performance.now();
      await webgl.compileAsync(scene, camera);
      host.dataset.shaderWarmMs = (performance.now() - shaderStartedAt).toFixed(2);
      if (cancelled) { controller.dispose(); return; }
      host.dataset.sceneReadyMs = (performance.now() - sceneStartedAt).toFixed(2);
      controllerRef.current = controller;
      resizeObserver.observe(host);
      intersectionObserver.observe(host);
      document.addEventListener("visibilitychange", visibilityChanged);
      canvas.addEventListener("webglcontextlost", contextLost);
      canvas.addEventListener("pointerdown", pointerDown);
      canvas.addEventListener("pointermove", pointerMove);
      canvas.addEventListener("pointerup", pointerEnd);
      canvas.addEventListener("pointercancel", pointerEnd);
      canvas.addEventListener("lostpointercapture", pointerEnd);
      window.addEventListener("resize", resize);
      resize();
      update(stateRef.current);
      setRenderState({ signature, status: "webgl" });
    }
    createScene().catch(() => {
      if (!cancelled) setRenderState({ signature, status: "fallback" });
    });
    return () => {
      cancelled = true;
      controller?.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [signature]);

  return (
    <div
      ref={hostRef}
      className={styles.scene}
      role="region"
      aria-label="3D карта на учебния път"
      data-renderer={renderer}
      data-camera-state={overview ? "overview" : "focused"}
      data-selected={nodes[selected]?.id || ""}
    >
      <canvas
        key={signature}
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden="true"
      />
      <div className={styles.nodes} hidden={renderer !== "webgl"}>
        {nodes.map((node, index) => (
          <button
            key={node.id}
            ref={(element) => {
              nodeRefs.current[index] = element;
            }}
            className={`${styles.node} ${index === selected ? styles.current : ""}`}
            data-scene-node={node.id}
            type="button"
            aria-label={`Ниво ${index + 1}: ${node.label}`}
            aria-current={index === selected ? "step" : undefined}
            aria-describedby={`journey-state-${node.id}`}
            title={node.label}
            onClick={() => onSelect(index)}
          >
            <span aria-hidden="true">{index + 1}</span>
            <span className={styles.nodeState} id={`journey-state-${node.id}`}>
              {index === selected ? "Избрано ниво. " : ""}
              {node.done ? "Завършено." : "Предстои."}
            </span>
          </button>
        ))}
      </div>
      {renderer !== "webgl" && (
        <div className={styles.fallback}>
          <p role="status">
            {renderer === "loading"
              ? "Подготвяне на картата…"
              : "Картата е в опростен изглед."}
          </p>
          <ol>
            {nodes.map((node, index) => (
              <li key={node.id}>
                <button
                  type="button"
                  data-fallback-node={node.id}
                  aria-current={index === selected ? "step" : undefined}
                  onClick={() => onSelect(index)}
                >
                  <span>{index + 1}</span>
                  <span>
                    {node.label}
                    <small>
                      {node.done
                        ? "Завършено"
                        : index === selected
                          ? "Избрано ниво"
                          : "Предстои"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
