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
 * @module scripts/models/buildings The weapon shop, the fountain, a cottage,
 *   the apothecary shop and the house of the village chief.
 */

import {
  createBlob,
  createBlock,
  createBox,
  createCone,
  createEllipsoid,
  createExtrusion,
  createLathe,
  createTube,
  place,
} from './geometry.ts';
import type { Pair, Placement, Shape, Triple } from './geometry.ts';
import { Model } from './model.ts';
import { createFourLeafClover, setCloverMaterials } from './props.ts';
import type { BuiltModel } from './rig.ts';

/** A wall of a house. */
type Wall = 'front' | 'back' | 'left' | 'right';

/** A window of a house. */
interface HouseWindow {
  /** The wall the window is in. */
  readonly wall: Wall;
  /** The distance of the center of the window along the wall. */
  readonly u: number;
  /** The height of the center of the window. */
  readonly y: number;
  /** The width of the window. */
  readonly w: number;
  /** The height of the window. */
  readonly h: number;
}

/** The plan of a timber-framed house. */
interface HousePlan {
  /** The center of the house along X. */
  readonly x: number;
  /** The size of the house along X. */
  readonly width: number;
  /** The size of the house along Z. */
  readonly depth: number;
  /** The height of the stone base. */
  readonly base: number;
  /** The height of the walls. */
  readonly wall: number;
  /**
   * The number of stories the walls rise through, each as tall as the
   * others, or one if not given.
   */
  readonly stories?: number;
  /** The height of the roof. */
  readonly rise: number;
  /** The offset of the door from the center of the front wall. */
  readonly door: number;
  /** The [x, z] offset of the chimney from the center of the house. */
  readonly chimney: Pair;
  /** The windows. */
  readonly windows: readonly HouseWindow[];
}

/**
 * Moves a shape built facing +Z onto a wall of a house, at a distance along
 * the wall, a height, and a distance out of the wall.
 */
type PutOnWall = (
  shape: Shape,
  side: Wall,
  u: number,
  y: number,
  out: number,
) => Shape;

/** A part of an object, as its material and its shape. */
type Part = readonly [string, Shape];

/** One degree, in radians. */
const DEG: number = Math.PI / 180;

/**
 * Defines the materials of a timber-framed house.
 *
 * @param {Model} model - The model.
 * @param {string} roof - The main roof color as `#rrggbb`.
 * @param {string} roofShade - The color of the alternate tile rows.
 */
function setHouseMaterials(
  model: Model,
  roof: string,
  roofShade: string,
): void {
  model.setMaterial('stone', '#a9a8ad');
  model.setMaterial('stoneDark', '#86858c');
  model.setMaterial('plaster', '#f3e4c3');
  model.setMaterial('timber', '#8a5530');
  model.setMaterial('door', '#6b4226');
  model.setMaterial('roof', roof);
  model.setMaterial('roofShade', roofShade);
  model.setMaterial('glass', '#a9dcec', { roughness: 0.3 });
  model.setMaterial('gold', '#f2c12e', { roughness: 0.5 });
}

/**
 * Adds a timber-framed house whose front gable faces +Z.
 *
 * @param {Model} model - The model, with the house materials defined.
 * @param {HousePlan} plan - The plan of the house.
 * @returns {PutOnWall} A function that moves a shape built facing +Z onto a
 *   wall of the house.
 */
function addHouse(model: Model, plan: HousePlan): PutOnWall {
  const { x, width: w, depth: d, base, wall, rise } = plan;
  const eaves: number = base + wall;
  const stories: number = plan.stories ?? 1;
  const story: number = wall / stories;
  const floors: number[] = Array.from(
    { length: stories - 1 },
    (_, i: number) => base + (i + 1) * story,
  );
  const putOnWall: PutOnWall = (
    shape: Shape,
    side: Wall,
    u: number,
    y: number,
    out: number,
  ): Shape => {
    switch (side) {
      case 'front':
        return place(shape, { pos: [x + u, y, d / 2 + out] });
      case 'back':
        return place(shape, {
          pos: [x - u, y, -d / 2 - out],
          rot: [0, 180, 0],
        });
      case 'right':
        return place(shape, {
          pos: [x + w / 2 + out, y, -u],
          rot: [0, 90, 0],
        });
      case 'left':
        return place(shape, {
          pos: [x - w / 2 - out, y, u],
          rot: [0, -90, 0],
        });
    }
  };
  model.add(
    'stone',
    place(createBlock(w + 0.3, base, d + 0.3), { pos: [x, 0, 0] }),
  );
  model.add('plaster', place(createBlock(w, wall, d), { pos: [x, base, 0] }));
  model.add(
    'plaster',
    place(
      createExtrusion(
        [
          [-w / 2, 0],
          [w / 2, 0],
          [0, rise],
        ],
        d,
      ),
      { pos: [x, eaves, 0] },
    ),
  );

  const slope: number = rise / (w / 2);
  const reach: number = w / 2 + 0.45;
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const far: number = (reach * (rows - i)) / rows;
    const thick: number = 0.16 + 0.07 * i;
    model.add(
      i % 2 ? 'roofShade' : 'roof',
      place(
        createExtrusion(
          [
            [-far, rise - slope * far],
            [0, rise],
            [far, rise - slope * far],
            [far, rise - slope * far + thick],
            [0, rise + thick],
            [-far, rise - slope * far + thick],
          ],
          d + 0.9 - 0.04 * i,
        ),
        { pos: [x, eaves + 0.02, 0] },
      ),
    );
  }
  model.add(
    'timber',
    place(createBox(0.22, 0.2, d + 1), {
      pos: [x, eaves + rise + 0.16 + 0.07 * rows, 0],
    }),
  );

  const angle: number = Math.atan(slope) / DEG;
  const rafter: number = Math.hypot(w / 2, rise);
  const gables: Wall[] = ['front', 'back'];
  const sides: Wall[] = ['left', 'right'];
  for (const side of gables) {
    for (const y of [base + 0.1, eaves - 0.1, ...floors]) {
      model.add(
        'timber',
        putOnWall(createBox(w + 0.12, 0.2, 0.1), side, 0, y, 0.03),
      );
    }
    for (const s of [1, -1]) {
      model.add(
        'timber',
        putOnWall(
          place(createBox(rafter, 0.18, 0.1), { rot: [0, 0, -angle * s] }),
          side,
          (s * w) / 4,
          eaves + rise / 2 - 0.1,
          0.03,
        ),
      );
      model.add(
        'timber',
        putOnWall(
          createBox(0.22, wall, 0.22),
          side,
          s * (w / 2 - 0.08),
          base + wall / 2,
          -0.05,
        ),
      );
    }
    model.add(
      'timber',
      putOnWall(
        createBox(0.18, rise - 0.5, 0.1),
        side,
        0,
        eaves + (rise - 0.5) / 2,
        0.03,
      ),
    );
    model.add(
      'timber',
      putOnWall(
        createBox(w * 0.52, 0.16, 0.1),
        side,
        0,
        eaves + rise * 0.42,
        0.035,
      ),
    );
  }
  for (const side of sides) {
    for (const y of [base + 0.1, eaves - 0.1, base + wall * 0.5]) {
      model.add(
        'timber',
        putOnWall(createBox(d - 0.1, 0.2, 0.1), side, 0, y, 0.03),
      );
    }
    for (const u of [-d / 6, d / 6]) {
      model.add(
        'timber',
        putOnWall(createBox(0.18, wall, 0.1), side, u, base + wall / 2, 0.025),
      );
    }
  }
  const addBrace = (side: Wall, u: number, lean: number): void => {
    const span: number = story * 0.5 - 0.2;
    for (let i = 0; i < stories; i++) {
      model.add(
        'timber',
        putOnWall(
          place(createBox(0.15, Math.hypot(span, span * 0.8), 0.08), {
            rot: [0, 0, lean * 38.7],
          }),
          side,
          u,
          base + i * story + 0.2 + span / 2,
          0.03,
        ),
      );
    }
  };
  addBrace('front', -w / 2 + 0.65, -1);
  addBrace('front', w / 2 - 0.65, 1);
  addBrace('back', -w / 2 + 0.65, -1);
  addBrace('back', w / 2 - 0.65, 1);
  for (const side of sides) {
    addBrace(side, -d / 2 + 0.6, -1);
    addBrace(side, d / 2 - 0.6, 1);
  }

  const u: number = plan.door;
  model.add(
    'timber',
    putOnWall(createBox(1.3, 1.95, 0.12), 'front', u, base + 0.975, 0.03),
  );
  model.add(
    'door',
    putOnWall(createBox(1.02, 1.75, 0.1), 'front', u, base + 0.875, 0.07),
  );
  for (const dy of [0.45, 1.3]) {
    model.add(
      'timber',
      putOnWall(createBox(1.02, 0.1, 0.06), 'front', u, base + dy, 0.12),
    );
  }
  model.add(
    'gold',
    putOnWall(
      createEllipsoid([0.06, 0.06, 0.05], 0),
      'front',
      u + 0.36,
      base + 0.9,
      0.14,
    ),
  );
  model.add(
    'stoneDark',
    putOnWall(createBlock(1.6, base * 0.5, 0.7), 'front', u, 0, 0.35),
  );

  for (const win of plan.windows) {
    const addPart = (
      material: string,
      shape: Shape,
      dy: number,
      out: number,
    ): void => {
      model.add(material, putOnWall(shape, win.wall, win.u, win.y + dy, out));
    };
    addPart('timber', createBox(win.w + 0.22, win.h + 0.22, 0.1), 0, 0.03);
    addPart('glass', createBox(win.w, win.h, 0.1), 0, 0.06);
    addPart('timber', createBox(0.07, win.h, 0.06), 0, 0.11);
    addPart('timber', createBox(win.w, 0.07, 0.06), 0, 0.11);
    addPart(
      'timber',
      createBox(win.w + 0.4, 0.1, 0.24),
      -win.h / 2 - 0.13,
      0.1,
    );
  }
  const [cx, cz] = plan.chimney;
  const top: number = eaves + rise + 0.5;
  const bottom: number = eaves + rise - slope * Math.abs(cx) - 0.3;
  model.add(
    'stone',
    place(createBlock(0.62, top - bottom, 0.62), {
      pos: [x + cx, bottom, cz],
    }),
  );
  model.add(
    'stoneDark',
    place(createBlock(0.78, 0.16, 0.78), { pos: [x + cx, top, cz] }),
  );
  return putOnWall;
}

/**
 * Creates a sword standing on its pommel.
 *
 * @param {number} length - The length of the blade.
 * @returns {Part[]} The blade, the guard, the grip and the pommel.
 */
export function createSword(length: number): Part[] {
  return [
    [
      'steel',
      place(
        createExtrusion(
          [
            [-0.055, 0],
            [0.055, 0],
            [0.055, length - 0.12],
            [0, length],
            [-0.055, length - 0.12],
          ],
          0.03,
        ),
        { pos: [0, 0.27, 0] },
      ),
    ],
    ['gold', place(createBox(0.3, 0.06, 0.06), { pos: [0, 0.25, 0] })],
    ['door', place(createBox(0.05, 0.2, 0.05), { pos: [0, 0.13, 0] })],
    [
      'gold',
      place(createEllipsoid([0.045, 0.045, 0.045], 0), { pos: [0, 0.03, 0] }),
    ],
  ];
}

/**
 * Builds the weapon shop: a slate-roofed timber house with a sword and
 * shield emblem, a weapon stall under a striped awning, and a forge.
 *
 * @returns {BuiltModel} The model.
 */
export function buildWeaponShop(): BuiltModel {
  const model = new Model('WeaponShop');
  setHouseMaterials(model, '#5f7fb0', '#4f6c9c');
  model.setMaterial('steel', '#dfe6ee', { roughness: 0.4 });
  model.setMaterial('iron', '#4a4d58', { roughness: 0.6 });
  model.setMaterial('red', '#d24a3c');
  model.setMaterial('cream', '#fbf1d8');
  model.setMaterial('wood', '#b98045');
  model.setMaterial('fire', '#ff8a1e', { emissive: '#ff6a00' });
  model.setMaterial('glow', '#ffd95a', { emissive: '#ffb020' });
  model.setMaterial('coal', '#2e2a2c');
  model.setMaterial('embers', '#d2481e', {
    roughness: 0.8,
    emissive: '#5a1406',
  });
  model.setMaterial('hotIron', '#e0602a', {
    roughness: 0.6,
    emissive: '#5a1a06',
  });
  const hx = -1.05;
  const plan: HousePlan = {
    x: hx,
    width: 5,
    depth: 4.4,
    base: 0.4,
    wall: 2.5,
    rise: 2.25,
    door: -1.2,
    chimney: [-1.5, -1],
    windows: [
      { wall: 'left', u: 0, y: 1.85, w: 1, h: 0.9 },
      { wall: 'back', u: 0, y: 1.85, w: 1.1, h: 0.9 },
      { wall: 'right', u: -1.3, y: 2.1, w: 0.8, h: 0.7 },
    ],
  };
  const putOnWall: PutOnWall = addHouse(model, plan);

  // The emblem under the gable: a shield over two crossed swords.
  const emblemY = 4.05;
  const faceFront: Placement = { rot: [90, 0, 0] };
  model.add(
    'door',
    putOnWall(
      place(
        createLathe(
          [
            [0, 0],
            [0.74, 0],
            [0.74, 0.05],
            [0, 0.05],
          ],
          8,
        ),
        faceFront,
      ),
      'front',
      0,
      emblemY,
      0.04,
    ),
  );
  for (const lean of [42, -42]) {
    for (const [material, shape] of createSword(1.25)) {
      model.add(
        material,
        putOnWall(
          place(place(shape, { pos: [0, -0.85, 0] }), { rot: [0, 0, lean] }),
          'front',
          0,
          emblemY,
          0.1,
        ),
      );
    }
  }
  model.add(
    'red',
    putOnWall(
      place(
        createLathe(
          [
            [0, 0],
            [0.4, 0],
            [0.4, 0.07],
            [0, 0.11],
          ],
          8,
        ),
        faceFront,
      ),
      'front',
      0,
      emblemY,
      0.12,
    ),
  );
  model.add(
    'gold',
    putOnWall(
      place(
        createLathe(
          [
            [0.38, 0],
            [0.47, 0],
            [0.47, 0.09],
            [0.38, 0.09],
          ],
          8,
        ),
        faceFront,
      ),
      'front',
      0,
      emblemY,
      0.115,
    ),
  );
  model.add(
    'gold',
    putOnWall(
      createEllipsoid([0.11, 0.11, 0.08], 0),
      'front',
      0,
      emblemY,
      0.24,
    ),
  );

  // The weapon stall: an open counter under a striped awning.
  const stall = 0.95;
  model.add(
    'timber',
    putOnWall(createBox(2.5, 1.5, 0.1), 'front', stall, 2.0, 0.03),
  );
  model.add(
    'door',
    putOnWall(createBox(2.26, 1.26, 0.1), 'front', stall, 2.0, 0.05),
  );
  model.add(
    'wood',
    putOnWall(createBlock(2.6, 0.12, 0.9), 'front', stall, 1.2, 0.42),
  );
  model.add(
    'timber',
    putOnWall(createBlock(2.4, 0.8, 0.12), 'front', stall, 0.4, 0.75),
  );
  for (const s of [-1, 1]) {
    model.add(
      'timber',
      putOnWall(
        createBlock(0.12, 2.25, 0.12),
        'front',
        stall + s * 1.3,
        0,
        1.35,
      ),
    );
  }
  for (let i = 0; i < 7; i++) {
    const u: number = stall - 1.45 + 2.9 / 14 + (i * 2.9) / 7;
    model.add(
      i % 2 ? 'cream' : 'red',
      putOnWall(
        place(createBox(2.9 / 7, 0.08, 1.75), { rot: [22, 0, 0] }),
        'front',
        u,
        2.62,
        0.72,
      ),
    );
    model.add(
      i % 2 ? 'cream' : 'red',
      putOnWall(createBox(2.9 / 7, 0.22, 0.05), 'front', u, 2.2, 1.52),
    );
  }
  const displayed: Triple[] = [
    [-0.75, 0.9, 8],
    [-0.3, 1.05, -6],
    [0.15, 0.8, 5],
  ];
  for (const [du, length, lean] of displayed) {
    for (const [material, shape] of createSword(length)) {
      model.add(
        material,
        putOnWall(
          place(shape, { rot: [-12, 0, lean] }),
          'front',
          stall + du,
          1.34,
          0.36,
        ),
      );
    }
  }
  model.add(
    'red',
    putOnWall(
      place(
        createLathe(
          [
            [0, 0],
            [0.33, 0],
            [0.33, 0.06],
            [0, 0.12],
          ],
          8,
        ),
        { rot: [72, 0, 0] },
      ),
      'front',
      stall + 0.78,
      1.72,
      0.3,
    ),
  );
  model.add(
    'gold',
    putOnWall(
      createEllipsoid([0.1, 0.1, 0.08], 0),
      'front',
      stall + 0.78,
      1.76,
      0.42,
    ),
  );
  model.add(
    'wood',
    putOnWall(
      place(createBox(0.07, 1.25, 0.07), { rot: [0, 0, -14] }),
      'front',
      stall - 0.05,
      2.0,
      0.12,
    ),
  );
  model.add(
    'iron',
    putOnWall(
      place(
        createExtrusion(
          [
            [0, 0.1],
            [0.3, 0.28],
            [0.34, -0.2],
            [0, -0.06],
          ],
          0.05,
        ),
        { rot: [0, 0, -14] },
      ),
      'front',
      stall + 0.1,
      2.5,
      0.13,
    ),
  );

  // The hanging sign by the door.
  const sign: number = plan.door - 0.95;
  model.add(
    'timber',
    putOnWall(createBox(0.1, 0.1, 1.0), 'front', sign, 2.75, 0.5),
  );
  model.add(
    'wood',
    putOnWall(createBox(0.08, 0.62, 0.74), 'front', sign, 2.3, 0.58),
  );
  for (const out of [0.05, -0.05]) {
    for (const [material, shape] of createSword(0.42)) {
      model.add(
        material,
        putOnWall(
          place(place(shape, { pos: [0, -0.33, 0], scale: 0.9 }), {
            rot: [-45, 90, 0],
          }),
          'front',
          sign + out,
          2.3,
          0.58,
        ),
      );
    }
  }

  // The forge beside the house.
  const fx: number = hx + 2.5 + 1.15;
  model.add(
    'stoneDark',
    place(createBlock(1.9, 0.25, 1.9), { pos: [fx, 0, -0.3] }),
  );
  model.add(
    'stone',
    place(createBlock(1.7, 1.45, 1.7, [0.9, 0.9]), { pos: [fx, 0.25, -0.3] }),
  );
  model.add(
    'stone',
    place(createBlock(1.0, 2.3, 1.0, [0.62, 0.62]), { pos: [fx, 1.7, -0.3] }),
  );
  model.add(
    'stoneDark',
    place(createBlock(0.8, 0.2, 0.8), { pos: [fx, 4.0, -0.3] }),
  );
  model.add(
    'coal',
    place(createBox(0.95, 0.75, 0.2), { pos: [fx, 0.95, 0.5] }),
  );
  model.add(
    'coal',
    place(
      createExtrusion(
        [
          [-0.475, 0],
          [0.475, 0],
          [0.3, 0.25],
          [-0.3, 0.25],
        ],
        0.2,
      ),
      { pos: [fx, 1.32, 0.5] },
    ),
  );
  // The bed of coals along the foot of the mouth, under the flames.
  for (let i = 0; i < 6; i++) {
    model.add(
      'embers',
      place(createBlob(0, 500 + i, 0.25), {
        pos: [fx - 0.375 + i * 0.15, 0.6, 0.56],
        scale: [0.085, 0.045, 0.06],
      }),
    );
  }
  model.add(
    'fire',
    place(createCone(0.33, 0, 0.6, 5), {
      pos: [fx, 0.6, 0.56],
      scale: [1, 1, 0.3],
    }),
  );
  model.add(
    'glow',
    place(createCone(0.18, 0, 0.36, 5), {
      pos: [fx - 0.03, 0.6, 0.6],
      scale: [1, 1, 0.3],
    }),
  );
  model.add(
    'fire',
    place(createCone(0.14, 0, 0.3, 4), {
      pos: [fx + 0.26, 0.6, 0.58],
      scale: [1, 1, 0.3],
    }),
  );

  // The anvil on its stump, out in front of the forge on the side away from
  // the house, low enough for the smith to bring her hammer down on it, with
  // a bar of hot iron on it.  The smith stands in front of the mouth of the
  // forge, facing away from the house, with the forge on her left and the
  // anvil in front of her; its horn points to her left, at the forge.
  const ax: number = fx + 0.46;
  const az = 1.41;
  const stump = 0.32;
  model.add(
    'wood',
    place(
      createLathe(
        [
          [0, 0],
          [0.34, 0],
          [0.3, stump],
          [0, stump],
        ],
        8,
      ),
      { pos: [ax, 0, az] },
    ),
  );
  model.add(
    'iron',
    place(
      createExtrusion(
        [
          [-0.2, 0],
          [0.2, 0],
          [0.13, 0.12],
          [0.13, 0.2],
          [0.52, 0.27],
          [0.3, 0.4],
          [-0.34, 0.4],
          [-0.34, 0.27],
          [-0.13, 0.2],
          [-0.13, 0.12],
        ],
        0.26,
      ),
      { pos: [ax, stump, az], rot: [0, 90, 0] },
    ),
  );
  // The bar lies across the flat of the anvil, pointing at the smith, with
  // its end on her side out over the edge of the anvil for her tongs to
  // hold.
  model.add(
    'hotIron',
    place(createBlock(0.045, 0.03, 0.24), {
      pos: [ax - 0.09, stump + 0.4, az + 0.02],
      rot: [0, 90, 0],
    }),
  );
  // The barrel of swords by the end of the counter.
  const bx: number = hx + 2.55;
  const bz = 2.97;
  model.add(
    'wood',
    place(
      createLathe(
        [
          [0, 0],
          [0.3, 0],
          [0.37, 0.4],
          [0.3, 0.8],
          [0.24, 0.8],
          [0.24, 0.72],
          [0, 0.72],
        ],
        8,
      ),
      { pos: [bx, 0, bz] },
    ),
  );
  for (const y of [0.16, 0.62]) {
    model.add(
      'iron',
      place(
        createLathe(
          [
            [0.33, y],
            [0.36, y],
            [0.36, y + 0.07],
            [0.33, y + 0.07],
          ],
          8,
        ),
        { pos: [bx, 0, bz] },
      ),
    );
  }
  const stored: Triple[] = [
    [0.08, 0.02, 14],
    [-0.1, 0.06, -12],
    [0.02, -0.1, 4],
  ];
  for (const [dx, dz, lean] of stored) {
    for (const [material, shape] of createSword(0.5).slice(1)) {
      model.add(
        material,
        place(place(shape, { pos: [0, 0.3, 0], rot: [180, 0, 0] }), {
          pos: [bx + dx, 0.95, bz + dz],
          rot: [lean, 0, lean],
        }),
      );
    }
  }

  // An open box of coal against the side of the forge away from the house,
  // by its front corner: a wooden box with no lid, heaped with dark lumps.
  const cx: number = fx + 1.17;
  const cz = 0.3;
  const coalBox: Triple = [0.38, 0.42, 0.6];
  const plank = 0.03;
  for (const side of [-1, 1]) {
    model.add(
      'wood',
      place(createBlock(plank, coalBox[1], coalBox[2]), {
        pos: [cx + side * (coalBox[0] - plank) * 0.5, 0, cz],
      }),
    );
    model.add(
      'wood',
      place(createBlock(coalBox[0] - 2 * plank, coalBox[1], plank), {
        pos: [cx, 0, cz + side * (coalBox[2] - plank) * 0.5],
      }),
    );
  }
  model.add(
    'coal',
    place(
      createBlock(
        coalBox[0] - 2 * plank,
        coalBox[1] - 0.06,
        coalBox[2] - 2 * plank,
      ),
      { pos: [cx, 0, cz] },
    ),
  );
  for (let i = 0; i < 10; i++) {
    const u: number = (i % 2) - 0.5;
    const v: number = Math.floor(i / 2) / 4 - 0.5;
    model.add(
      'coal',
      place(createBlob(0, 600 + i, 0.3), {
        pos: [
          cx + u * 0.15,
          coalBox[1] - 0.06 + (i % 3) * 0.008,
          cz + v * 0.44,
        ],
        scale: [0.07, 0.045, 0.06],
      }),
    );
  }
  model.centerFootprint();
  return { model };
}

/**
 * Builds a plain cottage with a clay-tile roof.
 *
 * @returns {BuiltModel} The model.
 */
export function buildCottage(): BuiltModel {
  const model = new Model('Cottage');
  setHouseMaterials(model, '#e0793c', '#c9662f');
  model.setMaterial('green', '#5fa646');
  model.setMaterial('red', '#e2463c');
  const plan: HousePlan = {
    x: 0,
    width: 4.6,
    depth: 4,
    base: 0.35,
    wall: 2.3,
    rise: 2.1,
    door: 0.9,
    chimney: [1.3, -0.9],
    windows: [
      { wall: 'front', u: -1.1, y: 1.7, w: 0.95, h: 0.85 },
      { wall: 'left', u: 0, y: 1.7, w: 0.95, h: 0.85 },
      { wall: 'right', u: 0, y: 1.7, w: 0.95, h: 0.85 },
      { wall: 'back', u: 0, y: 1.7, w: 1.1, h: 0.85 },
      { wall: 'front', u: 0, y: 3.55, w: 0.6, h: 0.55 },
    ],
  };
  const putOnWall: PutOnWall = addHouse(model, plan);
  model.add(
    'timber',
    putOnWall(createBox(1.35, 0.26, 0.3), 'front', -1.1, 1.02, 0.2),
  );
  for (let i = 0; i < 4; i++) {
    model.add(
      'green',
      putOnWall(
        place(createBlob(0, 60 + i, 0.2), { scale: 0.17 }),
        'front',
        -1.6 + i * 0.33,
        1.22,
        0.2,
      ),
    );
    model.add(
      'red',
      putOnWall(
        createEllipsoid([0.07, 0.07, 0.07], 0),
        'front',
        -1.5 + i * 0.27,
        1.36,
        0.27,
      ),
    );
  }
  model.centerFootprint();
  return { model };
}

/**
 * Adds the sign of an apothecary, a mortar and pestle on a round wooden
 * plaque framed in gold, with a sprig of herbs rising from the mortar.
 *
 * @param {Model} model - The model, with the house materials and the
 *   materials `mortar`, `pestle` and `green` defined.
 * @param {PutOnWall} putOnWall - Moves a shape built facing +Z onto a wall
 *   of the house.
 */
function addMortarSign(model: Model, putOnWall: PutOnWall): void {
  // The height of the middle of the sign.
  const y = 3.6;
  const faceFront: Placement = { rot: [90, 0, 0] };
  const radius = 0.52;
  model.add(
    'door',
    putOnWall(
      place(
        createLathe(
          [
            [0, 0],
            [radius, 0],
            [radius, 0.05],
            [0, 0.05],
          ],
          8,
        ),
        faceFront,
      ),
      'front',
      0,
      y,
      0.04,
    ),
  );
  model.add(
    'gold',
    putOnWall(
      place(
        createLathe(
          [
            [radius - 0.08, 0],
            [radius - 0.01, 0],
            [radius - 0.01, 0.07],
            [radius - 0.08, 0.07],
          ],
          8,
        ),
        faceFront,
      ),
      'front',
      0,
      y,
      0.06,
    ),
  );
  // The mortar, a squat stone bowl, flattened against the plaque, with
  // the hollow of its bowl showing over its rim.
  const flat: Placement = { scale: [1, 1, 0.55] };
  model.add(
    'mortar',
    putOnWall(
      place(
        createLathe(
          [
            [0, 0],
            [0.13, 0],
            [0.14, 0.03],
            [0.22, 0.09],
            [0.26, 0.19],
            [0.27, 0.25],
            [0.21, 0.25],
            [0.19, 0.17],
            [0, 0.13],
          ],
          10,
        ),
        flat,
      ),
      'front',
      0,
      y - 0.33,
      0.2,
    ),
  );
  // The pestle, its round head down in the bowl and its handle leaning out
  // over the rim to the right.
  model.add(
    'pestle',
    putOnWall(
      createTube(
        [
          [-0.04, 0.12, 0],
          [0.02, 0.2, 0],
          [0.12, 0.36, 0],
          [0.2, 0.5, 0],
          [0.23, 0.55, 0],
        ],
        [0.05, 0.062, 0.035, 0.03, 0],
        6,
      ),
      'front',
      0,
      y - 0.33,
      0.22,
    ),
  );
  // A sprig of herbs rising from the bowl on the left.
  const leaves: readonly Triple[] = [
    [-0.1, 0.33, 30],
    [-0.17, 0.4, 55],
    [-0.06, 0.44, 10],
  ];
  for (const [u, dy, tilt] of leaves) {
    model.add(
      'green',
      putOnWall(
        place(createEllipsoid([0.035, 0.08, 0.02], 0), { rot: [0, 0, tilt] }),
        'front',
        u,
        y - 0.33 + dy,
        0.2,
      ),
    );
  }
}

/**
 * Builds the apothecary shop: a cottage like the others, with its windows
 * where a cottage has them, under a roof of green-glazed tiles, its gable
 * window made into the sign of the shop, a mortar and pestle.  The front
 * window has no box of flowers under it, as the herb rack stands in front
 * of it.  The door is shut, and the windows hold glass.
 *
 * @returns {BuiltModel} The model.
 */
export function buildApothecary(): BuiltModel {
  const model = new Model('Apothecary');
  setHouseMaterials(model, '#3d8f80', '#327769');
  model.setMaterial('green', '#5fa646');
  model.setMaterial('mortar', '#e6e0d2');
  model.setMaterial('pestle', '#b98045');
  const plan: HousePlan = {
    x: 0,
    width: 4.6,
    depth: 4,
    base: 0.35,
    wall: 2.3,
    rise: 2.1,
    door: 0.9,
    chimney: [1.3, -0.9],
    windows: [
      { wall: 'front', u: -1.1, y: 1.7, w: 0.95, h: 0.85 },
      { wall: 'left', u: 0, y: 1.7, w: 0.95, h: 0.85 },
      { wall: 'right', u: 0, y: 1.7, w: 0.95, h: 0.85 },
      { wall: 'back', u: 0, y: 1.7, w: 1.1, h: 0.85 },
    ],
  };
  const putOnWall: PutOnWall = addHouse(model, plan);
  addMortarSign(model, putOnWall);
  model.centerFootprint();
  return { model };
}

/**
 * The outline of the banner of the village chief, in meters from the middle
 * of its top edge: a length of cloth with its lower end cut into two tails.
 */
const BANNER_OUTLINE: readonly Pair[] = [
  [-0.25, 0],
  [0.25, 0],
  [0.25, -0.85],
  [0, -0.7],
  [-0.25, -0.85],
];

/**
 * Builds the house of the village chief: a cottage grown wider, deeper and
 * two stories tall, each story as tall as the one of a cottage, with the
 * same walls under a broad roof of a gentler pitch, laid with clay tiles
 * of a deeper red-brown than those of a cottage, and a porch added in
 * front of the middle of it under a little roof of the same tiles.  The
 * door, as large as the door of a cottage, opens onto the middle of the
 * porch.  From the left end of the front beam of the porch, as one faces
 * the house, hangs a small banner bearing the green four-leaf clover of
 * the village sign; to the right of the door, on the porch, is room for
 * someone to stand.  The front faces +Z, and the windows of both stories
 * and the window in the gable, as large as those of a cottage, hold glass.
 *
 * @returns {BuiltModel} The model.
 */
export function buildChiefHouse(): BuiltModel {
  const model = new Model('ChiefHouse');
  setHouseMaterials(model, '#a5482d', '#8f3c25');
  setCloverMaterials(model);
  model.setMaterial('green', '#5fa646');
  model.setMaterial('red', '#e2463c');
  model.setMaterial('deck', '#a87447');
  model.setMaterial('banner', '#e3b34c');
  const lower = 1.75;
  const upper = 4.05;
  const pane = { w: 0.95, h: 0.85 };
  const plan: HousePlan = {
    x: 0,
    width: 7.2,
    depth: 5,
    base: 0.4,
    wall: 4.6,
    stories: 2,
    rise: 2.1,
    door: 0,
    chimney: [-2, -1.2],
    windows: [
      { wall: 'front', u: -2.75, y: lower, ...pane },
      { wall: 'front', u: 2.75, y: lower, ...pane },
      { wall: 'front', u: -2.75, y: upper, ...pane },
      { wall: 'front', u: 0, y: upper, ...pane },
      { wall: 'front', u: 2.75, y: upper, ...pane },
      { wall: 'front', u: 0, y: 5.9, w: 0.6, h: 0.55 },
      { wall: 'left', u: 0, y: lower, ...pane },
      { wall: 'left', u: 0, y: upper, ...pane },
      { wall: 'right', u: 0, y: lower, ...pane },
      { wall: 'right', u: 0, y: upper, ...pane },
      { wall: 'back', u: -1.5, y: lower, ...pane },
      { wall: 'back', u: 1.5, y: lower, ...pane },
      { wall: 'back', u: -1.5, y: upper, ...pane },
      { wall: 'back', u: 1.5, y: upper, ...pane },
    ],
  };
  const putOnWall: PutOnWall = addHouse(model, plan);
  const front: number = plan.depth / 2;

  // The boxes of flowers under the windows of the ground floor, beside the
  // porch, as a cottage has under its window.
  for (const u of [-2.75, 2.75]) {
    model.add(
      'timber',
      putOnWall(createBox(1.35, 0.26, 0.3), 'front', u, lower - 0.68, 0.2),
    );
    for (let i = 0; i < 4; i++) {
      model.add(
        'green',
        putOnWall(
          place(createBlob(0, 80 + i, 0.2), { scale: 0.17 }),
          'front',
          u - 0.5 + i * 0.33,
          lower - 0.48,
          0.2,
        ),
      );
      model.add(
        'red',
        putOnWall(
          createEllipsoid([0.07, 0.07, 0.07], 0),
          'front',
          u - 0.4 + i * 0.27,
          lower - 0.34,
          0.27,
        ),
      );
    }
  }

  // The porch, added in front of the stone base across the middle of the
  // front: a low wooden floor, two posts along its front, braced to the
  // beam they hold up, and the little roof, which slopes down from the
  // wall just above the floor of the upper story.
  const porch = 1.9;
  const post = 2;
  const postZ: number = front + 1.65;
  const deck = 0.08;
  const beam = 2.52;
  const eaves = 3.15;
  model.add(
    'deck',
    place(createBlock(4.4, deck, 1.65), { pos: [0, 0, front + 0.975] }),
  );
  for (const side of [-1, 1]) {
    model.add(
      'timber',
      place(createBlock(0.16, beam - 0.08 - deck, 0.16), {
        pos: [side * post, deck, postZ],
      }),
    );
    model.add(
      'timber',
      place(createBox(0.08, 0.5, 0.08), {
        pos: [side * (post - 0.17), beam - 0.25, postZ],
        rot: [0, 0, side * 45],
      }),
    );
  }
  model.add(
    'timber',
    place(createBox(4.3, 0.16, 0.16), { pos: [0, beam, postZ] }),
  );
  const slope: number = (eaves - (beam + 0.08)) / (postZ - front);
  const rows = 3;
  for (let i = 0; i < rows; i++) {
    const far: number = (porch * (rows - i)) / rows;
    const thick: number = 0.12 + 0.05 * i;
    model.add(
      i % 2 ? 'roofShade' : 'roof',
      place(
        createExtrusion(
          [
            [0, eaves],
            [far, eaves - slope * far],
            [far, eaves - slope * far + thick],
            [0, eaves + thick],
          ],
          4.8 - 0.04 * i,
        ),
        { pos: [0, 0, front], rot: [0, -90, 0] },
      ),
    );
  }

  // The banner, hung from a rod on two hooks in the front of the beam of
  // the porch, beside the post on the left, clear of its brace.
  const banner = -1.2;
  const hang: number = beam - 0.03;
  const cloth = 0.02;
  const out: number = postZ - front + 0.13;
  model.add(
    'banner',
    putOnWall(
      createExtrusion(BANNER_OUTLINE, cloth),
      'front',
      banner,
      hang - 0.02,
      out,
    ),
  );
  model.add(
    'timber',
    putOnWall(createBox(0.6, 0.035, 0.035), 'front', banner, hang, out),
  );
  for (const side of [-1, 1]) {
    model.add(
      'timber',
      putOnWall(
        createBox(0.03, 0.03, 0.06),
        'front',
        banner + side * 0.22,
        hang,
        out - 0.03,
      ),
    );
    model.add(
      'gold',
      putOnWall(
        createEllipsoid([0.03, 0.03, 0.03], 0),
        'front',
        banner + side * 0.32,
        hang,
        out,
      ),
    );
  }
  const [leaflets, stalk] = createFourLeafClover(0.13, 0.008);
  const clover: number = hang - 0.32;
  const face: number = out + cloth / 2;
  model.add(
    'leaf',
    putOnWall(leaflets, 'front', banner, clover, face + 0.004),
  );
  model.add('stalk', putOnWall(stalk, 'front', banner, clover, face + 0.002));
  model.centerFootprint();
  return { model };
}

/**
 * Builds the healing fountain: an octagonal stone basin with steps at the
 * front and a glowing crystal rising from the water.
 *
 * @returns {BuiltModel} The model.
 */
export function buildFountain(): BuiltModel {
  const model = new Model('Fountain');
  model.setMaterial('stone', '#b4b3b8');
  model.setMaterial('stoneDark', '#8f8e96');
  model.setMaterial('stoneLight', '#cfced2');
  model.setMaterial('water', '#63cfe6', {
    roughness: 0.2,
    emissive: '#0b3a44',
  });
  model.setMaterial('crystal', '#7fe9f5', {
    roughness: 0.15,
    emissive: '#1f8f9f',
  });
  model.setMaterial('crystalDeep', '#3fb6dc', {
    roughness: 0.15,
    emissive: '#126a86',
  });
  model.setMaterial('moss', '#7fb23c');
  const sides = 8;
  model.add(
    'stoneDark',
    createLathe(
      [
        [0, 0],
        [1.93, 0],
        [1.93, 0.16],
        [0, 0.16],
      ],
      sides,
    ),
  );
  model.add(
    'stone',
    createLathe(
      [
        [1.62, 0.16],
        [1.62, 0.36],
        [0, 0.36],
      ],
      sides,
    ),
  );
  model.add(
    'stoneLight',
    createLathe(
      [
        [1.5, 0.36],
        [1.56, 0.72],
        [1.5, 0.8],
        [1.22, 0.8],
        [1.18, 0.58],
      ],
      sides,
    ),
  );
  model.add(
    'water',
    createLathe(
      [
        [1.2, 0.6],
        [0, 0.6],
      ],
      sides,
    ),
  );
  model.add(
    'stone',
    createLathe(
      [
        [0.52, 0.6],
        [0.44, 1.0],
        [0.8, 1.22],
        [0.84, 1.34],
        [0.66, 1.34],
        [0.6, 1.26],
      ],
      sides,
    ),
  );
  model.add(
    'water',
    createLathe(
      [
        [0.61, 1.27],
        [0, 1.27],
      ],
      sides,
    ),
  );
  for (let i = 0; i < 4; i++) {
    model.add(
      'water',
      place(
        place(createBox(0.2, 0.8, 0.05, [0.6, 1]), {
          pos: [0, 0.95, 0.9],
          rot: [-9, 0, 0],
        }),
        { rot: [0, 45 + i * 90, 0] },
      ),
    );
  }
  const addGem = (
    material: string,
    radius: number,
    height: number,
    placement: Placement,
  ): void => {
    model.add(
      material,
      place(
        createLathe(
          [
            [0, 0],
            [radius * 0.55, height * 0.12],
            [radius, height * 0.42],
            [radius * 0.5, height * 0.86],
            [0, height],
          ],
          6,
        ),
        placement,
      ),
    );
  };
  addGem('crystal', 0.4, 1.9, { pos: [0, 1.05, 0] });
  addGem('crystalDeep', 0.24, 1.15, {
    pos: [0.24, 1.12, 0.1],
    rot: [0, 0, -24],
  });
  addGem('crystalDeep', 0.22, 1.0, {
    pos: [-0.24, 1.12, -0.05],
    rot: [8, 0, 26],
  });
  addGem('crystal', 0.17, 0.8, { pos: [0, 1.12, 0.26], rot: [26, 0, 4] });
  addGem('crystal', 0.16, 0.75, {
    pos: [0.03, 1.12, -0.26],
    rot: [-28, 0, -6],
  });
  addGem('crystalDeep', 0.11, 0.5, {
    pos: [0.95, 0.5, -0.5],
    rot: [0, 0, -14],
  });
  addGem('crystal', 0.09, 0.4, { pos: [-0.9, 0.5, 0.55], rot: [10, 0, 16] });
  model.add(
    'stone',
    place(createBlock(1.1, 0.16, 0.5), { pos: [0, 0.16, 1.6] }),
  );
  model.add(
    'stoneLight',
    place(createBlock(1.3, 0.16, 0.42), { pos: [0, 0, 1.74] }),
  );
  const tufts: Triple[] = [
    [1.5, 0.9, 1],
    [-1.55, -0.8, 0.8],
    [-1.3, 1.25, 0.7],
  ];
  for (const [x, z, s] of tufts) {
    model.add(
      'moss',
      place(createBlob(0, 70 + Math.round(x * 10), 0.2), {
        pos: [x, 0.2, z],
        scale: [0.24 * s, 0.13 * s, 0.24 * s],
      }),
    );
  }
  model.centerFootprint();
  return { model };
}
