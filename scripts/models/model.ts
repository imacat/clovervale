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
 * @module scripts/models/model A low-poly model, written as binary glTF.
 */

import { Vector3 } from 'three';

import { computeFaceNormal } from './geometry.ts';
import type { Shape, Triangle, Triple } from './geometry.ts';
import { getItem } from './items.ts';

/** The factors of a material other than its base color. */
interface MaterialOptions {
  /** The roughness factor. */
  readonly roughness?: number;
  /** The metallic factor. */
  readonly metallic?: number;
  /** The emissive color as `#rrggbb`, or `null` for none. */
  readonly emissive?: string | null;
}

/** A material in a plain color. */
interface Material {
  /** The base color as `#rrggbb`. */
  readonly hex: string;
  /** The roughness factor. */
  readonly roughness: number;
  /** The metallic factor. */
  readonly metallic: number;
  /** The emissive color as `#rrggbb`, or `null` for none. */
  readonly emissive: string | null;
}

/** How to shade a shape. */
export interface ShapeOptions {
  /** Whether the shape reads as a rounded surface instead of as facets. */
  readonly smooth?: boolean;
}

/** A triangle of a model. */
export interface Face {
  /** The corners in model space. */
  readonly tri: Triangle;
  /** The index of the bone the triangle follows. */
  readonly bone: number;
  /** The unit normals at the corners, when the triangle is smooth-shaded. */
  readonly normals?: Triangle;
}

/** A corner of a triangle of a model. */
interface Corner {
  /** The corner in model space. */
  readonly point: Vector3;
  /** The index of the bone the corner follows. */
  readonly bone: number;
}

/** A bone of a model. */
export interface Bone {
  /** The unique name of the bone. */
  readonly name: string;
  /** The index of the parent bone, or -1 for the root bone. */
  readonly parent: number;
  /** The pivot in model space. */
  readonly head: Vector3;
}

/** The keys of one property of one bone in an animation clip. */
export interface Track {
  /** The index of the bone. */
  readonly bone: number;
  /** The animated property. */
  readonly path: 'rotation' | 'translation';
  /** The values at the key times, flat. */
  readonly values: number[];
}

/** An animation clip. */
export interface Clip {
  /** The name of the clip. */
  readonly name: string;
  /** The key times in seconds. */
  readonly times: number[];
  /** The tracks of the clip. */
  readonly tracks: Track[];
}

/** The vertex data of the faces in one material. */
interface VertexData {
  /** The positions, three numbers a vertex. */
  readonly positions: number[];
  /** The normals, three numbers a vertex. */
  readonly normals: number[];
  /** The bone indices, four numbers a vertex. */
  readonly joints: number[];
  /** The bone weights, four numbers a vertex. */
  readonly weights: number[];
  /** The vertex indices of the triangles. */
  readonly indices: number[];
}

/** The numbers an accessor can hold. */
type AccessorArray = Float32Array | Uint8Array | Uint16Array;

/** The glTF type of the elements of an accessor. */
type AccessorType = 'SCALAR' | 'VEC3' | 'VEC4' | 'MAT4';

/** How to describe an accessor. */
interface AccessorOptions {
  /** The buffer view target, or `null` for none. */
  readonly target?: number | null;
  /** Whether to record the least and the greatest values. */
  readonly bounds?: boolean;
  /** Whether the integers stand for numbers from 0 to 1. */
  readonly normalized?: boolean;
}

/** A glTF buffer view. */
interface GltfBufferView {
  /** The index of the buffer. */
  buffer: number;
  /** The offset into the buffer, in bytes. */
  byteOffset: number;
  /** The length, in bytes. */
  byteLength: number;
  /** What the graphics card uses the data for. */
  target?: number;
}

/** A glTF accessor. */
interface GltfAccessor {
  /** The index of the buffer view. */
  bufferView: number;
  /** The type of the numbers. */
  componentType: number;
  /** The number of elements. */
  count: number;
  /** The type of the elements. */
  type: AccessorType;
  /** Whether the integers stand for numbers from 0 to 1. */
  normalized?: boolean;
  /** The least value of each component. */
  min?: number[];
  /** The greatest value of each component. */
  max?: number[];
}

/** A glTF node. */
interface GltfNode {
  /** The name of the node. */
  name: string;
  /** The translation from the parent node. */
  translation?: number[];
  /** The index of the mesh. */
  mesh?: number;
  /** The index of the skin. */
  skin?: number;
  /** The indices of the child nodes. */
  children?: number[];
}

/** A glTF mesh primitive. */
interface GltfPrimitive {
  /** The accessor indices of the vertex attributes. */
  attributes: Record<string, number>;
  /** The accessor index of the vertex indices. */
  indices: number;
  /** The index of the material. */
  material: number;
  /** The kind of primitive. */
  mode: number;
}

/** A glTF material. */
interface GltfMaterial {
  /** The name of the material. */
  name: string;
  /** The metallic-roughness factors. */
  pbrMetallicRoughness: {
    /** The linear base color and its opacity. */
    baseColorFactor: number[];
    /** The metallic factor. */
    metallicFactor: number;
    /** The roughness factor. */
    roughnessFactor: number;
  };
  /** The linear emissive color. */
  emissiveFactor?: number[];
}

/** A glTF animation sampler. */
interface GltfSampler {
  /** The accessor index of the key times. */
  input: number;
  /** How to interpolate between the keys. */
  interpolation: string;
  /** The accessor index of the key values. */
  output: number;
}

/** A glTF animation channel. */
interface GltfChannel {
  /** The index of the sampler. */
  sampler: number;
  /** The animated property. */
  target: {
    /** The index of the node. */
    node: number;
    /** The property of the node. */
    path: string;
  };
}

/** A glTF document without its buffer data. */
interface GltfDocument {
  /** What wrote the document. */
  asset: {
    /** The glTF version. */
    version: string;
    /** The name of the generator. */
    generator: string;
  };
  /** The index of the scene to show. */
  scene: number;
  /** The scenes. */
  scenes: {
    /** The name of the scene. */
    name: string;
    /** The indices of the root nodes. */
    nodes: number[];
  }[];
  /** The nodes. */
  nodes: GltfNode[];
  /** The meshes. */
  meshes: {
    /** The name of the mesh. */
    name: string;
    /** The primitives of the mesh. */
    primitives: GltfPrimitive[];
  }[];
  /** The materials. */
  materials: GltfMaterial[];
  /** The skins. */
  skins?: {
    /** The name of the skin. */
    name: string;
    /** The node index of the root bone. */
    skeleton: number;
    /** The node indices of the bones. */
    joints: number[];
    /** The accessor index of the inverse bind matrices. */
    inverseBindMatrices: number;
  }[];
  /** The animation clips. */
  animations?: {
    /** The name of the clip. */
    name: string;
    /** The samplers of the clip. */
    samplers: GltfSampler[];
    /** The channels of the clip. */
    channels: GltfChannel[];
  }[];
}

const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** The number of components of an element of each accessor type. */
const ELEMENT_SIZES: Readonly<Record<AccessorType, number>> = {
  SCALAR: 1,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

/**
 * Converts an sRGB hexadecimal color to linear RGB.
 *
 * @param {string} hex - The color as `#rrggbb`.
 * @returns {number[]} The linear red, green and blue in [0, 1].
 */
function convertHexToLinear(hex: string): number[] {
  return [1, 3, 5].map((i: number) => {
    const c: number = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    const linear: number =
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return Math.round(linear * 1e5) / 1e5;
  });
}

/**
 * Rounds the components of a vector for compact output.
 *
 * @param {Vector3} v - The vector.
 * @returns {number[]} The rounded components.
 */
function roundAll(v: Vector3): number[] {
  return v.toArray().map((x: number) => Math.round(x * 1e6) / 1e6);
}

/**
 * Names a point, so that corners at the same place share a name.
 *
 * @param {Vector3} p - The point.
 * @returns {string} The name of the point.
 */
function namePoint(p: Vector3): string {
  return p
    .toArray()
    .map((x: number) => x.toFixed(5))
    .join(',');
}

/**
 * Computes the normal of a triangle.
 *
 * @param {Readonly<Triangle>} tri - The triangle.
 * @returns {Vector3} The unit normal.
 */
function computeUnitNormal(tri: Readonly<Triangle>): Vector3 {
  return computeFaceNormal(tri[0], tri[1], tri[2]).normalize();
}

/**
 * Computes the normals that shade a shape as one rounded surface.
 *
 * @param {Shape} shape - The shape.
 * @returns {Triangle[]} The unit normals at the corners of each triangle.
 */
function computeSmoothNormals(shape: Shape): Triangle[] {
  const sums = new Map<string, Vector3>();
  for (const tri of shape) {
    const normal: Vector3 = computeUnitNormal(tri);
    tri.forEach((p: Vector3, i: number) => {
      const next: Vector3 = getItem(tri, (i + 1) % 3);
      const prev: Vector3 = getItem(tri, (i + 2) % 3);
      const angle: number = new Vector3()
        .subVectors(next, p)
        .angleTo(new Vector3().subVectors(prev, p));
      const key: string = namePoint(p);
      let sum: Vector3 | undefined = sums.get(key);
      if (sum === undefined) {
        sum = new Vector3();
        sums.set(key, sum);
      }
      sum.addScaledVector(normal, angle);
    });
  }
  const findNormal = (p: Vector3): Vector3 => {
    const sum: Vector3 | undefined = sums.get(namePoint(p));
    if (sum === undefined) {
      throw new Error('A corner has no normal.');
    }
    return sum.clone().normalize();
  };
  return shape.map(
    (tri: Triangle): Triangle => [
      findNormal(tri[0]),
      findNormal(tri[1]),
      findNormal(tri[2]),
    ],
  );
}

/**
 * Builds indexed vertex data from faces.
 *
 * @param {readonly Face[]} faces - The faces.
 * @returns {VertexData} The vertex data.
 */
function buildVertices(faces: readonly Face[]): VertexData {
  const data: VertexData = {
    positions: [],
    normals: [],
    joints: [],
    weights: [],
    indices: [],
  };
  const lookup = new Map<string, number>();
  for (const { tri, bone, normals } of faces) {
    const flat: Vector3 = computeUnitNormal(tri);
    for (const [corner, p] of tri.entries()) {
      const unit: number[] = (
        normals === undefined ? flat : getItem(normals, corner)
      ).toArray();
      const key: string = [
        ...p.toArray().map((x: number) => x.toFixed(5)),
        ...unit.map((x: number) => x.toFixed(3)),
        bone,
      ].join(',');
      let index: number | undefined = lookup.get(key);
      if (index === undefined) {
        index = data.positions.length / 3;
        lookup.set(key, index);
        data.positions.push(p.x, p.y, p.z);
        data.normals.push(...unit);
        data.joints.push(bone, 0, 0, 0);
        data.weights.push(255, 0, 0, 0);
      }
      data.indices.push(index);
    }
  }
  return data;
}

/**
 * Collects accessors into one binary buffer.
 */
class BufferWriter {
  /** The aligned chunks of the buffer. */
  readonly #chunks: Buffer[] = [];
  /** The length of the buffer so far. */
  #length = 0;
  /** The buffer views. */
  readonly #bufferViews: GltfBufferView[] = [];
  /** The accessors. */
  readonly #accessors: GltfAccessor[] = [];

  /**
   * Adds an accessor with its own buffer view.
   *
   * @param {AccessorArray} array - The data.
   * @param {number} componentType - The glTF component type.
   * @param {AccessorType} type - The glTF accessor type.
   * @param {AccessorOptions} [options] - How to describe the accessor.
   * @returns {number} The accessor index.
   */
  addAccessor(
    array: AccessorArray,
    componentType: number,
    type: AccessorType,
    { target = null, bounds = false, normalized = false }: AccessorOptions = {},
  ): number {
    const size: number = ELEMENT_SIZES[type];
    const bytes: Buffer = Buffer.from(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    const view: GltfBufferView = {
      buffer: 0,
      byteOffset: this.#length,
      byteLength: bytes.length,
    };
    if (target !== null) {
      view.target = target;
    }
    this.#bufferViews.push(view);
    const padding: number = (4 - (bytes.length % 4)) % 4;
    this.#chunks.push(bytes, Buffer.alloc(padding));
    this.#length += bytes.length + padding;
    const accessor: GltfAccessor = {
      bufferView: this.#bufferViews.length - 1,
      componentType,
      count: array.length / size,
      type,
    };
    if (normalized) {
      accessor.normalized = true;
    }
    if (bounds) {
      const min: number[] = new Array<number>(size).fill(Infinity);
      const max: number[] = new Array<number>(size).fill(-Infinity);
      array.forEach((value: number, index: number) => {
        const k: number = index % size;
        min[k] = Math.min(getItem(min, k), value);
        max[k] = Math.max(getItem(max, k), value);
      });
      accessor.min = min;
      accessor.max = max;
    }
    this.#accessors.push(accessor);
    return this.#accessors.length - 1;
  }

  /**
   * Assembles the binary glTF file.
   *
   * @param {GltfDocument} gltf - The glTF document without its buffer data.
   * @returns {Buffer} The file.
   */
  finish(gltf: GltfDocument): Buffer {
    const binary: Buffer = Buffer.concat(this.#chunks);
    const document = {
      ...gltf,
      accessors: this.#accessors,
      bufferViews: this.#bufferViews,
      buffers: [{ byteLength: binary.length }],
    };
    const text: Buffer = Buffer.from(JSON.stringify(document), 'utf8');
    const json: Buffer = Buffer.concat([
      text,
      Buffer.alloc((4 - (text.length % 4)) % 4, 0x20),
    ]);
    const header: Buffer = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + json.length + binary.length, 8);
    const jsonHeader: Buffer = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(json.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binaryHeader: Buffer = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(binary.length, 0);
    binaryHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([header, jsonHeader, json, binaryHeader, binary]);
  }
}

/**
 * A model made of triangles in plain colors, flat-shaded unless a shape
 * asks to be smooth, optionally bound to a skeleton and animated.
 */
export class Model {
  /** The name of the root node. */
  readonly name: string;
  /** The materials by name. */
  readonly materials = new Map<string, Material>();
  /** The faces by material name. */
  readonly faces = new Map<string, Face[]>();
  /** The bones. */
  readonly bones: Bone[] = [];
  /** The animation clips. */
  animations: Clip[] = [];

  /**
   * Creates an empty model.
   *
   * @param {string} name - The name of the root node.
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Defines a material.
   *
   * @param {string} name - The material name.
   * @param {string} hex - The base color as `#rrggbb`.
   * @param {MaterialOptions} [options] - The other factors.
   * @returns {this} This model.
   */
  setMaterial(
    name: string,
    hex: string,
    { roughness = 0.9, metallic = 0, emissive = null }: MaterialOptions = {},
  ): this {
    this.materials.set(name, { hex, roughness, metallic, emissive });
    return this;
  }

  /**
   * Adds a bone whose rest orientation matches the model axes.
   *
   * @param {string} name - The unique bone name.
   * @param {string | null} parent - The name of the parent bone, if any.
   * @param {Triple} head - The pivot in model space.
   * @returns {this} This model.
   * @throws {Error} If there is no such parent bone.
   */
  addBone(name: string, parent: string | null, head: Triple): this {
    const index: number = parent === null ? -1 : this.findBone(parent);
    this.bones.push({ name, parent: index, head: new Vector3(...head) });
    return this;
  }

  /**
   * Finds a bone by name.
   *
   * @param {string} name - The bone name.
   * @returns {number} The bone index.
   * @throws {Error} If there is no such bone.
   */
  findBone(name: string): number {
    const index: number = this.bones.findIndex(
      (bone: Bone) => bone.name === name,
    );
    if (index < 0) {
      throw new Error(`Unknown bone: ${name}`);
    }
    return index;
  }

  /**
   * Adds a shape in a material, rigidly attached to a bone.
   *
   * @param {string} material - The material name.
   * @param {Shape} shape - The triangles in model space.
   * @param {string | null} [bone] - The bone the shape follows.
   * @param {ShapeOptions} [options] - How to shade the shape.
   * @returns {this} This model.
   * @throws {Error} If the material is not defined, or there is no such
   *   bone.
   */
  add(
    material: string,
    shape: Shape,
    bone: string | null = null,
    { smooth = false }: ShapeOptions = {},
  ): this {
    if (!this.materials.has(material)) {
      throw new Error(`Unknown material: ${material}`);
    }
    const index: number = bone === null ? 0 : this.findBone(bone);
    let faces: Face[] | undefined = this.faces.get(material);
    if (faces === undefined) {
      faces = [];
      this.faces.set(material, faces);
    }
    if (smooth) {
      const normals: Triangle[] = computeSmoothNormals(shape);
      shape.forEach((tri: Triangle, i: number) => {
        faces.push({ tri, bone: index, normals: getItem(normals, i) });
      });
    } else {
      for (const tri of shape) {
        faces.push({ tri, bone: index });
      }
    }
    return this;
  }

  /**
   * Adds an animation clip.
   *
   * @param {string} name - The clip name.
   * @param {number[]} times - The key times in seconds.
   * @param {Track[]} tracks - The tracks.
   * @returns {this} This model.
   */
  addAnimation(name: string, times: number[], tracks: Track[]): this {
    this.animations.push({ name, times, tracks });
    return this;
  }

  /**
   * Counts the triangles.
   *
   * @returns {number} The number of triangles.
   */
  countTriangles(): number {
    let count = 0;
    for (const faces of this.faces.values()) {
      count += faces.length;
    }
    return count;
  }

  /**
   * Lists every corner of every face with the bone it follows.
   *
   * @returns {Corner[]} The corners.
   */
  listCorners(): Corner[] {
    const out: Corner[] = [];
    for (const faces of this.faces.values()) {
      for (const { tri, bone } of faces) {
        for (const point of tri) {
          out.push({ point, bone });
        }
      }
    }
    return out;
  }

  /**
   * Moves the model so that its footprint is centered on the origin and its
   * lowest point rests on the ground.
   *
   * @returns {this} This model.
   */
  centerFootprint(): this {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const corners: Corner[] = this.listCorners();
    for (const { point } of corners) {
      min.min(point);
      max.max(point);
    }
    this.#shiftCorners(
      corners,
      new Vector3(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2),
    );
    return this;
  }

  /**
   * Moves the whole model, with its skeleton and its animations, so that
   * the middle of the geometry of the given bones stands over the origin,
   * and raises it by a millimeter to keep rounding errors above the ground.
   *
   * @param {readonly string[]} names - The bones whose geometry to center,
   *   such as the feet; when empty, the model is only raised.
   * @returns {this} This model.
   * @throws {Error} If there is no such bone.
   */
  centerOn(names: readonly string[]): this {
    const wanted: number[] = names.map((name: string) => this.findBone(name));
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const corners: Corner[] = this.listCorners();
    for (const { point, bone } of corners) {
      if (wanted.includes(bone)) {
        min.min(point);
        max.max(point);
      }
    }
    const shift: Vector3 =
      wanted.length === 0
        ? new Vector3(0, 0.001, 0)
        : new Vector3(-(min.x + max.x) / 2, 0.001, -(min.z + max.z) / 2);
    this.#shiftCorners(corners, shift);
    for (const bone of this.bones) {
      bone.head.add(shift);
    }
    this.animations = this.animations.map(
      (clip: Clip): Clip => ({
        ...clip,
        tracks: clip.tracks.map(
          (track: Track): Track =>
            track.path !== 'translation'
              ? track
              : {
                  ...track,
                  values: track.values.map(
                    (value: number, i: number) =>
                      value + shift.getComponent(i % 3),
                  ),
                },
        ),
      }),
    );
    return this;
  }

  /**
   * Serializes the model.
   *
   * @returns {Buffer} The binary glTF 2.0 file.
   */
  encodeGlb(): Buffer {
    const writer = new BufferWriter();
    const rigged: boolean = this.bones.length > 0;
    const groups: [string, Face[]][] = [...this.faces];
    const primitives: GltfPrimitive[] = groups.map(
      ([, faces]: [string, Face[]], index: number): GltfPrimitive => {
        const data: VertexData = buildVertices(faces);
        const attributes: Record<string, number> = {
          POSITION: writer.addAccessor(
            new Float32Array(data.positions),
            FLOAT,
            'VEC3',
            { target: ARRAY_BUFFER, bounds: true },
          ),
          NORMAL: writer.addAccessor(
            new Float32Array(data.normals),
            FLOAT,
            'VEC3',
            { target: ARRAY_BUFFER },
          ),
        };
        if (rigged) {
          attributes.JOINTS_0 = writer.addAccessor(
            new Uint8Array(data.joints),
            UNSIGNED_BYTE,
            'VEC4',
            { target: ARRAY_BUFFER },
          );
          attributes.WEIGHTS_0 = writer.addAccessor(
            new Uint8Array(data.weights),
            UNSIGNED_BYTE,
            'VEC4',
            { target: ARRAY_BUFFER, normalized: true },
          );
        }
        const indices: number = writer.addAccessor(
          new Uint16Array(data.indices),
          UNSIGNED_SHORT,
          'SCALAR',
          { target: ELEMENT_ARRAY_BUFFER },
        );
        return { attributes, indices, material: index, mode: 4 };
      },
    );
    const materials: GltfMaterial[] = groups.map(
      ([name]: [string, Face[]]): GltfMaterial => {
        const source: Material | undefined = this.materials.get(name);
        if (source === undefined) {
          throw new Error(`Unknown material: ${name}`);
        }
        const material: GltfMaterial = {
          name,
          pbrMetallicRoughness: {
            baseColorFactor: [...convertHexToLinear(source.hex), 1],
            metallicFactor: source.metallic,
            roughnessFactor: source.roughness,
          },
        };
        if (source.emissive !== null) {
          material.emissiveFactor = convertHexToLinear(source.emissive);
        }
        return material;
      },
    );
    const root: GltfNode = { name: this.name };
    const gltf: GltfDocument = {
      asset: { version: '2.0', generator: 'Clovervale model generator' },
      scene: 0,
      scenes: [{ name: 'Scene', nodes: [0] }],
      nodes: [root],
      meshes: [{ name: `${this.name}Mesh`, primitives }],
      materials,
    };
    if (rigged) {
      this.#writeRig(gltf, writer);
    } else {
      root.mesh = 0;
    }
    return writer.finish(gltf);
  }

  /**
   * Moves every corner once, however many faces share it.
   *
   * @param {readonly Corner[]} corners - The corners.
   * @param {Vector3} shift - How far to move them.
   */
  #shiftCorners(corners: readonly Corner[], shift: Vector3): void {
    const seen = new Set<Vector3>();
    for (const { point } of corners) {
      if (!seen.has(point)) {
        seen.add(point);
        point.add(shift);
      }
    }
  }

  /**
   * Adds the skeleton, the skin and the animations to a glTF document.
   *
   * @param {GltfDocument} gltf - The glTF document.
   * @param {BufferWriter} writer - The buffer writer.
   */
  #writeRig(gltf: GltfDocument, writer: BufferWriter): void {
    const first = 2;
    gltf.nodes.push({ name: `${this.name}Body`, mesh: 0, skin: 0 });
    getItem(gltf.nodes, 0).children = [1];
    const inverse: number[] = [];
    this.bones.forEach((bone: Bone, index: number) => {
      const origin: Vector3 =
        bone.parent < 0
          ? new Vector3()
          : getItem(this.bones, bone.parent).head;
      const offset: Vector3 = new Vector3().subVectors(bone.head, origin);
      const node: GltfNode = { name: bone.name, translation: roundAll(offset) };
      gltf.nodes.push(node);
      const parent: GltfNode = getItem(
        gltf.nodes,
        bone.parent < 0 ? 0 : first + bone.parent,
      );
      parent.children = [...(parent.children ?? []), first + index];
      inverse.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0);
      inverse.push(-bone.head.x, -bone.head.y, -bone.head.z, 1);
    });
    const root: number = this.bones.findIndex((bone: Bone) => bone.parent < 0);
    gltf.skins = [
      {
        name: `${this.name}Skin`,
        skeleton: first + root,
        joints: this.bones.map((_: Bone, index: number) => first + index),
        inverseBindMatrices: writer.addAccessor(
          new Float32Array(inverse),
          FLOAT,
          'MAT4',
        ),
      },
    ];
    gltf.animations = this.animations.map(({ name, times, tracks }: Clip) => {
      const input: number = writer.addAccessor(
        new Float32Array(times),
        FLOAT,
        'SCALAR',
        { bounds: true },
      );
      const samplers: GltfSampler[] = [];
      const channels: GltfChannel[] = [];
      for (const { bone, path, values } of tracks) {
        samplers.push({
          input,
          interpolation: 'LINEAR',
          output: writer.addAccessor(
            new Float32Array(values),
            FLOAT,
            path === 'rotation' ? 'VEC4' : 'VEC3',
          ),
        });
        channels.push({
          sampler: samplers.length - 1,
          target: { node: first + bone, path },
        });
      }
      return { name, samplers, channels };
    });
  }
}
