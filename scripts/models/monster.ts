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
  createBlob,
  createCone,
  createEllipsoid,
  createExtrusion,
  createTube,
  mirrorShape,
  place,
} from './geometry.ts';
import type { Pair, Shape } from './geometry.ts';
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

const LEGS: Readonly<Record<'L' | 'R', LegBones>> = {
  L: ['ThighL', 'ShinL', 'FootL'],
  R: ['ThighR', 'ShinR', 'FootR'],
};
const GAIT: Gait = {
  duty: 0.42,
  stride: 1.5,
  lift: 0.17,
  ankle: 0.1,
  heel: 0.13,
  toe: 0.3,
  strike: 8,
  push: 26,
  centre: 0.03,
};
const FOOT_X = 0.27;

/**
 * Builds the mesh and the skeleton of the monster: a plump purple
 * dragonling with a cream belly, a spiked back, a heavy tail and a bow.
 *
 * @returns {Model} The model without animations.
 */
function buildBody(): Model {
  const model = new Model('Monster');
  model.setMaterial('body', '#9a5fd6');
  model.setMaterial('dark', '#7141b6');
  model.setMaterial('belly', '#f8e7b6');
  model.setMaterial('spike', '#ff9a3d');
  model.setMaterial('horn', '#fff3d6');
  model.setMaterial('white', '#ffffff', { roughness: 0.5 });
  model.setMaterial('pupil', '#2a1838', { roughness: 0.5 });
  model.setMaterial('mouth', '#c9364b');
  model.setMaterial('bow', '#ff6fa5');

  model.addBone('Hips', null, [0, 0.78, -0.05]);
  model.addBone('Chest', 'Hips', [0, 0.88, 0.25]);
  model.addBone('Head', 'Chest', [0, 1.12, 0.48]);
  model.addBone('Jaw', 'Head', [0, 1.17, 0.62]);
  model.addBone('Tail1', 'Hips', [0, 0.76, -0.45]);
  model.addBone('Tail2', 'Tail1', [0, 0.64, -0.88]);
  model.addBone('Tail3', 'Tail2', [0, 0.54, -1.24]);
  for (const [side, x] of SIDES) {
    model.addBone(`Arm${side}`, 'Chest', [0.29 * x, 0.86, 0.4]);
    model.addBone(`Thigh${side}`, 'Hips', [FOOT_X * x, 0.68, 0]);
    model.addBone(`Shin${side}`, `Thigh${side}`, [FOOT_X * x, 0.38, 0]);
    model.addBone(`Foot${side}`, `Shin${side}`, [FOOT_X * x, 0.1, 0]);
  }
  const addBoth = (material: string, shape: Shape, bone: string): void => {
    model.add(material, shape, `${bone}L`);
    model.add(material, mirrorShape(shape), `${bone}R`);
  };
  const addSpike = (
    bone: string,
    y: number,
    z: number,
    size: number,
    tilt: number,
  ): void => {
    model.add(
      'spike',
      place(createCone(0.11 * size, 0, 0.26 * size, 4), {
        pos: [0, y, z],
        rot: [tilt, 45, 0],
      }),
      bone,
    );
  };

  model.add(
    'body',
    place(createBlob(1, 3, 0.05), {
      pos: [0, 0.84, -0.02],
      rot: [-14, 0, 0],
      scale: [0.43, 0.4, 0.56],
    }),
    'Hips',
  );
  model.add(
    'belly',
    place(createEllipsoid([0.35, 0.33, 0.45], 1), {
      pos: [0, 0.76, 0.1],
      rot: [-14, 0, 0],
    }),
    'Hips',
  );
  addSpike('Hips', 1.18, 0.02, 1.15, -18);
  addSpike('Hips', 1.1, -0.3, 1, -34);

  model.add(
    'body',
    place(createEllipsoid([0.31, 0.31, 0.31], 1), { pos: [0, 1, 0.33] }),
    'Chest',
  );
  model.add(
    'belly',
    place(createEllipsoid([0.25, 0.26, 0.24], 1), { pos: [0, 0.94, 0.42] }),
    'Chest',
  );
  addSpike('Chest', 1.27, 0.22, 1, -10);

  model.add(
    'body',
    place(createEllipsoid([0.35, 0.3, 0.34], 1), { pos: [0, 1.34, 0.56] }),
    'Head',
  );
  model.add(
    'body',
    place(createEllipsoid([0.27, 0.16, 0.3], 1), { pos: [0, 1.27, 0.86] }),
    'Head',
  );
  addSpike('Head', 1.6, 0.36, 0.8, -20);
  const teeth: Pair[] = [
    [1.07, 1],
    [0.95, 0.9],
    [0.83, 0.8],
  ];
  for (const x of [1, -1]) {
    model.add(
      'white',
      place(createEllipsoid([0.1, 0.13, 0.06], 1), {
        pos: [0.19 * x, 1.42, 0.8],
        rot: [-12, 26 * x, 0],
      }),
      'Head',
    );
    model.add(
      'pupil',
      place(createEllipsoid([0.055, 0.085, 0.03], 1), {
        pos: [0.2 * x, 1.41, 0.845],
        rot: [-12, 26 * x, 0],
      }),
      'Head',
    );
    model.add(
      'white',
      place(createEllipsoid([0.02, 0.025, 0.012], 0), {
        pos: [0.185 * x, 1.455, 0.868],
      }),
      'Head',
    );
    for (let i = 0; i < 3; i++) {
      model.add(
        'pupil',
        place(createCone(0.022, 0, 0.1, 3), {
          pos: [(0.25 + i * 0.03) * x, 1.5 - i * 0.045, 0.8 - i * 0.035],
          rot: [10, 0, (-35 - i * 28) * x],
        }),
        'Head',
      );
    }
    model.add(
      'pupil',
      place(createEllipsoid([0.025, 0.02, 0.02], 0), {
        pos: [0.09 * x, 1.36, 1.1],
      }),
      'Head',
    );
    model.add(
      'horn',
      place(createCone(0.075, 0, 0.3, 5), {
        pos: [0.2 * x, 1.56, 0.5],
        rot: [-18, 0, -28 * x],
      }),
      'Head',
    );
    model.add(
      'bow',
      place(createEllipsoid([0.12, 0.085, 0.05], 0), {
        pos: [0.11 * x, 1.68, 0.6],
        rot: [0, 0, 24 * x],
      }),
      'Head',
    );
    for (const [z, size] of teeth) {
      model.add(
        'white',
        place(createCone(0.035 * size, 0, 0.09 * size, 4), {
          pos: [(0.34 - (z - 0.8) * 0.75) * 0.62 * x, 1.21, z],
          rot: [180, 0, 0],
        }),
        'Head',
      );
    }
  }
  model.add(
    'bow',
    place(createEllipsoid([0.05, 0.055, 0.05], 0), { pos: [0, 1.66, 0.6] }),
    'Head',
  );

  model.add(
    'belly',
    place(createEllipsoid([0.23, 0.085, 0.27], 1), { pos: [0, 1.14, 0.84] }),
    'Jaw',
  );
  model.add(
    'mouth',
    place(createEllipsoid([0.19, 0.04, 0.23], 0), { pos: [0, 1.185, 0.84] }),
    'Jaw',
  );
  for (const x of [1, -1]) {
    model.add(
      'white',
      place(createCone(0.035, 0, 0.09, 4), { pos: [0.11 * x, 1.19, 1.02] }),
      'Jaw',
    );
  }

  model.add(
    'body',
    createTube(
      [
        [0, 0.8, -0.3],
        [0, 0.72, -0.66],
        [0, 0.64, -0.95],
      ],
      [
        [0.3, 0.3],
        [0.25, 0.24],
        [0.19, 0.18],
      ],
      6,
      [0, 1, 0],
    ),
    'Tail1',
  );
  addSpike('Tail1', 0.93, -0.62, 0.85, -42);
  model.add(
    'body',
    createTube(
      [
        [0, 0.65, -0.85],
        [0, 0.58, -1.1],
        [0, 0.54, -1.3],
      ],
      [
        [0.2, 0.19],
        [0.16, 0.15],
        [0.12, 0.11],
      ],
      6,
      [0, 1, 0],
    ),
    'Tail2',
  );
  addSpike('Tail2', 0.74, -0.98, 0.7, -48);
  model.add(
    'dark',
    createTube(
      [
        [0, 0.55, -1.2],
        [0, 0.52, -1.42],
        [0, 0.53, -1.66],
      ],
      [
        [0.125, 0.115],
        [0.085, 0.08],
        [0, 0],
      ],
      6,
      [0, 1, 0],
    ),
    'Tail3',
  );
  model.add(
    'spike',
    place(createCone(0.07, 0, 0.17, 4), {
      pos: [0, 0.6, -1.33],
      rot: [-55, 45, 0],
    }),
    'Tail3',
  );

  addBoth(
    'dark',
    createTube(
      [
        [0.29, 0.88, 0.38],
        [0.36, 0.74, 0.52],
        [0.36, 0.64, 0.64],
      ],
      [0.085, 0.075, 0.06],
      5,
      [1, 0, 0],
    ),
    'Arm',
  );
  for (const dx of [-0.045, 0, 0.045]) {
    addBoth(
      'horn',
      place(createCone(0.022, 0, 0.09, 3), {
        pos: [0.36 + dx, 0.62, 0.67],
        rot: [125, 0, 0],
      }),
      'Arm',
    );
  }

  addBoth(
    'dark',
    place(createEllipsoid([0.17, 0.25, 0.22], 1), { pos: [FOOT_X, 0.6, 0] }),
    'Thigh',
  );
  addBoth(
    'dark',
    createTube(
      [
        [FOOT_X, 0.44, 0],
        [FOOT_X, 0.24, 0],
        [FOOT_X, 0.08, 0],
      ],
      [0.11, 0.095, 0.1],
      6,
    ),
    'Shin',
  );
  addBoth(
    'dark',
    place(
      place(
        createExtrusion(
          [
            [-0.14, 0],
            [0.3, 0],
            [0.31, 0.05],
            [0.2, 0.12],
            [0.02, 0.15],
            [-0.14, 0.13],
          ],
          0.25,
        ),
        { rot: [0, -90, 0] },
      ),
      { pos: [FOOT_X, 0, 0] },
    ),
    'Foot',
  );
  for (const dx of [-0.08, 0, 0.08]) {
    addBoth(
      'horn',
      place(createCone(0.04, 0, 0.12, 4), {
        pos: [FOOT_X + dx, 0.045, 0.28],
        rot: [90, 0, 0],
      }),
      'Foot',
    );
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
  const plantFeet = (pose: Pose): Pose => {
    rig.reachLeg(pose, LEGS.L, [FOOT_X, 0.1, 0], { yaw: 8 });
    rig.reachLeg(pose, LEGS.R, [-FOOT_X, 0.1, 0], { yaw: -8 });
    return pose;
  };
  const swingTail = (angle: number, size: number, droop = 0): PoseSpec => ({
    Tail1: [droop, size * Math.sin(angle), 0],
    Tail2: [droop, size * 1.3 * Math.sin(angle - 0.7), 0],
    Tail3: [droop, size * 1.6 * Math.sin(angle - 1.4), 0],
  });
  const poseIdle = (angle: number): Pose => {
    const breath: number = (1 - Math.cos(angle)) / 2;
    return plantFeet(
      rig.createPose({
        offset: [0, -0.03 - 0.025 * breath, 0],
        Hips: [-2 * breath, 0, 0],
        Chest: [3 * breath, 0, 0],
        Head: [-3 * breath, 7 * Math.sin(angle), 0],
        Jaw: [4 + 5 * breath, 0, 0],
        ArmL: [-6 * breath, 0, 0],
        ArmR: [-6 * breath, 0, 0],
        ...swingTail(angle, 9),
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
    1,
    (t: number): PoseSample => {
      const angle: number = 2 * Math.PI * t;
      const [c, s]: Pair = [Math.cos(angle), Math.sin(angle)];
      const pose: Pose = rig.createPose({
        offset: [0.03 * s, -0.118 - 0.03 * Math.cos(2 * (angle - 1.3)), 0],
        Hips: [4, -7 * c, 5 * s],
        Chest: [2 + 3 * Math.cos(2 * angle), 6 * c, -3 * s],
        Head: [-4 - 4 * Math.cos(2 * angle - 0.8), 5 * c, -3 * s],
        Jaw: [6, 0, 0],
        ArmL: [-10 + 28 * c, 0, 0],
        ArmR: [-10 - 28 * c, 0, 0],
        ...swingTail(angle + 1.6, 15, -3),
      });
      const left: Step = computeStep(t, GAIT);
      const right: Step = computeStep(t + 0.5, GAIT);
      overreach = Math.max(
        overreach,
        rig.reachLeg(pose, LEGS.L, [FOOT_X, left.y, left.z], {
          pitch: left.pitch,
          yaw: 4,
        }),
        rig.reachLeg(pose, LEGS.R, [-FOOT_X, right.y, right.z], {
          pitch: right.pitch,
          yaw: -4,
        }),
      );
      return { pose };
    },
    { loop: true },
  );
  rig.noteOverreach('Walk', overreach);

  const attackKeys: PoseKey[] = [
    { t: 0, pose: idleStart },
    {
      t: 0.17,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, 0.02, -0.16],
        Hips: [-20, 0, 0],
        Chest: [-16, 0, 0],
        Head: [-26, 0, 0],
        Jaw: [48, 0, 0],
        ArmL: [-75, 0, 25],
        ArmR: [-75, 0, -25],
        Tail1: [14, 0, 0],
        Tail2: [12, 0, 0],
        Tail3: [10, 0, 0],
      }),
    },
    {
      t: 0.28,
      ease: 'in',
      pose: rig.createPose({
        offset: [0, -0.16, 0.34],
        Hips: [20, 0, 0],
        Chest: [12, 0, 0],
        Head: [6, 0, 0],
        Jaw: [44, 0, 0],
        ArmL: [-30, 0, 10],
        ArmR: [-30, 0, -10],
        Tail1: [-22, 0, 0],
        Tail2: [-16, 0, 0],
        Tail3: [-12, 0, 0],
      }),
    },
    {
      t: 0.33,
      ease: 'in',
      pose: rig.createPose({
        offset: [0, -0.17, 0.36],
        Hips: [22, 0, 0],
        Chest: [14, 0, 0],
        Head: [16, 0, 0],
        Jaw: [0, 0, 0],
        ArmL: [10, 0, 0],
        ArmR: [10, 0, 0],
        Tail1: [-24, 0, 0],
        Tail2: [-18, 0, 0],
        Tail3: [-14, 0, 0],
      }),
    },
    {
      t: 0.42,
      pose: rig.createPose({
        offset: [0, -0.15, 0.32],
        Hips: [18, 0, 0],
        Chest: [12, 0, 0],
        Head: [12, 0, 0],
        Jaw: [2, 0, 0],
        ArmL: [10, 0, 0],
        ArmR: [10, 0, 0],
        Tail1: [-18, 0, 0],
        Tail2: [-12, 0, 0],
        Tail3: [-8, 0, 0],
      }),
    },
    { t: 0.6, pose: idleStart },
  ];
  rig.bake(
    'Attack',
    0.6,
    (t: number): PoseSample => {
      const pose: Pose = rig.interpolate(attackKeys, t);
      const step: number =
        0.26 * easeProgress(Math.min(t / 0.28, (0.6 - t) / 0.18));
      const hop: number = 0.07 * Math.sin(Math.PI * Math.min(t / 0.28, 1));
      rig.reachLeg(pose, LEGS.R, [-FOOT_X, 0.1, 0], { yaw: -8 });
      rig.reachLeg(pose, LEGS.L, [FOOT_X, 0.1 + hop, step], { yaw: 8 });
      return { pose };
    },
    { settle: true },
  );

  const lying: PoseSpec = {
    offset: [-0.45, -0.4, 0],
    Hips: [0, 0, 86],
    Chest: [0, -8, 6],
    Head: [0, -10, 8],
    Jaw: [30, 0, 0],
    ArmL: [-20, 0, 0],
    ArmR: [-40, 0, 0],
    Tail1: [0, -10, 0],
    Tail2: [0, -14, 0],
    Tail3: [0, -16, 0],
    ThighL: [-28, 0, 0],
    ShinL: [20, 0, 0],
    FootL: [25, 0, 0],
    ThighR: [22, 0, -8],
    ShinR: [18, 0, 0],
    FootR: [30, 0, 0],
  };
  const dieKeys: PoseKey[] = [
    { t: 0, pose: idleStart },
    {
      t: 0.16,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, 0.02, -0.12],
        Hips: [-18, 0, -6],
        Chest: [-14, 0, 0],
        Head: [-30, 0, 0],
        Jaw: [42, 0, 0],
        ArmL: [-80, 0, 30],
        ArmR: [-80, 0, -30],
        Tail1: [12, 0, 0],
        Tail2: [10, 0, 0],
        Tail3: [10, 0, 0],
        ThighL: [-10, 0, 0],
        ThighR: [-10, 0, 0],
      }),
    },
    { t: 0.62, ease: 'in', pose: rig.createPose(lying) },
    {
      t: 0.76,
      ease: 'out',
      pose: rig.createPose({
        ...lying,
        Hips: [0, 0, 76],
        Head: [0, -10, -6],
        Jaw: [44, 0, 0],
        ThighL: [-45, 0, 0],
        ThighR: [38, 0, -8],
        Tail1: [0, -10, -14],
        Tail2: [0, -14, -12],
      }),
    },
    { t: 0.95, ease: 'in', pose: rig.createPose(lying) },
    { t: 1.3, pose: rig.createPose(lying) },
  ];
  rig.bake('Die', 1.3, (t: number): PoseSample => {
    const free: Pose = rig.interpolate(dieKeys, t);
    const planted: Pose = plantFeet(free.clone());
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
  model.centreOn(['FootL', 'FootR']);
  return { model, report };
}
