// The Clovervale project.
// Copyright 2026 imacat.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Authors:
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/check-models Checks the 3D models of the client.
 */

import { createHash } from 'node:crypto';
import type { Hash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  AnimationMixer,
  Box3,
  LoopOnce,
  Mesh,
  SkinnedMesh,
  Vector3,
} from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { getItem } from './models/items.ts';

/** What a model stands for in the game. */
type ModelKind = 'character' | 'npc' | 'monster' | 'static';

/** The parts of the Khronos glTF Validator the check uses. */
interface Validator {
  /** Validates a glTF file. */
  readonly validateBytes: (data: Uint8Array) => Promise<ValidationReport>;
}

/** The report of the Khronos glTF Validator on a file. */
interface ValidationReport {
  /** What the validator found. */
  readonly issues: {
    /** The number of errors. */
    readonly numErrors: number;
    /** The number of warnings. */
    readonly numWarnings: number;
    /** The findings. */
    readonly messages: {
      /** The severity: 0 for an error, up to 3 for a hint. */
      readonly severity: number;
      /** The code of the finding. */
      readonly code: string;
    }[];
  };
}

/** A node of a glTF document. */
interface GltfNode {
  /** The name of the node. */
  readonly name?: string;
  /** The indices of the child nodes. */
  readonly children?: number[];
  /** The transform matrix. */
  readonly matrix?: number[];
  /** The translation. */
  readonly translation?: number[];
  /** The rotation. */
  readonly rotation?: number[];
  /** The scale. */
  readonly scale?: number[];
}

/** An animation of a glTF document. */
interface GltfAnimation {
  /** The name of the animation. */
  readonly name: string;
  /** The channels. */
  readonly channels: {
    /** The index of the sampler. */
    readonly sampler: number;
    /** The animated property. */
    readonly target: {
      /** The index of the node. */
      readonly node?: number;
      /** The property of the node. */
      readonly path: string;
    };
  }[];
  /** The samplers. */
  readonly samplers: {
    /** The accessor index of the key times. */
    readonly input: number;
    /** How to interpolate between the keys. */
    readonly interpolation?: string;
    /** The accessor index of the key values. */
    readonly output: number;
  }[];
}

/** The parts of a glTF document the check reads. */
interface GltfDocument {
  /** The names of the extensions the document uses. */
  readonly extensionsUsed?: string[];
  /** The names of the extensions the document needs. */
  readonly extensionsRequired?: string[];
  /** The buffers. */
  readonly buffers?: {
    /** Where the data is, if not in the file. */
    readonly uri?: string;
  }[];
  /** The buffer views. */
  readonly bufferViews?: {
    /** The offset into the buffer, in bytes. */
    readonly byteOffset?: number;
    /** The length, in bytes. */
    readonly byteLength: number;
  }[];
  /** The accessors. */
  readonly accessors?: {
    /** The index of the buffer view. */
    readonly bufferView?: number;
  }[];
  /** The cameras. */
  readonly cameras?: unknown[];
  /** The images. */
  readonly images?: unknown[];
  /** The textures. */
  readonly textures?: unknown[];
  /** The scenes. */
  readonly scenes?: {
    /** The indices of the root nodes. */
    readonly nodes?: number[];
  }[];
  /** The nodes. */
  readonly nodes?: GltfNode[];
  /** The materials. */
  readonly materials?: {
    /** The metallic-roughness factors. */
    readonly pbrMetallicRoughness?: object;
    /** How the material handles transparency. */
    readonly alphaMode?: string;
  }[];
  /** The meshes. */
  readonly meshes?: {
    /** The primitives of the mesh. */
    readonly primitives: {
      /** The accessor indices of the vertex attributes. */
      readonly attributes: Readonly<Record<string, number>>;
    }[];
  }[];
  /** The skins. */
  readonly skins?: {
    /** The node indices of the bones. */
    readonly joints: number[];
  }[];
  /** The animations. */
  readonly animations?: GltfAnimation[];
}

/** A binary glTF file, taken apart. */
interface ParsedGlb {
  /** The glTF document. */
  readonly gltf: GltfDocument;
  /** The binary chunk. */
  readonly binary: Buffer;
  /** The number of chunks in the file. */
  readonly chunks: number;
}

/** The vertices of a posed model, in world space. */
interface WorldVertices {
  /** The positions of the vertices. */
  readonly positions: Vector3[];
  /** The index of the bone each vertex follows, or -1 for none. */
  readonly bones: number[];
}

/** What a clip does to a model. */
interface ClipMeasurements {
  /** The length of the clip, in seconds. */
  readonly duration: number;
  /** The lowest point the model reaches. */
  readonly lowest: number;
  /** How far apart the first and the last poses are. */
  readonly seam: number;
  /** How far the first pose is from the first pose of `Idle`. */
  readonly startFromIdle: number;
  /** How far the last pose is from the first pose of `Idle`. */
  readonly endFromIdle: number;
  /** How far along X and Z the hips end from where they start. */
  readonly hipsDrift: readonly [number, number];
  /** The mean speed along Z of each foot while on the ground, by bone name. */
  readonly footSpeeds: ReadonlyMap<string, number>;
}

/** What a model measures when loaded and animated. */
interface ModelMeasurements {
  /** The number of triangles. */
  readonly triangles: number;
  /** The bounds of the rest pose. */
  readonly rest: Box3;
  /** The bounds of the feet in the rest pose, if the model has feet. */
  readonly feet: Box3 | null;
  /** The middle of the vertices in each material, by material name. */
  readonly centroids: ReadonlyMap<string, Vector3>;
  /** The measurements of the clips, by clip name. */
  readonly clips: ReadonlyMap<string, ClipMeasurements>;
}

/** The outcome of checking a model. */
interface ModelResult {
  /** The file name of the model. */
  readonly file: string;
  /** What the model stands for in the game. */
  readonly kind: ModelKind;
  /** The summary of the model, for the owner to read. */
  readonly summary: string;
  /** The requirements the model does not meet. */
  readonly failures: string[];
  /** The digest of the skeleton, if the model has one. */
  readonly skeletonHash: string;
  /** The digest of the animation clips, if the model has any. */
  readonly clipsHash: string;
}

const rootDir: string = path.resolve(import.meta.dirname, '..');
const modelsDir: string = path.join(rootDir, 'packages/client/public/models');
const validator = createRequire(import.meta.url)('gltf-validator') as Validator;
const loader = new GLTFLoader();

/** The file names of the player and bot characters. */
const CHARACTER_FILES: readonly string[] = Array.from(
  { length: 8 },
  (_: unknown, index: number) => `character-0${String(index + 1)}.glb`,
);
/** The file names of the models the game cannot do without. */
const REQUIRED_FILES: readonly string[] = [
  ...CHARACTER_FILES,
  'npc.glb',
  'wild-dog.glb',
  'weapon-shop.glb',
  'fountain.glb',
];
/** The file names of the optional props. */
const PROP_PATTERN = /^prop-[a-z]+(-[a-z]+)*\.glb$/;
/** The shortest and the longest each clip may last, in seconds, by kind. */
const CLIP_DURATIONS: Readonly<
  Record<ModelKind, Readonly<Record<string, readonly [number, number]>>>
> = {
  character: {
    Idle: [0, Infinity],
    Walk: [0.9, 1.1],
    Slash: [0, 0.6],
    Die: [0, 1.5],
  },
  npc: { Idle: [0, Infinity] },
  monster: {
    Idle: [0, Infinity],
    Walk: [0.9, 1.1],
    Attack: [0, 0.6],
    Die: [0, 1.5],
  },
  static: {},
};
/** The clips that loop. */
const LOOPING_CLIPS: readonly string[] = ['Idle', 'Walk'];
/** The clips that end on the pose they start from. */
const SETTLING_CLIPS: readonly string[] = ['Slash', 'Attack'];
/** The distance a `Walk` cycle stands for, in metres. */
const WALK_DISTANCE = 1.5;
/** The severities of the findings of the validator, by number. */
const SEVERITIES: readonly string[] = ['error', 'warning', 'info', 'hint'];
/** The greatest difference that counts as none, in metres. */
const TOLERANCE = 1e-4;
/** How many times a second a clip is measured. */
const SAMPLE_RATE = 240;
/** The greatest height of a point that touches the ground, in metres. */
const CONTACT_HEIGHT = 0.004;
/** The magic number of a binary glTF file. */
const GLB_MAGIC = 0x46546c67;
/** The type of the JSON chunk of a binary glTF file. */
const JSON_CHUNK = 0x4e4f534a;

/**
 * Splits a binary glTF file into its document and its binary chunk.
 *
 * @param {Buffer} glb - The file.
 * @returns {ParsedGlb} The parts.
 */
function parseGlb(glb: Buffer): ParsedGlb {
  let offset = 12;
  let gltf: GltfDocument = {};
  let binary: Buffer = Buffer.alloc(0);
  let chunks = 0;
  while (offset < glb.length) {
    const length: number = glb.readUInt32LE(offset);
    const type: number = glb.readUInt32LE(offset + 4);
    const body: Buffer = glb.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      gltf = JSON.parse(body.toString('utf8')) as GltfDocument;
    } else {
      binary = body;
    }
    chunks += 1;
    offset += 8 + length;
  }
  return { gltf, binary, chunks };
}

/**
 * Reads the bytes of an accessor.
 *
 * @param {ParsedGlb} glb - The file.
 * @param {number} index - The accessor index.
 * @returns {Buffer} The bytes of its buffer view.
 */
function readAccessor({ gltf, binary }: ParsedGlb, index: number): Buffer {
  const view = getItem(
    gltf.bufferViews ?? [],
    getItem(gltf.accessors ?? [], index).bufferView ?? -1,
  );
  const start: number = view.byteOffset ?? 0;
  return binary.subarray(start, start + view.byteLength);
}

/**
 * Counts how many times a key occurs anywhere in a document.
 *
 * @param {unknown} value - The document.
 * @param {string} key - The key.
 * @returns {number} How many times the key occurs.
 */
function countKey(value: unknown, key: string): number {
  if (value === null || typeof value !== 'object') {
    return 0;
  }
  let count = 0;
  for (const [name, child] of Object.entries(value)) {
    count += (name === key ? 1 : 0) + countKey(child, key);
  }
  return count;
}

/**
 * Hashes the skeleton and the animation clips of a file.
 *
 * @param {ParsedGlb} glb - The file.
 * @returns {[string, string]} The digests of the skeleton and of the clips.
 */
function hashRig(glb: ParsedGlb): [string, string] {
  const skeleton: Hash = createHash('sha256');
  const clips: Hash = createHash('sha256');
  const nodes: readonly GltfNode[] = glb.gltf.nodes ?? [];
  const joints: readonly number[] = glb.gltf.skins?.[0]?.joints ?? [];
  const parents = new Map<number, number>();
  nodes.forEach((node: GltfNode, index: number) => {
    for (const child of node.children ?? []) {
      parents.set(child, index);
    }
  });
  for (const joint of joints) {
    const node: GltfNode = getItem(nodes, joint);
    const parent: number | undefined = parents.get(joint);
    const parentName: string =
      parent !== undefined && joints.includes(parent)
        ? (getItem(nodes, parent).name ?? '')
        : '';
    const head: string = (node.translation ?? [])
      .map((x: number) => x.toFixed(5))
      .join(',');
    const rotation: string = (node.rotation ?? []).join(',');
    const scale: string = (node.scale ?? []).join(',');
    skeleton.update(
      `${node.name ?? ''}|${parentName}|${head}|${rotation}|${scale};`,
    );
  }
  for (const clip of glb.gltf.animations ?? []) {
    clips.update(clip.name);
    for (const channel of clip.channels) {
      const sampler = getItem(clip.samplers, channel.sampler);
      const name: string = getItem(nodes, channel.target.node ?? -1).name ?? '';
      clips.update(
        `${name}|${channel.target.path}|${sampler.interpolation ?? ''}`,
      );
      clips.update(readAccessor(glb, sampler.input));
      clips.update(readAccessor(glb, sampler.output));
    }
  }
  return [
    skeleton.digest('hex').slice(0, 12),
    clips.digest('hex').slice(0, 12),
  ];
}

/**
 * Poses a loaded model at a time of one of its clips.
 *
 * @param {GLTF} model - The loaded model.
 * @param {AnimationClip} clip - The clip.
 * @param {number} time - The time in seconds.
 * @returns {AnimationMixer} The mixer that holds the pose.
 */
function poseModel(
  model: GLTF,
  clip: AnimationClip,
  time: number,
): AnimationMixer {
  const mixer = new AnimationMixer(model.scene);
  const action: AnimationAction = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(Math.min(time, clip.duration));
  model.scene.updateMatrixWorld(true);
  return mixer;
}

/**
 * Restores the rest pose of a model.
 *
 * @param {GLTF} model - The loaded model.
 * @param {AnimationMixer} mixer - The mixer that holds its pose.
 */
function resetModel(model: GLTF, mixer: AnimationMixer): void {
  mixer.stopAllAction();
  mixer.uncacheRoot(model.scene);
  model.scene.traverse((node: Object3D) => {
    if (node instanceof SkinnedMesh) {
      node.skeleton.pose();
    }
  });
  model.scene.updateMatrixWorld(true);
}

/**
 * Tells whether a node of a loaded model is a mesh.
 *
 * @param {Object3D} node - The node.
 * @returns {boolean} Whether the node is a mesh.
 */
function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

/**
 * Lists the vertices of every mesh of a posed model, in world space.
 *
 * @param {Object3D} root - The model.
 * @returns {WorldVertices} The positions and, for skinned vertices, the
 *   index of the bone each one follows.
 */
function listWorldVertices(root: Object3D): WorldVertices {
  const positions: Vector3[] = [];
  const bones: number[] = [];
  root.traverse((node: Object3D) => {
    if (!isMesh(node)) {
      return;
    }
    const skinned: boolean = node.geometry.hasAttribute('skinIndex');
    const count: number = node.geometry.getAttribute('position').count;
    for (let i = 0; i < count; i++) {
      const vertex: Vector3 = node.getVertexPosition(i, new Vector3());
      positions.push(vertex.applyMatrix4(node.matrixWorld));
      bones.push(
        skinned ? node.geometry.getAttribute('skinIndex').getX(i) : -1,
      );
    }
  });
  return { positions, bones };
}

/**
 * Lists where every node of a posed model is.
 *
 * @param {Object3D} root - The model.
 * @returns {number[]} The world matrices of the nodes, flat.
 */
function listNodeMatrices(root: Object3D): number[] {
  const values: number[] = [];
  root.traverse((node: Object3D) => {
    values.push(...node.matrixWorld.elements);
  });
  return values;
}

/**
 * Measures how far apart two poses are.
 *
 * @param {readonly number[]} a - The node matrices of one pose.
 * @param {readonly number[]} b - The node matrices of the other pose.
 * @returns {number} The greatest difference between two matrix elements.
 */
function measureDifference(a: readonly number[], b: readonly number[]): number {
  let difference = 0;
  a.forEach((value: number, index: number) => {
    difference = Math.max(difference, Math.abs(value - getItem(b, index)));
  });
  return difference;
}

/**
 * Measures what a clip does to a model.
 *
 * @param {GLTF} model - The loaded model.
 * @param {AnimationClip} clip - The clip.
 * @param {readonly string[]} boneNames - The names of the bones.
 * @param {readonly number[]} idleStart - The node matrices of the first pose
 *   of `Idle`.
 * @returns {ClipMeasurements} The measurements.
 */
function measureClip(
  model: GLTF,
  clip: AnimationClip,
  boneNames: readonly string[],
  idleStart: readonly number[],
): ClipMeasurements {
  const root: Object3D = model.scene;
  const hips: Object3D | undefined = root.getObjectByName('Hips');
  const steps: number = Math.round(clip.duration * SAMPLE_RATE);
  const interval: number = clip.duration / steps;
  const speeds = new Map<string, number[]>();
  const hipsPath: Vector3[] = [];
  let lowest = Infinity;
  let previous: Vector3[] | null = null;
  let start: number[] = [];
  let end: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const mixer: AnimationMixer = poseModel(
      model,
      clip,
      (clip.duration * k) / steps,
    );
    const { positions, bones } = listWorldVertices(root);
    for (const position of positions) {
      lowest = Math.min(lowest, position.y);
    }
    if (hips !== undefined) {
      hipsPath.push(new Vector3().setFromMatrixPosition(hips.matrixWorld));
    }
    if (k === 0) {
      start = listNodeMatrices(root);
    }
    if (k === steps) {
      end = listNodeMatrices(root);
    }
    if (clip.name === 'Walk') {
      boneNames.forEach((name: string, bone: number) => {
        if (!name.startsWith('Foot')) {
          return;
        }
        let sole = -1;
        positions.forEach((position: Vector3, i: number) => {
          if (
            getItem(bones, i) === bone &&
            (sole < 0 || position.y < getItem(positions, sole).y)
          ) {
            sole = i;
          }
        });
        if (sole < 0) {
          return;
        }
        const footSpeeds: number[] = speeds.get(name) ?? [];
        speeds.set(name, footSpeeds);
        if (
          previous !== null &&
          getItem(positions, sole).y < CONTACT_HEIGHT &&
          getItem(previous, sole).y < CONTACT_HEIGHT
        ) {
          footSpeeds.push(
            (getItem(positions, sole).z - getItem(previous, sole).z) / interval,
          );
        }
      });
      previous = positions;
    }
    resetModel(model, mixer);
  }
  const first: Vector3 = hipsPath[0] ?? new Vector3();
  const last: Vector3 = hipsPath[steps] ?? new Vector3();
  const footSpeeds = new Map<string, number>();
  for (const [name, values] of speeds) {
    const sum: number = values.reduce((a: number, b: number) => a + b, 0);
    footSpeeds.set(name, sum / values.length);
  }
  return {
    duration: clip.duration,
    lowest,
    seam: measureDifference(start, end),
    startFromIdle: measureDifference(start, idleStart),
    endFromIdle: measureDifference(end, idleStart),
    hipsDrift: [last.x - first.x, last.z - first.z],
    footSpeeds,
  };
}

/**
 * Loads a model the way the client does, and measures it.
 *
 * @param {Buffer} glb - The file.
 * @returns {Promise<ModelMeasurements>} The measurements.
 */
async function measureModel(glb: Buffer): Promise<ModelMeasurements> {
  const model: GLTF = await loader.parseAsync(new Uint8Array(glb).buffer, '');
  const root: Object3D = model.scene;
  let triangles = 0;
  let boneNames: string[] = [];
  root.traverse((node: Object3D) => {
    if (isMesh(node)) {
      const count: number =
        node.geometry.index?.count ??
        node.geometry.getAttribute('position').count;
      triangles += count / 3;
    }
    if (node instanceof SkinnedMesh) {
      boneNames = node.skeleton.bones.map((bone: Object3D) => bone.name);
    }
  });
  root.updateMatrixWorld(true);
  const rest: Box3 = new Box3().setFromPoints(
    listWorldVertices(root).positions,
  );
  const centroids = new Map<string, Vector3>();
  const feet: Vector3[] = [];
  root.traverse((node: Object3D) => {
    if (!isMesh(node) || Array.isArray(node.material)) {
      return;
    }
    const sum = new Vector3();
    const { positions, bones } = listWorldVertices(node);
    positions.forEach((position: Vector3, i: number) => {
      sum.add(position);
      if (boneNames[getItem(bones, i)]?.startsWith('Foot') === true) {
        feet.push(position);
      }
    });
    centroids.set(node.material.name, sum.divideScalar(positions.length));
  });
  const idle: AnimationClip | undefined = model.animations.find(
    (clip: AnimationClip) => clip.name === 'Idle',
  );
  let idleStart: number[] = [];
  if (idle !== undefined) {
    const mixer: AnimationMixer = poseModel(model, idle, 0);
    idleStart = listNodeMatrices(root);
    resetModel(model, mixer);
  }
  const clips = new Map<string, ClipMeasurements>();
  for (const clip of model.animations) {
    clips.set(clip.name, measureClip(model, clip, boneNames, idleStart));
  }
  return {
    triangles,
    rest,
    feet: feet.length > 0 ? new Box3().setFromPoints(feet) : null,
    centroids,
    clips,
  };
}

/**
 * Tells what a model file stands for in the game.
 *
 * @param {string} file - The file name of the model.
 * @returns {ModelKind} The kind of the model.
 */
function classifyModel(file: string): ModelKind {
  if (CHARACTER_FILES.includes(file)) {
    return 'character';
  }
  if (file === 'npc.glb') {
    return 'npc';
  }
  return file === 'wild-dog.glb' ? 'monster' : 'static';
}

/**
 * Checks a model file.
 *
 * @param {string} file - The file name of the model.
 * @returns {Promise<ModelResult>} The outcome.
 */
async function checkModel(file: string): Promise<ModelResult> {
  const glb: Buffer = readFileSync(path.join(modelsDir, file));
  const parsed: ParsedGlb = parseGlb(glb);
  const { gltf } = parsed;
  const kind: ModelKind = classifyModel(file);
  const rigged: boolean = kind !== 'static';
  const failures: string[] = [];
  const check = (ok: boolean, message: string): void => {
    if (!ok) {
      failures.push(message);
    }
  };
  const report: ValidationReport = await validator.validateBytes(
    new Uint8Array(glb),
  );
  const measured: ModelMeasurements = await measureModel(glb);
  const { min, max } = measured.rest;
  const size: Vector3 = measured.rest.getSize(new Vector3());

  // Format.
  check(
    glb.readUInt32LE(0) === GLB_MAGIC && glb.readUInt32LE(4) === 2,
    'not a binary glTF 2.0 file',
  );
  check(
    parsed.chunks === 2 &&
      gltf.buffers?.length === 1 &&
      countKey(gltf, 'uri') === 0,
    'not one self-contained file',
  );
  check(
    gltf.extensionsUsed === undefined &&
      gltf.extensionsRequired === undefined &&
      countKey(gltf, 'extensions') === 0,
    'uses an extension',
  );
  check(
    gltf.cameras === undefined && countKey(gltf, 'camera') === 0,
    'has a camera',
  );
  check(
    countKey(gltf, 'targets') === 0 && countKey(gltf, 'weights') === 0,
    'has morph targets',
  );
  const roots: readonly number[] = gltf.scenes?.[0]?.nodes ?? [];
  check(
    gltf.scenes?.length === 1 && roots.length === 1,
    'not one scene with one root node',
  );
  const nodes: readonly GltfNode[] = gltf.nodes ?? [];
  const names: (string | undefined)[] = nodes.map(
    (node: GltfNode) => node.name,
  );
  check(
    !names.includes(undefined) && new Set(names).size === names.length,
    'node names repeat',
  );
  const root: GltfNode = nodes[roots[0] ?? -1] ?? {};
  check(
    root.matrix === undefined &&
      root.translation === undefined &&
      root.rotation === undefined &&
      root.scale === undefined,
    'root transform is not identity',
  );
  check(
    nodes.every(
      (node: GltfNode) => node.scale === undefined && node.matrix === undefined,
    ),
    'a node carries a scale or a matrix',
  );
  check(
    (gltf.animations ?? []).every((clip: GltfAnimation) =>
      clip.channels.every(
        (channel) =>
          channel.target.path !== 'scale' && channel.target.node !== roots[0],
      ),
    ),
    'an animation scales a node or moves the root node',
  );

  // Materials.
  check(
    (gltf.materials ?? []).every(
      (material) =>
        material.pbrMetallicRoughness !== undefined &&
        material.alphaMode !== 'BLEND',
    ),
    'a material is not opaque metallic-roughness',
  );
  check(
    (gltf.images ?? []).length === 0 && (gltf.textures ?? []).length === 0,
    'has textures (their format and size are not checked here)',
  );

  // Budgets.
  const [maxTriangles, maxBytes] = rigged
    ? [3000, 500 * 1024]
    : [5000, 1024 * 1024];
  check(measured.triangles <= maxTriangles, 'too many triangles');
  check(glb.length <= maxBytes, 'file too large');

  // Acceptance.
  check(report.issues.numErrors === 0, 'glTF Validator reports errors');

  // Origin and size.
  check(min.y >= -TOLERANCE, 'rest pose reaches below the ground');
  check(min.y < 0.01, 'rest pose floats above the ground');
  const height: number = max.y;
  if (kind === 'character' || kind === 'npc') {
    check(height >= 1.5 && height <= 1.8, `height ${String(height)}`);
  } else if (kind === 'monster') {
    check(height >= 1 && height <= 2.5, `height ${String(height)}`);
  } else {
    check(
      Math.abs(min.x + max.x) < 2e-3 && Math.abs(min.z + max.z) < 2e-3,
      'origin is not the centre of the footprint',
    );
    if (file === 'weapon-shop.glb') {
      check(
        size.x <= 8 && size.z <= 8 && height <= 6,
        'weapon shop too large',
      );
    }
    if (file === 'fountain.glb') {
      check(size.x <= 4 && size.z <= 4, 'fountain too wide');
    }
  }
  if (measured.feet !== null) {
    const centre: Vector3 = measured.feet.getCenter(new Vector3());
    check(
      Math.abs(centre.x) < 2e-3 && Math.abs(centre.z) < 2e-3,
      'origin is not the centre of the feet',
    );
  }
  const front: Vector3 | undefined =
    measured.centroids.get('eye') ??
    measured.centroids.get('pupil') ??
    measured.centroids.get('door');
  if (front !== undefined) {
    check(front.z > 0.1, 'the front does not face +Z');
  }

  // Skeleton and animation.
  let skeletonHash = '';
  let clipsHash = '';
  if (rigged) {
    check(
      gltf.skins?.length === 1 && (gltf.skins[0]?.joints.length ?? 0) <= 40,
      'more than 40 bones',
    );
    check(
      (gltf.meshes ?? []).every((mesh) =>
        mesh.primitives.every(
          (primitive) => primitive.attributes.JOINTS_1 === undefined,
        ),
      ),
      'more than four influences per vertex',
    );
    [skeletonHash, clipsHash] = hashRig(parsed);
    const durations = CLIP_DURATIONS[kind];
    const clipNames: string[] = [...measured.clips.keys()];
    check(
      clipNames.toSorted().join() === Object.keys(durations).sort().join(),
      `clips are ${clipNames.join()}`,
    );
    for (const [name, clip] of measured.clips) {
      const [shortest, longest] = durations[name] ?? [0, Infinity];
      check(
        clip.duration >= shortest && clip.duration <= longest + 1e-6,
        `${name} lasts ${String(clip.duration)}`,
      );
      check(
        clip.lowest >= -TOLERANCE,
        `${name} reaches ${String(clip.lowest)} below the ground`,
      );
      check(
        name === 'Die' ||
          (Math.abs(clip.hipsDrift[0]) < TOLERANCE &&
            Math.abs(clip.hipsDrift[1]) < TOLERANCE),
        `${name} drifts`,
      );
      if (LOOPING_CLIPS.includes(name)) {
        check(clip.seam < TOLERANCE, `${name} does not loop seamlessly`);
      } else {
        check(
          clip.startFromIdle < TOLERANCE,
          `${name} does not start from the first Idle frame`,
        );
      }
      if (SETTLING_CLIPS.includes(name)) {
        check(
          clip.endFromIdle < TOLERANCE,
          `${name} does not end on the first Idle frame`,
        );
      }
      for (const [foot, speed] of clip.footSpeeds) {
        check(
          Math.abs(speed + WALK_DISTANCE / clip.duration) < 0.05,
          `${foot} slides: ${String(speed)} m/s on the ground`,
        );
      }
    }
  } else {
    check(
      gltf.skins === undefined && gltf.animations === undefined,
      'a static model is rigged or animated',
    );
  }

  const codes: string[] = [
    ...new Set(
      report.issues.messages.map(
        (message) =>
          `${SEVERITIES[message.severity] ?? 'hint'}:${message.code}`,
      ),
    ),
  ];
  const clipSummaries: string[] = [...measured.clips].map(
    ([name, clip]: [string, ClipMeasurements]) =>
      `, ${name} ${clip.duration.toFixed(3)}s low ${clip.lowest.toFixed(4)}`,
  );
  const summary: string =
    `${String(measured.triangles)} tris, ` +
    `${(glb.length / 1024).toFixed(1)} KB, size ` +
    `${size.toArray().map((x: number) => x.toFixed(2)).join(' x ')}, ` +
    `validator ${String(report.issues.numErrors)}E/` +
    `${String(report.issues.numWarnings)}W [${codes.join(', ')}]` +
    clipSummaries.join('');
  return { file, kind, summary, failures, skeletonHash, clipsHash };
}

/**
 * Checks the models of the client.
 *
 * @returns {Promise<boolean>} Whether every model meets every requirement.
 */
async function checkModels(): Promise<boolean> {
  const files: string[] = readdirSync(modelsDir).sort();
  const problems: string[] = [];
  if (!files.every((file: string) => file.endsWith('.glb'))) {
    problems.push('the directory holds something other than .glb files');
  }
  for (const file of REQUIRED_FILES) {
    if (!files.includes(file)) {
      problems.push(`${file} is missing`);
    }
  }
  for (const file of files) {
    if (!REQUIRED_FILES.includes(file) && !PROP_PATTERN.test(file)) {
      problems.push(`${file} is not a name the game uses`);
    }
  }
  const results: ModelResult[] = [];
  for (const file of files) {
    if (file.endsWith('.glb')) {
      results.push(await checkModel(file));
    }
  }
  const characters: ModelResult[] = results.filter(
    (result: ModelResult) => result.kind === 'character',
  );
  const countDistinct = (values: string[]): number => new Set(values).size;
  if (countDistinct(characters.map((result) => result.skeletonHash)) > 1) {
    problems.push('the characters do not share one skeleton');
  }
  if (countDistinct(characters.map((result) => result.clipsHash)) > 1) {
    problems.push('the characters do not share the same clips');
  }
  for (const result of results) {
    const mark: string = result.failures.length > 0 ? 'FAIL' : 'ok  ';
    console.log(`${mark} ${result.file}: ${result.summary}`);
    for (const failure of result.failures) {
      console.log(`     - ${failure}`);
    }
  }
  for (const problem of problems) {
    console.log(`FAIL ${problem}`);
  }
  return (
    problems.length === 0 &&
    results.every((result: ModelResult) => result.failures.length === 0)
  );
}

try {
  if (await checkModels()) {
    console.log('Model check passed: every model meets the requirements.');
  } else {
    console.error('Model check failed.');
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const reason: string = error instanceof Error ? error.message : String(error);
  console.error(`Model check failed: ${reason}`);
  process.exitCode = 1;
}
