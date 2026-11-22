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
 *   the porch of her house, and who is the enemy spy, with the pitchfork
 *   she fights with.
 */

import { Quaternion, Vector3 } from 'three';

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
import { addPitchfork } from './pitchfork.ts';
import { Rig, easeProgress } from './rig.ts';
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
 * Where the pitchfork is gripped in the right hand, in model space at rest:
 * in the middle of the fist.
 */
const FORK_GRIP: Triple = [-0.25, 0.555, 0];

/** How long a thrust of the pitchfork lasts, in seconds. */
const THRUST_DURATION = 0.6;

/** How long she takes to sit down on the ground, in seconds. */
const SIT_DURATION = 1.2;

/** How long a stride of her walk lasts, in seconds. */
const STRIDE_DURATION = 1;

/**
 * How far she leans forward from the waist on her guard, in degrees,
 * which her head makes up for, to keep her eyes ahead.
 */
const GUARD_LEAN = 8;

/**
 * How far she turns to her right on her guard, a third from her hips and
 * the rest from her waist, in degrees, which her head makes up for, to
 * keep her eyes ahead: her left shoulder forward, so that her short arms
 * reach the shaft of the pitchfork.
 */
const GUARD_TWIST = -35;

/** Where Martha holds her pitchfork with both hands. */
interface ForkGrip {
  /** Where her right wrist is, which grips it, in model space. */
  readonly right: Triple;
  /** Where her left wrist is, further along it, in model space. */
  readonly left: Triple;
}

/** How Martha stands at a key moment of a thrust of her pitchfork. */
interface ThrustKey {
  /** The moment, in seconds from the start of the thrust. */
  readonly t: number;
  /** Where she holds the pitchfork. */
  readonly grip: ForkGrip;
  /** How far she leans into the thrust, from -1 back to 1 forward. */
  readonly lean: number;
  /**
   * How far she turns from the waist, in degrees: to her right if less
   * than 0.
   */
  readonly twist: number;
}

/**
 * Where Martha holds her pitchfork on her guard: diagonally across her
 * body, her rear, right, hand at her hip and her front, left, hand before
 * her chest, so that its tines point forward and a little up.
 */
const GUARD_GRIP: ForkGrip = {
  right: [-0.18, 0.7, 0.04],
  left: [-0.05, 0.84, 0.3],
};

/**
 * How far her hips tip back as she sits beaten, in degrees: her skirt
 * spreads out before her, sloping a little down to its hem, as her knees
 * are drawn up under it.
 */
const SIT_HIPS = -80;

/**
 * How far she sinks as she sits beaten, in metres, with her hips tipped
 * back, to sit on the ground, her skirt resting on its hem.
 */
const SIT_DROP = 0.1;

/**
 * How she holds her body as she sits beaten, in degrees, in model space:
 * bent a little forward over her knees, catching her breath.
 */
const SIT_CHEST: Triple = [22, 0, 0];

/**
 * How she holds her head as she sits beaten, in degrees, in model space:
 * bowed.
 */
const SIT_HEAD: Triple = [44, 0, 0];

/**
 * Where her wrists are as she sits beaten, in model space: her hands
 * resting on her knees, her elbows out to the sides.
 */
const SIT_HANDS: ForkGrip = {
  right: [-0.16, 0.66, 0.3],
  left: [0.16, 0.66, 0.3],
};

/**
 * Finds where Martha holds her pitchfork as she thrusts it: level at her
 * waist, pointing forward, her hands a little apart along it.
 *
 * @param {number} reach - How far forward her hands are, in metres.
 * @param {number} rise - How far up her hands are, in metres.
 * @returns {ForkGrip} Where she holds it.
 */
function findThrustGrip(reach: number, rise: number): ForkGrip {
  return {
    right: [-0.08, 0.8 + rise, -0.04 + reach],
    left: [-0.06, 0.81 + rise, 0.22 + reach],
  };
}

/**
 * Finds a grip between two.
 *
 * @param {ForkGrip} a - One grip.
 * @param {ForkGrip} b - The other grip.
 * @param {number} weight - The weight of the other grip, from 0 to 1.
 * @returns {ForkGrip} The grip between them.
 */
function mixGrips(a: ForkGrip, b: ForkGrip, weight: number): ForkGrip {
  const mix = (from: Triple, to: Triple): Triple => [
    from[0] + (to[0] - from[0]) * weight,
    from[1] + (to[1] - from[1]) * weight,
    from[2] + (to[2] - from[2]) * weight,
  ];
  return { right: mix(a.right, b.right), left: mix(a.left, b.left) };
}

/**
 * Finds how a bone is turned in model space, in a pose.
 *
 * @param {Model} model - The model.
 * @param {Pose} pose - The pose.
 * @param {number} bone - The index of the bone.
 * @returns {Quaternion} The turn.
 */
function findWorldTurn(model: Model, pose: Pose, bone: number): Quaternion {
  const chain: number[] = [];
  for (
    let index = bone;
    index >= 0;
    index = getItem(model.bones, index).parent
  ) {
    chain.unshift(index);
  }
  const turn = new Quaternion();
  for (const index of chain) {
    turn.multiply(getItem(pose.rotations, index));
  }
  return turn;
}

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
 * She walks with her arms swinging.  Holding a pitchfork, which hangs on a
 * bone of its own, `Pitchfork`, for the game to show only while she holds
 * it, she stands and walks on her guard, holding it diagonally across her
 * body in both hands, its tines forward and a little up, in clips of
 * their own, `IdleArmed` and `WalkArmed`; she
 * thrusts it forward with both hands, its tines reaching two metres in
 * front of her; and she sits down on the ground, beaten, for a breather,
 * her skirt spread before her, bent a little forward with her hands on her
 * knees and her head bowed, catching her breath, as she has dropped the
 * pitchfork, which the game shows lying beside her.
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
  model.addBone('Pitchfork', 'HandR', FORK_GRIP);

  // The head, with level brows and lids lowered a little over the eyes, and
  // the hair swept back into a low knot, silver at the temples.
  addHead(model);
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

  // The pitchfork, gripped in her right fist.
  addPitchfork(model, 'Pitchfork', FORK_GRIP);

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
  const hand: number = model.findBone('HandR');
  const fork: number = model.findBone('Pitchfork');
  // Turns the pitchfork in her right hand as it is to be turned in model
  // space, wherever her hand is.
  const turnFork = (pose: Pose, turn: Quaternion): Pose => {
    getItem(pose.rotations, fork).copy(
      findWorldTurn(model, pose, hand).invert().multiply(turn),
    );
    return pose;
  };
  // Puts both her hands on the shaft of the pitchfork, her right hand
  // where it is gripped and her left further along it, towards its head,
  // which points on from her right hand past her left.
  const holdFork = (pose: Pose, { right, left }: ForkGrip): Pose => {
    overreach = Math.max(
      overreach,
      rig.reachArm(pose, ARMS.R, right, { yaw: 0 }),
      rig.reachArm(pose, ARMS.L, left, { yaw: 0 }),
    );
    const along: Vector3 = new Vector3(...left)
      .sub(new Vector3(...right))
      .normalize();
    return turnFork(
      pose,
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), along),
    );
  };
  // The pitchfork lies level, its tines forward, at rest, and so it is
  // turned while she does not hold it, out of sight.
  const level = new Quaternion();

  const sampleIdle = (t: number, isArmed = false): PoseSample => {
    // Her weight shifts from one foot to the other and back, and she
    // breathes, twice as often.
    const shift: number = Math.sin((2 * Math.PI * t) / 7.2);
    const breath: number = (1 - Math.cos((2 * Math.PI * t) / 3.6)) / 2;
    const hips: Triple = [0, 3 * shift, 0.6 * shift];
    const twist: number = isArmed ? GUARD_TWIST : 0;
    const pose: Pose = rig.createPose({
      Hips: [hips[0], hips[1] + twist / 3, hips[2]],
      Chest: [
        1.5 * breath + (isArmed ? GUARD_LEAN : 0),
        -2 * shift + (twist * 2) / 3,
        -1.8 * shift,
      ],
    });
    // Her head stays level as her body sways; on her guard, leaning a
    // little forward and turned to her right, she keeps her eyes ahead.
    getItem(pose.rotations, head)
      .copy(
        isArmed
          ? createRotation([-GUARD_LEAN, -GUARD_TWIST, 0])
          : getItem(rig.interpolate(looks, t).rotations, head),
      )
      .multiply(createRotation([-1.5 * breath, 0, 1.2 * shift]));
    return {
      pose: isArmed
        ? holdFork(pose, GUARD_GRIP)
        : turnFork(setHands(pose, hips), level),
    };
  };
  rig.bake('Idle', 7.2, (t: number) => sampleIdle(t), { loop: true });
  rig.noteOverreach('Idle', overreach);
  // On her guard, she holds the pitchfork diagonally across her body in
  // both hands, her right hand at her hip and her left before her chest,
  // its tines forward and a little up.
  overreach = 0;
  rig.bake('IdleArmed', 7.2, (t: number) => sampleIdle(t, true), {
    loop: true,
  });
  rig.noteOverreach('IdleArmed', overreach);
  const guardStart: Pose = sampleIdle(0, true).pose;

  // She strides along, her skirt swaying, and rises a little at every
  // step: with her arms swinging at her sides, clear of her skirt, or on
  // her guard, with the pitchfork held as she stands on it.
  const sampleWalk = (t: number, isArmed: boolean): PoseSample => {
    const swing: number = Math.sin((2 * Math.PI * t) / STRIDE_DURATION);
    const step: number = Math.cos((4 * Math.PI * t) / STRIDE_DURATION);
    const pose: Pose = rig.createPose({
      offset: [0, 0.012 * (1 - step), 0],
      Hips: [0, 5 * swing + (isArmed ? GUARD_TWIST / 3 : 0), 1.5 * swing],
      Chest: [
        3 + (isArmed ? GUARD_LEAN : 0),
        -7 * swing + (isArmed ? (GUARD_TWIST * 2) / 3 : 0),
        -1.5 * swing,
      ],
      Head: [
        -2 - (isArmed ? GUARD_LEAN : 0),
        2 * swing - (isArmed ? GUARD_TWIST : 0),
        0,
      ],
      ...(isArmed
        ? {}
        : {
            UpperArmL: [24 * swing, 0, 10],
            ForeArmL: [-18 + 8 * swing, 0, 0],
            UpperArmR: [-24 * swing, 0, -10],
            ForeArmR: [-18 - 8 * swing, 0, 0],
          }),
    });
    return {
      pose: isArmed ? holdFork(pose, GUARD_GRIP) : turnFork(pose, level),
    };
  };
  overreach = 0;
  rig.bake('Walk', STRIDE_DURATION, (t: number) => sampleWalk(t, false), {
    loop: true,
  });
  rig.bake('WalkArmed', STRIDE_DURATION, (t: number) => sampleWalk(t, true), {
    loop: true,
  });
  rig.noteOverreach('WalkArmed', overreach);

  // She thrusts the pitchfork forward with both hands on its shaft from
  // her guard: she winds up, drawing it back as she leans back and turns
  // further from the waist; she lunges, driving it forward and level at her
  // waist, its butt under her right arm, which strikes halfway through; she
  // holds it out a moment; and she recovers, drawing it back onto her guard
  // again.
  const thrustKeys: ThrustKey[] = [
    { t: 0, grip: GUARD_GRIP, lean: 0, twist: GUARD_TWIST },
    { t: 0.15, grip: findThrustGrip(-0.14, 0.04), lean: -0.35, twist: -42 },
    { t: 0.3, grip: findThrustGrip(0.32, -0.04), lean: 1, twist: -18 },
    { t: 0.38, grip: findThrustGrip(0.32, -0.04), lean: 1, twist: -18 },
    { t: 0.48, grip: findThrustGrip(0, 0), lean: 0.3, twist: -26 },
    { t: THRUST_DURATION, grip: GUARD_GRIP, lean: 0, twist: GUARD_TWIST },
  ];
  overreach = 0;
  rig.bake(
    'Attack',
    THRUST_DURATION,
    (t: number): PoseSample => {
      if (t <= 0 || t >= THRUST_DURATION) {
        return { pose: guardStart.clone() };
      }
      const after: number = thrustKeys.findIndex(
        (key: ThrustKey) => key.t >= t,
      );
      const a: ThrustKey = getItem(thrustKeys, after - 1);
      const b: ThrustKey = getItem(thrustKeys, after);
      const w: number = easeProgress((t - a.t) / (b.t - a.t));
      const mix = (from: number, to: number): number => from + (to - from) * w;
      const lean: number = mix(a.lean, b.lean);
      const twist: number = mix(a.twist, b.twist);
      const pose: Pose = rig.createPose({
        offset: [0, 0, 0.15 * lean],
        Hips: [0, twist / 3, 0],
        Chest: [GUARD_LEAN + 16 * lean, (twist * 2) / 3, 0],
        Head: [-GUARD_LEAN - 10 * lean, -twist, 0],
      });
      return { pose: holdFork(pose, mixGrips(a.grip, b.grip, w)) };
    },
    { settle: true },
  );
  rig.noteOverreach('Attack', overreach);

  // Beaten, she sits down on the ground from her guard, as one sits down
  // to catch one's breath after a run: her hips tip back, her skirt
  // spreading out before her with the toes of her shoes peeping up at its
  // end; she bends a little forward, her hands resting on her knees and
  // her elbows out to the sides; and she bows her head.  She has dropped
  // the pitchfork, out of sight, which turns level.
  const hips: number = model.findBone('Hips');
  const chest: number = model.findBone('Chest');
  const guardTurns: Quaternion[] = [hips, chest, head].map((bone: number) =>
    findWorldTurn(model, guardStart, bone),
  );
  const [guardHips, guardChest, guardHead] = guardTurns as [
    Quaternion,
    Quaternion,
    Quaternion,
  ];
  const guardFork: Quaternion = findWorldTurn(model, guardStart, fork);
  const sitHips: Quaternion = createRotation([SIT_HIPS, 0, 0]);
  const sitChest: Quaternion = createRotation(SIT_CHEST);
  const sitHead: Quaternion = createRotation(SIT_HEAD);
  // Turns a bone between how it is turned in model space on her guard and
  // as she sits, whatever its parent.
  const turnBone = (
    pose: Pose,
    bone: number,
    from: Quaternion,
    to: Quaternion,
    weight: number,
  ): void => {
    const parent: number = getItem(model.bones, bone).parent;
    const turn: Quaternion = from.clone().slerp(to, weight);
    getItem(pose.rotations, bone).copy(
      findWorldTurn(model, pose, parent).invert().multiply(turn),
    );
  };
  overreach = 0;
  rig.bake('Sit', SIT_DURATION, (t: number): PoseSample => {
    const down: number = easeProgress(t / (SIT_DURATION - 0.2));
    const pose: Pose = rig.createPose({ offset: [0, -SIT_DROP * down, 0] });
    turnBone(pose, hips, guardHips, sitHips, down);
    turnBone(pose, chest, guardChest, sitChest, down);
    turnBone(pose, head, guardHead, sitHead, down);
    const { right, left } = mixGrips(GUARD_GRIP, SIT_HANDS, down);
    overreach = Math.max(
      overreach,
      rig.reachArm(pose, ARMS.R, right, { yaw: -ELBOW_YAW * down }),
      rig.reachArm(pose, ARMS.L, left, { yaw: ELBOW_YAW * down }),
    );
    return {
      pose: turnFork(pose, guardFork.clone().slerp(level, down)),
      snap: 1,
    };
  });
  rig.noteOverreach('Sit', overreach);
  model.centreOn([]);
  return { model, report: rig.report };
}
