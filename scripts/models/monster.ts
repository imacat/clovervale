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
 * @module scripts/models/monster The monster that appears outside the valley.
 */

import { SIDES, computeStep } from './characters.ts';
import type { Gait, Step } from './characters.ts';
import {
  createBox,
  createCone,
  createEllipsoid,
  createExtrusion,
  createTube,
  place,
} from './geometry.ts';
import type { Pair, Placement, Shape, Triple } from './geometry.ts';
import { Model } from './model.ts';
import { Rig, easeProgress } from './rig.ts';
import type {
  BuiltModel,
  ClipReport,
  LegBones,
  Pose,
  PoseKey,
  PoseSample,
  PoseSpec,
} from './rig.ts';

/** A leg of the dog. */
interface Leg {
  /** The upper leg, lower leg and paw bones. */
  readonly bones: LegBones;
  /** The X of the paw at rest. */
  readonly x: number;
  /** The Z of the paw at rest. */
  readonly z: number;
  /** Whether the joint between the bones bends backwards. */
  readonly isKneeBackward: boolean;
  /** The phase of the leg in the trot. */
  readonly phase: number;
}

/** One degree, in radians. */
const DEG: number = Math.PI / 180;
/** The X of the front paws. */
const FRONT_X = 0.14;
/** The X of the hind paws. */
const HIND_X = 0.15;
/** The Z of the front paws. */
const FRONT_Z = 0.29;
/** The Z of the hind paws. */
const HIND_Z = -0.29;
/** The height of the ankles above the soles. */
const ANKLE = 0.07;
/** The centre of the head in the rest pose. */
const HEAD_CENTRE: Triple = [0, 0.84, 0.43];
/** The radii of the head. */
const HEAD_RADII: Triple = [0.26, 0.23, 0.23];
/**
 * The tufts on each cheek: the angle below the equator of the head and the
 * tilt from upright, both in degrees, and the length.
 */
const CHEEK_TUFTS: readonly Triple[] = [
  [24, 112, 0.12],
  [8, 98, 0.1],
];
/**
 * How long a walk cycle lasts, in seconds, with two trot strides in it: the
 * longest the model check allows, so that the 1.5 metres the check expects
 * of a cycle come nearest to the speeds the dog moves at.
 */
const WALK_DURATION = 1.1;
/** How a paw trots: twice in a walk cycle, half its distance each time. */
const GAIT: Gait = {
  duty: 0.42,
  stride: 0.75,
  lift: 0.08,
  ankle: ANKLE,
  heel: 0.06,
  toe: 0.1,
  strike: 6,
  push: 20,
  centre: 0,
};
/**
 * The legs.  The paw bones start with `Foot`, as the model check expects
 * of every paw that walks.
 */
const LEGS: readonly Leg[] = SIDES.flatMap(
  ([side, x]: readonly [string, number]): Leg[] => [
    {
      bones: [`FrontLeg${side}`, `FrontShin${side}`, `FootFront${side}`],
      x: FRONT_X * x,
      z: FRONT_Z,
      isKneeBackward: false,
      phase: x > 0 ? 0.5 : 0,
    },
    {
      bones: [`HindLeg${side}`, `HindShin${side}`, `FootHind${side}`],
      x: HIND_X * x,
      z: HIND_Z,
      isKneeBackward: true,
      phase: x > 0 ? 0 : 0.5,
    },
  ],
);

/**
 * Finds a point on the surface of the head.
 *
 * @param {number} yaw - The angle from the front towards the left, in
 *   degrees.
 * @param {number} down - The angle below the equator, in degrees.
 * @param {number} [factor] - The distance from the centre, in head radii.
 * @returns {Triple} The point in model space.
 */
function findHeadPoint(yaw: number, down: number, factor = 1): Triple {
  const direction: Triple = [
    Math.sin(yaw * DEG) * Math.cos(down * DEG),
    -Math.sin(down * DEG),
    Math.cos(yaw * DEG) * Math.cos(down * DEG),
  ];
  return [
    HEAD_CENTRE[0] + direction[0] * HEAD_RADII[0] * factor,
    HEAD_CENTRE[1] + direction[1] * HEAD_RADII[1] * factor,
    HEAD_CENTRE[2] + direction[2] * HEAD_RADII[2] * factor,
  ];
}

/**
 * Creates a tuft of fur: a flat four-sided spike standing on the origin.
 *
 * @param {number} size - The length of the tuft.
 * @returns {Shape} The tuft.
 */
function createTuft(size: number): Shape {
  return place(createCone(0.38 * size, 0, size, 4), { scale: [1, 1, 0.5] });
}

/**
 * Creates the shape of an ear, standing on the origin and pointing up.
 *
 * @param {boolean} isFolded - Whether the tip folds over forwards.
 * @param {number} scale - The scale of the ear.
 * @returns {Shape} The ear.
 */
function createEar(isFolded: boolean, scale: number): Shape {
  const createSegment = (bottom: number, top: number, height: number): Shape =>
    place(createCone(bottom * scale, top * scale, height * scale, 4), {
      scale: [1, 1, 0.42],
    });
  if (!isFolded) {
    return createSegment(0.09, 0, 0.21);
  }
  return [
    ...createSegment(0.09, 0.042, 0.12),
    ...place(createSegment(0.042, 0, 0.1), {
      pos: [0, 0.115 * scale, 0],
      rot: [75, 0, 0],
    }),
  ];
}

/**
 * Builds the mesh and the skeleton of the monster: a scruffy stray dog with
 * a big head, tan fur with a dark saddle and a patch over one eye, a cream
 * muzzle and chest, one ear folded over, raised hackles and small fangs.
 *
 * @returns {Model} The model without animations.
 */
function buildBody(): Model {
  const model = new Model('Monster');
  model.setMaterial('fur', '#c48a50');
  model.setMaterial('dark', '#6e4a2e');
  model.setMaterial('cream', '#f3e2bd');
  model.setMaterial('inner', '#d9897a');
  model.setMaterial('nose', '#2e2420', { roughness: 0.5 });
  model.setMaterial('eye', '#e8a32e', { roughness: 0.5 });
  model.setMaterial('pupil', '#231814', { roughness: 0.5 });
  model.setMaterial('white', '#ffffff', { roughness: 0.5 });
  model.setMaterial('mouth', '#b9483f');
  model.setMaterial('claw', '#4a3a30');

  model.addBone('Hips', null, [0, 0.5, -0.17]);
  model.addBone('Chest', 'Hips', [0, 0.52, 0.12]);
  model.addBone('Head', 'Chest', [0, 0.66, 0.3]);
  model.addBone('Jaw', 'Head', [0, 0.72, 0.55]);
  model.addBone('Tail1', 'Hips', [0, 0.6, -0.4]);
  model.addBone('Tail2', 'Tail1', [0, 0.72, -0.58]);
  for (const [side, x] of SIDES) {
    model.addBone(`Ear${side}`, 'Head', [0.13 * x, 0.98, 0.42]);
  }
  for (const leg of LEGS) {
    const [upper, lower, paw] = leg.bones;
    const parent: string = leg.isKneeBackward ? 'Hips' : 'Chest';
    model.addBone(upper, parent, [leg.x, 0.48, leg.z]);
    model.addBone(lower, upper, [leg.x, 0.27, leg.z]);
    model.addBone(paw, lower, [leg.x, ANKLE, leg.z]);
  }

  model.add(
    'fur',
    place(createEllipsoid([0.2, 0.19, 0.27], 1), {
      pos: [0, 0.53, -0.17],
      rot: [6, 0, 0],
    }),
    'Hips',
  );
  model.add(
    'dark',
    place(createEllipsoid([0.17, 0.075, 0.25], 1), {
      pos: [0, 0.665, -0.13],
      rot: [5, 0, 0],
    }),
    'Hips',
  );
  model.add(
    'fur',
    place(createEllipsoid([0.21, 0.22, 0.24], 1), { pos: [0, 0.55, 0.12] }),
    'Chest',
  );
  model.add(
    'cream',
    place(createEllipsoid([0.15, 0.16, 0.1], 1), { pos: [0, 0.5, 0.29] }),
    'Chest',
  );
  const hackles: readonly (readonly [string, number, number, number])[] = [
    ['Chest', 0.75, 0.1, 0.1],
    ['Hips', 0.73, -0.04, 0.11],
    ['Hips', 0.72, -0.17, 0.09],
  ];
  for (const [bone, y, z, size] of hackles) {
    model.add(
      'dark',
      place(createTuft(size), { pos: [0, y, z], rot: [-70, 0, 0] }),
      bone,
    );
  }

  model.add(
    'fur',
    place(createEllipsoid(HEAD_RADII, 2), { pos: HEAD_CENTRE }),
    'Head',
    { smooth: true },
  );
  model.add(
    'dark',
    place(createEllipsoid([0.085, 0.08, 0.03], 1), {
      pos: findHeadPoint(-27, -8, 0.92),
      rot: [-8, -27, 0],
    }),
    'Head',
  );
  model.add(
    'cream',
    place(createEllipsoid([0.12, 0.095, 0.17], 1), { pos: [0, 0.75, 0.67] }),
    'Head',
  );
  model.add(
    'nose',
    place(createEllipsoid([0.05, 0.035, 0.035], 1), {
      pos: [0, 0.805, 0.825],
    }),
    'Head',
  );
  for (const [, x] of SIDES) {
    model.add(
      'eye',
      place(createEllipsoid([0.05, 0.058, 0.02], 1), {
        pos: findHeadPoint(27 * x, -8, 0.985),
        rot: [-8, 27 * x, 0],
      }),
      'Head',
    );
    model.add(
      'pupil',
      place(createEllipsoid([0.03, 0.04, 0.015], 1), {
        pos: findHeadPoint(26 * x, -8, 1.02),
        rot: [-8, 26 * x, 0],
      }),
      'Head',
    );
    model.add(
      'white',
      place(createEllipsoid([0.012, 0.016, 0.008], 0), {
        pos: findHeadPoint(24 * x, -13, 1.045),
        rot: [-13, 24 * x, 0],
      }),
      'Head',
    );
    model.add(
      'dark',
      place(createBox(0.1, 0.024, 0.03), {
        pos: findHeadPoint(25 * x, -26, 1),
        rot: [-26, 25 * x, 17 * x],
      }),
      'Head',
    );
    for (const [down, tilt, size] of CHEEK_TUFTS) {
      model.add(
        'fur',
        place(createTuft(size), {
          pos: findHeadPoint(78 * x, down, 0.9),
          rot: [0, 0, -tilt * x],
        }),
        'Head',
      );
    }
    model.add(
      'claw',
      place(createCone(0.016, 0, 0.05, 3), {
        pos: [0.06 * x, 0.69, 0.76],
        rot: [180, 0, 0],
      }),
      'Head',
    );
    model.add(
      'claw',
      place(createCone(0.014, 0, 0.04, 3), {
        pos: [0.045 * x, 0.69, 0.78],
      }),
      'Jaw',
    );
  }
  model.add(
    'dark',
    place(createTuft(0.1), {
      pos: findHeadPoint(0, -70, 0.9),
      rot: [-40, 0, 0],
    }),
    'Head',
  );

  model.add(
    'cream',
    place(createEllipsoid([0.085, 0.04, 0.12], 1), { pos: [0, 0.675, 0.7] }),
    'Jaw',
  );
  model.add(
    'mouth',
    place(createEllipsoid([0.07, 0.02, 0.1], 1), { pos: [0, 0.698, 0.7] }),
    'Jaw',
  );

  for (const [side, x] of SIDES) {
    const placement: Placement = {
      pos: [0.13 * x, 0.97, 0.42],
      rot: [-6, 0, -16 * x],
    };
    model.add(
      'fur',
      place(createEar(side === 'R', 1.2), placement),
      `Ear${side}`,
    );
    model.add(
      'inner',
      place(createEar(side === 'R', 0.8), {
        ...placement,
        pos: [0.13 * x, 0.98, 0.44],
      }),
      `Ear${side}`,
    );
  }

  model.add(
    'fur',
    createTube(
      [
        [0, 0.6, -0.38],
        [0, 0.66, -0.49],
        [0, 0.72, -0.58],
      ],
      [0.05, 0.06, 0.07],
      6,
      [0, 1, 0],
    ),
    'Tail1',
  );
  model.add(
    'fur',
    createTube(
      [
        [0, 0.71, -0.57],
        [0, 0.79, -0.69],
        [0, 0.83, -0.8],
      ],
      [0.075, 0.075, 0.05],
      6,
      [0, 1, 0],
    ),
    'Tail2',
  );
  model.add(
    'cream',
    createTube(
      [
        [0, 0.825, -0.78],
        [0, 0.84, -0.88],
      ],
      [0.055, 0.015],
      6,
      [0, 1, 0],
    ),
    'Tail2',
  );

  for (const leg of LEGS) {
    const [upper, lower, paw] = leg.bones;
    const { x, z } = leg;
    const upperRadii: Triple = leg.isKneeBackward
      ? [0.09, 0.15, 0.13]
      : [0.075, 0.13, 0.09];
    model.add(
      'fur',
      place(createEllipsoid(upperRadii, 1), { pos: [x, 0.44, z] }),
      upper,
    );
    model.add(
      'fur',
      createTube(
        [
          [x, 0.44, z],
          [x, 0.27, z],
        ],
        [0.055, 0.05],
        6,
      ),
      upper,
    );
    model.add(
      'fur',
      createTube(
        [
          [x, 0.3, z],
          [x, 0.17, z],
          [x, ANKLE, z],
        ],
        [0.05, 0.045, 0.048],
        6,
      ),
      lower,
    );
    model.add(
      'cream',
      place(
        createExtrusion(
          [
            [-GAIT.heel, 0],
            [GAIT.toe, 0],
            [0.112, 0.035],
            [0.085, 0.072],
            [-0.02, 0.09],
            [-0.066, 0.05],
          ],
          0.11,
        ),
        { pos: [x, 0, z], rot: [0, -90, 0] },
      ),
      paw,
    );
    for (const dx of [-0.032, 0, 0.032]) {
      model.add(
        'claw',
        place(createCone(0.013, 0, 0.035, 3), {
          pos: [x + dx, 0.035, z + 0.1],
          rot: [100, 0, 0],
        }),
        paw,
      );
    }
  }
  return model;
}

/**
 * Adds the four animation clips to the monster.
 *
 * @param {Model} model - The monster.
 * @returns {ReadonlyMap<string, ClipReport>} The measurements of the baked
 *   clips, by clip name.
 */
function animateBody(model: Model): ReadonlyMap<string, ClipReport> {
  const rig = new Rig(model);
  const reachPaw = (
    pose: Pose,
    leg: Leg,
    [dx, y, dz]: Triple,
    pitch = 0,
  ): number =>
    rig.reachLeg(pose, leg.bones, [leg.x + dx, y, leg.z + dz], {
      pitch,
      yaw: 4 * Math.sign(leg.x),
      isKneeBackward: leg.isKneeBackward,
    });
  const plantPaws = (pose: Pose): Pose => {
    for (const leg of LEGS) {
      reachPaw(pose, leg, [0, ANKLE, 0]);
    }
    return pose;
  };
  const wagTail = (angle: number, size: number, lift = 0): PoseSpec => ({
    Tail1: [lift, size * Math.sin(angle), 0],
    Tail2: [lift / 2, size * 1.4 * Math.sin(angle - 0.8), 0],
  });
  const poseIdle = (angle: number): Pose => {
    const breath: number = (1 - Math.cos(angle)) / 2;
    const twitch: number = Math.max(Math.sin(2 * angle), 0) ** 4;
    return plantPaws(
      rig.createPose({
        offset: [0, -0.04 - 0.012 * breath, 0],
        Hips: [-1.5 * breath, 0, 0],
        Chest: [2 * breath, 0, 0],
        Head: [4 - 3 * breath, 10 * Math.sin(angle), 3 * Math.sin(angle)],
        Jaw: [3 + 4 * breath, 0, 0],
        EarL: [-4 * breath, 0, 0],
        EarR: [-4 * breath - 14 * twitch, 0, 0],
        ...wagTail(angle, 10, 4),
      }),
    );
  };
  const idleStart: Pose = poseIdle(0);

  rig.bake(
    'Idle',
    2,
    (t: number): PoseSample => ({ pose: poseIdle((2 * Math.PI * t) / 2) }),
    { loop: true },
  );

  let overreach = 0;
  rig.bake(
    'Walk',
    WALK_DURATION,
    (t: number): PoseSample => {
      const phase: number = (2 * t) / WALK_DURATION;
      const angle: number = 2 * Math.PI * phase;
      const [c, s]: Pair = [Math.cos(angle), Math.sin(angle)];
      const bob: number = Math.cos(2 * (angle - 0.9));
      const pose: Pose = rig.createPose({
        offset: [0, -0.06 - 0.012 * bob, 0],
        Hips: [1, 4 * c, -3 * s],
        Chest: [-1, -6 * c, 3 * s],
        Head: [5 + 3 * bob, 4 * c, -2 * s],
        Jaw: [8, 0, 0],
        EarL: [-10 - 6 * bob, 0, 0],
        EarR: [-10 - 6 * bob, 0, 0],
        ...wagTail(angle / 2, 18, 8),
      });
      for (const leg of LEGS) {
        const step: Step = computeStep(phase + leg.phase, GAIT);
        overreach = Math.max(
          overreach,
          reachPaw(pose, leg, [0, step.y, step.z], step.pitch),
        );
      }
      return { pose };
    },
    { loop: true },
  );
  rig.noteOverreach('Walk', overreach);

  const attackKeys: PoseKey[] = [
    { t: 0, pose: idleStart },
    {
      t: 0.15,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, -0.07, -0.08],
        Hips: [-6, 0, 0],
        Chest: [6, 0, 0],
        Head: [10, 0, 0],
        Jaw: [26, 0, 0],
        EarL: [-35, 0, 0],
        EarR: [-35, 0, 0],
        Tail1: [20, 0, 0],
        Tail2: [10, 0, 0],
      }),
    },
    {
      t: 0.25,
      ease: 'in',
      pose: rig.createPose({
        offset: [0, -0.05, 0.2],
        Hips: [4, 0, 0],
        Chest: [4, 0, 0],
        Head: [-4, 0, 0],
        Jaw: [42, 0, 0],
        EarL: [-40, 0, 0],
        EarR: [-40, 0, 0],
        Tail1: [-8, 0, 0],
        Tail2: [-6, 0, 0],
      }),
    },
    {
      t: 0.3,
      ease: 'in',
      pose: rig.createPose({
        offset: [0, -0.06, 0.22],
        Hips: [5, 0, 0],
        Chest: [2, 0, 0],
        Head: [8, 0, 0],
        Jaw: [0, 0, 0],
        EarL: [-30, 0, 0],
        EarR: [-30, 0, 0],
        Tail1: [-10, 0, 0],
        Tail2: [-8, 0, 0],
      }),
    },
    {
      t: 0.42,
      pose: rig.createPose({
        offset: [0, -0.06, 0.18],
        Hips: [4, 0, 0],
        Chest: [2, 0, 0],
        Head: [6, 14, -6],
        Jaw: [2, 0, 0],
        EarL: [-24, 0, 0],
        EarR: [-24, 0, 0],
        Tail1: [-4, 0, 0],
        Tail2: [-4, 0, 0],
      }),
    },
    { t: 0.6, pose: idleStart },
  ];
  rig.bake(
    'Attack',
    0.6,
    (t: number): PoseSample => {
      const pose: Pose = rig.interpolate(attackKeys, t);
      const reach: number = easeProgress(Math.min(t / 0.25, (0.6 - t) / 0.2));
      const hop: number = Math.sin(Math.PI * Math.min(t / 0.25, 1));
      for (const leg of LEGS) {
        const isFront = !leg.isKneeBackward;
        reachPaw(pose, leg, [
          0,
          ANKLE + (isFront ? 0.06 : 0.02) * hop,
          (isFront ? 0.22 : 0.1) * reach,
        ]);
      }
      return { pose };
    },
    { settle: true },
  );

  const lying: PoseSpec = {
    offset: [0, -0.28, 0],
    Hips: [0, 0, 84],
    Chest: [0, 0, 4],
    Head: [-6, -10, 8],
    Jaw: [24, 0, 0],
    EarL: [-30, 0, 20],
    EarR: [-20, 0, -10],
    Tail1: [-10, -10, 0],
    Tail2: [-10, -20, 0],
    FrontLegL: [-30, 0, 0],
    FrontShinL: [10, 0, 0],
    FrontLegR: [-20, 0, 6],
    FrontShinR: [14, 0, 0],
    HindLegL: [34, 0, 0],
    HindShinL: [-10, 0, 0],
    HindLegR: [24, 0, -6],
    HindShinR: [-14, 0, 0],
  };
  const dieKeys: PoseKey[] = [
    { t: 0, pose: idleStart },
    {
      t: 0.16,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, 0.02, -0.08],
        Hips: [-14, 0, -4],
        Chest: [-10, 0, 0],
        Head: [-28, 0, 0],
        Jaw: [36, 0, 0],
        EarL: [-40, 0, 0],
        EarR: [-40, 0, 0],
        Tail1: [-20, 0, 0],
        Tail2: [-10, 0, 0],
      }),
    },
    { t: 0.62, ease: 'in', pose: rig.createPose(lying) },
    {
      t: 0.76,
      ease: 'out',
      pose: rig.createPose({
        ...lying,
        Hips: [0, 0, 76],
        Head: [-14, -10, -4],
        Jaw: [32, 0, 0],
        HindLegL: [44, 0, 0],
        FrontLegL: [-40, 0, 0],
      }),
    },
    { t: 0.95, ease: 'in', pose: rig.createPose(lying) },
    { t: 1.3, pose: rig.createPose(lying) },
  ];
  rig.bake('Die', 1.3, (t: number): PoseSample => {
    const free: Pose = rig.interpolate(dieKeys, t);
    const planted: Pose = plantPaws(free.clone());
    return {
      pose: planted.blend(free, easeProgress((t - 0.12) / 0.2)),
      snap: easeProgress((t - 0.4) / 0.2),
    };
  });
  return rig.report;
}

/**
 * Builds the monster.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildMonster(): BuiltModel {
  const model: Model = buildBody();
  const report: ReadonlyMap<string, ClipReport> = animateBody(model);
  model.centreOn(LEGS.map((leg: Leg) => leg.bones[2]));
  return { model, report };
}
