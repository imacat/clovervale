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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/npc-edwin The prisoner in the north cell of the
 *   cave, a courier of a kingdom, who waits at the bars of his cell.
 */

import { CAVE_EDWIN_BEHIND_BARS } from '@clovervale/shared';

import {
  SIDES,
  SKINS,
  addHead,
  createHair,
  findHeadPoint,
  setFaceMaterials,
} from './characters.ts';
import type { Hair } from './characters.ts';
import {
  createBox,
  createEllipsoid,
  createExtrusion,
  createLathe,
  createRotation,
  place,
} from './geometry.ts';
import type { Placement, Shape, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import { Rig } from './rig.ts';
import type {
  ArmBones,
  BuiltModel,
  LegBones,
  Pose,
  PoseKey,
  PoseSample,
} from './rig.ts';

/** The bones of the arms. */
const ARMS: Readonly<Record<'L' | 'R', ArmBones>> = {
  L: ['UpperArmL', 'ForeArmL', 'HandL'],
  R: ['UpperArmR', 'ForeArmR', 'HandR'],
};

/** The bones of the legs. */
const LEGS: Readonly<Record<'L' | 'R', LegBones>> = {
  L: ['ThighL', 'ShinL', 'FootL'],
  R: ['ThighR', 'ShinR', 'FootR'],
};

/**
 * The height of the ankles above the ground, which keeps the soles about
 * 2 mm above it.
 */
const ANKLE_HEIGHT = 0.082;

/** How far either ankle stands out to the side of the middle, in metres. */
const STANCE = 0.11;

/**
 * How far out to the side the bars he holds stand, in metres, as the cave
 * stands him: the second bar on either side of the middle of the row.
 */
const BAR_X = 0.24;

/**
 * Where the left wrist holds its bar, in model space; the right wrist holds
 * the mirror bar.  The fist, a little in front of the wrist with the hand
 * turned forward, closes round the bar, a little above the shoulder.
 */
const WRIST_ON_BAR: Triple = [BAR_X, 0.92, CAVE_EDWIN_BEHIND_BARS - 0.015];

/** The pitch of the hands, turned forward to hold the bars. */
const HAND_PITCH = -90;

/**
 * The heading of the left hand and of the bend of the left arm, with the
 * elbow out to the side and a little back; the right arm bends the mirror
 * way.
 */
const ELBOW_YAW = -70;

/**
 * How far forward of where they stand at rest he leans his hips, standing
 * straight, to hold the bars, in metres.
 */
const LEAN = 0.14;

/** How long his idling lasts before it starts again, in seconds. */
const IDLE_DURATION = 8;

/**
 * Creates the shape of a boot from its side profile.
 *
 * @returns {Shape} The boot, around its ankle bone at the origin of X.
 */
function createBootSole(): Shape {
  return place(
    createExtrusion(
      [
        [-0.095, 0],
        [0.175, 0],
        [0.185, 0.045],
        [0.135, 0.09],
        [0.03, 0.11],
        [-0.095, 0.11],
      ],
      0.165,
    ),
    { rot: [0, -90, 0] },
  );
}

/**
 * Creates the crown of the kingdom he rides for, as embroidered on his
 * tabard, upright and facing +Z, its foot at the origin.
 *
 * @returns {Shape} The crown.
 */
function createCrown(): Shape {
  return createExtrusion(
    [
      [-0.055, 0],
      [0.055, 0],
      [0.062, 0.05],
      [0.03, 0.026],
      [0, 0.058],
      [-0.03, 0.026],
      [-0.062, 0.05],
    ],
    0.006,
  );
}

/**
 * Builds the prisoner: a courier of a kingdom, a grown man, tired but
 * upright, his short hair unkempt and his chin unshaven, with dark rings
 * under his heavy eyes and his brows drawn up, in the worn and
 * travel-stained clothes of his errand: a faded blue tabard with the crown
 * of his kingdom on its breast, over a linen shirt, a short brown cloak
 * about his shoulders, a belt with a strap across him to an empty pouch,
 * trousers, and boots caked with dust.  He has no armour and no weapon.
 * He stands right at the bars of his cell, holding two of them, leaning in
 * on straight arms; he shifts his weight from one foot to the other, and
 * looks along the passage one way and then the other, and breathes.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcEdwin(): BuiltModel {
  const model = new Model('NpcEdwin');
  setFaceMaterials(model, SKINS.light);
  model.setMaterial('hand', SKINS.light);
  model.setMaterial('blush', '#e9b79c');
  model.setMaterial('stubble', '#c4a185');
  model.setMaterial('shadow', '#d5a88c');
  model.setMaterial('hair', '#3e2c20');
  model.setMaterial('brow', '#33241a');
  model.setMaterial('lid', '#e9bb92');
  model.setMaterial('tabard', '#3f5a85');
  model.setMaterial('stain', '#6f6553');
  model.setMaterial('crown', '#bfa058', { roughness: 0.7 });
  model.setMaterial('linen', '#cbc2ad');
  model.setMaterial('cloak', '#6b5038');
  model.setMaterial('leather', '#4a3222');
  model.setMaterial('trousers', '#565049');
  model.setMaterial('boot', '#3e2c1f');
  model.setMaterial('dust', '#7d6a4f');

  model.addBone('Hips', null, [0, 0.56, 0]);
  model.addBone('Chest', 'Hips', [0, 0.66, 0]);
  model.addBone('Head', 'Chest', [0, 0.98, 0]);
  for (const [side, x] of SIDES) {
    model.addBone(`UpperArm${side}`, 'Chest', [0.25 * x, 0.9, 0]);
    model.addBone(`ForeArm${side}`, `UpperArm${side}`, [0.25 * x, 0.73, 0]);
    model.addBone(`Hand${side}`, `ForeArm${side}`, [0.25 * x, 0.57, 0]);
    model.addBone(`Thigh${side}`, 'Hips', [0.1 * x, 0.55, 0]);
    model.addBone(`Shin${side}`, `Thigh${side}`, [0.1 * x, 0.3, 0]);
    model.addBone(`Foot${side}`, `Shin${side}`, [0.1 * x, 0.08, 0]);
  }

  // The head: short, unkempt hair, heavy lids, brows drawn up in the
  // middle, dark rings under the eyes, and a stubbled chin.
  addHead(model, 'Head');
  const hair: Hair = createHair('tufts');
  model.add('hair', hair.hair, 'Head');
  model.add('hair', hair.accent, 'Head');
  for (const side of [1, -1]) {
    model.add(
      'lid',
      place(createEllipsoid([0.05, 0.034, 0.022], 1), {
        pos: findHeadPoint(23 * side, -9, 0.99),
        rot: [-9, 23 * side, 0],
      }),
      'Head',
    );
    model.add(
      'brow',
      place(createBox(0.085, 0.017, 0.014), {
        pos: findHeadPoint(23 * side, -17, 0.995),
        rot: [-17, 23 * side, 12 * side],
      }),
      'Head',
    );
    model.add(
      'shadow',
      place(createEllipsoid([0.038, 0.014, 0.008], 0), {
        pos: findHeadPoint(24 * side, 13, 0.997),
        rot: [13, 24 * side, 0],
      }),
      'Head',
    );
  }
  model.add(
    'stubble',
    place(createEllipsoid([0.15, 0.065, 0.05], 1), {
      pos: findHeadPoint(0, 38, 0.93),
      rot: [38, 0, 0],
    }),
    'Head',
  );

  // The body: the tabard over the shirt, the crown on its breast, the
  // strap across it to the pouch, and the short cloak about the shoulders.
  const flat: Placement = { scale: [1, 1, 0.82] };
  model.add(
    'skin',
    createLathe(
      [
        [0.068, 0.94],
        [0.068, 1.04],
      ],
      6,
    ),
    'Chest',
  );
  model.add(
    'tabard',
    place(
      createLathe(
        [
          [0, 0.62],
          [0.195, 0.63],
          [0.218, 0.76],
          [0.205, 0.87],
          [0.14, 0.95],
          [0, 0.96],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  model.add(
    'linen',
    place(
      createLathe(
        [
          [0.12, 0.93],
          [0.15, 0.935],
          [0.11, 0.985],
          [0.072, 0.99],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  model.add(
    'crown',
    place(createCrown(), { pos: [0, 0.77, 0.181], rot: [-8, 0, 0] }),
    'Chest',
  );
  model.add(
    'leather',
    place(createBox(0.045, 0.5, 0.02), {
      pos: [0, 0.79, 0.165],
      rot: [-4, 0, 38],
    }),
    'Chest',
  );
  model.add(
    'cloak',
    createLathe(
      [
        [0.29, 0.6],
        [0.278, 0.9],
        [0.165, 0.988],
        [0.15, 0.968],
        [0.255, 0.885],
        [0.268, 0.6],
        [0.29, 0.6],
      ],
      10,
      { phase: 0.5, from: 2, to: 8 },
    ),
    'Chest',
  );
  model.add(
    'cloak',
    place(createEllipsoid([0.03, 0.03, 0.02], 0), {
      pos: [0.12, 0.93, 0.13],
    }),
    'Chest',
  );

  // The hips: the trousers, the belt, the skirt of the tabard down to the
  // middle of the thighs, its hem stained with the dust of the road, and the
  // empty pouch on the belt.
  model.add(
    'trousers',
    place(
      createLathe(
        [
          [0, 0.44],
          [0.22, 0.43],
          [0.2, 0.67],
          [0, 0.68],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'tabard',
    place(
      createLathe(
        [
          [0.255, 0.42],
          [0.205, 0.66],
          [0, 0.67],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'stain',
    place(
      createLathe(
        [
          [0, 0.36],
          [0.268, 0.36],
          [0.255, 0.42],
          [0, 0.42],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'leather',
    place(
      createLathe(
        [
          [0.2, 0.6],
          [0.222, 0.6],
          [0.222, 0.65],
          [0.2, 0.65],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'leather',
    place(createBox(0.11, 0.12, 0.05), {
      pos: [-0.2, 0.55, 0.07],
      rot: [0, -30, 0],
    }),
    'Hips',
  );

  // The limbs: the arms, in the sleeves of the tabard over the long sleeves
  // of the shirt, and the legs, in trousers and dusty boots.
  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape, px = 0.25): Shape =>
      place(shape, { pos: [px * x, 0, 0] });
    model.add(
      'tabard',
      moveAside(
        createLathe(
          [
            [0, 0.97],
            [0.085, 0.945],
            [0.096, 0.86],
            [0.09, 0.76],
            [0, 0.75],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'linen',
      moveAside(
        createLathe(
          [
            [0, 0.78],
            [0.068, 0.77],
            [0.06, 0.61],
            [0, 0.6],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'hand',
      place(createEllipsoid([0.064, 0.066, 0.066], 1), {
        pos: [0.25 * x, 0.555, 0],
      }),
      `Hand${side}`,
    );
    model.add(
      'trousers',
      moveAside(
        createLathe(
          [
            [0, 0.6],
            [0.095, 0.575],
            [0.085, 0.3],
            [0, 0.285],
          ],
          6,
        ),
        0.1,
      ),
      `Thigh${side}`,
    );
    model.add(
      'boot',
      moveAside(
        createLathe(
          [
            [0, 0.33],
            [0.092, 0.32],
            [0.088, 0.17],
            [0, 0.16],
          ],
          6,
        ),
        0.1,
      ),
      `Shin${side}`,
    );
    model.add(
      'dust',
      moveAside(
        createLathe(
          [
            [0, 0.17],
            [0.088, 0.17],
            [0.085, 0.07],
            [0, 0.06],
          ],
          6,
        ),
        0.1,
      ),
      `Shin${side}`,
    );
    model.add('boot', moveAside(createBootSole(), 0.1), `Foot${side}`);
  }

  // The model is centred on its feet before it is posed, so that his hands
  // close on the bars where the cave stands them.
  model.centreOn(['FootL', 'FootR']);
  const rig = new Rig(model);
  const head: number = model.findBone('Head');
  // His ankles stay where they stand at rest, under the middle of his feet.
  const ankleZ: number = getItem(model.bones, model.findBone('FootL')).head.z;
  let overreach = 0;
  // His feet stay where they stand, and his hands on the bars, however his
  // body moves.
  const plant = (pose: Pose): Pose => {
    for (const [side, x] of SIDES) {
      const isLeft: boolean = side === 'L';
      overreach = Math.max(
        overreach,
        rig.reachLeg(
          pose,
          isLeft ? LEGS.L : LEGS.R,
          [STANCE * x, ANKLE_HEIGHT, ankleZ],
          { yaw: 8 * x },
        ),
        rig.reachArm(
          pose,
          isLeft ? ARMS.L : ARMS.R,
          [WRIST_ON_BAR[0] * x, WRIST_ON_BAR[1], WRIST_ON_BAR[2]],
          { pitch: HAND_PITCH, yaw: ELBOW_YAW * x },
        ),
      );
    }
    return pose;
  };
  // He looks ahead, then along the passage to his left, ahead again, and
  // along it to his right, his face never nearer the bars than it is ahead.
  const ahead: Triple = [-6, 0, 0];
  const looks: PoseKey[] = [
    { t: 0, pose: rig.createPose({ Head: ahead }) },
    { t: 1.2, pose: rig.createPose({ Head: ahead }) },
    { t: 2.1, pose: rig.createPose({ Head: [-7, 40, 3] }) },
    { t: 3.5, pose: rig.createPose({ Head: [-7, 40, 3] }) },
    { t: 4.3, pose: rig.createPose({ Head: ahead }) },
    { t: 5, pose: rig.createPose({ Head: ahead }) },
    { t: 5.9, pose: rig.createPose({ Head: [-8, -38, -3] }) },
    { t: 7.1, pose: rig.createPose({ Head: [-8, -38, -3] }) },
    { t: IDLE_DURATION, pose: rig.createPose({ Head: ahead }) },
  ];
  rig.bake(
    'Idle',
    IDLE_DURATION,
    (t: number): PoseSample => {
      // His weight shifts from one foot to the other and back, and he
      // breathes, twice as often.
      const turn: number = (2 * Math.PI * t) / IDLE_DURATION;
      const shift: number = Math.sin(turn);
      const breath: number = (1 - Math.cos(2 * turn)) / 2;
      const pose: Pose = rig.createPose({
        offset: [0.02 * shift, -0.035 - 0.004 * breath, LEAN],
        Hips: [0, 3 * shift, 2 * shift],
        Chest: [1.2 * breath, -2 * shift, -2.4 * shift],
      });
      // His head stays level as his body sways.
      getItem(pose.rotations, head)
        .copy(getItem(rig.interpolate(looks, t).rotations, head))
        .multiply(createRotation([-1.2 * breath, 0, 4.4 * shift]));
      return { pose: plant(pose) };
    },
    { loop: true },
  );
  rig.noteOverreach('Idle', overreach);
  return { model, report: rig.report };
}
