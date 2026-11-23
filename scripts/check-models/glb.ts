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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/check-models/glb Takes binary glTF files apart, and
 *   hashes their skeletons and clips.
 */

import { createHash } from 'node:crypto';
import type { Hash } from 'node:crypto';

import { getItem } from '../models/items.ts';

/** A node of a glTF document. */
export interface GltfNode {
  /** The name of the node. */
  readonly name?: string;
  /** The indices of the child nodes. */
  readonly children?: number[];
  /** The translation. */
  readonly translation?: number[];
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
export interface GltfDocument {
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
  /** The nodes. */
  readonly nodes?: GltfNode[];
  /** The skins. */
  readonly skins?: {
    /** The node indices of the bones. */
    readonly joints: number[];
  }[];
  /** The animations. */
  readonly animations?: GltfAnimation[];
}

/** A binary glTF file, taken apart. */
export interface ParsedGlb {
  /** The glTF document. */
  readonly gltf: GltfDocument;
  /** The binary chunk. */
  readonly binary: Buffer;
}

/** The type of the JSON chunk of a binary glTF file. */
const JSON_CHUNK = 0x4e4f534a;

/**
 * Splits a binary glTF file into its document and its binary chunk.
 *
 * @param {Buffer} glb - The file.
 * @returns {ParsedGlb} The parts.
 */
export function parseGlb(glb: Buffer): ParsedGlb {
  let offset = 12;
  let gltf: GltfDocument = {};
  let binary: Buffer = Buffer.alloc(0);
  while (offset < glb.length) {
    const length: number = glb.readUInt32LE(offset);
    const type: number = glb.readUInt32LE(offset + 4);
    const body: Buffer = glb.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      gltf = JSON.parse(body.toString('utf8')) as GltfDocument;
    } else {
      binary = body;
    }
    offset += 8 + length;
  }
  return { gltf, binary };
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
 * Hashes the skeleton and the animation clips of a file.
 *
 * @param {ParsedGlb} glb - The file.
 * @returns {[string, string]} The digests of the skeleton and of the clips.
 */
export function hashRig(glb: ParsedGlb): [string, string] {
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
    skeleton.update(`${node.name ?? ''}|${parentName}|${head};`);
  }
  for (const clip of glb.gltf.animations ?? []) {
    clips.update(clip.name);
    for (const channel of clip.channels) {
      const sampler = getItem(clip.samplers, channel.sampler);
      const name: string =
        getItem(nodes, channel.target.node ?? -1).name ?? '';
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
