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
 * @module scripts/models/props The optional static scenery.
 */

import type { Vector3 } from 'three';

import {
  createBlob,
  createBlock,
  createBox,
  createCone,
  createEllipsoid,
  createExtrusion,
  createLathe,
  createRandom,
  createTube,
  place,
} from './geometry.ts';
import type { Pair, Placement, Shape, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { Face, ShapeOptions } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** A lump of leaves: its centre, its radius and its material. */
type Lump = readonly [number, number, number, number, string];

/**
 * Flattens whatever reaches below the ground onto the ground.
 *
 * @param {Model} model - The model.
 */
function flattenUnderside(model: Model): void {
  for (const { point } of model.listCorners()) {
    point.y = Math.max(point.y, 0);
  }
}

/**
 * Builds the great tree that stands in the middle of the town.
 *
 * @returns {BuiltModel} The model.
 */
export function buildGreatTree(): BuiltModel {
  const model = new Model('GreatTree');
  model.setMaterial('bark', '#a5633a');
  model.setMaterial('barkDark', '#8a4f2e');
  model.setMaterial('leafA', '#a9c940');
  model.setMaterial('leafB', '#7fb23c');
  model.setMaterial('leafC', '#c6d24e');
  model.add(
    'bark',
    createLathe(
      [
        [0, 0],
        [1.75, 0],
        [1.2, 0.8],
        [0.92, 2.2],
        [0.82, 3.6],
        [1.0, 4.9],
        [0, 5.2],
      ],
      8,
    ),
  );
  for (let i = 0; i < 6; i++) {
    const turn: number = i * 60 + 20;
    model.add(
      i % 2 ? 'bark' : 'barkDark',
      place(
        createTube(
          [
            [0, 1.5, 0.75],
            [0, 0.55, 1.5],
            [0, 0.12, 2.35],
            [0, 0, 2.9],
          ],
          [
            [0.36, 0.36],
            [0.4, 0.34],
            [0.3, 0.2],
            [0.14, 0.05],
          ],
          5,
          [0, 1, 0],
        ),
        { rot: [0, turn, 0] },
      ),
    );
  }
  const crowns: Lump[] = [
    [0, 9.3, -0.2, 2.9, 'leafA'],
    [-2.9, 7.6, 0.5, 2.4, 'leafB'],
    [3.0, 7.9, 0.2, 2.5, 'leafC'],
    [-1.3, 6.9, 2.1, 2.2, 'leafC'],
    [1.7, 6.6, 2.2, 2.1, 'leafB'],
    [0.2, 7.7, -2.5, 2.5, 'leafB'],
    [-4.0, 6.0, -0.8, 1.8, 'leafA'],
    [4.1, 6.1, -0.7, 1.9, 'leafA'],
    [-2.4, 9.0, -1.2, 1.9, 'leafC'],
    [2.2, 9.4, -1.0, 1.8, 'leafB'],
  ];
  crowns.forEach(([x, y, z, r, material]: Lump, index: number) => {
    model.add(
      material,
      place(createBlob(1, 100 + index, 0.1), {
        pos: [x, y, z],
        rot: [index * 37, index * 53, 0],
        scale: r,
      }),
    );
    model.add(
      index % 2 ? 'bark' : 'barkDark',
      createTube(
        [
          [x * 0.08, 4.3, z * 0.08],
          [x * 0.5, 4.6 + (y - 4.6) * 0.55, z * 0.5],
          [x * 0.9, y - r * 0.3, z * 0.9],
        ],
        [0.5, 0.36, 0.22],
        5,
        [0.3, 0, 1],
      ),
    );
  });
  model.centreFootprint();
  return { model };
}

/**
 * Builds a pine tree.
 *
 * @returns {BuiltModel} The model.
 */
export function buildPineTree(): BuiltModel {
  const model = new Model('PineTree');
  model.setMaterial('bark', '#8a5530');
  model.setMaterial('pineA', '#3f8f55');
  model.setMaterial('pineB', '#327a4a');
  model.add('bark', createCone(0.2, 0.14, 0.75, 6));
  model.add(
    'pineB',
    place(createCone(1.05, 0.3, 1.25, 6), { pos: [0, 0.6, 0] }),
  );
  model.add(
    'pineA',
    place(createCone(0.82, 0.2, 1.15, 6), {
      pos: [0, 1.5, 0],
      rot: [0, 30, 0],
    }),
  );
  model.add(
    'pineB',
    place(createCone(0.56, 0, 1.2, 6), { pos: [0, 2.35, 0] }),
  );
  model.centreFootprint();
  return { model };
}

/**
 * Builds a cluster of round bushes.
 *
 * @returns {BuiltModel} The model.
 */
export function buildBush(): BuiltModel {
  const model = new Model('Bush');
  model.setMaterial('leafA', '#a9c940');
  model.setMaterial('leafB', '#7fb23c');
  model.setMaterial('leafC', '#c6d24e');
  const lumps: Lump[] = [
    [0, 0.45, 0, 0.62, 'leafA'],
    [0.55, 0.32, 0.2, 0.44, 'leafB'],
    [-0.5, 0.3, 0.25, 0.42, 'leafC'],
    [0.1, 0.3, -0.5, 0.45, 'leafB'],
  ];
  lumps.forEach(([x, y, z, r, material]: Lump, index: number) => {
    model.add(
      material,
      place(createBlob(1, 200 + index, 0.12), {
        pos: [x, y, z],
        scale: [r, r * 0.85, r],
      }),
    );
  });
  for (const [material, faces] of [...model.faces]) {
    model.faces.set(
      material,
      faces.filter(({ tri }: Face) => tri.some((p: Vector3) => p.y > 0)),
    );
  }
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}

/**
 * Builds a boulder with a smaller stone beside it.
 *
 * @returns {BuiltModel} The model.
 */
export function buildRock(): BuiltModel {
  const model = new Model('Rock');
  model.setMaterial('rock', '#a3a4aa');
  model.setMaterial('rockDark', '#85868e');
  model.add(
    'rock',
    place(createBlob(1, 300, 0.2), {
      pos: [0, 0.3, 0],
      scale: [0.62, 0.45, 0.5],
    }),
  );
  model.add(
    'rockDark',
    place(createBlob(0, 301, 0.2), {
      pos: [0.55, 0.12, 0.3],
      scale: [0.3, 0.22, 0.26],
    }),
  );
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}

/**
 * Builds a two-metre stretch of wooden fence running along X.
 *
 * @returns {BuiltModel} The model.
 */
export function buildFence(): BuiltModel {
  const model = new Model('Fence');
  model.setMaterial('wood', '#b9763f');
  model.setMaterial('woodDark', '#9a5f33');
  for (const x of [-0.9, 0.9]) {
    model.add(
      'woodDark',
      place(createBlock(0.16, 0.95, 0.16, [0.8, 0.8]), { pos: [x, 0, 0] }),
    );
  }
  model.add(
    'wood',
    place(createBox(2, 0.12, 0.07), {
      pos: [0, 0.68, 0.02],
      rot: [0, 0, 1.5],
    }),
  );
  model.add(
    'wood',
    place(createBox(2, 0.12, 0.07), {
      pos: [0, 0.36, 0.02],
      rot: [0, 0, -1.5],
    }),
  );
  model.centreFootprint();
  return { model };
}

/** The number of sprigs in a patch of clover. */
const CLOVER_SPRIG_COUNT = 10;

/**
 * The number of four-leaved sprigs in a patch of clover.  The rest are
 * three-leaved.
 */
const FOUR_LEAVED_SPRIG_COUNT = 4;

/** The seed of the shuffle that hands out the kinds of clover sprigs. */
const CLOVER_SHUFFLE_SEED = 9;

/**
 * The outline of a clover leaflet, from where it joins the stem to its
 * notched tip along +Y, in metres.
 */
const LEAFLET_OUTLINE: readonly Pair[] = [
  [0, 0],
  [0.046, 0.06],
  [0.026, 0.1],
  [0, 0.085],
  [-0.026, 0.1],
  [-0.046, 0.06],
];

/** The materials of the leaves of clover, from sprig to sprig. */
const CLOVER_LEAVES: readonly string[] = ['leafA', 'leafB', 'leafC'];

/**
 * Counts the leaflets of each sprig in a patch of clover, handing out the
 * four-leaved and the three-leaved kinds in a shuffled order of the sprigs.
 * The counts are the same every time.
 *
 * @returns {number[]} The number of leaflets of each sprig, by its number.
 */
function countCloverLeaflets(): number[] {
  const random: () => number = createRandom(CLOVER_SHUFFLE_SEED);
  const order: number[] = Array.from(
    { length: CLOVER_SPRIG_COUNT },
    (_, i: number) => i,
  );
  for (let i = order.length - 1; i > 0; i--) {
    const j: number = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [getItem(order, j), getItem(order, i)];
  }
  const counts: number[] = [];
  order.forEach((sprig: number, rank: number) => {
    counts[sprig] = rank < FOUR_LEAVED_SPRIG_COUNT ? 4 : 3;
  });
  return counts;
}

/**
 * Builds a low patch of clover, mostly three-leaved with some four-leaved
 * sprigs among them.
 *
 * @returns {BuiltModel} The model.
 */
export function buildClover(): BuiltModel {
  const model = new Model('Clover');
  model.setMaterial('stem', '#6aa84a');
  model.setMaterial('leafA', '#3f8a3a');
  model.setMaterial('leafB', '#4c9a40');
  model.setMaterial('leafC', '#5aa746');
  const random: () => number = createRandom(7);
  const leaflet: Shape = createExtrusion(LEAFLET_OUTLINE, 0.006);
  const leafletCounts: number[] = countCloverLeaflets();
  for (let i = 0; i < CLOVER_SPRIG_COUNT; i++) {
    const angle: number = i * 2.4;
    const reach: number = 0.06 + 0.56 * Math.sqrt(i / CLOVER_SPRIG_COUNT);
    const leafletCount: number = getItem(leafletCounts, i);
    const x: number = reach * Math.cos(angle);
    const z: number = reach * Math.sin(angle);
    const height: number = 0.05 + random() * 0.07;
    const turn: number = random() * 360;
    model.add(
      'stem',
      place(
        createLathe(
          [
            [0, 0],
            [0.008, 0],
            [0, height],
          ],
          3,
        ),
        { pos: [x, 0, z] },
      ),
    );
    for (let j = 0; j < leafletCount; j++) {
      model.add(
        getItem(CLOVER_LEAVES, i % CLOVER_LEAVES.length),
        place(place(leaflet, { rot: [-75 - random() * 10, 0, 0] }), {
          pos: [x, height, z],
          rot: [0, turn + (j * 360) / leafletCount, 0],
        }),
      );
    }
  }
  model.centreFootprint();
  return { model };
}

/**
 * The way the burrow among the standing stones slopes down into the ground,
 * as a yaw in degrees.  It slopes under one of the stones, and its mouth
 * faces the other way, out between two of them.
 */
const BURROW_YAW = 108;

/**
 * The broken pieces left of the old slab, each as the [angle, radius]
 * corners around it, in degrees and metres from the middle of the ring.
 */
const SLAB_PIECES: readonly (readonly Pair[])[] = [
  [
    [150, 1.0],
    [160, 1.22],
    [185, 1.25],
    [210, 1.2],
    [232, 1.14],
    [237, 0.95],
    [224, 0.8],
    [206, 0.87],
    [190, 0.74],
    [170, 0.83],
    [155, 0.9],
  ],
  [
    [340, 1.04],
    [350, 1.2],
    [15, 1.23],
    [36, 1.13],
    [41, 0.96],
    [26, 0.88],
    [6, 0.78],
    [349, 0.86],
  ],
];

/**
 * The worn lines left of the circle once carved into the slab, each as the
 * angles it runs between, in degrees.
 */
const CARVED_ARCS: readonly Pair[] = [
  [166, 196],
  [203, 222],
  [352, 8],
  [17, 30],
];

/**
 * Creates a flat piece lying on the ground.
 *
 * @param {readonly Pair[]} corners - The [angle, radius] corners around
 *   the piece, in degrees and metres from the origin.
 * @param {number} height - The thickness of the piece.
 * @returns {Shape} The piece.
 */
function createGroundPiece(corners: readonly Pair[], height: number): Shape {
  const outline: Pair[] = corners.map(([degrees, radius]: Pair): Pair => {
    const angle: number = (degrees * Math.PI) / 180;
    return [radius * Math.sin(angle), -radius * Math.cos(angle)];
  });
  return place(createExtrusion(outline, height), {
    pos: [0, height / 2, 0],
    rot: [-90, 0, 0],
  });
}

/**
 * Creates a flat arc lying on the ground around the origin.
 *
 * @param {Pair} angles - The angles the arc runs from and to, in degrees,
 *   the way the angle grows.
 * @param {number} inner - The inner radius.
 * @param {number} outer - The outer radius.
 * @param {number} height - The thickness of the arc.
 * @returns {Shape} The arc.
 */
function createGroundArc(
  [from, to]: Pair,
  inner: number,
  outer: number,
  height: number,
): Shape {
  const span: number = (((to - from) % 360) + 360) % 360;
  const count: number = Math.max(Math.ceil(span / 6), 1);
  const angles: number[] = Array.from(
    { length: count + 1 },
    (_, i: number) => from + (span * i) / count,
  );
  return createGroundPiece(
    [
      ...angles.map((angle: number): Pair => [angle, outer]),
      ...[...angles].reverse().map((angle: number): Pair => [angle, inner]),
    ],
    height,
  );
}

/**
 * Builds the old ring of standing stones where the monster lives, long
 * abandoned: weathered stones, one of them leaning, around the mouth of a
 * burrow with the earth dug out of it heaped in front, and a few broken
 * pieces of the slab that once lay there, with the worn lines of a carved
 * circle on them.  The origin is at the mouth of the burrow, where the
 * monster stands as it comes out.
 *
 * @returns {BuiltModel} The model.
 */
export function buildSpawnStones(): BuiltModel {
  const model = new Model('SpawnStones');
  model.setMaterial('rock', '#6f6a7c');
  model.setMaterial('rockDark', '#575266');
  model.setMaterial('carving', '#4a4656');
  model.setMaterial('slab', '#7d7889');
  model.setMaterial('moss', '#6f9a3c');
  model.setMaterial('earth', '#94603a');
  model.setMaterial('earthDark', '#5c3a22');
  model.setMaterial('hole', '#3a2416');
  model.setMaterial('holeDeep', '#1f130b');
  model.setMaterial('holeDark', '#0d0805');
  model.setMaterial('bone', '#e9dfc6');
  const addToBurrow = (
    material: string,
    shape: Shape,
    options: ShapeOptions = {},
  ): void => {
    model.add(
      material,
      place(shape, { rot: [0, BURROW_YAW, 0] }),
      null,
      options,
    );
  };
  // The hollow: a low bank of earth around a hole that darkens towards
  // its far end, where it goes under a heap of earth by the stone.
  const hollow: Triple = [0.85, 1, 1];
  addToBurrow(
    'earth',
    place(
      createLathe(
        [
          [1, 0],
          [0.82, 0.1],
        ],
        9,
      ),
      { pos: [0, 0, 0.8], scale: hollow },
    ),
  );
  addToBurrow(
    'earthDark',
    place(
      createLathe(
        [
          [0.82, 0.1],
          [0.62, 0.012],
        ],
        9,
      ),
      { pos: [0, 0, 0.8], scale: hollow },
    ),
  );
  const floors: (readonly [string, number, number, number])[] = [
    ['hole', 0.62, 0.012, 0.8],
    ['holeDeep', 0.42, 0.016, 1.0],
    ['holeDark', 0.26, 0.02, 1.18],
  ];
  for (const [material, radius, height, middle] of floors) {
    addToBurrow(
      material,
      place(
        createLathe(
          [
            [radius, height],
            [0, height],
          ],
          9,
        ),
        { pos: [0, 0, middle], scale: hollow },
      ),
    );
  }
  addToBurrow(
    'earth',
    place(createBlob(1, 400, 0.15), {
      pos: [0, 0, 1.55],
      scale: [0.7, 0.28, 0.3],
    }),
  );
  // The earth dug out, heaped low in front of the mouth.
  const heaps: (readonly [Triple, Triple])[] = [
    [
      [0, 0, -0.42],
      [0.55, 0.1, 0.32],
    ],
    [
      [-0.4, 0, -0.82],
      [0.32, 0.08, 0.26],
    ],
    [
      [0.38, 0, -0.8],
      [0.3, 0.07, 0.24],
    ],
    [
      [0.06, 0, -1.15],
      [0.16, 0.06, 0.12],
    ],
  ];
  heaps.forEach(([pos, scale]: readonly [Triple, Triple], i: number) => {
    addToBurrow('earth', place(createBlob(1, 401 + i, 0.1), { pos, scale }), {
      smooth: true,
    });
  });
  // A gnawed bone by the mouth.
  const bone: Shape = [
    ...createBox(0.035, 0.035, 0.26),
    ...[-0.13, 0.13].flatMap((end: number) =>
      place(createEllipsoid([0.04, 0.035, 0.035], 0), { pos: [0, 0, end] }),
    ),
  ];
  addToBurrow(
    'bone',
    place(bone, { pos: [0.66, 0.035, -0.5], rot: [0, 35, 0] }),
  );
  for (const corners of SLAB_PIECES) {
    model.add('slab', createGroundPiece(corners, 0.06));
  }
  for (const angles of CARVED_ARCS) {
    model.add('carving', createGroundArc(angles, 0.97, 1.03, 0.064));
  }
  for (let i = 0; i < 5; i++) {
    const angle: number = ((i * 72 + 36) * Math.PI) / 180;
    // One stone has broken off low, and the stone the burrow goes under
    // leans over it.
    const isBroken: boolean = i === 0;
    const height: number = isBroken ? 0.9 : 1.5 + (i % 3) * 0.35;
    const taper: Pair = isBroken ? [0.73, 0.76] : [0.55, 0.6];
    const lean: number = i === 1 ? -18 : -6;
    const spot: Placement = {
      pos: [1.75 * Math.sin(angle), 0, 1.75 * Math.cos(angle)],
      rot: [0, i * 72 + 36, 0],
    };
    const stand = (shape: Shape): Shape =>
      place(
        place(shape, {
          pos: [0, i === 1 ? -0.06 : 0, 0],
          rot: [lean, 0, i % 2 ? 5 : -4],
        }),
        spot,
      );
    const material: string = i % 2 ? 'rock' : 'rockDark';
    model.add(material, stand(createBlock(0.55, height, 0.42, taper)));
    if (isBroken) {
      model.add(
        material,
        stand(
          place(createBlock(0.36, 0.22, 0.3, [0.4, 0.6]), {
            pos: [0.08, height - 0.06, 0],
            rot: [0, 0, -16],
          }),
        ),
      );
    }
    if (i !== 1 && i !== 4) {
      model.add(
        'carving',
        place(
          place(createBox(0.12, 0.3, 0.03), {
            pos: [0, height * 0.55, -0.19],
            rot: [lean, 0, 0],
          }),
          spot,
        ),
      );
    }
    if (i === 0 || i === 3) {
      model.add(
        'moss',
        place(
          place(createBlob(1, 410 + i, 0.2), {
            pos: [0, 0, -0.26],
            scale: [0.26, 0.12, 0.12],
          }),
          spot,
        ),
      );
    }
  }
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}

/**
 * Creates a flat ring in the XY plane around the origin, extruded along Z.
 *
 * @param {number} inner - The inner radius.
 * @param {number} outer - The outer radius.
 * @param {number} depth - The thickness along Z.
 * @returns {Shape} The ring, in two halves.
 */
function createUprightRing(inner: number, outer: number, depth: number): Shape {
  const count = 12;
  return [0, 180].flatMap((from: number) => {
    const angles: number[] = Array.from(
      { length: count + 1 },
      (_, i: number) => ((from + (180 * i) / count) * Math.PI) / 180,
    );
    const findPoint = (radius: number, angle: number): Pair => [
      radius * Math.cos(angle),
      radius * Math.sin(angle),
    ];
    const outline: Pair[] = [
      ...angles.map((angle: number) => findPoint(outer, angle)),
      ...[...angles].reverse().map((angle: number) => findPoint(inner, angle)),
    ];
    return createExtrusion(outline, depth);
  });
}

/**
 * Creates a short, thick cross of four equal arms with rounded corners, in
 * the XY plane around the origin, extruded along Z.
 *
 * @param {number} reach - How far each arm reaches from the middle.
 * @param {number} halfWidth - Half the width of each arm.
 * @param {number} depth - The thickness along Z.
 * @returns {Shape} The cross.
 */
function createRoundCross(
  reach: number,
  halfWidth: number,
  depth: number,
): Shape {
  const corner: number = halfWidth * 0.45;
  const fillet: number = halfWidth * 0.25;
  /**
   * Finds points along a quarter of a circle.
   *
   * @param {Pair} centre - The centre of the circle.
   * @param {number} radius - The radius of the circle.
   * @param {number} from - The angle the points start at, in quarter turns.
   * @param {number} way - 1 to go anticlockwise, -1 to go clockwise.
   * @returns {Pair[]} The points, the ends included.
   */
  const findArc = (
    [x, y]: Pair,
    radius: number,
    from: number,
    way: number,
  ): Pair[] =>
    Array.from({ length: 4 }, (_, i: number): Pair => {
      const angle: number = (Math.PI / 2) * (from + (way * i) / 3);
      return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
    });
  // The arm that points up, from its right side round its end, and the
  // rounded corner between it and the arm to its left.
  const arm: Pair[] = [
    ...findArc([halfWidth - corner, reach - corner], corner, 0, 1),
    ...findArc([-halfWidth + corner, reach - corner], corner, 1, 1),
    ...findArc([-halfWidth - fillet, halfWidth + fillet], fillet, 0, -1),
  ];
  const outline: Pair[] = [0, 1, 2, 3].flatMap((turn: number) => {
    const angle: number = (Math.PI / 2) * turn;
    const [c, s]: Pair = [Math.cos(angle), Math.sin(angle)];
    return arm.map(([x, y]: Pair): Pair => [x * c - y * s, x * s + y * c]);
  });
  return createExtrusion(outline, depth);
}

/**
 * Builds the healing stele that stands by the fountain: a short tapering
 * stone of plain pale stone on a low plinth, whole and kept clean.  Its
 * front, which faces +Z, is carved with the sign of healing, a short,
 * thick cross of four equal rounded arms inside a circle, inlaid in a
 * softly glowing green.
 *
 * @returns {BuiltModel} The model.
 */
export function buildHealingStele(): BuiltModel {
  const model = new Model('HealingStele');
  model.setMaterial('stone', '#cdc8bc');
  model.setMaterial('stoneDark', '#b2ac9f');
  model.setMaterial('carving', '#7d776c');
  model.setMaterial('rune', '#6fe68c', {
    roughness: 0.5,
    emissive: '#2fae52',
  });
  const plinthHeight = 0.1;
  const height = 0.56;
  const width = 0.48;
  const depth = 0.2;
  const taper: Pair = [0.78, 0.8];
  model.add('stoneDark', createBlock(0.62, plinthHeight, 0.36, [0.94, 0.9]));
  model.add(
    'stone',
    place(createBlock(width, height, depth, taper), {
      pos: [0, plinthHeight, 0],
    }),
  );
  // Whatever is carved on the front lies on it, which leans back a little.
  const lean: number =
    (Math.atan(((depth / 2) * (1 - taper[1])) / height) * 180) / Math.PI;
  const placeOnFront = (shape: Shape, y: number): Shape => {
    const share: number = (y - plinthHeight) / height;
    const z: number = (depth / 2) * (1 - (1 - taper[1]) * share);
    return place(shape, { pos: [0, y, z], rot: [-lean, 0, 0] });
  };
  // The sign: a dark round hollow, a glowing circle, and a glowing cross.
  const runeHeight = 0.4;
  const runeScale = 0.7;
  const hollow: Pair[] = Array.from({ length: 16 }, (_, i: number): Pair => {
    const angle: number = (Math.PI * i) / 8;
    return [0.265 * Math.cos(angle), 0.265 * Math.sin(angle)];
  });
  const rune: Shape = [
    ...createUprightRing(0.205, 0.24, 0.02),
    ...createRoundCross(0.175, 0.062, 0.02),
  ];
  model.add(
    'carving',
    placeOnFront(
      place(createExtrusion(hollow, 0.02), { scale: runeScale }),
      runeHeight,
    ),
  );
  model.add(
    'rune',
    placeOnFront(
      place(rune, { pos: [0, 0, 0.006], scale: runeScale }),
      runeHeight,
    ),
  );
  model.centreFootprint();
  return { model };
}

/** The number of points along the outline of a clover leaflet on the sign. */
const HEART_POINTS = 20;

/**
 * Creates the outline of a heart-shaped leaflet, from its point at the
 * origin to its notched end along +Y.
 *
 * @param {number} length - About how far the leaflet reaches from its
 *   point.  It falls about 1% short of this.
 * @returns {Pair[]} The outline.
 */
function createHeartOutline(length: number): Pair[] {
  // The curve below reaches about 28.9 from its point along +Y.  Dividing
  // by a little more than that leaves the leaflet about 1% short of
  // `length`.
  const scale: number = length / 29.2;
  return Array.from({ length: HEART_POINTS }, (_, i: number): Pair => {
    const t: number = (2 * Math.PI * i) / HEART_POINTS + Math.PI;
    const x: number = 16 * Math.sin(t) ** 3;
    const y: number =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    return [x * scale, (y + 17) * scale];
  });
}

/**
 * Creates a four-leaved clover in the XY plane around the origin, extruded
 * along Z: four heart-shaped leaflets turned out on the diagonals, and a
 * short stalk that curves down from their middle.
 *
 * @param {number} length - How far each leaflet reaches from the middle.
 * @param {number} depth - The thickness of the leaflets along Z.
 * @returns {[Shape, Shape]} The leaflets and the stalk.  The stalk is
 *   thinner, so that the leaflets stand out in front of where it meets
 *   them when both lie on the same face.
 */
function createFourLeafClover(length: number, depth: number): [Shape, Shape] {
  const leaflet: Shape = createExtrusion(createHeartOutline(length), depth);
  const leaflets: Shape = [45, 135, 225, 315].flatMap((turn: number) =>
    place(leaflet, { rot: [0, 0, turn] }),
  );
  // The stalk, as points along its middle and its half width at each.
  const spine: readonly Pair[] = [
    [0, 0],
    [0.004, -0.3],
    [0.03, -0.6],
    [0.08, -0.85],
    [0.14, -1.05],
  ];
  const halfWidth: number = length * 0.07;
  const sides: Pair[][] = [1, -1].map((side: number) =>
    spine.map(([x, y]: Pair, i: number): Pair => {
      const [nx, ny]: Pair = getItem(spine, Math.min(i + 1, spine.length - 1));
      const [px, py]: Pair = getItem(spine, Math.max(i - 1, 0));
      const [dx, dy]: Pair = [nx - px, ny - py];
      const norm: number = Math.hypot(dx, dy);
      const width: number = halfWidth * (1 - (0.4 * i) / spine.length);
      return [
        x * length + (side * width * -dy) / norm,
        y * length + (side * width * dx) / norm,
      ];
    }),
  );
  const stalk: Shape = createExtrusion(
    [...getItem(sides, 0), ...[...getItem(sides, 1)].reverse()],
    depth / 2,
  );
  return [leaflets, stalk];
}

/**
 * The rough-hewn outline of the board of the village sign, with its ends
 * chipped and cut at a slant, in metres from its middle.
 */
const SIGN_BOARD_OUTLINE: readonly Pair[] = [
  [-0.5, 0.2],
  [-0.2, 0.24],
  [0.15, 0.232],
  [0.47, 0.25],
  [0.51, 0.12],
  [0.44, 0.075],
  [0.5, 0.02],
  [0.49, -0.19],
  [0.41, -0.24],
  [0.05, -0.228],
  [-0.3, -0.245],
  [-0.44, -0.225],
  [-0.48, -0.17],
  [-0.53, 0.06],
];

/**
 * The grain worn into the face of the board of the village sign, each line
 * as its outline, in metres from the middle of the board.
 */
const SIGN_BOARD_GRAIN: readonly (readonly Pair[])[] = [
  [
    [-0.46, 0.14],
    [-0.34, 0.152],
    [-0.24, 0.148],
    [-0.34, 0.14],
  ],
  [
    [0.23, -0.16],
    [0.33, -0.168],
    [0.45, -0.162],
    [0.33, -0.158],
  ],
];

/**
 * Builds the sign that stands at the gate of the village: a rough-hewn
 * board, near the eye level of a player, nailed a little crooked across the
 * front of a crooked stake that sticks out above it, with the stub of a
 * branch lower down.  The front of the board, which faces +Z, bears a green
 * four-leaved clover.
 *
 * @returns {BuiltModel} The model.
 */
export function buildVillageSign(): BuiltModel {
  const model = new Model('VillageSign');
  model.setMaterial('post', '#7a4a2a');
  model.setMaterial('board', '#d9a568');
  model.setMaterial('grain', '#b07a44');
  model.setMaterial('nail', '#4a3c34');
  model.setMaterial('leaf', '#3f9a3a');
  model.setMaterial('stalk', '#2f7a2e');
  model.add(
    'post',
    createTube(
      [
        [0, 0, 0],
        [0.018, 0.6, 0.006],
        [-0.01, 1.2, -0.01],
        [0.012, 1.8, 0],
      ],
      [0.07, 0.062, 0.056, 0.05],
      6,
    ),
  );
  // The stub of a branch, cut off short.
  model.add(
    'post',
    createTube(
      [
        [0.01, 0.78, 0],
        [0.1, 0.86, 0.01],
        [0.17, 0.94, 0.016],
      ],
      [0.034, 0.027, 0.021],
      5,
    ),
  );
  const boardDepth = 0.045;
  const paintDepth = 0.008;
  // Whatever lies on the board lies flat on its front, its back against it.
  const placeOnFront = (shape: Shape, depth: number, x = 0, y = 0): Shape =>
    place(shape, { pos: [x, y, (boardDepth + depth) / 2] });
  const [leaflets, stalk] = createFourLeafClover(0.19, paintDepth);
  const nail: Shape = createBox(0.022, 0.022, paintDepth);
  const board: readonly (readonly [string, Shape])[] = [
    ['board', createExtrusion(SIGN_BOARD_OUTLINE, boardDepth)],
    ...SIGN_BOARD_GRAIN.map(
      (line: readonly Pair[]): [string, Shape] => [
        'grain',
        placeOnFront(createExtrusion(line, paintDepth / 2), paintDepth / 2),
      ],
    ),
    ['nail', placeOnFront(nail, paintDepth, 0.005, 0.205)],
    ['nail', placeOnFront(nail, paintDepth, -0.03, -0.205)],
    ['leaf', placeOnFront(leaflets, paintDepth, 0, 0.015)],
    ['stalk', placeOnFront(stalk, paintDepth / 2, 0, 0.015)],
  ];
  for (const [material, shape] of board) {
    model.add(
      material,
      place(shape, {
        pos: [0, 1.38, 0.056 + boardDepth / 2],
        rot: [0, 0, -3],
      }),
    );
  }
  flattenUnderside(model);
  model.centreFootprint();
  return { model };
}
