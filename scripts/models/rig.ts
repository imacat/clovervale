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
 * @module scripts/models/rig Posing the models and baking their animations.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';

import { createRotation } from './geometry.ts';
import type { Triple } from './geometry.ts';
import { getItem } from './items.ts';
import type { Bone, Model, Track } from './model.ts';

/** How a move speeds up and slows down. */
export type Ease = 'linear' | 'smooth' | 'in' | 'out';

/**
 * The X, Y and Z angles in degrees by bone name; the `offset` key holds the
 * offset of the root bone instead.
 */
export type PoseSpec = Readonly<Record<string, Triple>>;

/** A pose at a moment of a clip. */
export interface PoseKey {
  /** The time in seconds. */
  readonly t: number;
  /** The pose at that time. */
  readonly pose: Pose;
  /** How the move that arrives at the pose speeds up and slows down. */
  readonly ease?: Ease;
}

/** The pose of a frame of a clip. */
export interface PoseSample {
  /** The pose. */
  readonly pose: Pose;
  /** How strongly the lowest point is pulled onto the ground, in [0, 1]. */
  readonly snap?: number;
}

/** The upper leg, lower leg and foot bones of a leg. */
export type LegBones = readonly [string, string, string];

/** How a foot meets the target of its leg. */
export interface LegOptions {
  /** The pitch of the foot in degrees, positive with the toes down. */
  readonly pitch?: number;
  /** The heading of the foot and the knee in degrees. */
  readonly yaw?: number;
}

/** How to bake a clip. */
export interface BakeOptions {
  /** Whether the last frame repeats the first one. */
  readonly loop?: boolean;
  /** Whether the clip ends on the pose it starts from. */
  readonly settle?: boolean;
  /** The frames per second. */
  readonly fps?: number;
}

/** What was measured while baking a clip. */
export interface ClipReport {
  /** The most a frame was lifted to stay above the ground, in metres. */
  lift: number;
  /** The most a leg target was beyond the reach of the leg, in metres. */
  overreach?: number;
}

/** A model as built, with what was measured while baking its clips. */
export interface BuiltModel {
  /** The model. */
  readonly model: Model;
  /** The measurements of the baked clips, by clip name. */
  readonly report?: ReadonlyMap<string, ClipReport>;
}

/** Where every bone is in model space. */
interface SolvedPose {
  /** The pivot of every bone. */
  readonly positions: Vector3[];
  /** The orientation of every bone. */
  readonly rotations: Quaternion[];
}

/**
 * Eases a value in [0, 1].
 *
 * @param {number} x - The linear progress.
 * @param {Ease} [ease] - How the move speeds up and slows down.
 * @returns {number} The eased progress.
 */
export function easeProgress(x: number, ease: Ease = 'smooth'): number {
  const t: number = Math.min(Math.max(x, 0), 1);
  switch (ease) {
    case 'linear':
      return t;
    case 'in':
      return t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'smooth':
      return t * t * (3 - 2 * t);
  }
}

/**
 * Computes the orientation of a limb bone that hangs down at rest.
 *
 * @param {Vector3} direction - The direction the limb points in.
 * @param {Vector3} side - The direction of the local X axis, roughly.
 * @returns {Quaternion} The orientation in model space.
 */
function alignLimb(direction: Vector3, side: Vector3): Quaternion {
  const y: Vector3 = direction.clone().negate();
  const z: Vector3 = new Vector3().crossVectors(side, y).normalize();
  const x: Vector3 = new Vector3().crossVectors(y, z);
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(x, y, z),
  );
}

/**
 * A pose: the local rotation of every bone and the offset of the root bone
 * from its rest position.
 */
export class Pose {
  /** The local rotations. */
  readonly rotations: Quaternion[];
  /** The offset of the root bone. */
  readonly offset = new Vector3();

  /**
   * Creates the rest pose.
   *
   * @param {number} count - The number of bones.
   */
  constructor(count: number) {
    this.rotations = Array.from({ length: count }, () => new Quaternion());
  }

  /**
   * Copies this pose.
   *
   * @returns {Pose} The copy.
   */
  clone(): Pose {
    const copy = new Pose(this.rotations.length);
    this.rotations.forEach((q: Quaternion, i: number) => {
      getItem(copy.rotations, i).copy(q);
    });
    copy.offset.copy(this.offset);
    return copy;
  }

  /**
   * Blends this pose towards another one.
   *
   * @param {Pose} other - The other pose.
   * @param {number} weight - The weight of the other pose in [0, 1].
   * @returns {Pose} The blended pose.
   */
  blend(other: Pose, weight: number): Pose {
    const out: Pose = this.clone();
    out.rotations.forEach((q: Quaternion, i: number) => {
      q.slerp(getItem(other.rotations, i), weight);
    });
    out.offset.lerp(other.offset, weight);
    return out;
  }
}

/**
 * The skeleton of a model, able to pose it and to bake animation clips.
 */
export class Rig {
  /** The rigged model. */
  readonly model: Model;
  /** The measurements of the baked clips, by clip name. */
  readonly report = new Map<string, ClipReport>();
  /** The bones of the model. */
  readonly #bones: readonly Bone[];
  /** The corners that follow each bone, from its pivot. */
  #corners: Vector3[][] | null = null;

  /**
   * Creates the rig of a model.
   *
   * @param {Model} model - The rigged model.
   */
  constructor(model: Model) {
    this.model = model;
    this.#bones = model.bones;
  }

  /**
   * Creates a pose from Euler angles.
   *
   * @param {PoseSpec} [spec] - The angles of the bones that are not at
   *   rest, and the offset of the root bone.
   * @returns {Pose} The pose.
   * @throws {Error} If there is no such bone.
   */
  createPose(spec: PoseSpec = {}): Pose {
    const pose = new Pose(this.#bones.length);
    for (const [name, value] of Object.entries(spec)) {
      if (name === 'offset') {
        pose.offset.set(...value);
      } else {
        getItem(pose.rotations, this.model.findBone(name)).copy(
          createRotation(value),
        );
      }
    }
    return pose;
  }

  /**
   * Interpolates between keyed poses.
   *
   * @param {readonly PoseKey[]} keys - The keys in time order.
   * @param {number} time - The time.
   * @returns {Pose} The pose at that time.
   */
  interpolate(keys: readonly PoseKey[], time: number): Pose {
    const first: PoseKey = getItem(keys, 0);
    if (time <= first.t) {
      return first.pose.clone();
    }
    for (let i = 1; i < keys.length; i++) {
      const b: PoseKey = getItem(keys, i);
      if (time <= b.t) {
        const a: PoseKey = getItem(keys, i - 1);
        const weight: number = easeProgress((time - a.t) / (b.t - a.t), b.ease);
        return a.pose.blend(b.pose, weight);
      }
    }
    return getItem(keys, keys.length - 1).pose.clone();
  }

  /**
   * Bends a two-bone leg so that its ankle reaches a target.
   *
   * @param {Pose} pose - The pose to change.
   * @param {LegBones} names - The upper leg, lower leg and foot bones.
   * @param {Triple} target - The ankle position in model space.
   * @param {LegOptions} [options] - How the foot meets the target.
   * @returns {number} How far the target is beyond the reach of the leg.
   * @throws {Error} If there is no such bone.
   */
  reachLeg(
    pose: Pose,
    names: LegBones,
    target: Triple,
    { pitch = 0, yaw = 0 }: LegOptions = {},
  ): number {
    const upper: number = this.model.findBone(names[0]);
    const lower: number = this.model.findBone(names[1]);
    const foot: number = this.model.findBone(names[2]);
    const upperHead: Vector3 = getItem(this.#bones, upper).head;
    const lowerHead: Vector3 = getItem(this.#bones, lower).head;
    const footHead: Vector3 = getItem(this.#bones, foot).head;
    const solved: SolvedPose = this.#solve(pose);
    const parentRotation: Quaternion = getItem(
      solved.rotations,
      getItem(this.#bones, upper).parent,
    );
    const hip: Vector3 = getItem(solved.positions, upper);
    const a: number = upperHead.distanceTo(lowerHead);
    const b: number = lowerHead.distanceTo(footHead);
    const toTarget: Vector3 = new Vector3(...target).sub(hip);
    const distance: number = toTarget.length();
    const reach: number = Math.min(Math.max(distance, 1e-4), (a + b) * 0.999);
    const direction: Vector3 = toTarget.clone().normalize();
    const heading: Quaternion = createRotation([0, yaw, 0]);
    const pole: Vector3 = new Vector3(0, 0, 1).applyQuaternion(heading);
    const side: Vector3 = new Vector3()
      .crossVectors(pole, direction)
      .normalize();
    const forward: Vector3 = new Vector3().crossVectors(direction, side);
    const cos: number = (a * a + reach * reach - b * b) / (2 * a * reach);
    const angle: number = Math.acos(Math.min(Math.max(cos, -1), 1));
    const kneeDirection: Vector3 = direction
      .clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(forward, Math.sin(angle));
    const knee: Vector3 = hip.clone().addScaledVector(kneeDirection, a);
    const ankle: Vector3 = hip.clone().addScaledVector(direction, reach);
    const shinDirection: Vector3 = ankle.sub(knee).normalize();
    const upperRotation: Quaternion = alignLimb(kneeDirection, side);
    const lowerRotation: Quaternion = alignLimb(shinDirection, side);
    const footRotation: Quaternion = heading
      .clone()
      .multiply(createRotation([pitch, 0, 0]));
    getItem(pose.rotations, upper).copy(
      parentRotation.clone().invert().multiply(upperRotation),
    );
    getItem(pose.rotations, lower).copy(
      upperRotation.clone().invert().multiply(lowerRotation),
    );
    getItem(pose.rotations, foot).copy(
      lowerRotation.clone().invert().multiply(footRotation),
    );
    return Math.max(distance - (a + b), 0);
  }

  /**
   * Bakes a clip into the model.
   *
   * Frames are lifted when needed so that nothing sinks below the ground,
   * on the frames and between them, and the measurements are kept in the
   * report of the rig.  The first frame is never changed, and neither is the
   * last one of a clip that ends on the pose it starts from.
   *
   * @param {string} name - The clip name.
   * @param {number} duration - The length in seconds.
   * @param {(time: number) => PoseSample} sample - Returns the pose at a
   *   time.
   * @param {BakeOptions} [options] - How to bake the clip.
   */
  bake(
    name: string,
    duration: number,
    sample: (time: number) => PoseSample,
    { loop = false, settle = false, fps = 30 }: BakeOptions = {},
  ): void {
    const frames: number = Math.round(duration * fps);
    const times: number[] = [];
    const poses: Pose[] = [];
    let lift = 0;
    for (let f = 0; f <= frames; f++) {
      const time: number = (duration * f) / frames;
      times.push(time);
      if (loop && f === frames) {
        poses.push(getItem(poses, 0));
        continue;
      }
      const { pose, snap = 0 } = sample(time);
      const gap: number = 0.002 - this.#measureLowest(pose);
      const shift: number = gap > 0 ? gap : gap * snap;
      pose.offset.y += shift;
      lift = Math.max(lift, shift);
      poses.push(pose);
    }
    const pinned = new Set<Pose>([getItem(poses, 0)]);
    if (settle) {
      pinned.add(getItem(poses, frames));
    }
    for (let pass = 0; pass < 6; pass++) {
      for (let f = 0; f < frames; f++) {
        for (let step = 1; step < 8; step++) {
          const a: Pose = getItem(poses, f);
          const b: Pose = getItem(poses, f + 1);
          const weight: number = step / 8;
          const gap: number = 0.001 - this.#measureLowest(a.blend(b, weight));
          if (gap <= 0) {
            continue;
          }
          if (!pinned.has(a) && !pinned.has(b)) {
            a.offset.y += gap;
            b.offset.y += gap;
          } else if (!pinned.has(b)) {
            b.offset.y += gap / weight;
          } else if (!pinned.has(a)) {
            a.offset.y += gap / (1 - weight);
          }
          lift = Math.max(lift, gap);
        }
      }
    }
    const tracks: Track[] = [];
    this.#bones.forEach((bone: Bone, i: number) => {
      const values: number[] = [];
      const last = new Quaternion();
      poses.forEach((pose: Pose, f: number) => {
        const q: Quaternion = getItem(pose.rotations, i).clone().normalize();
        if (f > 0 && q.dot(last) < 0) {
          q.set(-q.x, -q.y, -q.z, -q.w);
        }
        last.copy(q);
        values.push(q.x, q.y, q.z, q.w);
      });
      tracks.push({ bone: i, path: 'rotation', values });
      if (bone.parent < 0) {
        const translation: number[] = [];
        for (const pose of poses) {
          translation.push(...bone.head.clone().add(pose.offset).toArray());
        }
        tracks.push({ bone: i, path: 'translation', values: translation });
      }
    });
    this.model.addAnimation(name, times, tracks);
    this.report.set(name, { lift });
  }

  /**
   * Notes the most a leg target was beyond the reach of its leg in a clip.
   *
   * @param {string} name - The name of a baked clip.
   * @param {number} overreach - The distance, in metres.
   * @throws {Error} If no such clip is baked.
   */
  noteOverreach(name: string, overreach: number): void {
    const report: ClipReport | undefined = this.report.get(name);
    if (report === undefined) {
      throw new Error(`Unknown clip: ${name}`);
    }
    report.overreach = overreach;
  }

  /**
   * Computes where every bone is in model space.
   *
   * @param {Pose} pose - The pose.
   * @returns {SolvedPose} The pivot and the orientation of every bone.
   */
  #solve(pose: Pose): SolvedPose {
    const positions: Vector3[] = [];
    const rotations: Quaternion[] = [];
    this.#bones.forEach((bone: Bone, i: number) => {
      const rotation: Quaternion = getItem(pose.rotations, i);
      if (bone.parent < 0) {
        positions.push(bone.head.clone().add(pose.offset));
        rotations.push(rotation.clone());
      } else {
        const parent: Bone = getItem(this.#bones, bone.parent);
        const parentRotation: Quaternion = getItem(rotations, bone.parent);
        const offset: Vector3 = new Vector3()
          .subVectors(bone.head, parent.head)
          .applyQuaternion(parentRotation);
        positions.push(offset.add(getItem(positions, bone.parent)));
        rotations.push(parentRotation.clone().multiply(rotation));
      }
    });
    return { positions, rotations };
  }

  /**
   * Measures the lowest point of the posed model.
   *
   * @param {Pose} pose - The pose.
   * @returns {number} The lowest Y.
   */
  #measureLowest(pose: Pose): number {
    this.#corners ??= this.#collectCorners();
    const { positions, rotations } = this.#solve(pose);
    const row = new Vector3();
    let lowest = Infinity;
    this.#corners.forEach((corners: Vector3[], i: number) => {
      const e: number[] = new Matrix4()
        .makeRotationFromQuaternion(getItem(rotations, i))
        .toArray();
      row.set(getItem(e, 1), getItem(e, 5), getItem(e, 9));
      const y: number = getItem(positions, i).y;
      for (const corner of corners) {
        lowest = Math.min(lowest, y + row.dot(corner));
      }
    });
    return lowest;
  }

  /**
   * Collects the distinct corners that follow each bone.
   *
   * @returns {Vector3[][]} The corners of each bone, from its pivot.
   */
  #collectCorners(): Vector3[][] {
    const corners: Vector3[][] = this.#bones.map(() => []);
    const seen: Set<string>[] = this.#bones.map(() => new Set<string>());
    for (const { point, bone } of this.model.listCorners()) {
      const key: string = point
        .toArray()
        .map((x: number) => x.toFixed(4))
        .join(',');
      const known: Set<string> = getItem(seen, bone);
      if (!known.has(key)) {
        known.add(key);
        getItem(corners, bone).push(
          new Vector3().subVectors(point, getItem(this.#bones, bone).head),
        );
      }
    }
    return corners;
  }
}
