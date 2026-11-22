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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/models/npc-basil Basil, the apothecary, who stands by the
 *   door of his shop with his writing board.
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
  createExtrusion,
  createLathe,
  createRotation,
  createTube,
  place,
} from './geometry.ts';
import type { Placement, Shape, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import { Rig, easeProgress } from './rig.ts';
import type {
  ArmBones,
  BuiltModel,
  LegBones,
  Pose,
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

/** The height of the shoulders, in metres. */
const SHOULDER_HEIGHT = 0.9;

/** The length of the upper arm, and of the forearm, in metres. */
const ARM_BONE = 0.21;

/** How far either shoulder stands out to the side of the middle. */
const SHOULDER_X = 0.25;

/**
 * The height of the ankles above the ground, which keeps the soles about
 * 2 mm above it.
 */
const ANKLE_HEIGHT = 0.082;

/** How far either ankle stands out to the side of the middle, in metres. */
const STANCE = 0.11;

/** How long his idling lasts before it starts again, in seconds. */
const IDLE_DURATION = 10;

/** How far forward he leans his chest over his board, in degrees. */
const CHEST_LEAN = 7;

/**
 * The middle of the writing board, as he holds it to write on, in model
 * space: in front of his chest, a little to his left.
 */
const BOARD_CENTRE: Triple = [0.05, 0.75, 0.3];

/**
 * How the board is turned as he holds it to write, as the X, Y and Z
 * angles of a rotation in degrees: its face, the paper, turned to him and
 * looking up, its edge away from him raised, the board sloping 40 degrees
 * from the level.
 */
const BOARD_TURN: Triple = [-50, 180, 0];

/** The width, the length and the thickness of the board, in metres. */
const BOARD_SIZE: Triple = [0.2, 0.24, 0.015];

/**
 * The way from the wrist of his right hand to the tip of his pen, in model
 * space, which the pen keeps as he writes: down onto the paper from above,
 * a little to his left and a little away from him.
 */
const PEN_REACH: Triple = [0.04, -0.09, 0.05];

/**
 * Where on the paper he writes, from its middle, in metres, along it to
 * his right and away from him: the start and the end of each of the two
 * lines he writes, the second nearer him.
 */
const WRITING_LINES: readonly [Triple, Triple] = [
  [-0.01, 0.05, 0.02],
  [-0.01, 0.05, -0.02],
];

/**
 * How far each hand, and the bend of its arm, is turned about the upright
 * as he holds the board and writes, in degrees: the elbows out to the
 * sides, clear of his body.
 */
const ELBOW_YAWS: Readonly<Record<'L' | 'R', number>> = { L: -40, R: 70 };

/** The radius of the ball of a hand, in metres. */
const HAND_RADIUS = 0.064;

/** The parts of a board held in front of him: its axes and its middle. */
interface BoardFrame {
  /** The middle of the board. */
  readonly centre: Vector3;
  /** The way along its width, to his right. */
  readonly across: Vector3;
  /** The way along its length, away from him, towards its top edge. */
  readonly up: Vector3;
  /** The way its face looks: to him, and up. */
  readonly out: Vector3;
}

/**
 * Finds the axes and the middle of the board as he holds it to write.
 *
 * @returns {BoardFrame} The board.
 */
function findBoardFrame(): BoardFrame {
  const tilt = createRotation(BOARD_TURN);
  return {
    centre: new Vector3(...BOARD_CENTRE),
    across: new Vector3(1, 0, 0).applyQuaternion(tilt),
    up: new Vector3(0, 1, 0).applyQuaternion(tilt),
    out: new Vector3(0, 0, 1).applyQuaternion(tilt),
  };
}

/**
 * Finds a point on the face of the paper on the board.
 *
 * @param {BoardFrame} board - The board.
 * @param {number} across - How far along its width from its middle.
 * @param {number} up - How far up its face from its middle.
 * @param {number} [lift] - How far off the face of the paper.
 * @returns {Vector3} The point.
 */
function findOnPaper(
  board: BoardFrame,
  across: number,
  up: number,
  lift = 0,
): Vector3 {
  return board.centre
    .clone()
    .addScaledVector(board.across, across)
    .addScaledVector(board.up, up)
    .addScaledVector(board.out, BOARD_SIZE[2] / 2 + 0.004 + lift);
}

/**
 * Where his left wrist holds the board up from under it, in model space:
 * under it, near its edge by him on his left, the ball of the hand against
 * its back.
 *
 * @param {BoardFrame} board - The board.
 * @returns {Vector3} The wrist.
 */
function findHoldingWrist(board: BoardFrame): Vector3 {
  return board.centre
    .clone()
    .addScaledVector(board.across, -0.06)
    .addScaledVector(board.up, -0.08)
    .addScaledVector(board.out, -(BOARD_SIZE[2] / 2 + HAND_RADIUS + 0.004))
    .add(new Vector3(0, 0.015, 0));
}

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
 * Moves a shape made where it is to be as he writes, held in a hand, to
 * where it is in the rest pose, following the wrist of the hand, which is
 * turned about the upright as {@link ELBOW_YAWS} tells as he writes.
 *
 * @param {Shape} shape - The shape, in model space, as he writes.
 * @param {Vector3} wrist - Where the wrist is as he writes.
 * @param {'L' | 'R'} side - The hand.
 * @returns {Shape} The shape in the rest pose.
 */
function moveToRestHand(
  shape: Shape,
  wrist: Vector3,
  side: 'L' | 'R',
): Shape {
  return place(place(shape, { pos: wrist.clone().negate().toArray() }), {
    rot: [0, -ELBOW_YAWS[side], 0],
    pos: [
      side === 'L' ? SHOULDER_X : -SHOULDER_X,
      SHOULDER_HEIGHT - 2 * ARM_BONE,
      0,
    ],
  });
}

/**
 * Adds his writing board, held in his left hand: a board of light wood
 * with a sheet of paper on it, written on in a few lines, under a metal
 * clip at its top.
 *
 * @param {Model} model - The model, with the materials `board`, `paper`,
 *   `ink` and `clip` defined.
 * @param {BoardFrame} board - The board, as he holds it to write.
 */
function addBoard(model: Model, board: BoardFrame): void {
  const wrist: Vector3 = findHoldingWrist(board);
  const onBoard = (shape: Shape, across: number, up: number, out: number) =>
    moveToRestHand(
      place(place(shape, { pos: [across, up, out] }), {
        pos: board.centre.toArray(),
        rot: BOARD_TURN,
      }),
      wrist,
      'L',
    );
  const [width, height, thickness] = BOARD_SIZE;
  model.add(
    'board',
    onBoard(createBox(width, height, thickness), 0, 0, 0),
    'HandL',
  );
  model.add(
    'paper',
    onBoard(
      createBox(width - 0.03, height - 0.05, 0.004),
      0,
      -0.012,
      thickness / 2 + 0.002,
    ),
    'HandL',
  );
  const lines: readonly (readonly [number, number])[] = [
    [0.08, 0.12],
    [0.05, 0.14],
    [-0.04, 0.1],
    [-0.07, 0.13],
  ];
  for (const [up, length] of lines) {
    model.add(
      'ink',
      onBoard(
        createBox(length, 0.007, 0.002),
        -0.07 + length / 2,
        up,
        thickness / 2 + 0.0045,
      ),
      'HandL',
    );
  }
  model.add(
    'clip',
    onBoard(createBox(0.09, 0.035, 0.02), 0, height / 2 - 0.02, 0.008),
    'HandL',
  );
}

/**
 * Adds his pen, held in his right hand, its tip on the paper where he
 * starts to write.
 *
 * @param {Model} model - The model, with the material `pen` defined.
 * @param {BoardFrame} board - The board, as he holds it to write.
 */
function addPen(model: Model, board: BoardFrame): void {
  const [first] = WRITING_LINES;
  const tip: Vector3 = findOnPaper(board, first[0], first[2]);
  const wrist: Vector3 = tip.clone().sub(new Vector3(...PEN_REACH));
  const back: Vector3 = new Vector3(...PEN_REACH).normalize().negate();
  const along = (distance: number): Triple =>
    tip.clone().addScaledVector(back, distance).toArray();
  model.add(
    'pen',
    moveToRestHand(
      createTube(
        [along(0), along(0.03), along(0.16), along(0.22)],
        [0, 0.008, 0.009, 0.009],
        6,
      ),
      wrist,
      'R',
    ),
    'HandR',
  );
}

/**
 * Adds his round glasses: two thin rings of dark wire round his eyes, a
 * bridge over his nose, and the arms back to his ears.
 *
 * @param {Model} model - The model, with the material `frame` defined.
 */
function addGlasses(model: Model): void {
  const ring: Shape = place(
    createLathe(
      [
        [0.07, 0],
        [0.086, 0],
        [0.086, 0.014],
        [0.07, 0.014],
        [0.07, 0],
      ],
      12,
    ),
    { rot: [90, 0, 0] },
  );
  for (const side of [1, -1]) {
    model.add(
      'frame',
      place(ring, {
        pos: findHeadPoint(23 * side, 4, 1.07),
        rot: [4, 23 * side, 0],
      }),
      'Head',
    );
    const [ex, ey, ez] = findHeadPoint(41 * side, 2, 1.05);
    const [bx, by, bz] = findHeadPoint(88 * side, 4, 1.04);
    model.add(
      'frame',
      createTube(
        [
          [ex, ey, ez],
          [bx, by, bz],
        ],
        [0.008, 0.008],
        4,
      ),
      'Head',
    );
  }
  const [lx, ly, lz] = findHeadPoint(9, 2, 1.06);
  const [rx, ry, rz] = findHeadPoint(-9, 2, 1.06);
  const [mx, my, mz] = findHeadPoint(0, -1, 1.09);
  model.add(
    'frame',
    createTube(
      [
        [lx, ly, lz],
        [mx, my, mz],
        [rx, ry, rz],
      ],
      [0.007, 0.007, 0.007],
      4,
    ),
    'Head',
  );
}

/**
 * Builds Basil, the apothecary: a young man, eager and a little
 * scatter-brained, his brown hair in a mop of tufts, with round glasses
 * and his brows raised, in a green shirt with its sleeves rolled up, a long
 * apron over it and brown trousers and boots.  He holds a writing board in
 * his left hand and a pen in his right.  He idles writing on his board,
 * bent over it, line after line, and now and then turns and looks up over
 * his right shoulder, as at the herb rack beside him, before he writes on.
 *
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 */
export function buildNpcBasil(): BuiltModel {
  const model = new Model('NpcBasil');
  setFaceMaterials(model, SKINS.light);
  model.setMaterial('hair', '#7a4a2a');
  model.setMaterial('brow', '#5a3520');
  model.setMaterial('frame', '#3b2f2a', { roughness: 0.5 });
  model.setMaterial('shirt', '#4c9a5a');
  model.setMaterial('collar', '#3e8048');
  model.setMaterial('apron', '#e3d3ad');
  model.setMaterial('apronTie', '#b39c6c');
  model.setMaterial('trousers', '#6b5240');
  model.setMaterial('boot', '#4a3222');
  model.setMaterial('board', '#c08a50');
  model.setMaterial('paper', '#f7f2e4');
  model.setMaterial('ink', '#40465a');
  model.setMaterial('clip', '#a3a8b0', { roughness: 0.5 });
  model.setMaterial('pen', '#2f3b6b');

  const elbow: number = SHOULDER_HEIGHT - ARM_BONE;
  const wristHeight: number = SHOULDER_HEIGHT - 2 * ARM_BONE;
  model.addBone('Hips', null, [0, 0.56, 0]);
  model.addBone('Chest', 'Hips', [0, 0.66, 0]);
  model.addBone('Head', 'Chest', [0, 0.98, 0]);
  for (const [side, x] of SIDES) {
    model.addBone(`UpperArm${side}`, 'Chest', [
      SHOULDER_X * x,
      SHOULDER_HEIGHT,
      0,
    ]);
    model.addBone(`ForeArm${side}`, `UpperArm${side}`, [
      SHOULDER_X * x,
      elbow,
      0,
    ]);
    model.addBone(`Hand${side}`, `ForeArm${side}`, [
      SHOULDER_X * x,
      wristHeight,
      0,
    ]);
    model.addBone(`Thigh${side}`, 'Hips', [0.1 * x, 0.55, 0]);
    model.addBone(`Shin${side}`, `Thigh${side}`, [0.1 * x, 0.3, 0]);
    model.addBone(`Foot${side}`, `Shin${side}`, [0.1 * x, 0.08, 0]);
  }

  // The head: a mop of brown tufts, round glasses, and brows raised high.
  addHead(model);
  const hair: Hair = createHair('tufts');
  model.add('hair', hair.hair, 'Head');
  model.add('hair', hair.accent, 'Head');
  addGlasses(model);
  for (const side of [1, -1]) {
    model.add(
      'brow',
      place(createBox(0.075, 0.016, 0.014), {
        pos: findHeadPoint(23 * side, -24, 1.0),
        rot: [-24, 23 * side, -8 * side],
      }),
      'Head',
    );
  }

  // The body: the shirt, its collar, and the bib of the apron over it,
  // hung from a strap round his neck.
  const flat: Placement = { scale: [1, 1, 0.82] };
  model.add(
    'skin',
    createLathe(
      [
        [0.066, 0.94],
        [0.066, 1.04],
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
          [0.212, 0.76],
          [0.2, 0.87],
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
    'collar',
    place(
      createLathe(
        [
          [0.12, 0.93],
          [0.15, 0.935],
          [0.11, 0.99],
          [0.072, 0.99],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  model.add(
    'apron',
    place(createBox(0.25, 0.24, 0.02), { pos: [0, 0.77, 0.178] }),
    'Chest',
  );
  for (const side of [1, -1]) {
    model.add(
      'apronTie',
      createTube(
        [
          [0.11 * side, 0.885, 0.18],
          [0.1 * side, 0.95, 0.1],
          [0.07 * side, 0.975, 0],
        ],
        [0.012, 0.012, 0.012],
        4,
      ),
      'Chest',
    );
  }

  // The hips: the trousers, the tie of the apron round the waist, and its
  // skirt down to the knees.
  model.add(
    'trousers',
    place(
      createLathe(
        [
          [0, 0.44],
          [0.215, 0.43],
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
    'apronTie',
    place(
      createLathe(
        [
          [0.205, 0.6],
          [0.222, 0.6],
          [0.222, 0.645],
          [0.205, 0.645],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'apron',
    place(createBox(0.38, 0.36, 0.02, [0.88, 1]), {
      pos: [0, 0.44, 0.19],
      rot: [-4, 0, 0],
    }),
    'Hips',
  );

  // The limbs: the arms, in sleeves rolled up to the elbows, and the legs,
  // in trousers and boots.
  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape, px = SHOULDER_X): Shape =>
      place(shape, { pos: [px * x, 0, 0] });
    model.add(
      'shirt',
      moveAside(
        createLathe(
          [
            [0, 0.97],
            [0.082, 0.945],
            [0.09, 0.85],
            [0.085, elbow - 0.01],
            [0, elbow - 0.02],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'collar',
      moveAside(
        createLathe(
          [
            [0, elbow + 0.015],
            [0.078, elbow + 0.015],
            [0.078, elbow - 0.035],
            [0, elbow - 0.035],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      moveAside(
        createLathe(
          [
            [0, elbow],
            [0.056, elbow - 0.01],
            [0.048, wristHeight + 0.03],
            [0, wristHeight + 0.02],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      place(createEllipsoid([HAND_RADIUS, 0.066, 0.066], 1), {
        pos: [SHOULDER_X * x, wristHeight - 0.015, 0],
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
      'trousers',
      moveAside(
        createLathe(
          [
            [0, 0.32],
            [0.085, 0.31],
            [0.08, 0.2],
            [0, 0.19],
          ],
          6,
        ),
        0.1,
      ),
      `Shin${side}`,
    );
    model.add(
      'boot',
      moveAside(
        createLathe(
          [
            [0, 0.215],
            [0.09, 0.21],
            [0.086, 0.07],
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

  // What he holds: the board in his left hand, the pen in his right.
  const board: BoardFrame = findBoardFrame();
  addBoard(model, board);
  addPen(model, board);

  // The model is centred on its feet before it is posed, so that his feet
  // stand where they stand at rest.
  model.centreOn(['FootL', 'FootR']);
  const rig = new Rig(model);
  const ankleZ: number = getItem(model.bones, model.findBone('FootL')).head.z;
  const shift: Vector3 = new Vector3(
    getItem(model.bones, model.findBone('Hips')).head.x,
    0,
    getItem(model.bones, model.findBone('Hips')).head.z,
  );
  const holding: Vector3 = findHoldingWrist(board).add(shift);
  const reach: Vector3 = new Vector3(...PEN_REACH);
  let overreach = 0;

  /**
   * Finds how far he has turned to look at the rack at a time, from 0 as
   * he writes to 1 as he looks.
   *
   * @param {number} t - The time, in seconds.
   * @returns {number} How far.
   */
  const findLook = (t: number): number => {
    if (t < 6) {
      return 0;
    }
    if (t < 6.8) {
      return easeProgress((t - 6) / 0.8);
    }
    if (t < 8.4) {
      return 1;
    }
    return 1 - easeProgress((t - 8.4) / 0.9);
  };

  /**
   * Finds where the tip of his pen is at a time, on the paper or lifted
   * off it, as the board is held to write.
   *
   * @param {number} t - The time, in seconds.
   * @param {number} look - How far he has turned to look at the rack.
   * @returns {Vector3} The tip.
   */
  const findTip = (t: number, look: number): Vector3 => {
    const lines: readonly [Triple, Triple] = WRITING_LINES;
    // He writes the first line, lifts his pen back to the start of the
    // second and writes it, then rests his pen, and starts again.
    const spans: readonly (readonly [number, number, 0 | 1])[] = [
      [0.3, 2.7, 0],
      [3.1, 5.5, 1],
    ];
    for (const [start, end, index] of spans) {
      const [from, to, up] = lines[index];
      if (t >= start && t <= end) {
        const progress: number = (t - start) / (end - start);
        const wiggle: number = Math.sin(progress * Math.PI * 18) * 0.006;
        return findOnPaper(
          board,
          from + (to - from) * progress,
          up + wiggle,
        );
      }
    }
    const [from1, , up1] = lines[0];
    const [from2, to2, up2] = lines[1];
    const [, to1] = lines[0];
    if (t > 2.7 && t < 3.1) {
      const progress: number = easeProgress((t - 2.7) / 0.4);
      return findOnPaper(
        board,
        to1 + (from2 - to1) * progress,
        up1 + (up2 - up1) * progress,
        0.02 * Math.sin(progress * Math.PI),
      );
    }
    // After the second line, the pen comes back to the start of the first,
    // lifted while he looks up.
    const back: number = t <= 0.3 ? 1 : easeProgress((t - 5.5) / 4.5);
    return findOnPaper(
      board,
      to2 + (from1 - to2) * back + 0.025 * look,
      up2 + (up1 - up2) * back,
      0.012 * look + 0.006 * Math.sin(back * Math.PI),
    );
  };

  rig.bake(
    'Idle',
    IDLE_DURATION,
    (t: number): PoseSample => {
      const look: number = findLook(t);
      const turn: number = (2 * Math.PI * t) / IDLE_DURATION;
      const breath: number = (1 - Math.cos(4 * turn)) / 2;
      const twist: number = -30 * look;
      const pose: Pose = rig.createPose({
        offset: [0, -0.03 - 0.004 * breath, 0],
        Hips: [0, -6 * look, 0],
        Chest: [
          CHEST_LEAN * (1 - 0.1 * look) + 1.2 * breath,
          twist + 6 * look,
          0,
        ],
        Head: [
          16 * (1 - look) - 16 * look,
          -58 * look,
          3 * Math.sin(turn) * (1 - look),
        ],
      });
      const spin = createRotation([0, twist, 0]);
      const tip: Vector3 = findTip(t, look).add(shift);
      const writing: Vector3 = tip.sub(reach).applyQuaternion(spin);
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
            (isLeft
              ? holding.clone().applyQuaternion(spin)
              : writing
            ).toArray(),
            { yaw: twist + ELBOW_YAWS[isLeft ? 'L' : 'R'] },
          ),
        );
      }
      return { pose };
    },
    { loop: true },
  );
  rig.noteOverreach('Idle', overreach);
  return { model, report: rig.report };
}
