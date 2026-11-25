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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/26
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/npc-gate-guard The gate guard, a soldier of the
 *   kingdom who keeps the palisade gate at the end of the mountain road.
 */

import {
  HEAD_CENTER,
  SIDES,
  SKINS,
  addHead,
  addNpcBones,
  addNpcLegs,
  createHair,
  setFaceMaterials,
} from './characters.ts';
import {
  createBox,
  createEllipsoid,
  createExtrusion,
  createLathe,
  place,
} from './geometry.ts';
import type { Pair, Placement, Shape, Triple } from './geometry.ts';
import { Model } from './model.ts';
import { Rig } from './rig.ts';
import type {
  ArmBones,
  BuiltModel,
  ClipReport,
  Pose,
  PoseSample,
  PoseSpec,
} from './rig.ts';

/**
 * Where the shaft of the spear stands upright on the ground, along the X
 * and Z axes: on her right, a little in front of her.
 */
const SPEAR_FOOT: Pair = [-0.3, 0.12];

/** How high the butt of the spear stands above the ground. */
const SPEAR_BUTT = 0.03;

/** How high the point of the spear reaches. */
const SPEAR_POINT = 2.02;

/**
 * Where her right wrist is as she holds the spear, in model space: around
 * the shaft, at the height of her waist, with her fist around it just
 * below.
 */
const SPEAR_WRIST: Triple = [SPEAR_FOOT[0], 0.7, SPEAR_FOOT[1]];

/** The bones of her right arm, which holds the spear. */
const RIGHT_ARM: ArmBones = ['UpperArmR', 'ForeArmR', 'HandR'];

/** How long a round of her idling lasts, in seconds. */
const IDLE_DURATION = 4;

/**
 * Defines the materials of the gate guard.
 *
 * @param {Model} model - The model.
 */
function setMaterials(model: Model): void {
  setFaceMaterials(model, SKINS.brown);
  model.setMaterial('hair', '#2b1d16');
  model.setMaterial('steel', '#b9c0c9', { roughness: 0.4, metallic: 0.5 });
  model.setMaterial('mail', '#7d848e', { roughness: 0.6, metallic: 0.4 });
  model.setMaterial('tabard', '#2e4a9a');
  model.setMaterial('gold', '#e0b84a', { roughness: 0.5, metallic: 0.4 });
  model.setMaterial('plume', '#c8402f');
  model.setMaterial('leather', '#6b4026');
  model.setMaterial('glove', '#5a3a22');
  model.setMaterial('pants', '#3e3a48');
  model.setMaterial('boot', '#3a2a1e');
  model.setMaterial('wood', '#8a5a32');
}

/**
 * Adds her head, her hair coiled in a knot at the nape, and her helmet: a
 * round steel cap with a broad brim, tipped back a little to show her
 * face, with a red plume along its crown.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addHeadAndHelmet(model: Model): void {
  addHead(model);
  model.add('hair', createHair('chignon').hair, 'Head');
  const putOnHead = (shape: Shape): Shape =>
    place(place(shape, { rot: [-10, 0, 0] }), { pos: HEAD_CENTER });
  model.add(
    'steel',
    putOnHead(
      createLathe(
        [
          [0.29, 0.12],
          [0.42, 0.08],
          [0.43, 0.105],
          [0.33, 0.14],
          [0.33, 0.2],
          [0.29, 0.29],
          [0.2, 0.36],
          [0.1, 0.39],
          [0, 0.4],
        ],
        12,
      ),
    ),
    'Head',
  );
  model.add(
    'plume',
    putOnHead(
      place(createEllipsoid([0.035, 0.07, 0.17], 1), {
        pos: [0, 0.43, -0.04],
        rot: [-8, 0, 0],
      }),
    ),
    'Head',
  );
}

/**
 * Adds her body: a shirt of mail, with a blue tabard over it, front and
 * back, bearing the gold crown of the kingdom on her chest, and at the
 * hips a skirt of mail, the tabard hanging down over it to the knees,
 * trimmed with gold, and a leather belt with a gold buckle.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addBody(model: Model): void {
  const flat: Placement = { scale: [1, 1, 0.82] };
  model.add(
    'skin',
    createLathe(
      [
        [0.065, 0.94],
        [0.065, 1.04],
      ],
      6,
    ),
    'Chest',
  );
  model.add(
    'mail',
    place(
      createLathe(
        [
          [0, 0.62],
          [0.18, 0.63],
          [0.2, 0.76],
          [0.195, 0.87],
          [0.135, 0.95],
          [0, 0.96],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  for (const side of [1, -1]) {
    model.add(
      'tabard',
      place(createBox(0.26, 0.3, 0.03), {
        pos: [0, 0.78, 0.168 * side],
        rot: [-4 * side, 0, 0],
      }),
      'Chest',
    );
  }
  model.add(
    'gold',
    place(
      createExtrusion(
        [
          [-0.06, -0.035],
          [0.06, -0.035],
          [0.065, 0.03],
          [0.035, 0],
          [0, 0.045],
          [-0.035, 0],
          [-0.065, 0.03],
        ],
        0.012,
      ),
      { pos: [0, 0.8, 0.186], rot: [-4, 0, 0] },
    ),
    'Chest',
  );

  model.add(
    'mail',
    place(
      createLathe(
        [
          [0, 0.36],
          [0.235, 0.35],
          [0.205, 0.67],
          [0, 0.68],
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
          [0.222, 0.655],
          [0.2, 0.655],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'gold',
    place(createBox(0.05, 0.05, 0.015), { pos: [0, 0.628, 0.19] }),
    'Hips',
  );
  for (const side of [1, -1]) {
    const hang = (shape: Shape): Shape =>
      place(shape, { pos: [0, 0.3, 0.2 * side], rot: [-6 * side, 0, 0] });
    model.add(
      'tabard',
      hang(
        createExtrusion(
          [
            [-0.13, 0],
            [0.13, 0],
            [0.12, 0.3],
            [-0.12, 0.3],
          ],
          0.025,
        ),
      ),
      'Hips',
    );
    model.add(
      'gold',
      hang(place(createBox(0.262, 0.025, 0.03), { pos: [0, 0.012, 0] })),
      'Hips',
    );
  }
}

/**
 * Adds her arms: sleeves of mail, round steel plates over the shoulders,
 * and leather bracers and gloves.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addArms(model: Model): void {
  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape): Shape =>
      place(shape, { pos: [0.25 * x, 0, 0] });
    model.add(
      'mail',
      moveAside(
        createLathe(
          [
            [0, 0.97],
            [0.08, 0.945],
            [0.092, 0.86],
            [0.086, 0.79],
            [0, 0.78],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'steel',
      place(
        createLathe(
          [
            [0, 0.86],
            [0.115, 0.86],
            [0.12, 0.9],
            [0.09, 0.96],
            [0, 0.985],
          ],
          8,
        ),
        { pos: [0.27 * x, 0, 0] },
      ),
      `UpperArm${side}`,
    );
    model.add(
      'leather',
      moveAside(
        createLathe(
          [
            [0, 0.79],
            [0.062, 0.77],
            [0.058, 0.6],
            [0, 0.585],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'glove',
      place(createEllipsoid([0.06, 0.064, 0.064], 1), {
        pos: [0.25 * x, 0.555, 0],
      }),
      `Hand${side}`,
    );
  }
}

/**
 * Adds her spear, which stands upright on its butt by her right side: a
 * wooden shaft shod with steel, and a leaf-shaped steel head on a socket.
 * It does not move as she idles; her right hand holds it where it stands.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addSpear(model: Model): void {
  const [x, z] = SPEAR_FOOT;
  const stand = (shape: Shape): Shape => place(shape, { pos: [x, 0, z] });
  model.add(
    'steel',
    stand(
      createLathe(
        [
          [0, SPEAR_BUTT],
          [0.024, SPEAR_BUTT],
          [0.024, SPEAR_BUTT + 0.04],
          [0, SPEAR_BUTT + 0.04],
        ],
        6,
      ),
    ),
    'Hips',
  );
  model.add(
    'wood',
    stand(
      createLathe(
        [
          [0, SPEAR_BUTT + 0.04],
          [0.02, SPEAR_BUTT + 0.04],
          [0.02, 1.7],
          [0, 1.7],
        ],
        6,
      ),
    ),
    'Hips',
  );
  model.add(
    'steel',
    stand(
      createLathe(
        [
          [0, 1.7],
          [0.027, 1.7],
          [0.027, 1.78],
          [0, 1.79],
        ],
        6,
      ),
    ),
    'Hips',
  );
  model.add(
    'steel',
    stand(
      place(
        createLathe(
          [
            [0, 1.78],
            [0.05, 1.86],
            [0.035, 1.95],
            [0, SPEAR_POINT],
          ],
          4,
          { phase: 0 },
        ),
        { scale: [1, 1, 0.35] },
      ),
    ),
    'Hips',
  );
}

/**
 * Bakes her idling, `Idle`: she stands at her post, her right hand on her
 * spear and her left arm at her side, breathing, and now and then looks a
 * little to either side, down the road.
 *
 * @param {Model} model - The model.
 * @returns {ReadonlyMap<string, ClipReport>} The measurements of the baked
 *   clip, by clip name.
 */
function animate(model: Model): ReadonlyMap<string, ClipReport> {
  const rig = new Rig(model);
  let overreach = 0;
  rig.bake(
    'Idle',
    IDLE_DURATION,
    (t: number): PoseSample => {
      const angle: number = (2 * Math.PI * t) / IDLE_DURATION;
      const breath: number = (1 - Math.cos(2 * angle)) / 2;
      const spec: PoseSpec = {
        Chest: [1.5 * breath, 0, 0],
        Head: [-1.5 * breath, 12 * Math.sin(angle), 0],
        UpperArmL: [0, 0, 8 + 1.5 * breath],
        ForeArmL: [-10, 0, 0],
      };
      const pose: Pose = rig.createPose(spec);
      overreach = Math.max(
        overreach,
        rig.reachArm(pose, RIGHT_ARM, SPEAR_WRIST, { pitch: 0, yaw: 0 }),
      );
      return { pose };
    },
    { loop: true },
  );
  rig.noteOverreach('Idle', overreach);
  return rig.report;
}

/**
 * Builds the gate guard: a woman soldier of the kingdom on duty, in a
 * round steel helmet with a red plume, a blue tabard bearing the gold
 * crown of the kingdom over a shirt of mail, steel plates over her
 * shoulders, and leather gloves and boots, who stands with her spear
 * upright at her right side, her hand on it, and keeps watch.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcGateGuard(): BuiltModel {
  const model = new Model('NpcGateGuard');
  setMaterials(model);
  addNpcBones(model);
  addHeadAndHelmet(model);
  addBody(model);
  addArms(model);
  // Her legs, in pants and tall boots with steel cuffs below the knees.
  addNpcLegs(model, [
    {
      material: 'boot',
      profile: [
        [0, 0.3],
        [0.092, 0.29],
        [0.085, 0.07],
        [0, 0.06],
      ],
    },
    {
      material: 'steel',
      profile: [
        [0.088, 0.25],
        [0.1, 0.255],
        [0.1, 0.3],
        [0.088, 0.305],
      ],
    },
  ]);
  addSpear(model);
  // The model is posed before it is centered on its feet, so that her hand
  // holds the spear where it stands, wherever that ends up.
  const report: ReadonlyMap<string, ClipReport> = animate(model);
  model.centerOn(['FootL', 'FootR']);
  return { model, report };
}
