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
 * @module scripts/models/npc-emma Emma, the smith who works at the forge of
 *   the weapon shop.
 */

import { Vector3 } from 'three';

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
import type { Hair } from './characters.ts';
import {
  createBox,
  createEllipsoid,
  createExtrusion,
  createLathe,
  createRotation,
  createTube,
  place,
} from './geometry.ts';
import type { Placement, Shape, Triple } from './geometry.ts';
import { Model } from './model.ts';
import { Rig } from './rig.ts';
import type {
  ArmBones,
  BuiltModel,
  ClipReport,
  LegBones,
  Pose,
  PoseKey,
  PoseSample,
  PoseSpec,
} from './rig.ts';

/** A pose of the arm that holds the hammer, and how the body stands. */
interface StrokePose {
  /** The angles of the body and the offset of the hips. */
  readonly body: PoseSpec;
  /** Where the right wrist is, in model space. */
  readonly wrist: Triple;
  /** The pitch of the right hand in degrees, positive with the head down. */
  readonly pitch: number;
  /** The heading of the right hand in degrees. */
  readonly yaw: number;
}

/** The key poses of a stroke of the hammer. */
interface Strokes {
  /** The hammer raised, as the stroke starts and ends. */
  readonly raised: StrokePose;
  /** The hammer at the top of its swing. */
  readonly top: StrokePose;
  /** The hammer swung forward, on its way down. */
  readonly swung: StrokePose;
  /** The hammer falling onto the iron. */
  readonly falling: StrokePose;
  /** The hammer just before the blow. */
  readonly landing: StrokePose;
  /** The hammer on the iron. */
  readonly struck: StrokePose;
  /** The hammer bounced back off the iron. */
  readonly rebound: StrokePose;
  /** The hammer at rest over the iron. */
  readonly settled: StrokePose;
  /** The hammer lifted for the next stroke. */
  readonly lifted: StrokePose;
}

/**
 * Where the face of the hammer lands, in model space: on the top of the bar
 * of hot iron on the anvil of the weapon shop, 0.75 m up, 2 cm beyond the
 * middle of the bar and 6 cm in from the edge of the anvil, as the village
 * stands her at the anvil.  The model check makes sure the two meet.
 */
const STRIKE: Triple = [-0.13, 0.75, 0.64];

/**
 * Where the middle of the jaws of the tongs grips the bar, in model space:
 * 3.5 cm in from its end on her side, which reaches 8 cm out over the edge
 * of the anvil, so that the jaws close on the bar clear of the anvil, and
 * halfway up it, 0.735 m up, between its bottom at 0.72 m and its top at
 * 0.75 m.
 */
const GRIP: Triple = [-0.13, 0.735, 0.535];

/**
 * How far the face of the hammer is from the pivot of the right hand, in
 * the rest pose: below it and in front of it.
 */
const HAMMER_FACE: Triple = [0, -0.08, 0.34];

/**
 * How far the middle of the jaws of the tongs is from the pivot of the left
 * hand, in the rest pose: 3 cm below it and 0.45 m in front of it.
 */
const TONGS_JAWS: Triple = [0, -0.03, 0.45];

/** The pitch and the heading of the left hand that holds the tongs. */
const TONGS_TURN: Triple = [10, -30, 0];

/**
 * The height of the ankles above the ground, which keeps the soles about
 * 2 mm above it, the clearance baking keeps under every frame, so that no
 * frame is lifted and the hammer lands where it is aimed.
 */
const ANKLE_HEIGHT = 0.082;

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
 * Finds where a wrist goes for a point held in the hand to be at a target.
 *
 * @param {Triple} target - Where the point is to be, in model space.
 * @param {Triple} held - How far the point is from the pivot of the hand,
 *   in the rest pose.
 * @param {Triple} turn - The pitch and the heading of the hand, in degrees.
 * @returns {Triple} Where the wrist goes, in model space.
 */
function findWrist(target: Triple, held: Triple, turn: Triple): Triple {
  const [pitch, yaw] = turn;
  const offset: Vector3 = new Vector3(...held).applyQuaternion(
    createRotation([0, yaw, 0]).multiply(createRotation([pitch, 0, 0])),
  );
  return [target[0] - offset.x, target[1] - offset.y, target[2] - offset.z];
}

/**
 * Defines the materials of Emma.
 *
 * @param {Model} model - The model.
 */
function setMaterials(model: Model): void {
  setFaceMaterials(model, SKINS.tan);
  model.setMaterial('hair', '#3b2418');
  model.setMaterial('kerchief', '#3d7a8c');
  model.setMaterial('shirt', '#c9b48a');
  model.setMaterial('cuff', '#b39e74');
  model.setMaterial('apron', '#6b4026');
  model.setMaterial('strap', '#4e2e1a');
  model.setMaterial('pants', '#4b4a5a');
  model.setMaterial('boot', '#3a2a1e');
  model.setMaterial('handle', '#9a6a3a');
  model.setMaterial('hammerHead', '#5c606b', { roughness: 0.5 });
  model.setMaterial('tongs', '#3c3e45', { roughness: 0.5 });
}

/**
 * Adds her head, her hair tied up in a bun, and a kerchief tied around her
 * head across the brow, knotted at the nape.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addHeadAndKerchief(model: Model): void {
  addHead(model);
  const hair: Hair = createHair('bun');
  model.add('hair', hair.hair, 'Head');
  model.add('kerchief', hair.accent, 'Head');
  const putOnHead = (shape: Shape): Shape =>
    place(place(shape, { rot: [-16, 0, 0] }), { pos: HEAD_CENTER });
  model.add(
    'kerchief',
    putOnHead(
      createLathe(
        [
          [0.333, 0.075],
          [0.338, 0.11],
          [0.32, 0.17],
          [0.302, 0.2],
        ],
        12,
      ),
    ),
    'Head',
  );
  for (const x of [1, -1]) {
    model.add(
      'kerchief',
      place(createEllipsoid([0.05, 0.03, 0.022], 0), {
        pos: [0.045 * x, HEAD_CENTER[1] + 0.02, -0.33],
        rot: [10, 0, -40 * x],
      }),
      'Head',
    );
  }
  model.add(
    'kerchief',
    place(createEllipsoid([0.035, 0.03, 0.03], 0), {
      pos: [0, HEAD_CENTER[1] + 0.04, -0.325],
    }),
    'Head',
  );
}

/**
 * Adds her broad body: the shirt, the bib of the apron and its straps, and
 * at the hips the pants, the belt, and the skirt of the apron, down to
 * the knees.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addBody(model: Model): void {
  const flat: Placement = { scale: [1, 1, 0.82] };
  model.add(
    'skin',
    createLathe(
      [
        [0.07, 0.94],
        [0.07, 1.04],
      ],
      6,
    ),
    'Chest',
  );
  model.add(
    'shirt',
    place(
      createLathe(
        [
          [0, 0.62],
          [0.19, 0.63],
          [0.215, 0.76],
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
    'apron',
    place(createBox(0.27, 0.27, 0.03), {
      pos: [0, 0.8, 0.168],
      rot: [-4, 0, 0],
    }),
    'Chest',
  );
  for (const x of [1, -1]) {
    model.add(
      'strap',
      place(createBox(0.035, 0.24, 0.025), {
        pos: [0.1 * x, 0.92, 0.07],
        rot: [-58, 0, 0],
      }),
      'Chest',
    );
  }

  model.add(
    'pants',
    place(
      createLathe(
        [
          [0, 0.44],
          [0.23, 0.43],
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
    'strap',
    place(
      createLathe(
        [
          [0.19, 0.61],
          [0.215, 0.61],
          [0.215, 0.665],
          [0.19, 0.665],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'apron',
    place(
      createExtrusion(
        [
          [-0.2, 0],
          [0.2, 0],
          [0.17, 0.36],
          [-0.17, 0.36],
        ],
        0.03,
      ),
      { pos: [0, 0.3, 0.215], rot: [-7, 0, 0] },
    ),
    'Hips',
  );
}

/**
 * Adds her strong arms, in short sleeves rolled up above the elbows with
 * the forearms bare.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addArms(model: Model): void {
  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape): Shape =>
      place(shape, { pos: [0.25 * x, 0, 0] });
    model.add(
      'shirt',
      moveAside(
        createLathe(
          [
            [0, 0.97],
            [0.085, 0.945],
            [0.1, 0.86],
            [0.094, 0.79],
            [0, 0.78],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'cuff',
      moveAside(
        createLathe(
          [
            [0.09, 0.765],
            [0.108, 0.77],
            [0.108, 0.815],
            [0.09, 0.82],
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
            [0.068, 0.77],
            [0.06, 0.6],
            [0, 0.585],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      place(createEllipsoid([0.066, 0.068, 0.068], 1), {
        pos: [0.25 * x, 0.555, 0],
      }),
      `Hand${side}`,
    );
  }
}

/**
 * Adds the hammer in her right hand: a wooden handle that runs forward out
 * of her fist, with an iron head across its end, its face down.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addHammer(model: Model): void {
  const fist: Triple = [-0.25, 0.555, 0];
  model.add(
    'handle',
    place(createBox(0.032, 0.032, 0.36), {
      pos: [fist[0], fist[1], 0.15],
    }),
    'HandR',
  );
  model.add(
    'hammerHead',
    place(createBox(0.07, 0.13, 0.07), {
      pos: [fist[0], fist[1], HAMMER_FACE[2]],
    }),
    'HandR',
  );
}

/**
 * Adds the tongs in her left hand: two long arms that close on the bar.
 *
 * @param {Model} model - The model, with her materials and bones defined.
 */
function addTongs(model: Model): void {
  const grip: Triple = [0.25, 0.555, 0];
  for (const side of [1, -1]) {
    model.add(
      'tongs',
      createTube(
        [
          [grip[0], grip[1] + 0.012 * side, -0.04],
          [grip[0], grip[1] + 0.012 * side, 0.2],
          [grip[0], grip[1] + 0.006 * side - 0.015, TONGS_JAWS[2] - 0.03],
        ],
        [0.009, 0.009, 0.009],
        4,
      ),
      'HandL',
    );
    // The jaws are turned back against the pitch of the hand, so that they
    // lie level, one above the bar and one below it.
    model.add(
      'tongs',
      place(
        place(createBox(0.03, 0.01, 0.05), { pos: [0, 0.021 * side, 0] }),
        {
          pos: [grip[0], grip[1] - 0.015, TONGS_JAWS[2]],
          rot: [-TONGS_TURN[0], 0, 0],
        },
      ),
      'HandL',
    );
  }
}

/**
 * Creates the key poses of a stroke of the hammer.
 *
 * @returns {Strokes} The key poses.
 */
function createStrokes(): Strokes {
  const strikeTurn: Triple = [0, 0, 0];
  const atStrike: Triple = findWrist(STRIKE, HAMMER_FACE, strikeTurn);
  const struck: StrokePose = {
    body: {
      offset: [0, -0.04, 0],
      Hips: [5, 6, 0],
      Chest: [14, 10, -2],
      Head: [12, -8, 0],
    },
    wrist: atStrike,
    pitch: strikeTurn[0],
    yaw: strikeTurn[1],
  };
  return {
    raised: {
      body: {
        offset: [0, -0.012, 0],
        Hips: [-2, -6, 0],
        Chest: [-4, -10, 3],
        Head: [6, 10, -2],
      },
      wrist: [-0.4, 1.06, 0.0],
      pitch: -120,
      yaw: 12,
    },
    top: {
      body: {
        offset: [0, -0.008, 0],
        Hips: [-3, -8, 0],
        Chest: [-6, -12, 3],
        Head: [6, 12, -2],
      },
      wrist: [-0.4, 1.09, -0.03],
      pitch: -135,
      yaw: 14,
    },
    swung: {
      body: {
        offset: [0, -0.025, 0],
        Hips: [2, 0, 0],
        Chest: [6, 0, 0],
        Head: [10, 0, 0],
      },
      wrist: [-0.36, 1.0, 0.2],
      pitch: -55,
      yaw: 8,
    },
    falling: {
      body: {
        offset: [0, -0.033, 0],
        Hips: [4, 4, 0],
        Chest: [11, 6, -1],
        Head: [11, -5, 0],
      },
      wrist: [-0.24, 0.93, 0.27],
      pitch: -35,
      yaw: 4,
    },
    // Just before the blow the hammer comes straight down on the iron.
    landing: {
      ...struck,
      wrist: [atStrike[0], atStrike[1] + 0.05, atStrike[2] - 0.01],
      pitch: -8,
    },
    struck,
    rebound: {
      body: {
        offset: [0, -0.034, 0],
        Hips: [4, 5, 0],
        Chest: [12, 8, -1],
        Head: [12, -6, 0],
      },
      wrist: [atStrike[0], atStrike[1] + 0.07, atStrike[2] - 0.03],
      pitch: -18,
      yaw: 0,
    },
    settled: {
      body: {
        offset: [0, -0.03, 0],
        Hips: [3, 3, 0],
        Chest: [10, 5, 0],
        Head: [11, -4, 0],
      },
      wrist: [atStrike[0] - 0.03, atStrike[1] + 0.06, atStrike[2] - 0.05],
      pitch: -12,
      yaw: 4,
    },
    lifted: {
      body: {
        offset: [0, -0.02, 0],
        Hips: [1, -2, 0],
        Chest: [4, -4, 1],
        Head: [9, 4, 0],
      },
      wrist: [-0.38, 0.98, 0.16],
      pitch: -45,
      yaw: 6,
    },
  };
}

/**
 * Bakes her clips: hammering the iron, `Work`, and holding the hammer
 * still over it, `Idle`.
 *
 * @param {Model} model - The model, centered on its feet.
 * @returns {ReadonlyMap<string, ClipReport>} The measurements of the baked
 *   clips, by clip name.
 */
function animate(model: Model): ReadonlyMap<string, ClipReport> {
  const rig = new Rig(model);
  let overreach = 0;
  // Her feet stay where they stand, and the jaws of the tongs stay on the
  // bar, however her body moves.
  const plant = (pose: Pose): Pose => {
    overreach = Math.max(
      overreach,
      rig.reachLeg(pose, LEGS.L, [0.12, ANKLE_HEIGHT, 0.04], { yaw: 12 }),
      rig.reachLeg(pose, LEGS.R, [-0.12, ANKLE_HEIGHT, -0.1], { yaw: -18 }),
      rig.reachArm(pose, ARMS.L, findWrist(GRIP, TONGS_JAWS, TONGS_TURN), {
        pitch: TONGS_TURN[0],
        yaw: TONGS_TURN[1],
      }),
    );
    return pose;
  };
  const poseStroke = ({ body, wrist, pitch, yaw }: StrokePose): Pose => {
    const pose: Pose = rig.createPose(body);
    overreach = Math.max(
      overreach,
      rig.reachArm(pose, ARMS.R, wrist, { pitch, yaw }),
    );
    return plant(pose);
  };
  const strokes: Strokes = createStrokes();
  const keys: PoseKey[] = [
    { t: 0, pose: poseStroke(strokes.raised) },
    { t: 0.2, pose: poseStroke(strokes.top) },
    { t: 0.4, ease: 'in', pose: poseStroke(strokes.swung) },
    { t: 13 / 30, ease: 'linear', pose: poseStroke(strokes.falling) },
    { t: 14 / 30, ease: 'linear', pose: poseStroke(strokes.landing) },
    { t: 0.5, ease: 'linear', pose: poseStroke(strokes.struck) },
    { t: 0.63, ease: 'out', pose: poseStroke(strokes.rebound) },
    { t: 0.8, pose: poseStroke(strokes.settled) },
    { t: 1, pose: poseStroke(strokes.lifted) },
    { t: 1.2, pose: poseStroke(strokes.raised) },
  ];
  rig.bake(
    'Work',
    1.2,
    (t: number): PoseSample => ({ pose: plant(rig.interpolate(keys, t)) }),
    { loop: true },
  );
  rig.noteOverreach('Work', overreach);
  overreach = 0;

  // Idling, she holds the hammer still over the iron, its face about 12.5 cm
  // above it, keeps the iron in her tongs, and breathes.
  const { settled } = strokes;
  rig.bake(
    'Idle',
    2.4,
    (t: number): PoseSample => {
      const breath: number = (1 - Math.cos((2 * Math.PI * t) / 2.4)) / 2;
      const body: PoseSpec = {
        ...settled.body,
        Chest: [10 + 2 * breath, 5, 0],
        Head: [11 - 1.5 * breath, -4 + 3 * Math.sin((2 * Math.PI * t) / 2.4), 0],
      };
      return { pose: poseStroke({ ...settled, body }) };
    },
    { loop: true },
  );
  rig.noteOverreach('Idle', overreach);
  return rig.report;
}

/**
 * Builds Emma, the smith: a sturdy, strong-armed woman in a leather apron
 * over her shirt and pants, her sleeves rolled up and her hair tied up in
 * a bun under a kerchief, with a hammer in her right hand and tongs in her
 * left, who hammers a bar of hot iron on an anvil.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcEmma(): BuiltModel {
  const model = new Model('NpcEmma');
  setMaterials(model);
  addNpcBones(model);
  addHeadAndKerchief(model);
  addBody(model);
  addArms(model);
  // Her legs, in pants and boots.
  addNpcLegs(model, [
    {
      material: 'boot',
      profile: [
        [0, 0.33],
        [0.092, 0.32],
        [0.085, 0.07],
        [0, 0.06],
      ],
    },
  ]);
  addHammer(model);
  addTongs(model);
  // The model is centered on its feet before it is posed, so that the
  // hammer lands where it is aimed in the model as it is written.
  model.centerOn(['FootL', 'FootR']);
  return { model, report: animate(model) };
}
