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
  Raycaster,
  SkinnedMesh,
  Vector3,
} from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  CAVE_BARS_FILE,
  CAVE_CELLS,
  CAVE_CONTAINERS,
  CAVE_CONTAINER_FILES,
  CAVE_ENVOY_FILE,
  CAVE_FILE,
  CAVE_FIXTURE_FOOTPRINTS,
  CAVE_FLAME_AHEAD,
  CAVE_FLAME_HEIGHT,
  CAVE_FOOTPRINT,
  CAVE_MODEL_CENTRE,
  CAVE_PASSAGE,
  CAVE_PASSAGE_HALF_WIDTH,
  CAVE_PLACEMENTS,
  CAVE_ROPE,
  CAVE_SKELETON_FILE,
  CAVE_TERRAIN,
  CAVE_TORCH_FILE,
  PLAYER_RADIUS,
  SIMULATION_RATE,
  TOBY_ACTIVITY_STEPS,
  TOBY_FILE,
  TOBY_RUN_SPEED,
  Terrain,
  VILLAGE_PLACEMENTS,
  findPlacement,
  placePoint,
  placeShape,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GroundVector,
  Placement,
  Shape,
} from '@clovervale/shared';

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

/**
 * The outcome of checking how two models meet: that the hammer of the smith
 * meets the iron, or that the face of the chief is seen from the plaza.
 */
interface StrikeResult {
  /** How the models meet, for the owner to read. */
  readonly summary: string;
  /** The requirements not met. */
  readonly failures: string[];
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
  /** The node matrices of the first pose. */
  readonly start: readonly number[];
  /** The node matrices of the last pose. */
  readonly end: readonly number[];
  /** How far the first pose is from the first pose of `Idle`. */
  readonly startFromIdle: number;
  /** How far the last pose is from the first pose of `Idle`. */
  readonly endFromIdle: number;
  /** How far along X and Z the hips end from where they start. */
  readonly hipsDrift: readonly [number, number];
  /** The mean speed along Z of each foot while on the ground, by bone name. */
  readonly footSpeeds: ReadonlyMap<string, number>;
  /**
   * The lowest point the hands reach, and how far in front of the feet the
   * hands are then, in metres, if the model has hands.
   */
  readonly handReach: readonly [low: number, ahead: number] | null;
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
  'npc-nancy.glb',
  'npc-emma.glb',
  'npc-martha.glb',
  TOBY_FILE,
  CAVE_ENVOY_FILE,
  'wild-dog.glb',
  'weapon-shop.glb',
  'fountain.glb',
];
/** The file names of the NPCs. */
const NPC_PATTERN = /^npc-[a-z]+(-[a-z]+)*\.glb$/;
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
/**
 * The shortest and the longest each clip a model may have besides those it
 * must have may last, in seconds, by kind.  An NPC may work.
 */
const OPTIONAL_CLIP_DURATIONS: Readonly<
  Record<ModelKind, Readonly<Record<string, readonly [number, number]>>>
> = {
  character: {},
  npc: { Work: [0, Infinity] },
  monster: {},
  static: {},
};
/** How long each activity of Toby lasts on his course, in seconds. */
const CHILD_ACTIVITY_DURATIONS: Readonly<Record<string, number>> =
  Object.fromEntries(
    Object.entries(TOBY_ACTIVITY_STEPS).map(
      ([activity, steps]: [string, number]) => [
        activity,
        steps / SIMULATION_RATE,
      ],
    ),
  );
/**
 * The shortest and the longest each clip of Toby may last, in seconds:
 * squatting down, standing up and turning round each as long as his course
 * gives them, and no round of picking or stride of his run longer than his
 * picking or his run.
 */
const CHILD_CLIP_DURATIONS: Readonly<
  Record<string, readonly [number, number]>
> = Object.fromEntries([
  ['Idle', [0, Infinity]],
  ...Object.entries(CHILD_ACTIVITY_DURATIONS).map(
    ([activity, duration]: [string, number]): [string, [number, number]] => [
      activity,
      activity === 'Pick' || activity === 'Run'
        ? [0, duration]
        : [duration - 1e-6, duration],
    ],
  ),
] satisfies [string, [number, number]][]);
/**
 * The clips of Toby that lead from one into another, by name, with the
 * clips whose first frame each starts from and ends on, so that he goes on
 * without a jump as his course takes him from one to the next.
 */
const CHILD_CLIP_CHAIN: Readonly<
  Record<string, readonly [from: string, to: string]>
> = {
  Squat: ['Run', 'Pick'],
  Rise: ['Pick', 'Idle'],
  Turn: ['Idle', 'Run'],
};
/**
 * The bounds of the height of Toby, in metres: clearly shorter than the
 * grown-ups, which stand 1.5 m to 1.8 m tall.
 */
const CHILD_HEIGHT: readonly [number, number] = [1, 1.2];
/**
 * The highest the hands of Toby must come down to as he picks at the
 * clover, in metres: among its leaves, a centimetre below the tops of the
 * tallest, which reach up to 13 cm.
 */
const CLOVER_HEIGHT = 0.12;
/**
 * The least distance in front of the middle of his feet the hands of Toby
 * must reach down at as he picks, in metres: over the patch of clover,
 * whose edge lies just in front of his toes.
 */
const CLOVER_AHEAD = 0.12;
/** The clips that loop. */
const LOOPING_CLIPS: readonly string[] = [
  'Idle',
  'Walk',
  'Work',
  'Run',
  'Pick',
];
/** The clips that end on the pose they start from. */
const SETTLING_CLIPS: readonly string[] = ['Slash', 'Attack'];
/**
 * The speed each clip in which the feet tread the ground stands for, in
 * metres per second, by the length of the clip in seconds: a `Walk` cycle
 * stands for 1.5 m, and a `Run` of Toby for his speed.
 */
const TREADING_SPEEDS: Readonly<Record<string, (duration: number) => number>> =
  {
    Walk: (duration: number) => 1.5 / duration,
    Run: () => TOBY_RUN_SPEED,
  };
/** The severities of the findings of the validator, by number. */
const SEVERITIES: readonly string[] = ['error', 'warning', 'info', 'hint'];
/** The greatest difference that counts as none, in metres. */
const TOLERANCE = 1e-4;
/** How many times a second a clip is measured. */
const SAMPLE_RATE = 240;
/** The greatest height of a point that touches the ground, in metres. */
const CONTACT_HEIGHT = 0.004;
/** The file name of the smith, who hammers hot iron on an anvil. */
const SMITH_FILE = 'npc-emma.glb';
/** The file name of the model with the anvil the smith works at. */
const ANVIL_FILE = 'weapon-shop.glb';
/** The clip in which the smith hammers. */
const HAMMERING_CLIP = 'Work';
/** The material of the head of the hammer of the smith. */
const HAMMER_MATERIAL = 'hammerHead';
/** The material of the bar of hot iron on the anvil. */
const IRON_MATERIAL = 'hotIron';
/**
 * The farthest the face of the hammer may stop above the iron at the blow,
 * or sink into it, in metres.
 */
const STRIKE_TOLERANCE = 0.003;
/** The file name of the chief, who stands on the porch of her house. */
const CHIEF_FILE = 'npc-martha.glb';
/** The file name of the house of the chief. */
const CHIEF_HOUSE_FILE = 'prop-chief-house.glb';
/**
 * The models that stand around the porch of the house of the chief, any of
 * which could hide her face: the house, with the posts, the banner and the
 * roof of its porch, the low wall of its yard, and the old well.
 */
const PORCH_SURROUNDINGS: readonly string[] = [
  CHIEF_HOUSE_FILE,
  'prop-yard-wall.glb',
  'prop-yard-wall-end.glb',
  'prop-old-well.glb',
];
/**
 * The materials of the face of the chief, which must be seen, and what
 * they are.
 */
const FACE_PARTS: readonly (readonly [material: string, part: string])[] = [
  ['eye', 'eyes'],
  ['mouth', 'mouth'],
];
/** The height of the eyes of a player, in metres. */
const PLAYER_EYE_HEIGHT = 1.3;
/**
 * Where the camera starts from a player, in metres: up, and back towards
 * +Z.
 */
const CAMERA_OFFSET: readonly [up: number, back: number] = [7.5, 13];
/**
 * Where a player coming from the plaza stands in front of the porch of the
 * house of the chief, as the model of the house has it.
 */
const BEFORE_PORCH: GroundVector = { x: 0, z: 6.25 };
/**
 * Where a player stands at the rim of the fountain on the side of the
 * spawn points, to drink from it, as the model of the fountain has it.
 */
const AT_FOUNTAIN: GroundVector = { x: 0, z: 2.6 };
/** How many times in her idle clip the face of the chief is looked at. */
const SIGHT_SAMPLES = 12;
/**
 * The least height the rock and the stonework of the cave stand, where they
 * stand in the way, in metres: above the head of a player.
 */
const CAVE_WALL_HEIGHT = 2;
/**
 * The highest anything on the floor of the cave may stand where a player
 * can walk, in metres: no more than a flat stone.
 */
const CAVE_FLOOR_HEIGHT = 0.05;
/**
 * How far into what stands in the way of the players in the cave a point
 * must lie for the model to have to stand there, in metres.
 */
const CAVE_INSIDE = 0.05;
/**
 * Half the length and half the width of the ground the model of the cave
 * covers, around the middle it stands on, in metres.
 */
const CAVE_HALF_SIZE: readonly [number, number] = [13, 6.5];
/** The distance between two points the floor of the cave is checked at. */
const CAVE_SAMPLE_SPACING = 0.2;
/**
 * The least share of how far up the slope from the burrow a point lies
 * that the slope must rise to there: a slope of 42 degrees at least.
 */
const CAVE_SLOPE_RISE = 0.9;
/** The farthest the flame of a torch may be from where it is to burn. */
const FLAME_TOLERANCE = 0.03;
/**
 * The farthest an edge of what stands in the cave may lie from the edge of
 * the ground it takes up, inside it or out, in metres.
 */
const FOOTPRINT_TOLERANCE = 0.03;
/** The material of the hands of the prisoner, which hold the bars. */
const HAND_MATERIAL = 'hand';
/** The material of the bars of a cell. */
const BAR_MATERIAL = 'iron';
/**
 * The farthest the middle of a fist of the prisoner may be from the bar it
 * holds, along the ground, in metres.
 */
const GRIP_TOLERANCE = 0.03;
/** How many times in his idle clip the prisoner is looked at. */
const ENVOY_SAMPLES = 48;
/**
 * The least room between the axis of a bar of a cell and anything of the
 * prisoner but his fists, along the ground, in metres: the radius of a bar.
 */
const BAR_CLEARANCE = 0.022;
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
  let handReach: [number, number] | null = null;
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
    positions.forEach((position: Vector3, i: number) => {
      const isHand: boolean =
        boneNames[getItem(bones, i)]?.startsWith('Hand') === true;
      if (isHand && (handReach === null || position.y < handReach[0])) {
        handReach = [position.y, position.z];
      }
    });
    if (clip.name in TREADING_SPEEDS) {
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
    start,
    end,
    startFromIdle: measureDifference(start, idleStart),
    endFromIdle: measureDifference(end, idleStart),
    hipsDrift: [last.x - first.x, last.z - first.z],
    footSpeeds,
    handReach,
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
  if (NPC_PATTERN.test(file)) {
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
  if (file === TOBY_FILE) {
    const [shortest, tallest] = CHILD_HEIGHT;
    check(
      height >= shortest && height <= tallest,
      `height ${String(height)}`,
    );
  } else if (kind === 'character' || kind === 'npc') {
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
    if (file === 'prop-village-sign.glb') {
      // The whole sign, to the top of the stake above its board, stands
      // about as tall as a person: no shorter than a character, and at
      // most a little taller, so that it does not tower over the players.
      check(height >= 1.5 && height <= 1.9, `height ${String(height)}`);
    }
    if (file === 'prop-chief-house.glb') {
      // The largest house of the village: much wider than a cottage, which
      // is 5.5 m across under its roof and 5.4 m tall, and with its two
      // storeys well above it, yet under a roof of a gentle pitch that does
      // not tower, and not so large as to crowd its corner.
      check(height >= 7 && height <= 8.2, `height ${String(height)}`);
      check(size.x >= 7.5 && size.x <= 9, `width ${String(size.x)}`);
      check(size.z <= 8, `depth ${String(size.z)}`);
    }
    if (file === 'prop-yard-wall.glb') {
      // A two-metre stretch that reaches a little past each end, about
      // thigh-high on a player, low enough to see the porch over.
      check(size.x >= 2 && size.x <= 2.4, `length ${String(size.x)}`);
      check(height >= 0.6 && height <= 0.8, `height ${String(height)}`);
    }
    if (file === 'prop-yard-wall-end.glb') {
      // A ragged end shorter than a whole stretch, from its tall end, no
      // taller than a whole stretch, to its low stones, with the stones
      // fallen from it lying close by on either side.
      check(size.x >= 1.3 && size.x <= 1.7, `length ${String(size.x)}`);
      check(size.z <= 1.5, `depth ${String(size.z)}`);
      check(height >= 0.5 && height <= 0.7, `height ${String(height)}`);
    }
    if (file === 'prop-old-well.glb') {
      // No more than 1.5 m across, its stonework being 1.4 m across and the
      // little roof over it only a little wider; and no more than 2 m tall
      // with its roof, a little taller than a player.
      check(size.x <= 1.5 && size.z <= 1.5, 'old well too wide');
      check(height <= 2, `height ${String(height)}`);
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
    const required =
      file === TOBY_FILE ? CHILD_CLIP_DURATIONS : CLIP_DURATIONS[kind];
    const durations = { ...OPTIONAL_CLIP_DURATIONS[kind], ...required };
    const clipNames: string[] = [...measured.clips.keys()];
    check(
      Object.keys(required).every((name: string) => clipNames.includes(name)) &&
        clipNames.every((name: string) => name in durations),
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
      const chain: readonly [string, string] | undefined =
        file === TOBY_FILE ? CHILD_CLIP_CHAIN[name] : undefined;
      // A clip that leads from one into another may move the hips, as the
      // poses at its ends do.
      check(
        name === 'Die' ||
          chain !== undefined ||
          (Math.abs(clip.hipsDrift[0]) < TOLERANCE &&
            Math.abs(clip.hipsDrift[1]) < TOLERANCE),
        `${name} drifts`,
      );
      if (LOOPING_CLIPS.includes(name)) {
        check(clip.seam < TOLERANCE, `${name} does not loop seamlessly`);
      } else if (chain !== undefined) {
        const [from, to] = chain;
        const fromStart: readonly number[] =
          measured.clips.get(from)?.start ?? [];
        const toStart: readonly number[] =
          measured.clips.get(to)?.start ?? [];
        check(
          fromStart.length > 0 &&
            measureDifference(clip.start, fromStart) < TOLERANCE,
          `${name} does not start from the first ${from} frame`,
        );
        check(
          toStart.length > 0 &&
            measureDifference(clip.end, toStart) < TOLERANCE,
          `${name} does not end on the first ${to} frame`,
        );
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
      const treading: number = TREADING_SPEEDS[name]?.(clip.duration) ?? 0;
      for (const [foot, speed] of clip.footSpeeds) {
        check(
          Math.abs(speed + treading) < 0.05,
          `${foot} slides in ${name}: ${String(speed)} m/s on the ground`,
        );
      }
    }
    if (file === TOBY_FILE) {
      const run: ClipMeasurements | undefined = measured.clips.get('Run');
      const strides: number =
        (CHILD_ACTIVITY_DURATIONS.Run ?? 0) / (run?.duration ?? Infinity);
      check(
        Math.abs(strides - Math.round(strides)) < 1e-6 && strides >= 1,
        'Run does not fit a whole number of times into his run',
      );
      check(
        (run?.footSpeeds.size ?? 0) === 2,
        'Run does not set both feet on the ground',
      );
      const reach = measured.clips.get('Pick')?.handReach ?? null;
      const centre: number = measured.feet?.getCenter(new Vector3()).z ?? 0;
      check(
        reach !== null &&
          reach[0] <= CLOVER_HEIGHT &&
          reach[1] - centre >= CLOVER_AHEAD,
        'Pick does not reach down into the clover in front of him',
      );
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
 * Loads a model the way the client does, and stands it where the village
 * has a place for it.
 *
 * @param {string} file - The file name of the model.
 * @returns {Promise<GLTF>} The model, standing in its place.
 * @throws {Error} If the village has no place for the model.
 */
async function loadPlaced(file: string): Promise<GLTF> {
  const glb: Buffer = readFileSync(path.join(modelsDir, file));
  const model: GLTF = await loader.parseAsync(new Uint8Array(glb).buffer, '');
  const placement: Placement = findPlacement(file);
  model.scene.position.set(placement.x, 0, placement.z);
  model.scene.rotation.y = (placement.yaw * Math.PI) / 180;
  model.scene.updateMatrixWorld(true);
  return model;
}

/**
 * Lists the vertices in a material of a posed model, in world space.
 *
 * @param {Object3D} root - The model.
 * @param {string} material - The name of the material.
 * @returns {Vector3[]} The positions of the vertices.
 */
function listMaterialVertices(root: Object3D, material: string): Vector3[] {
  const positions: Vector3[] = [];
  root.traverse((node: Object3D) => {
    if (
      isMesh(node) &&
      !Array.isArray(node.material) &&
      node.material.name === material
    ) {
      positions.push(...listWorldVertices(node).positions);
    }
  });
  return positions;
}

/**
 * Tells whether a point on the ground lies within the outline of points
 * around a convex shape.
 *
 * @param {Vector3} point - The point; its height does not count.
 * @param {readonly Vector3[]} corners - The points around the shape, in no
 *   particular order; their heights do not count.
 * @returns {boolean} Whether the point lies within the outline.
 */
function isWithinOutline(point: Vector3, corners: readonly Vector3[]): boolean {
  const middle = new Vector3();
  for (const corner of corners) {
    middle.add(corner);
  }
  middle.divideScalar(corners.length);
  const findAngle = (p: Vector3): number =>
    Math.atan2(p.z - middle.z, p.x - middle.x);
  const ring: Vector3[] = corners.toSorted(
    (a: Vector3, b: Vector3) => findAngle(a) - findAngle(b),
  );
  return ring.every((a: Vector3, index: number) => {
    const b: Vector3 = getItem(ring, (index + 1) % ring.length);
    const cross: number =
      (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    return cross >= -1e-9;
  });
}

/**
 * Checks that the hammer of the smith meets the hot iron on the anvil, as
 * the village stands both: that at the lowest point of its stroke the face
 * of the hammer comes down on the top of the iron, neither short of it nor
 * into it, and over it.
 *
 * @returns {Promise<StrikeResult>} The outcome.
 */
async function checkStrike(): Promise<StrikeResult> {
  const smith: GLTF = await loadPlaced(SMITH_FILE);
  const anvil: GLTF = await loadPlaced(ANVIL_FILE);
  const iron: Vector3[] = listMaterialVertices(anvil.scene, IRON_MATERIAL);
  const clip: AnimationClip | undefined = smith.animations.find(
    (candidate: AnimationClip) => candidate.name === HAMMERING_CLIP,
  );
  if (iron.length === 0 || clip === undefined) {
    return {
      summary: '',
      failures: [
        `${ANVIL_FILE} has no hot iron or ${SMITH_FILE} does not hammer`,
      ],
    };
  }
  const ironTop: number = Math.max(...iron.map((p: Vector3) => p.y));
  const topFace: Vector3[] = iron.filter(
    (p: Vector3) => p.y > ironTop - TOLERANCE,
  );
  const steps: number = Math.round(clip.duration * SAMPLE_RATE);
  let gap = Infinity;
  let face = new Vector3();
  for (let k = 0; k <= steps; k++) {
    const mixer: AnimationMixer = poseModel(
      smith,
      clip,
      (clip.duration * k) / steps,
    );
    const head: Vector3[] = listMaterialVertices(smith.scene, HAMMER_MATERIAL);
    const lowest: number = Math.min(...head.map((p: Vector3) => p.y));
    if (lowest - ironTop < gap) {
      gap = lowest - ironTop;
      face = new Vector3();
      const bottom: Vector3[] = head.filter(
        (p: Vector3) => p.y < lowest + 0.001,
      );
      for (const p of bottom) {
        face.add(p);
      }
      face.divideScalar(bottom.length);
    }
    resetModel(smith, mixer);
  }
  const failures: string[] = [];
  const subject = `the hammer of ${SMITH_FILE}`;
  if (Math.abs(gap) > STRIKE_TOLERANCE) {
    failures.push(`${subject} does not meet the iron on ${ANVIL_FILE}`);
  }
  if (!isWithinOutline(face, topFace)) {
    failures.push(`${subject} comes down beside the iron on ${ANVIL_FILE}`);
  }
  const summary: string =
    `${subject} comes down ${(gap * 1000).toFixed(1)} mm above the iron ` +
    `on ${ANVIL_FILE}, ${isWithinOutline(face, topFace) ? 'over' : 'beside'} it`;
  return { summary, failures };
}

/**
 * Lists the points the face of the chief is looked at from: the eyes of a
 * player in front of her porch, and the camera as it starts behind that
 * player and behind a player at the fountain.
 *
 * @returns {[string, Vector3][]} What each point is, and where it is.
 */
function listChiefViewpoints(): [string, Vector3][] {
  const before: GroundVector = placePoint(
    findPlacement(CHIEF_HOUSE_FILE),
    BEFORE_PORCH,
  );
  const fountain: GroundVector = placePoint(
    findPlacement('fountain.glb'),
    AT_FOUNTAIN,
  );
  const [up, back] = CAMERA_OFFSET;
  return [
    [
      'a player in front of the porch',
      new Vector3(before.x, PLAYER_EYE_HEIGHT, before.z),
    ],
    [
      'the camera behind a player in front of the porch',
      new Vector3(before.x, up, before.z + back),
    ],
    [
      'the camera behind a player at the fountain',
      new Vector3(fountain.x, up, fountain.z + back),
    ],
  ];
}

/**
 * Loads the models around the porch of the house of the chief, each
 * standing in every place the village has for it.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<Object3D[]>} The models there are, standing in their
 *   places.
 */
async function loadPorchSurroundings(
  files: readonly string[],
): Promise<Object3D[]> {
  const roots: Object3D[] = [];
  for (const file of PORCH_SURROUNDINGS.filter((name: string) =>
    files.includes(name),
  )) {
    const model: GLTF = await loadPlaced(file);
    for (const placement of VILLAGE_PLACEMENTS) {
      if (placement.file === file) {
        const root: Object3D = model.scene.clone();
        root.position.set(placement.x, 0, placement.z);
        root.rotation.y = (placement.yaw * Math.PI) / 180;
        root.updateMatrixWorld(true);
        roots.push(root);
      }
    }
  }
  return roots;
}

/**
 * Checks that the face of the chief on the porch of her house is seen from
 * the plaza, as the village stands them: that from each point listed by
 * {@link listChiefViewpoints}, neither her house, with the posts, the
 * banner and the roof of its porch, nor the wall of the yard nor the well
 * stands in front of two points of her face, one between her eyes and one
 * at her mouth, each the mean of the vertices of its material, at each of {@link SIGHT_SAMPLES} evenly spaced
 * moments of her idle clip.  The check fails if she has no idle clip, or
 * no vertices of the material of her eyes or of her mouth.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<StrikeResult>} The outcome.
 */
async function checkChiefInSight(
  files: readonly string[],
): Promise<StrikeResult> {
  const chief: GLTF = await loadPlaced(CHIEF_FILE);
  const clip: AnimationClip | undefined = chief.animations.find(
    (candidate: AnimationClip) => candidate.name === 'Idle',
  );
  if (clip === undefined) {
    return { summary: '', failures: [`${CHIEF_FILE} does not idle`] };
  }
  const faceless: string[] = FACE_PARTS.filter(
    ([material]: readonly [string, string]) =>
      listMaterialVertices(chief.scene, material).length === 0,
  ).map(
    ([material, part]: readonly [string, string]) =>
      `${CHIEF_FILE} has no vertices of the material "${material}" of ` +
      `her ${part}, so whether they are seen cannot be checked`,
  );
  if (faceless.length > 0) {
    return { summary: '', failures: faceless };
  }
  const surroundings: Object3D[] = await loadPorchSurroundings(files);
  const raycaster = new Raycaster();
  const hidden = new Set<string>();
  for (let k = 0; k < SIGHT_SAMPLES; k++) {
    const mixer: AnimationMixer = poseModel(
      chief,
      clip,
      (clip.duration * k) / SIGHT_SAMPLES,
    );
    for (const [material, part] of FACE_PARTS) {
      const points: Vector3[] = listMaterialVertices(chief.scene, material);
      const middle = new Vector3();
      for (const point of points) {
        middle.add(point);
      }
      middle.divideScalar(points.length);
      for (const [name, viewpoint] of listChiefViewpoints()) {
        const way: Vector3 = new Vector3().subVectors(middle, viewpoint);
        const distance: number = way.length();
        raycaster.set(viewpoint, way.normalize());
        raycaster.far = distance;
        if (raycaster.intersectObjects(surroundings, true).length > 0) {
          hidden.add(`the ${part} of ${CHIEF_FILE} from ${name}`);
        }
      }
    }
    resetModel(chief, mixer);
  }
  const failures: string[] = [...hidden].map(
    (what: string) => `something hides ${what}`,
  );
  const summary =
    `the face of ${CHIEF_FILE} on the porch is ` +
    (failures.length === 0 ? 'seen from the plaza' : 'hidden from the plaza');
  return { summary, failures };
}

/**
 * Loads a model the way the client does, and stands it where the cave has
 * its first place for it.
 *
 * @param {string} file - The file name of the model.
 * @returns {Promise<GLTF>} The model, standing in its place.
 * @throws {Error} If the cave has no place for the model.
 */
async function loadCavePlaced(file: string): Promise<GLTF> {
  const placement: Placement | undefined = CAVE_PLACEMENTS.find(
    (candidate: Placement) => candidate.file === file,
  );
  if (placement === undefined) {
    throw new Error(`The cave has no place for ${file}.`);
  }
  return loadAt(placement);
}

/**
 * Loads a model the way the client does, and stands it in a place.
 *
 * @param {Placement} placement - The model, and where it stands.
 * @returns {Promise<GLTF>} The model, standing there.
 */
async function loadAt(placement: Placement): Promise<GLTF> {
  const { file } = placement;
  const glb: Buffer = readFileSync(path.join(modelsDir, file));
  const model: GLTF = await loader.parseAsync(new Uint8Array(glb).buffer, '');
  model.scene.position.set(placement.x, 0, placement.z);
  model.scene.rotation.y = (placement.yaw * Math.PI) / 180;
  model.scene.updateMatrixWorld(true);
  return model;
}

/**
 * Checks that the model of the cave stands where the cave stands in the
 * way of the players, and nowhere else, and that the torches burn where
 * the cave lights them from.
 *
 * Looking straight down on the cave standing in its place: where a player
 * could stand but for what stands in the side chambers, the floor is seen,
 * and nothing above it but a flat stone;
 * where the rock or the stonework stands in the way, it stands taller than
 * a player; and the slope from the burrow, which stands in the way at the
 * east end of the passage, rises steeply from its foot.  The flame of a
 * torch in its first place burns where the cave has the light of that
 * torch.
 *
 * @returns {Promise<StrikeResult>} The outcome.
 */
async function checkCave(): Promise<StrikeResult> {
  const cave: GLTF = await loadCavePlaced(CAVE_FILE);
  // The ground the model of the cave takes up, without what stands in it.
  const rock = new Terrain(
    CAVE_FOOTPRINT.map((shape: Shape) =>
      placeShape({ ...CAVE_MODEL_CENTRE, yaw: 0 }, shape),
    ),
    CAVE_TERRAIN.boundary,
  );
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const findTop = (x: number, z: number): number | null => {
    raycaster.set(new Vector3(x, 20, z), down);
    const [hit] = raycaster.intersectObject(cave.scene, true);
    return hit === undefined ? null : hit.point.y;
  };
  const { boundary } = rock;
  const failures: string[] = [];
  let floorCount = 0;
  let rockCount = 0;
  const report = (what: string, x: number, z: number): void => {
    if (failures.length < 5) {
      failures.push(`${what} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  };
  for (
    let x = boundary.x - boundary.radius;
    x <= boundary.x + boundary.radius;
    x += CAVE_SAMPLE_SPACING
  ) {
    for (
      let z = -boundary.radius;
      z <= boundary.radius;
      z += CAVE_SAMPLE_SPACING
    ) {
      const point: GroundVector = { x, z };
      const top: number | null = findTop(x, z);
      if (rock.isClear(point)) {
        floorCount++;
        if (top === null || top > CAVE_FLOOR_HEIGHT) {
          report(`${CAVE_FILE} has no bare floor`, x, z);
        }
        continue;
      }
      const isInside = !rock.isClear(point, -PLAYER_RADIUS - CAVE_INSIDE);
      const isRope: boolean =
        Math.hypot(x - CAVE_ROPE.x, z - CAVE_ROPE.z) <= PLAYER_RADIUS;
      if (!isInside || isRope) {
        continue;
      }
      if (top === null) {
        // Beyond the ground the model covers, nobody ever comes near.
        const [halfLength, halfWidth] = CAVE_HALF_SIZE;
        if (
          Math.abs(x - CAVE_MODEL_CENTRE.x) < halfLength &&
          Math.abs(z - CAVE_MODEL_CENTRE.z) < halfWidth
        ) {
          report(`${CAVE_FILE} has nothing`, x, z);
        }
        continue;
      }
      rockCount++;
      const along: number = x - CAVE_PASSAGE.east;
      const isSlope: boolean =
        along > 0 && Math.abs(z) < CAVE_PASSAGE_HALF_WIDTH - CAVE_INSIDE;
      if (isSlope) {
        if (top < Math.min(along, 3) * CAVE_SLOPE_RISE) {
          report(`the slope of ${CAVE_FILE} is too low`, x, z);
        }
      } else if (top < CAVE_WALL_HEIGHT) {
        report(`the rock of ${CAVE_FILE} is too low`, x, z);
      }
    }
  }
  const torch: GLTF = await loadCavePlaced(CAVE_TORCH_FILE);
  const flame: Vector3[] = listMaterialVertices(torch.scene, 'flame');
  const middle = new Vector3();
  for (const point of flame) {
    middle.add(point);
  }
  middle.divideScalar(Math.max(flame.length, 1));
  const placement: Placement | undefined = CAVE_PLACEMENTS.find(
    (candidate: Placement) => candidate.file === CAVE_TORCH_FILE,
  );
  const ahead: GroundVector =
    placement === undefined
      ? { x: NaN, z: NaN }
      : placePoint(placement, { x: 0, z: CAVE_FLAME_AHEAD });
  if (
    flame.length === 0 ||
    Math.hypot(middle.x - ahead.x, middle.z - ahead.z) > FLAME_TOLERANCE ||
    Math.abs(middle.y - CAVE_FLAME_HEIGHT) > 0.1
  ) {
    failures.push(
      `the flame of ${CAVE_TORCH_FILE} does not burn where the cave lights it`,
    );
  }
  const summary =
    `${CAVE_FILE} stands where the cave stands in the way ` +
    `(${String(floorCount)} points of floor, ${String(rockCount)} of rock), ` +
    `and ${CAVE_TORCH_FILE} burns where it is lit`;
  return { summary, failures };
}

/**
 * Finds the extent of the ground some shapes take up, along X and Z.
 *
 * @param {readonly Shape[]} shapes - The shapes, in the world.
 * @returns {[number, number, number, number]} The least and the greatest X,
 *   and the least and the greatest Z.
 */
function measureShapes(
  shapes: readonly Shape[],
): [number, number, number, number] {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const shape of shapes) {
    const corners: GroundVector[] =
      shape.shape === 'circle'
        ? [
            { x: shape.x - shape.radius, z: shape.z - shape.radius },
            { x: shape.x + shape.radius, z: shape.z + shape.radius },
          ]
        : [-1, 1].flatMap((u: number) =>
            [-1, 1].map((v: number) =>
              placePoint(shape, {
                x: u * shape.halfWidth,
                z: v * shape.halfDepth,
              }),
            ),
          );
    for (const { x, z } of corners) {
      [minX, maxX] = [Math.min(minX, x), Math.max(maxX, x)];
      [minZ, maxZ] = [Math.min(minZ, z), Math.max(maxZ, z)];
    }
  }
  return [minX, maxX, minZ, maxZ];
}

/**
 * Finds the axes of the bars of a cell, along X, as its model stands.
 *
 * @param {Object3D} root - The model of the bars, standing in its place.
 * @returns {number[]} Where the axis of each bar stands along X, in order.
 */
function findBarAxes(root: Object3D): number[] {
  const xs: number[] = listMaterialVertices(root, BAR_MATERIAL)
    .map((p: Vector3) => p.x)
    .sort((a: number, b: number) => a - b);
  const axes: number[] = [];
  let first: number | undefined = xs[0];
  xs.forEach((x: number, index: number) => {
    const next: number | undefined = xs[index + 1];
    if (next === undefined || next - x > 0.05) {
      axes.push(((first ?? x) + x) / 2);
      first = next;
    }
  });
  return axes;
}

/**
 * Checks that what stands in the side chambers of the cave stands where the
 * cave has it, and takes up the ground the cave has it take up.
 *
 * Each of the bars, the bones and the containers, shut and open, standing
 * in its place, reaches out to the edges of the ground it takes up, and no
 * farther; the bars of each cell run across its whole opening, on the edge
 * of the passage; and the bones lean on the back wall of the south cell.
 * Through his idle clip, both fists of the prisoner close round a bar of
 * his cell, and nothing else of him passes into a bar or through the bars
 * into the passage.
 *
 * @returns {Promise<StrikeResult>} The outcome.
 */
async function checkCaveFixtures(): Promise<StrikeResult> {
  const failures: string[] = [];
  const placements: Placement[] = [
    ...CAVE_PLACEMENTS.filter(
      ({ file }: Placement) =>
        file === CAVE_BARS_FILE || file === CAVE_SKELETON_FILE,
    ),
    ...CAVE_CONTAINERS.flatMap((container: CaveContainer): Placement[] => {
      const { closed, open } = CAVE_CONTAINER_FILES[container.kind];
      return [
        { ...container, file: closed },
        { ...container, file: open },
      ];
    }),
  ];
  for (const placement of placements) {
    const model: GLTF = await loadAt(placement);
    const box: Box3 = new Box3().setFromObject(model.scene, true);
    const shapes: Shape[] = (CAVE_FIXTURE_FOOTPRINTS[placement.file] ?? []).map(
      (shape: Shape) => placeShape(placement, shape),
    );
    const where = `${placement.file} at (${placement.x.toFixed(2)}, ` +
      `${placement.z.toFixed(2)})`;
    if (shapes.length > 0) {
      const [minX, maxX, minZ, maxZ] = measureShapes(shapes);
      const gaps: number[] = [
        box.min.x - minX,
        maxX - box.max.x,
        box.min.z - minZ,
        maxZ - box.max.z,
      ];
      if (gaps.some((gap: number) => Math.abs(gap) > FOOTPRINT_TOLERANCE)) {
        failures.push(`${where} does not take up the ground it stands on`);
      }
    }
    if (placement.file === CAVE_BARS_FILE) {
      const cell = CAVE_CELLS[placement.z < 0 ? 0 : 1];
      if (
        Math.abs(box.min.x - cell.west) > FOOTPRINT_TOLERANCE ||
        Math.abs(box.max.x - cell.east) > FOOTPRINT_TOLERANCE ||
        Math.abs(Math.abs(placement.z) - CAVE_PASSAGE_HALF_WIDTH) > 1e-9
      ) {
        failures.push(`${where} does not close off the whole cell`);
      }
    }
    if (placement.file === CAVE_SKELETON_FILE) {
      const wall: number = CAVE_CELLS[1].south;
      if (box.max.z > wall || box.max.z < wall - FOOTPRINT_TOLERANCE) {
        failures.push(`${where} does not lean on the back wall of its cell`);
      }
    }
  }

  const envoyPlacement: Placement | undefined = CAVE_PLACEMENTS.find(
    ({ file }: Placement) => file === CAVE_ENVOY_FILE,
  );
  const barsPlacement: Placement | undefined = CAVE_PLACEMENTS.find(
    ({ file, z }: Placement) => file === CAVE_BARS_FILE && z < 0,
  );
  let closest = Infinity;
  let loosest = 0;
  if (envoyPlacement !== undefined && barsPlacement !== undefined) {
    const envoy: GLTF = await loadAt(envoyPlacement);
    const bars: GLTF = await loadAt(barsPlacement);
    const axes: number[] = findBarAxes(bars.scene);
    const barTop: number = new Box3().setFromObject(bars.scene).max.y;
    const barZ: number = barsPlacement.z;
    const findBarDistance = (p: Vector3): number =>
      Math.min(...axes.map((x: number) => Math.hypot(p.x - x, p.z - barZ)));
    const clip: AnimationClip | undefined = envoy.animations.find(
      (candidate: AnimationClip) => candidate.name === 'Idle',
    );
    if (clip === undefined) {
      failures.push(`${CAVE_ENVOY_FILE} does not idle`);
    } else {
      let isHeld = true;
      let isClear = true;
      for (let k = 0; k <= ENVOY_SAMPLES; k++) {
        const mixer: AnimationMixer = poseModel(
          envoy,
          clip,
          (clip.duration * k) / ENVOY_SAMPLES,
        );
        const hands: Vector3[] = listMaterialVertices(
          envoy.scene,
          HAND_MATERIAL,
        );
        for (const side of [-1, 1]) {
          const fist: Vector3[] = hands.filter(
            (p: Vector3) => Math.sign(p.x - envoyPlacement.x) === side,
          );
          const middle = new Vector3();
          for (const p of fist) {
            middle.add(p);
          }
          middle.divideScalar(Math.max(fist.length, 1));
          const grip: number =
            fist.length === 0 ? Infinity : findBarDistance(middle);
          loosest = Math.max(loosest, grip);
          if (grip > GRIP_TOLERANCE) {
            isHeld = false;
          }
        }
        const rest: Mesh[] = [];
        envoy.scene.traverse((node: Object3D) => {
          if (
            isMesh(node) &&
            !Array.isArray(node.material) &&
            node.material.name !== HAND_MATERIAL
          ) {
            rest.push(node);
          }
        });
        for (const p of rest.flatMap(
          (node: Mesh) => listWorldVertices(node).positions,
        )) {
          const distance: number = findBarDistance(p);
          closest = Math.min(closest, distance);
          if (p.z > barZ || (p.y < barTop && distance < BAR_CLEARANCE)) {
            isClear = false;
          }
        }
        resetModel(envoy, mixer);
      }
      if (!isHeld) {
        failures.push(`the fists of ${CAVE_ENVOY_FILE} do not hold the bars`);
      }
      if (!isClear) {
        failures.push(`${CAVE_ENVOY_FILE} passes into the bars of his cell`);
      }
    }
  }
  const summary =
    `what stands in the side chambers of the cave takes up its ground ` +
    `(${String(placements.length)} models), and ${CAVE_ENVOY_FILE} holds ` +
    `the bars, his fists ${(loosest * 1000).toFixed(0)} mm from their ` +
    `axes at the most, and the rest of him ${(closest * 1000).toFixed(0)} ` +
    `mm at the least`;
  return { summary, failures };
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
    if (
      !REQUIRED_FILES.includes(file) &&
      !NPC_PATTERN.test(file) &&
      !PROP_PATTERN.test(file)
    ) {
      problems.push(`${file} is not a name the game uses`);
    }
  }
  const results: ModelResult[] = [];
  for (const file of files) {
    if (file.endsWith('.glb')) {
      results.push(await checkModel(file));
    }
  }
  // Both models are required, so a missing one is already reported; the
  // strike is reported as not checked as well.
  const strike: StrikeResult =
    files.includes(SMITH_FILE) && files.includes(ANVIL_FILE)
      ? await checkStrike()
      : {
          summary: '',
          failures: [
            `the hammer of ${SMITH_FILE} cannot be checked against the ` +
              `iron on ${ANVIL_FILE}`,
          ],
        };
  problems.push(...strike.failures);
  // The chief is required, so a missing one is already reported; her face
  // is reported as not checked as well.
  const sight: StrikeResult = files.includes(CHIEF_FILE)
    ? await checkChiefInSight(files)
    : {
        summary: '',
        failures: [`the face of ${CHIEF_FILE} cannot be checked`],
      };
  problems.push(...sight.failures);
  // The models of the cave are optional props; without them, the cave is
  // not checked.
  const cave: StrikeResult =
    files.includes(CAVE_FILE) && files.includes(CAVE_TORCH_FILE)
      ? await checkCave()
      : { summary: '', failures: [] };
  problems.push(...cave.failures);
  // The models of the side chambers are required with the prisoner, and
  // optional props otherwise; without all of them, they are not checked.
  const fixtures: StrikeResult = [
    CAVE_ENVOY_FILE,
    ...new Set(CAVE_PLACEMENTS.map(({ file }: Placement) => file)),
    ...Object.values(CAVE_CONTAINER_FILES).flatMap(
      ({ closed, open }) => [closed, open],
    ),
  ].every((file: string) => files.includes(file))
    ? await checkCaveFixtures()
    : { summary: '', failures: [] };
  problems.push(...fixtures.failures);
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
  for (const meeting of [strike, sight, cave, fixtures]) {
    if (meeting.summary !== '') {
      const mark: string = meeting.failures.length > 0 ? 'FAIL' : 'ok  ';
      console.log(`${mark} ${meeting.summary}`);
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
