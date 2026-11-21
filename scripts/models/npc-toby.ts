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
 * @module scripts/models/npc-toby Toby, the small boy who hunts for
 *   four-leaved clover west of the village gate.
 */

import type { Quaternion } from 'three';

import {
  SIMULATION_RATE,
  TOBY_ACTIVITY_STEPS,
  TOBY_RUN_SPEED,
} from '@clovervale/shared';

import {
  SIDES,
  SKINS,
  addHead,
  computeStep,
  createHair,
  findHeadPoint,
  fitToHead,
  setFaceMaterials,
} from './characters.ts';
import type { Gait, Hair, HeadFit, Step } from './characters.ts';
import {
  createBox,
  createEllipsoid,
  createExtrusion,
  createLathe,
  place,
} from './geometry.ts';
import type { Placement, Shape, Triple } from './geometry.ts';
import { Model } from './model.ts';
import { Rig, easeProgress } from './rig.ts';
import type {
  ArmBones,
  BakeOptions,
  BuiltModel,
  LegBones,
  Pose,
  PoseSample,
  PoseSpec,
} from './rig.ts';

/**
 * How long one stride of his run lasts, in seconds: a quick, short stride,
 * of which his run from one patch of clover to the other takes a whole
 * number.
 */
const RUN_CYCLE = 0.35;

/**
 * How long he takes to squat down, in seconds, as long as his course gives
 * him for it.
 */
const SQUAT_DURATION: number = TOBY_ACTIVITY_STEPS.Squat / SIMULATION_RATE;

/**
 * How long he takes to stand up, in seconds, as long as his course gives
 * him for it.
 */
const RISE_DURATION: number = TOBY_ACTIVITY_STEPS.Rise / SIMULATION_RATE;

/**
 * How long he takes to turn round, in seconds, as long as his course gives
 * him for it.
 */
const TURN_DURATION: number = TOBY_ACTIVITY_STEPS.Turn / SIMULATION_RATE;

/** The number of frames a second of his run is baked at. */
const RUN_FPS = 90;

/** How long one round of picking at the clover lasts, in seconds. */
const PICK_DURATION = 2;

/** How long one round of idling lasts, in seconds. */
const IDLE_DURATION = 2.4;

/** Where his head sits, and how big it is next to that of a grown-up. */
const HEAD: HeadFit = { centre: [0, 0.83, 0], scale: 0.88 };

/**
 * The height of the ankles above the ground with the soles flat on it,
 * which keeps the soles about 2 mm above it, the clearance baking keeps
 * under every frame, so that no frame is lifted and each clip starts and
 * ends on the very pose the next one takes up.
 */
const ANKLE_HEIGHT = 0.062;

/** How far apart his feet stand, from the middle, and how they turn out. */
const STANCE = { x: 0.085, yaw: 8 };

/**
 * How far apart his feet are as he squats, from the middle, and how far
 * they and his knees turn out, his round belly between his knees.
 */
const SQUAT_STANCE = { x: 0.14, yaw: 45 };

/**
 * How far out from the middle his shoulders are, which keeps his arms
 * clear of his round belly as they hang.
 */
const SHOULDER_X = 0.17;

/** How he runs: short, quick strides with his feet off the ground between. */
const RUN_GAIT: Gait = {
  duty: 0.3,
  stride: TOBY_RUN_SPEED * RUN_CYCLE,
  lift: 0.05,
  ankle: ANKLE_HEIGHT,
  heel: 0.05,
  toe: 0.105,
  strike: 8,
  push: 26,
  centre: 0.02,
};

/** The bones of the legs. */
const LEGS: Readonly<Record<'L' | 'R', LegBones>> = {
  L: ['ThighL', 'ShinL', 'FootL'],
  R: ['ThighR', 'ShinR', 'FootR'],
};

/** The bones of the arms. */
const ARMS: Readonly<Record<'L' | 'R', ArmBones>> = {
  L: ['UpperArmL', 'ForeArmL', 'HandL'],
  R: ['UpperArmR', 'ForeArmR', 'HandR'],
};

/** How he stands at ease, his arms hanging loose. */
const STANDING: PoseSpec = {
  Chest: [1, 0, 0],
  Head: [0, 0, 0],
  UpperArmL: [3, 0, 9],
  ForeArmL: [-14, 0, 0],
  UpperArmR: [3, 0, -9],
  ForeArmR: [-14, 0, 0],
};

/**
 * How he squats at the edge of the clover: flat-footed, sitting low on his
 * heels with his knees wide apart, his back bent over between them and his
 * head bowed to the leaves in front of him.
 */
const SQUATTING: PoseSpec = {
  offset: [0, -0.2, -0.085],
  Hips: [34, 0, 0],
  Chest: [24, 0, 0],
  Head: [-22, 0, 0],
};

/** Where a foot is to be, and how it meets the ground. */
interface FootPlace {
  /** The ankle, in model space. */
  readonly ankle: Triple;
  /** The pitch of the foot in degrees, positive with the toes down. */
  readonly pitch: number;
  /** The heading of the foot and the knee in degrees. */
  readonly yaw: number;
}

/**
 * Creates the sole and the upper of a small shoe from its side profile.
 *
 * @returns {Shape} The shoe, around its ankle bone at the origin of X.
 */
function createShoe(): Shape {
  return place(
    createExtrusion(
      [
        [-0.05, 0],
        [0.095, 0],
        [0.105, 0.025],
        [0.078, 0.052],
        [0.012, 0.072],
        [-0.05, 0.072],
      ],
      0.095,
    ),
    { rot: [0, -90, 0] },
  );
}

/**
 * Creates a stretch of a strap of his braces, lying along the line
 * between two points down one side of his front or his back.
 *
 * @param {number} x - How far to the side the strap runs, in metres.
 * @param {readonly [number, number]} from - The height and the depth of
 *   one end, in metres.
 * @param {readonly [number, number]} to - The height and the depth of the
 *   other end, in metres.
 * @returns {Shape} The stretch of the strap.
 */
function createStrap(
  x: number,
  from: readonly [number, number],
  to: readonly [number, number],
): Shape {
  const [y0, z0] = from;
  const [y1, z1] = to;
  const length: number = Math.hypot(y1 - y0, z1 - z0);
  const tilt: number = (Math.atan2(z1 - z0, y1 - y0) * 180) / Math.PI;
  return place(createBox(0.026, length + 0.008, 0.012), {
    pos: [x, (y0 + y1) / 2, (z0 + z1) / 2],
    rot: [tilt, 0, 0],
  });
}

/**
 * Builds the mesh and the skeleton of Toby: a small boy of five or so,
 * about two thirds the height of a grown-up and plainly a child, with a
 * big round head of short, tousled chestnut hair and freckles across his
 * nose, in a straw-coloured shirt with short sleeves and a round collar,
 * brown short trousers held up by blue braces, his knees bare, and white
 * socks in small brown shoes.
 *
 * @returns {Model} The model without animations.
 */
function buildBody(): Model {
  const model = new Model('NpcToby');
  setFaceMaterials(model, SKINS.light);
  model.setMaterial('blush', '#f4a08e');
  model.setMaterial('freckle', '#c78657');
  model.setMaterial('hair', '#94572b');
  model.setMaterial('shirt', '#f1dc9a');
  model.setMaterial('collar', '#fbf5e4');
  model.setMaterial('shorts', '#6e4b2e');
  model.setMaterial('braces', '#2f5d93');
  model.setMaterial('button', '#d8b35a', { roughness: 0.6 });
  model.setMaterial('sock', '#eee9dd');
  model.setMaterial('shoe', '#5b3923');

  model.addBone('Hips', null, [0, 0.34, 0]);
  model.addBone('Chest', 'Hips', [0, 0.43, 0]);
  model.addBone('Head', 'Chest', [0, 0.615, 0]);
  for (const [side, x] of SIDES) {
    model.addBone(`UpperArm${side}`, 'Chest', [SHOULDER_X * x, 0.58, 0]);
    model.addBone(`ForeArm${side}`, `UpperArm${side}`, [
      SHOULDER_X * x,
      0.475,
      0,
    ]);
    model.addBone(`Hand${side}`, `ForeArm${side}`, [SHOULDER_X * x, 0.37, 0]);
    model.addBone(`Thigh${side}`, 'Hips', [STANCE.x * x, 0.33, 0]);
    model.addBone(`Shin${side}`, `Thigh${side}`, [STANCE.x * x, 0.195, 0]);
    model.addBone(`Foot${side}`, `Shin${side}`, [STANCE.x * x, 0.06, 0]);
  }

  // The big round head of a child, with freckles across the nose and the
  // cheeks, and short, tousled hair.
  addHead(model, 'Head', HEAD);
  for (const side of [1, -1]) {
    for (const [yaw, down] of [
      [15, 12],
      [21, 16],
      [27, 11],
      [33, 15],
    ] as const) {
      model.add(
        'freckle',
        fitToHead(
          place(createEllipsoid([0.01, 0.01, 0.004], 0), {
            pos: findHeadPoint(yaw * side, down, 0.997),
            rot: [down, yaw * side, 0],
          }),
          HEAD,
        ),
        'Head',
      );
    }
  }
  const hair: Hair = createHair('tufts');
  model.add('hair', fitToHead(hair.hair, HEAD), 'Head');
  model.add('hair', fitToHead(hair.accent, HEAD), 'Head');

  // The shirt over his round belly, with its round collar and two buttons
  // down the front, and the braces over it, front and back.
  const flat: Placement = { scale: [1, 1, 0.9] };
  model.add(
    'skin',
    createLathe(
      [
        [0.04, 0.575],
        [0.04, 0.64],
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
          [0, 0.4],
          [0.132, 0.405],
          [0.148, 0.47],
          [0.14, 0.53],
          [0.115, 0.578],
          [0.07, 0.596],
          [0, 0.6],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  model.add(
    'collar',
    place(
      createLathe(
        [
          [0.07, 0.582],
          [0.092, 0.586],
          [0.07, 0.618],
          [0.048, 0.618],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  for (const [y, z] of [
    [0.555, 0.108],
    [0.51, 0.121],
  ] as const) {
    model.add(
      'button',
      place(createEllipsoid([0.011, 0.011, 0.008], 0), { pos: [0, y, z] }),
      'Chest',
    );
  }
  for (const x of [1, -1]) {
    for (const z of [1, -1]) {
      for (const [from, to] of [
        [
          [0.42, 0.113],
          [0.475, 0.1245],
        ],
        [
          [0.475, 0.1245],
          [0.56, 0.0975],
        ],
        [
          [0.56, 0.0975],
          [0.595, 0.036],
        ],
      ] as const) {
        model.add(
          'braces',
          createStrap(0.062 * x, [from[0], from[1] * z], [to[0], to[1] * z]),
          'Chest',
        );
      }
    }
    model.add(
      'braces',
      place(createBox(0.026, 0.014, 0.08), { pos: [0.062 * x, 0.598, 0] }),
      'Chest',
    );
  }

  // The short trousers, with the buttons the braces fasten to.
  model.add(
    'shorts',
    place(
      createLathe(
        [
          [0, 0.285],
          [0.138, 0.29],
          [0.148, 0.36],
          [0.137, 0.425],
          [0, 0.432],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  for (const x of [1, -1]) {
    model.add(
      'button',
      place(createEllipsoid([0.012, 0.012, 0.008], 0), {
        pos: [0.062 * x, 0.418, 0.111],
      }),
      'Hips',
    );
  }

  // The short, chubby arms, in short sleeves, and the short, chubby legs,
  // in the legs of the short trousers, bare at the knee, with white socks
  // and small shoes.
  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape, px = SHOULDER_X): Shape =>
      place(shape, { pos: [px * x, 0, 0] });
    model.add(
      'shirt',
      moveAside(
        createLathe(
          [
            [0, 0.602],
            [0.058, 0.586],
            [0.062, 0.525],
            [0.06, 0.51],
            [0, 0.505],
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
            [0, 0.522],
            [0.045, 0.514],
            [0.047, 0.488],
            [0.041, 0.465],
            [0, 0.458],
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
            [0, 0.488],
            [0.042, 0.478],
            [0.043, 0.43],
            [0.036, 0.388],
            [0, 0.382],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      place(createEllipsoid([0.044, 0.048, 0.048], 1), {
        pos: [SHOULDER_X * x, 0.355, 0],
      }),
      `Hand${side}`,
    );
    model.add(
      'shorts',
      moveAside(
        createLathe(
          [
            [0, 0.345],
            [0.078, 0.333],
            [0.075, 0.255],
            [0.077, 0.242],
            [0, 0.237],
          ],
          6,
        ),
        STANCE.x,
      ),
      `Thigh${side}`,
    );
    model.add(
      'skin',
      moveAside(
        createLathe(
          [
            [0, 0.258],
            [0.056, 0.25],
            [0.058, 0.225],
            [0.051, 0.192],
            [0, 0.184],
          ],
          6,
        ),
        STANCE.x,
      ),
      `Thigh${side}`,
    );
    model.add(
      'skin',
      moveAside(
        createLathe(
          [
            [0, 0.205],
            [0.051, 0.196],
            [0.054, 0.165],
            [0.046, 0.128],
            [0, 0.122],
          ],
          6,
        ),
        STANCE.x,
      ),
      `Shin${side}`,
    );
    model.add(
      'sock',
      moveAside(
        createLathe(
          [
            [0, 0.138],
            [0.048, 0.132],
            [0.045, 0.07],
            [0, 0.066],
          ],
          6,
        ),
        STANCE.x,
      ),
      `Shin${side}`,
    );
    model.add('shoe', moveAside(createShoe(), STANCE.x), `Foot${side}`);
  }
  return model;
}

/**
 * Bakes the animation clips of Toby: idling; running, in step with the
 * ground he covers at the speed of his run; squatting down from his run at
 * the edge of the clover; picking at it, over and over; standing up; and
 * turning round on the spot to set off on his run again.  Each clip that
 * leads into another ends on the very pose the other starts from.
 *
 * @param {Model} model - The model of Toby.
 * @returns {Rig} The rig the clips were baked with, with what was
 *   measured.
 */
function animateBody(model: Model): Rig {
  const rig = new Rig(model);
  let overreach = 0;
  const bake = (
    name: string,
    duration: number,
    sample: (time: number) => PoseSample,
    options: BakeOptions = {},
  ): void => {
    overreach = 0;
    rig.bake(name, duration, sample, options);
    rig.noteOverreach(name, overreach);
  };
  const placeFeet = (pose: Pose, left: FootPlace, right: FootPlace): Pose => {
    overreach = Math.max(
      overreach,
      rig.reachLeg(pose, LEGS.L, left.ankle, {
        pitch: left.pitch,
        yaw: left.yaw,
      }),
      rig.reachLeg(pose, LEGS.R, right.ankle, {
        pitch: right.pitch,
        yaw: right.yaw,
      }),
    );
    return pose;
  };
  const reachHands = (pose: Pose, left: Triple, right: Triple): Pose => {
    overreach = Math.max(
      overreach,
      rig.reachArm(pose, ARMS.L, left, { pitch: 20, yaw: -12 }),
      rig.reachArm(pose, ARMS.R, right, { pitch: 20, yaw: 12 }),
    );
    return pose;
  };
  const standFoot = (x: number, z = 0): FootPlace => ({
    ankle: [STANCE.x * x, ANKLE_HEIGHT, z],
    pitch: 0,
    yaw: STANCE.yaw * x,
  });
  const squatFoot = (x: number): FootPlace => ({
    ankle: [SQUAT_STANCE.x * x, ANKLE_HEIGHT, 0.02],
    pitch: 0,
    yaw: SQUAT_STANCE.yaw * x,
  });
  const runFoot = (x: number, phase: number): FootPlace => {
    const step: Step = computeStep(phase, RUN_GAIT);
    return {
      ankle: [STANCE.x * x, step.y, step.z],
      pitch: step.pitch,
      yaw: 2 * x,
    };
  };

  // Idling: he breathes, swings his arms a little and looks about.
  const poseIdle = (t: number): Pose => {
    const angle: number = (2 * Math.PI * t) / IDLE_DURATION;
    const breath: number = (1 - Math.cos(angle)) / 2;
    const sway: number = Math.sin(angle);
    const pose: Pose = rig.createPose({
      ...STANDING,
      offset: [0, -0.006 - 0.01 * breath, 0],
      Chest: [1 + 2 * breath, 0, 0],
      Head: [-2 * breath, 6 * sway, 2 * sway],
      UpperArmL: [3 - 3 * sway, 0, 9 + 3 * breath],
      UpperArmR: [3 + 3 * sway, 0, -9 - 3 * breath],
    });
    return placeFeet(pose, standFoot(1), standFoot(-1));
  };
  const idleStart: Pose = poseIdle(0);
  bake(
    'Idle',
    IDLE_DURATION,
    (t: number): PoseSample => ({ pose: poseIdle(t) }),
    { loop: true },
  );

  // Running: short, quick strides, leaning into his run, his arms pumping
  // with his elbows bent.
  const poseRun = (t: number): Pose => {
    const phase: number = t / RUN_CYCLE;
    const c: number = Math.cos(2 * Math.PI * phase);
    const pose: Pose = rig.createPose({
      offset: [0, -0.064 - 0.012 * Math.cos(4 * Math.PI * (phase - 0.15)), 0],
      Hips: [9, -9 * c, 0],
      Chest: [7, 13 * c, 0],
      Head: [-12, -7 * c, 0],
      UpperArmL: [42 * c - 6, 0, 10],
      ForeArmL: [-78 + 14 * c, 0, 0],
      UpperArmR: [-42 * c - 6, 0, -10],
      ForeArmR: [-78 - 14 * c, 0, 0],
    });
    return placeFeet(pose, runFoot(1, phase), runFoot(-1, phase + 0.5));
  };
  const runStart: Pose = poseRun(0);
  // A stride is short, so it takes more frames a second than the other
  // clips for the feet to keep to the ground between them.
  bake(
    'Run',
    RUN_CYCLE,
    (t: number): PoseSample => ({ pose: poseRun(t) }),
    { loop: true, fps: RUN_FPS },
  );

  // Picking at the clover: squatting, he reaches into the leaves with one
  // hand and then the other, plucks at them, and holds a leaf up to look
  // at it before he lets it drop and reaches in again.
  const posePick = (t: number): Pose => {
    const u: number = t / PICK_DURATION;
    const angle: number = 2 * Math.PI * u;
    const lift: number = easeProgress(
      Math.min(Math.max((u - 0.55) / 0.15, 0), 1) *
        Math.min(Math.max((0.95 - u) / 0.15, 0), 1),
    );
    const pose: Pose = rig.createPose({
      ...SQUATTING,
      Hips: [34 + 2 * Math.sin(angle), 3 * Math.sin(angle), 0],
      Head: [-22 + 10 * lift, 8 * Math.sin(angle), 4 * Math.sin(2 * angle)],
    });
    placeFeet(pose, squatFoot(1), squatFoot(-1));
    // The left hand plucks at the leaves twice as often as the right one
    // dips in, and the right one lifts a leaf up to his face.
    const pluck: number = (1 - Math.cos(2 * angle)) / 2;
    const dip: number = (1 - Math.cos(angle)) / 2;
    const left: Triple = [0.09, 0.13 + 0.04 * pluck, 0.175 + 0.02 * pluck];
    const right: Triple = [
      -0.09,
      0.13 + 0.04 * dip * (1 - lift) + 0.08 * lift,
      0.175 + 0.02 * dip + 0.04 * lift,
    ];
    return reachHands(pose, left, right);
  };
  const pickStart: Pose = posePick(0);
  bake(
    'Pick',
    PICK_DURATION,
    (t: number): PoseSample => ({ pose: posePick(t) }),
    { loop: true },
  );

  // Squatting down from his run: he brings his back foot up beside the
  // front one and drops down onto his heels, reaching for the clover.
  bake('Squat', SQUAT_DURATION, (t: number): PoseSample => {
    if (t <= 0) {
      return { pose: runStart.clone() };
    }
    if (t >= SQUAT_DURATION) {
      return { pose: pickStart.clone() };
    }
    const share: number = t / SQUAT_DURATION;
    const body: Pose = runStart.blend(pickStart, easeProgress(share));
    // His hands come forward and down in front of him into the clover,
    // clear of his knees as they spread.
    const down: number = easeProgress(share);
    const reaching: Pose = reachHands(
      body.clone(),
      [0.09 + 0.1 * (1 - down), 0.42 - 0.27 * down, 0.2 - 0.04 * down],
      [-0.09 - 0.1 * (1 - down), 0.42 - 0.27 * down, 0.2 - 0.04 * down],
    );
    const hold: number = easeProgress(Math.min(share / 0.4, 1));
    for (const bone of [...ARMS.L, ...ARMS.R]) {
      const index: number = model.findBone(bone);
      const target: Quaternion | undefined = reaching.rotations[index];
      if (target !== undefined) {
        body.rotations[index]?.slerp(target, hold);
      }
    }
    const from: [FootPlace, FootPlace] = [runFoot(1, 0), runFoot(-1, 0.5)];
    const to: [FootPlace, FootPlace] = [squatFoot(1), squatFoot(-1)];
    const feet: FootPlace[] = from.map((start: FootPlace, index: number) => {
      const end: FootPlace = to[index] ?? start;
      const weight: number = easeProgress(Math.min(share / 0.7, 1));
      const raise: number = index === 1 ? 0.05 * Math.sin(Math.PI * weight) : 0;
      return {
        ankle: [
          start.ankle[0] + (end.ankle[0] - start.ankle[0]) * weight,
          start.ankle[1] + (end.ankle[1] - start.ankle[1]) * weight + raise,
          start.ankle[2] + (end.ankle[2] - start.ankle[2]) * weight,
        ],
        pitch: start.pitch + (end.pitch - start.pitch) * weight,
        yaw: start.yaw + (end.yaw - start.yaw) * weight,
      };
    });
    return {
      pose: placeFeet(body, feet[0] ?? to[0], feet[1] ?? to[1]),
    };
  });

  // Standing up: he pushes himself up off his knees and straightens up.
  const pushing: Pose = rig.createPose({
    offset: [0, -0.107, -0.041],
    Hips: [28, 0, 0],
    Chest: [12, 0, 0],
    Head: [-20, 0, 0],
    UpperArmL: [-30, 0, 22],
    ForeArmL: [-20, 0, 0],
    UpperArmR: [-30, 0, -22],
    ForeArmR: [-20, 0, 0],
  });
  bake('Rise', RISE_DURATION, (t: number): PoseSample => {
    if (t <= 0) {
      return { pose: pickStart.clone() };
    }
    if (t >= RISE_DURATION) {
      return { pose: idleStart.clone() };
    }
    const share: number = t / RISE_DURATION;
    const body: Pose =
      share < 0.45
        ? pickStart.blend(pushing, easeProgress(share / 0.45))
        : pushing.blend(idleStart, easeProgress((share - 0.45) / 0.55));
    // He steps each foot in under him in turn as he comes up.
    const stepIn = (x: number, from: number): FootPlace => {
      const start: FootPlace = squatFoot(x);
      const end: FootPlace = standFoot(x);
      const weight: number = easeProgress((share - from) / 0.35);
      const raise: number = 0.025 * Math.sin(Math.PI * weight);
      return {
        ankle: [
          start.ankle[0] + (end.ankle[0] - start.ankle[0]) * weight,
          start.ankle[1] + raise,
          start.ankle[2] + (end.ankle[2] - start.ankle[2]) * weight,
        ],
        pitch: 0,
        yaw: start.yaw + (end.yaw - start.yaw) * weight,
      };
    };
    return { pose: placeFeet(body, stepIn(1, 0.25), stepIn(-1, 0.55)) };
  });

  // Turning round on the spot: two quick little steps, as he turns, lean
  // him into the first stride of his run.
  bake('Turn', TURN_DURATION, (t: number): PoseSample => {
    if (t <= 0) {
      return { pose: idleStart.clone() };
    }
    if (t >= TURN_DURATION) {
      return { pose: runStart.clone() };
    }
    const share: number = t / TURN_DURATION;
    const body: Pose = idleStart.blend(runStart, easeProgress(share));
    const stepFoot = (
      x: number,
      end: FootPlace,
      from: number,
      to: number,
    ): FootPlace => {
      const start: FootPlace = standFoot(x);
      const weight: number = easeProgress((share - from) / (to - from));
      const raise: number =
        0.045 * Math.sin(Math.PI * Math.min(Math.max(weight, 0), 1));
      return {
        ankle: [
          start.ankle[0] + (end.ankle[0] - start.ankle[0]) * weight,
          start.ankle[1] + (end.ankle[1] - start.ankle[1]) * weight + raise,
          start.ankle[2] + (end.ankle[2] - start.ankle[2]) * weight,
        ],
        pitch: start.pitch + (end.pitch - start.pitch) * weight,
        yaw: start.yaw + (end.yaw - start.yaw) * weight,
      };
    };
    // The right foot lifts last, into the swing it starts his run with.
    const left: FootPlace = stepFoot(1, runFoot(1, 0), 0.05, 0.6);
    const right: FootPlace =
      share < 0.6
        ? standFoot(-1)
        : stepFoot(-1, runFoot(-1, 0.5), 0.6, 1);
    return { pose: placeFeet(body, left, right) };
  });

  return rig;
}

/**
 * Builds Toby, a small boy of five or so, cheerful and simply dressed, who
 * runs between two patches of clover and squats at each to hunt for a
 * four-leaved one.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcToby(): BuiltModel {
  const model: Model = buildBody();
  const rig: Rig = animateBody(model);
  model.centreOn(['FootL', 'FootR']);
  return { model, report: rig.report };
}
