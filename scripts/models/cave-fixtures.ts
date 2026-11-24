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
 * @module scripts/models/cave-fixtures What stands in the side chambers of
 *   the cave: the iron bars across the cells, the bones of a dead prisoner,
 *   and the chests and the barrels of the store rooms, shut and open.
 */

import { CAVE_CELLS } from '@clovervale/shared';

import {
  createBlock,
  createBox,
  createEllipsoid,
  createLathe,
  createTube,
  place,
} from './geometry.ts';
import type { Pair, Shape, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/**
 * About the distance between two bars of a cell, from axis to axis, in
 * meters: the bars are spread evenly across the opening, as near this
 * apart as they fit.
 */
const BAR_SPACING = 0.34;

/** The radius of a bar of a cell, in meters. */
const BAR_RADIUS = 0.036;

/** The height of the bars of a cell, in meters. */
const BAR_HEIGHT = 2.2;

/** The heights of the flat iron bands across the bars, in meters. */
const BAND_HEIGHTS: readonly number[] = [0.12, 1.5, 2.08];

/** The width of a chest, its body without its handles, in meters. */
const CHEST_WIDTH = 0.96;

/** The depth of the body of a chest, in meters. */
const CHEST_DEPTH = 0.56;

/** The height of the body of a chest, below its lid, in meters. */
const CHEST_BODY = 0.42;

/** The height of the lid of a chest, in meters. */
const CHEST_LID = 0.14;

/** How far the iron straps of a chest stand out of its wood, in meters. */
const STRAP = 0.012;

/** How far the lid of an open chest stands up from shut, in degrees. */
const LID_OPEN_ANGLE = 86;

/** The profile of the outside of a barrel, from its foot to its rim. */
const BARREL_PROFILE: readonly Pair[] = [
  [0.25, 0],
  [0.3, 0.38],
  [0.25, 0.76],
];

/** The number of staves of a barrel. */
const STAVES = 10;

/**
 * Builds the row of iron bars that closes off a cell from the passage,
 * across its whole opening: stout dark bars of six sides, an edge turned to
 * the passage to catch the torchlight, held by three flat bands that run
 * into the rock at either end, with rust creeping up the foot of some of
 * the bars.  The passage lies along +Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveBars(): BuiltModel {
  const model = new Model('CaveBars');
  model.setMaterial('iron', '#3a3633', { roughness: 0.36, metallic: 0.85 });
  model.setMaterial('ironDark', '#24211f', { roughness: 0.5, metallic: 0.75 });
  model.setMaterial('rust', '#5e3b26', { roughness: 0.85, metallic: 0.2 });
  const half: number = (CAVE_CELLS[0].east - CAVE_CELLS[0].west) / 2;
  // The same number of bars on either side of the middle, evenly spread,
  // with half a spacing between the outermost bars and the rock.
  const count: number = Math.round(half / BAR_SPACING);
  const spacing: number = half / count;
  for (let index = 0; index < count; index++) {
    for (const side of [-1, 1]) {
      const x: number = side * (spacing / 2 + index * spacing);
      model.add(
        'iron',
        place(
          createLathe(
            [
              [0, 0],
              [BAR_RADIUS, 0],
              [BAR_RADIUS, BAR_HEIGHT],
              [0, BAR_HEIGHT],
            ],
            6,
            { phase: 0 },
          ),
          { pos: [x, 0, 0] },
        ),
      );
      if ((index * 2 + (side + 1) / 2) % 5 === 1) {
        model.add(
          'rust',
          place(
            createLathe(
              [
                [BAR_RADIUS + 0.002, 0],
                [BAR_RADIUS + 0.002, 0.2 + (index % 3) * 0.08],
              ],
              6,
              { phase: 0 },
            ),
            { pos: [x, 0, 0] },
          ),
        );
      }
    }
  }
  for (const y of BAND_HEIGHTS) {
    model.add(
      'ironDark',
      place(createBox(2 * half, 0.1, 0.09), { pos: [0, y, 0] }),
    );
  }
  model.centerFootprint();
  return { model };
}

/**
 * Adds a long bone between two points, thin along its shaft and knobbed at
 * its ends.
 *
 * @param {Model} model - The model.
 * @param {string} material - The material.
 * @param {Triple} from - One end.
 * @param {Triple} to - The other end.
 * @param {number} radius - The radius of its shaft.
 */
function addLongBone(
  model: Model,
  material: string,
  from: Triple,
  to: Triple,
  radius: number,
): void {
  model.add(material, createTube([from, to], [radius, radius], 5));
  for (const end of [from, to]) {
    model.add(
      material,
      place(createEllipsoid([radius * 1.5, radius * 1.4, radius * 1.5], 0), {
        pos: end,
      }),
    );
  }
}

/**
 * Adds a ring of iron, such as a shackle or the handle of a lantern.
 *
 * @param {Model} model - The model.
 * @param {Triple} center - The middle of the ring.
 * @param {number} radius - The radius of the ring.
 * @param {Triple} turn - How the ring is turned from lying flat, in
 *   degrees.
 */
function addRing(
  model: Model,
  center: Triple,
  radius: number,
  turn: Triple,
): void {
  model.add(
    'iron',
    place(
      createLathe(
        [
          [radius - 0.008, -0.012],
          [radius + 0.008, -0.012],
          [radius + 0.008, 0.012],
          [radius - 0.008, 0.012],
          [radius - 0.008, -0.012],
        ],
        8,
      ),
      { pos: center, rot: turn },
    ),
  );
}

/**
 * Builds the bones of a prisoner long dead, a grown-up of the build of the
 * villagers and the players, with a big round skull and a small body,
 * slumped where he sat against the back wall of his cell: his back against
 * the wall, his skull tilted to one side, his arms hanging down to the
 * floor and his legs stretched out before him: bare bones, stout in the
 * limbs, down to the bones of his hands and feet.  A pair of iron
 * shackles hangs on short chains from the wall above him, an iron lantern
 * lies overturned on the floor beside him, and a cobweb spans the foot of
 * the wall.  The wall is behind, along -Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveSkeleton(): BuiltModel {
  const model = new Model('CaveSkeleton');
  model.setMaterial('bone', '#dcd2b8');
  model.setMaterial('boneShade', '#bcae8e');
  model.setMaterial('socket', '#2a221c');
  model.setMaterial('iron', '#3a3633', { roughness: 0.5, metallic: 0.75 });
  model.setMaterial('glass', '#8a6a2e', { roughness: 0.3 });
  model.setMaterial('web', '#d8d8d4', { roughness: 1 });
  const wall = -0.4;
  addSkeletonTrunk(model);
  addSkeletonSkull(model);
  addSkeletonArms(model);
  addSkeletonLegs(model);
  addShackles(model, wall);
  addFallenLantern(model);
  addCobweb(model, wall);
  for (const { point } of model.listCorners()) {
    point.y = Math.max(point.y, 0);
    point.z = Math.max(point.z, wall);
  }
  model.centerFootprint();
  return { model };
}

/**
 * Adds the trunk of the dead prisoner: the pelvis, sitting on the floor,
 * the short spine leaning back against the wall, and the small ribcage, its
 * ribs curving forward from the spine to the breastbone.
 *
 * @param {Model} model - The model of the skeleton.
 */
function addSkeletonTrunk(model: Model): void {
  model.add(
    'bone',
    place(createEllipsoid([0.12, 0.065, 0.085], 1), {
      pos: [0, 0.08, -0.22],
    }),
  );
  for (let index = 0; index < 4; index++) {
    model.add(
      index % 2 === 0 ? 'bone' : 'boneShade',
      place(createBox(0.045, 0.04, 0.045), {
        pos: [0, 0.16 + index * 0.08, -0.27 - index * 0.02],
        rot: [-12, 0, 0],
      }),
    );
  }
  for (const [index, y] of [0.25, 0.31, 0.37].entries()) {
    const back: number = -0.29 - index * 0.015;
    const width: number = 0.12 - index * 0.008;
    for (const side of [-1, 1]) {
      model.add(
        'bone',
        createTube(
          [
            [0.02 * side, y, back],
            [width * side, y - 0.015, back + 0.07],
            [0.035 * side, y - 0.04, back + 0.16],
          ],
          [0.014, 0.014, 0.012],
          4,
        ),
      );
    }
  }
  model.add(
    'boneShade',
    place(createBox(0.04, 0.13, 0.02), {
      pos: [0, 0.31, -0.135],
      rot: [-14, 0, 0],
    }),
  );
}

/**
 * Adds the big round skull of the dead prisoner, tilted to one side and
 * drooped a little, with its dark eyes and nose, and a grin of teeth over
 * its jaw.
 *
 * @param {Model} model - The model of the skeleton.
 */
function addSkeletonSkull(model: Model): void {
  const skull: [string, Shape][] = [
    ['bone', createEllipsoid([0.24, 0.23, 0.235], 1)],
    [
      'boneShade',
      place(createBox(0.15, 0.05, 0.1), { pos: [0, -0.2, 0.12] }),
    ],
    [
      'bone',
      place(createBox(0.13, 0.025, 0.02), { pos: [0, -0.165, 0.18] }),
    ],
    ...[-1, 1].map((side: number): [string, Shape] => [
      'socket',
      place(createEllipsoid([0.06, 0.055, 0.03], 0), {
        pos: [0.085 * side, -0.02, 0.2],
        rot: [0, 22 * side, 0],
      }),
    ]),
    [
      'socket',
      place(createEllipsoid([0.022, 0.03, 0.015], 0), {
        pos: [0, -0.1, 0.222],
      }),
    ],
    ...[-0.045, -0.015, 0.015, 0.045].map((x: number): [string, Shape] => [
      'socket',
      place(createBox(0.003, 0.026, 0.006), { pos: [x, -0.165, 0.191] }),
    ]),
  ];
  for (const [material, shape] of skull) {
    model.add(
      material,
      place(shape, { pos: [0.03, 0.69, -0.17], rot: [10, 14, 16] }),
    );
  }
}

/**
 * Adds the stout arms of the dead prisoner, hanging from the shoulders down
 * to the floor, the bones of the hands spread on it.
 *
 * @param {Model} model - The model of the skeleton.
 */
function addSkeletonArms(model: Model): void {
  for (const side of [-1, 1]) {
    const elbow: Triple = [0.21 * side, 0.2, -0.17];
    const wrist: Triple = [0.24 * side, 0.04, -0.03];
    addLongBone(model, 'bone', [0.14 * side, 0.4, -0.27], elbow, 0.026);
    addLongBone(model, 'boneShade', elbow, wrist, 0.022);
    model.add(
      'bone',
      place(createBox(0.075, 0.026, 0.06), {
        pos: [0.25 * side, 0.014, 0.03],
        rot: [0, -15 * side, 0],
      }),
    );
    for (const finger of [-1, 0, 1]) {
      model.add(
        'boneShade',
        place(createBox(0.018, 0.016, 0.06), {
          pos: [0.25 * side + finger * 0.024, 0.009, 0.085],
          rot: [0, finger * 12 - 15 * side, 0],
        }),
      );
    }
    model.add(
      'boneShade',
      place(createBox(0.018, 0.016, 0.045), {
        pos: [0.25 * side + 0.045 * side, 0.009, 0.04],
        rot: [0, -45 * side, 0],
      }),
    );
  }
}

/**
 * Adds the stout short legs of the dead prisoner, stretched out along the
 * floor, and the bones of the feet, the toes up and fallen a little apart.
 *
 * @param {Model} model - The model of the skeleton.
 */
function addSkeletonLegs(model: Model): void {
  for (const side of [-1, 1]) {
    const knee: Triple = [0.09 * side, 0.08, 0.07];
    const ankle: Triple = [0.12 * side, 0.08, 0.3];
    addLongBone(model, 'bone', [0.07 * side, 0.09, -0.15], knee, 0.032);
    addLongBone(model, 'boneShade', knee, ankle, 0.027);
    const foot = (shape: Shape): Shape =>
      place(shape, { pos: ankle, rot: [-15, 0, 18 * side] });
    model.add(
      'bone',
      foot(
        place(createEllipsoid([0.035, 0.035, 0.04], 0), {
          pos: [0, -0.02, 0.02],
        }),
      ),
    );
    model.add(
      'bone',
      foot(place(createBox(0.08, 0.09, 0.03), { pos: [0, 0.04, 0.045] })),
    );
    for (const toe of [-1, 0, 1]) {
      model.add(
        'boneShade',
        foot(
          place(createBox(0.018, 0.05, 0.018), {
            pos: [toe * 0.026, 0.11, 0.05],
          }),
        ),
      );
    }
  }
}

/**
 * Adds the shackles above the dead prisoner, on short chains from an iron
 * bar on the wall.
 *
 * @param {Model} model - The model of the skeleton.
 * @param {number} wall - The Z of the face of the back wall.
 */
function addShackles(model: Model, wall: number): void {
  model.add(
    'iron',
    place(createBox(0.36, 0.05, 0.03), { pos: [0.33, 0.98, wall + 0.015] }),
  );
  for (const x of [0.22, 0.44]) {
    for (let link = 0; link < 3; link++) {
      addRing(model, [x, 0.92 - link * 0.065, wall + 0.04], 0.022, [
        90,
        link % 2 === 0 ? 0 : 90,
        0,
      ]);
    }
    addRing(model, [x, 0.68, wall + 0.05], 0.045, [90, 0, 0]);
  }
}

/**
 * Adds the lantern fallen over on the floor beside the dead prisoner: its
 * iron frame, its dark glass, and its ring.
 *
 * @param {Model} model - The model of the skeleton.
 */
function addFallenLantern(model: Model): void {
  const lantern: Triple = [-0.42, 0.075, 0.05];
  const putLantern = (shape: Shape): Shape =>
    place(shape, { pos: lantern, rot: [0, 30, 90] });
  model.add('glass', putLantern(createBox(0.1, 0.14, 0.1)));
  for (const y of [-0.08, 0.08]) {
    model.add(
      'iron',
      putLantern(place(createBox(0.13, 0.02, 0.13), { pos: [0, y, 0] })),
    );
  }
  for (const [x, z] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    model.add(
      'iron',
      putLantern(
        place(createBox(0.015, 0.16, 0.015), {
          pos: [x * 0.055, 0, z * 0.055],
        }),
      ),
    );
  }
  addRing(model, [-0.58, 0.012, 0.06], 0.035, [0, 0, 0]);
}

/**
 * Adds a cobweb across the foot of the back wall, beyond the lantern.
 *
 * @param {Model} model - The model of the skeleton.
 * @param {number} wall - The Z of the face of the back wall.
 */
function addCobweb(model: Model, wall: number): void {
  const corner: Triple = [-0.62, 0, wall];
  for (const [reach, rise] of [
    [0.26, 0],
    [0.24, 0.12],
    [0.17, 0.22],
    [0.08, 0.27],
    [0, 0.28],
  ] as const) {
    model.add(
      'web',
      createTube(
        [corner, [corner[0] + reach, rise, wall + 0.003 + reach * 0.4]],
        [0.0025, 0.0025],
        3,
      ),
    );
  }
  for (const scale of [0.45, 0.8]) {
    model.add(
      'web',
      createTube(
        [
          [corner[0] + 0.26 * scale, 0.004, wall + 0.1 * scale],
          [corner[0] + 0.22 * scale, 0.11 * scale, wall + 0.09 * scale],
          [corner[0] + 0.15 * scale, 0.2 * scale, wall + 0.06 * scale],
          [corner[0] + 0.06 * scale, 0.25 * scale, wall + 0.03 * scale],
          [corner[0], 0.27 * scale, wall + 0.003],
        ],
        [0.002, 0.002, 0.002, 0.002, 0.002],
        3,
      ),
    );
  }
}

/**
 * Makes the iron straps of a chest around a box of it, over its top and its
 * front, and its back if told, near either end.
 *
 * @param {Triple} center - The middle of the box.
 * @param {number} height - The height of the box.
 * @param {number} depth - The depth of the box.
 * @param {boolean} hasBack - Whether the straps run down its back too.
 * @returns {Shape[]} The straps.
 */
function createStraps(
  center: Triple,
  height: number,
  depth: number,
  hasBack: boolean,
): Shape[] {
  const [cx, cy, cz] = center;
  const straps: Shape[] = [];
  for (const x of [-0.3, 0.3]) {
    straps.push(
      place(createBox(0.06, STRAP, depth + 2 * STRAP), {
        pos: [cx + x, cy + height / 2 + STRAP / 2, cz],
      }),
      place(createBox(0.06, height, STRAP), {
        pos: [cx + x, cy, cz + depth / 2 + STRAP / 2],
      }),
    );
    if (hasBack) {
      straps.push(
        place(createBox(0.06, height, STRAP), {
          pos: [cx + x, cy, cz - depth / 2 - STRAP / 2],
        }),
      );
    }
  }
  return straps;
}

/**
 * Builds a chest of the store rooms, shut or open: a box of planks bound in
 * iron, a lock on its front, an iron handle at either end, and a lid
 * hinged at the top of its back.  Open, the lid stands up over the back,
 * and the chest shows its empty inside.  Shut or open, it takes up the same
 * ground, the lid of the open chest reaching no farther back than its
 * back.  Its front faces +Z.
 *
 * @param {boolean} isOpen - Whether the chest is open.
 * @returns {BuiltModel} The model.
 */
function buildChest(isOpen: boolean): BuiltModel {
  const model = new Model(isOpen ? 'CaveChestOpen' : 'CaveChest');
  model.setMaterial('wood', '#8a5a34');
  model.setMaterial('woodDark', '#6a4226');
  model.setMaterial('inside', '#3a2618');
  model.setMaterial('iron', '#3d3a37', { roughness: 0.5, metallic: 0.7 });
  model.setMaterial('brass', '#b08a3e', { roughness: 0.45, metallic: 0.6 });
  model.setMaterial('keyhole', '#141010');
  const halfDepth: number = CHEST_DEPTH / 2;
  const wall = 0.04;
  // The body: its floor, and its four walls of planks, the front and the
  // back darker than the ends.
  model.add(
    'inside',
    place(
      createBlock(CHEST_WIDTH - 2 * wall, 0.04, CHEST_DEPTH - 2 * wall),
      { pos: [0, 0.02, 0] },
    ),
  );
  model.add('wood', createBlock(CHEST_WIDTH, 0.03, CHEST_DEPTH));
  for (const side of [-1, 1]) {
    model.add(
      'wood',
      place(createBlock(CHEST_WIDTH, CHEST_BODY, wall), {
        pos: [0, 0, side * (halfDepth - wall / 2)],
      }),
    );
    model.add(
      'woodDark',
      place(createBlock(wall, CHEST_BODY, CHEST_DEPTH - 2 * wall), {
        pos: [side * (CHEST_WIDTH / 2 - wall / 2), 0, 0],
      }),
    );
    // A handle at the end, an iron grip on two lugs.
    model.add(
      'iron',
      place(createBox(0.03, 0.03, 0.16), {
        pos: [side * (CHEST_WIDTH / 2 + 0.035), 0.3, 0],
      }),
    );
    for (const z of [-0.07, 0.07]) {
      model.add(
        'iron',
        place(createBox(0.04, 0.03, 0.025), {
          pos: [side * (CHEST_WIDTH / 2 + 0.018), 0.3, z],
        }),
      );
    }
  }
  const bodyStraps: Shape[] = createStraps(
    [0, CHEST_BODY / 2, 0],
    CHEST_BODY,
    CHEST_DEPTH,
    true,
  );
  for (const strap of bodyStraps) {
    model.add('iron', strap);
  }
  // The lock, on the front of the body under the lid.
  model.add(
    'brass',
    place(createBox(0.1, 0.12, 0.02), {
      pos: [0, CHEST_BODY - 0.08, halfDepth + 0.01],
    }),
  );
  model.add(
    'keyhole',
    place(createBox(0.016, 0.035, 0.004), {
      pos: [0, CHEST_BODY - 0.09, halfDepth + 0.021],
    }),
  );

  // The lid, built shut with its hinge at the top of its back, then opened
  // about the hinge.  Nothing of it stands above the hinge or behind it, so
  // that opened no more than upright, it reaches no farther back.
  const hingeY: number = CHEST_BODY + CHEST_LID + STRAP;
  const hingeZ: number = -halfDepth - STRAP;
  const lid: [string, Shape][] = [
    [
      'woodDark',
      place(createBox(CHEST_WIDTH, CHEST_LID, CHEST_DEPTH), {
        pos: [0, CHEST_BODY + CHEST_LID / 2, 0],
      }),
    ],
    [
      'inside',
      place(createBox(CHEST_WIDTH - 2 * wall, 0.005, CHEST_DEPTH - 2 * wall), {
        pos: [0, CHEST_BODY - 0.002, 0],
      }),
    ],
    ...createStraps(
      [0, CHEST_BODY + CHEST_LID / 2, 0],
      CHEST_LID,
      CHEST_DEPTH,
      false,
    ).map((strap: Shape): [string, Shape] => ['iron', strap]),
  ];
  for (const [material, shape] of lid) {
    const atHinge: Shape = place(shape, { pos: [0, -hingeY, -hingeZ] });
    const turned: Shape = isOpen
      ? place(atHinge, { rot: [-LID_OPEN_ANGLE, 0, 0] })
      : atHinge;
    model.add(material, place(turned, { pos: [0, hingeY, hingeZ] }));
  }
  model.centerFootprint();
  return { model };
}

/**
 * Builds a chest of the store rooms, shut.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveChest(): BuiltModel {
  return buildChest(false);
}

/**
 * Builds a chest of the store rooms, open and empty.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveChestOpen(): BuiltModel {
  return buildChest(true);
}

/**
 * Builds a barrel of the store rooms, full or open: a belly of staves of
 * two shades, bound by four iron hoops.  Full, a lid of planks closes it,
 * set a little into its rim; open, it has none, and shows its empty
 * inside, dark down to its bottom.
 *
 * @param {boolean} isOpen - Whether the barrel is open.
 * @returns {BuiltModel} The model.
 */
function buildBarrel(isOpen: boolean): BuiltModel {
  const model = new Model(isOpen ? 'CaveBarrelOpen' : 'CaveBarrel');
  model.setMaterial('stave', '#9a6a3c');
  model.setMaterial('staveDark', '#7e5430');
  model.setMaterial('lid', '#6e4a2c');
  model.setMaterial('inside', '#2e2016');
  model.setMaterial('iron', '#3d3a37', { roughness: 0.5, metallic: 0.7 });
  const [rimRadius, top] = getItem(BARREL_PROFILE, BARREL_PROFILE.length - 1);
  const rim: number = rimRadius - 0.025;
  for (let stave = 0; stave < STAVES; stave++) {
    model.add(
      stave % 2 === 0 ? 'stave' : 'staveDark',
      createLathe(
        [[0, 0], ...BARREL_PROFILE, [rim, top]],
        STAVES,
        { from: stave, to: stave + 1 },
      ),
    );
  }
  if (isOpen) {
    model.add(
      'inside',
      createLathe(
        [
          [rim, top],
          [0.27, 0.38],
          [0.225, 0.06],
          [0, 0.06],
        ],
        STAVES,
      ),
    );
  } else {
    model.add(
      'lid',
      createLathe(
        [
          [rim, top],
          [rim, top - 0.025],
          [0, top - 0.025],
        ],
        STAVES,
      ),
    );
    for (const x of [-0.07, 0.07]) {
      model.add(
        'staveDark',
        place(createBox(0.008, 0.004, 2 * rim - 0.03), {
          pos: [x, top - 0.023, 0],
        }),
      );
    }
  }
  // The hoops, two near either end, following the belly.
  const findRadius = (y: number): number => {
    const [[r0, y0], [r1, y1], [r2, y2]] = BARREL_PROFILE as [Pair, Pair, Pair];
    return y <= y1
      ? r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
      : r1 + ((r2 - r1) * (y - y1)) / (y2 - y1);
  };
  for (const y of [0.06, 0.2, 0.56, 0.7]) {
    const r: number = findRadius(y);
    model.add(
      'iron',
      createLathe(
        [
          [r - 0.004, y - 0.025],
          [r + 0.008, y - 0.025],
          [r + 0.008, y + 0.025],
          [r - 0.004, y + 0.025],
        ],
        STAVES,
      ),
    );
  }
  model.centerFootprint();
  return { model };
}

/**
 * Builds a barrel of the store rooms, full and shut.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveBarrel(): BuiltModel {
  return buildBarrel(false);
}

/**
 * Builds a barrel of the store rooms, open and empty.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCaveBarrelOpen(): BuiltModel {
  return buildBarrel(true);
}
