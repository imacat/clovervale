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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/npc-martha Martha, the village chief, who stands on
 *   the porch of her house.
 */

import { Vector3 } from 'three';

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
  Pose,
  PoseKey,
  PoseSample,
  PoseSpec,
} from './rig.ts';

/** The bones of the arms. */
const ARMS: Readonly<Record<'L' | 'R', ArmBones>> = {
  L: ['UpperArmL', 'ForeArmL', 'HandL'],
  R: ['UpperArmR', 'ForeArmR', 'HandR'],
};

/** Where the hips turn, in the rest pose. */
const HIPS_PIVOT: Triple = [0, 0.56, 0];

/**
 * Where the left wrist rests, on her left hip, in model space with the
 * hips at rest; the right wrist rests in the mirror place.  The hand hangs
 * from it against the side of her waist.
 */
const WRIST_ON_HIP: Triple = [0.272, 0.685, 0.03];

/**
 * The heading of the left hand and of the bend of the left arm, with the
 * elbow out to the side and a little back; the right arm bends the mirror
 * way.
 */
const ELBOW_YAW = -72;

/**
 * Finds where a point that moves with the hips is, as the hips turn.
 *
 * @param {Triple} point - The point, with the hips at rest.
 * @param {Triple} turn - The angles of the hips, in degrees.
 * @returns {Triple} The point, with the hips turned.
 */
function turnWithHips(point: Triple, turn: Triple): Triple {
  const pivot = new Vector3(...HIPS_PIVOT);
  const moved: Vector3 = new Vector3(...point)
    .sub(pivot)
    .applyQuaternion(createRotation(turn))
    .add(pivot);
  return [moved.x, moved.y, moved.z];
}

/**
 * Builds Martha, the village chief: a sturdy woman of mature years, her
 * greying hair gone silver at the temples and coiled in a low knot, in a
 * long skirt and a buttoned waistcoat over a blouse with its sleeves
 * rolled to the elbows, a small clover pinned to her breast, who stands at
 * ease with her hands on her hips, shifts her weight and looks about her.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcMartha(): BuiltModel {
  const model = new Model('NpcMartha');
  setFaceMaterials(model, SKINS.light);
  model.setMaterial('blush', '#efb2a0');
  model.setMaterial('hair', '#6f6762');
  model.setMaterial('silver', '#dcd8d2');
  model.setMaterial('brow', '#4a403c');
  model.setMaterial('lid', '#e8b98f');
  model.setMaterial('blouse', '#f4ecd9');
  model.setMaterial('waistcoat', '#7b4a2b');
  model.setMaterial('button', '#c99a45', { roughness: 0.6 });
  model.setMaterial('belt', '#4a3020');
  model.setMaterial('skirt', '#46597a');
  model.setMaterial('hem', '#34445f');
  model.setMaterial('shoe', '#4a3222');
  model.setMaterial('clover', '#3f9d4f');

  model.addBone('Hips', null, HIPS_PIVOT);
  model.addBone('Chest', 'Hips', [0, 0.66, 0]);
  model.addBone('Head', 'Chest', [0, 0.98, 0]);
  for (const [side, x] of SIDES) {
    model.addBone(`UpperArm${side}`, 'Chest', [0.25 * x, 0.9, 0]);
    model.addBone(`ForeArm${side}`, `UpperArm${side}`, [0.25 * x, 0.73, 0]);
    model.addBone(`Hand${side}`, `ForeArm${side}`, [0.25 * x, 0.57, 0]);
  }

  // The head, with level brows and lids lowered a little over the eyes, and
  // the hair swept back into a low knot, silver at the temples.
  addHead(model, 'Head');
  const hair: Hair = createHair('chignon');
  model.add('hair', hair.hair, 'Head');
  model.add('silver', hair.accent, 'Head');
  for (const side of [1, -1]) {
    model.add(
      'lid',
      place(createEllipsoid([0.052, 0.03, 0.022], 1), {
        pos: findHeadPoint(23 * side, -9, 0.99),
        rot: [-9, 23 * side, 0],
      }),
      'Head',
    );
    model.add(
      'brow',
      place(createBox(0.085, 0.017, 0.014), {
        pos: findHeadPoint(23 * side, -16, 0.995),
        rot: [-16, 23 * side, -7 * side],
      }),
      'Head',
    );
  }

  // The long, full skirt, down to the ground, with a darker band at its
  // hem, and the toes of her shoes peeping out in front.
  const flat: Placement = { scale: [1, 1, 0.9] };
  model.add(
    'skirt',
    place(
      createLathe(
        [
          [0, 0],
          [0.4, 0],
          [0.405, 0.05],
          [0.36, 0.28],
          [0.215, 0.64],
          [0, 0.65],
        ],
        10,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'hem',
    place(
      createLathe(
        [
          [0.4, 0.02],
          [0.418, 0.02],
          [0.41, 0.1],
          [0.392, 0.1],
        ],
        10,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'belt',
    place(
      createLathe(
        [
          [0.2, 0.6],
          [0.228, 0.6],
          [0.228, 0.66],
          [0.2, 0.66],
        ],
        10,
      ),
      flat,
    ),
    'Hips',
  );
  for (const x of [1, -1]) {
    model.add(
      'shoe',
      place(createEllipsoid([0.08, 0.05, 0.1], 0), {
        pos: [0.12 * x, 0.05, 0.31],
      }),
      'Hips',
    );
  }

  // The broad body: the blouse, the waistcoat over it, open down the front
  // of the blouse, with brass buttons down its edges, and the clover pinned
  // to it.
  const thin: Placement = { scale: [1, 1, 0.84] };
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
    'blouse',
    place(
      createLathe(
        [
          [0, 0.62],
          [0.205, 0.63],
          [0.232, 0.76],
          [0.215, 0.87],
          [0.145, 0.95],
          [0, 0.96],
        ],
        8,
      ),
      thin,
    ),
    'Chest',
  );
  model.add(
    'blouse',
    place(
      createLathe(
        [
          [0.13, 0.925],
          [0.16, 0.93],
          [0.115, 0.99],
          [0.075, 0.99],
        ],
        8,
      ),
      thin,
    ),
    'Chest',
  );
  model.add(
    'waistcoat',
    place(
      createLathe(
        [
          [0.219, 0.625],
          [0.244, 0.76],
          [0.227, 0.87],
          [0.17, 0.925],
        ],
        8,
        { phase: -0.5, from: 1, to: 8 },
      ),
      thin,
    ),
    'Chest',
  );
  for (const x of [1, -1]) {
    for (const y of [0.68, 0.75, 0.82]) {
      model.add(
        'button',
        place(createEllipsoid([0.014, 0.014, 0.01], 0), {
          pos: [0.075 * x, y, 0.19],
        }),
        'Chest',
      );
    }
  }
  for (let i = 0; i < 4; i++) {
    model.add(
      'clover',
      place(
        place(createEllipsoid([0.022, 0.024, 0.008], 0), {
          pos: [0, 0.022, 0],
        }),
        { pos: [0.135, 0.84, 0.172], rot: [-14, 28, 45 + i * 90] },
      ),
      'Chest',
    );
  }

  // The strong arms, in full sleeves rolled up to the elbows, with the
  // forearms bare.
  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape): Shape =>
      place(shape, { pos: [0.25 * x, 0, 0] });
    model.add(
      'blouse',
      moveAside(
        createLathe(
          [
            [0, 0.97],
            [0.084, 0.945],
            [0.092, 0.86],
            [0.084, 0.78],
            [0, 0.77],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'blouse',
      moveAside(
        createLathe(
          [
            [0.078, 0.755],
            [0.1, 0.762],
            [0.1, 0.81],
            [0.078, 0.815],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'skin',
      moveAside(
        createLathe(
          [
            [0, 0.79],
            [0.064, 0.77],
            [0.056, 0.6],
            [0, 0.585],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      place(createEllipsoid([0.062, 0.066, 0.066], 1), {
        pos: [0.25 * x, 0.555, 0],
      }),
      `Hand${side}`,
    );
  }

  const rig = new Rig(model);
  const head: number = model.findBone('Head');
  let overreach = 0;
  // Her hands stay on her hips, however her hips turn.
  const setHands = (pose: Pose, hips: Triple): Pose => {
    for (const [side, x] of SIDES) {
      const wrist: Triple = turnWithHips(
        [WRIST_ON_HIP[0] * x, WRIST_ON_HIP[1], WRIST_ON_HIP[2]],
        hips,
      );
      overreach = Math.max(
        overreach,
        rig.reachArm(pose, side === 'L' ? ARMS.L : ARMS.R, wrist, {
          yaw: (ELBOW_YAW + hips[1]) * x,
        }),
      );
    }
    return pose;
  };
  // She looks to her left, back ahead, then to her right, and back.
  const rest: PoseSpec = { Head: [0, 0, 0] };
  const looks: PoseKey[] = [
    { t: 0, pose: rig.createPose(rest) },
    { t: 1.2, pose: rig.createPose(rest) },
    { t: 2, pose: rig.createPose({ Head: [2, 24, 3] }) },
    { t: 3, pose: rig.createPose({ Head: [2, 24, 3] }) },
    { t: 3.8, pose: rig.createPose({ Head: [-2, 0, 0] }) },
    { t: 4.6, pose: rig.createPose({ Head: [3, -20, -3] }) },
    { t: 5.4, pose: rig.createPose({ Head: [3, -20, -3] }) },
    { t: 6.4, pose: rig.createPose(rest) },
    { t: 7.2, pose: rig.createPose(rest) },
  ];
  rig.bake(
    'Idle',
    7.2,
    (t: number): PoseSample => {
      // Her weight shifts from one foot to the other and back, and she
      // breathes, twice as often.
      const shift: number = Math.sin((2 * Math.PI * t) / 7.2);
      const breath: number = (1 - Math.cos((2 * Math.PI * t) / 3.6)) / 2;
      const hips: Triple = [0, 3 * shift, 0.6 * shift];
      const pose: Pose = rig.createPose({
        Hips: hips,
        Chest: [1.5 * breath, -2 * shift, -1.8 * shift],
      });
      // Her head stays level as her body sways.
      getItem(pose.rotations, head)
        .copy(getItem(rig.interpolate(looks, t).rotations, head))
        .multiply(createRotation([-1.5 * breath, 0, 1.2 * shift]));
      return { pose: setHands(pose, hips) };
    },
    { loop: true },
  );
  rig.noteOverreach('Idle', overreach);
  model.centreOn([]);
  return { model, report: rig.report };
}
