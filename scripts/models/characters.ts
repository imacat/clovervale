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
 * @module scripts/models/characters The eight player and bot characters.
 */

import { Vector3 } from 'three';

import {
  createBlob,
  createBox,
  createCone,
  createEllipsoid,
  createExtrusion,
  createLathe,
  createTube,
  mirrorShape,
  place,
} from './geometry.ts';
import type { Pair, Placement, Shape, Triple } from './geometry.ts';
import { getItem } from './items.ts';
import { Model } from './model.ts';
import type { Clip } from './model.ts';
import { Rig, easeProgress } from './rig.ts';
import type {
  BuiltModel,
  ClipReport,
  LegBones,
  Pose,
  PoseKey,
  PoseSample,
  PoseSpec,
} from './rig.ts';

/** A way of wearing the hair. */
export type HairStyle =
  | 'bob'
  | 'ponytail'
  | 'twintails'
  | 'buns'
  | 'long'
  | 'braid'
  | 'spiky'
  | 'puffs'
  | 'bun';

/** The hair of a head, in model space. */
export interface Hair {
  /** The hair itself. */
  readonly hair: Shape;
  /** The ribbons and other ornaments in the hair. */
  readonly accent: Shape;
}

/** The look of a character. */
export interface Look {
  /** The hairstyle. */
  readonly style: HairStyle;
  /** The hair colour as `#rrggbb`. */
  readonly hair: string;
  /** The ribbon colour as `#rrggbb`. */
  readonly accent: string;
  /** The skin tone. */
  readonly skin: keyof typeof SKINS;
  /** The tunic colour as `#rrggbb`. */
  readonly tunic: string;
  /** The trim colour as `#rrggbb`. */
  readonly trim: string;
}

/** How a foot walks. */
export interface Gait {
  /** The share of the cycle spent on the ground. */
  readonly duty: number;
  /** The distance walked per cycle. */
  readonly stride: number;
  /** The swing height. */
  readonly lift: number;
  /** The height of the ankle above the sole. */
  readonly ankle: number;
  /** The distance from the ankle to the heel end of the sole. */
  readonly heel: number;
  /** The distance from the ankle to the toe end of the sole. */
  readonly toe: number;
  /** The foot pitch in degrees at landing. */
  readonly strike: number;
  /** The foot pitch in degrees at lift-off. */
  readonly push: number;
  /** The middle of the ground contact. */
  readonly centre: number;
}

/** Where a walking foot is. */
export interface Step {
  /** The height of the ankle. */
  readonly y: number;
  /** How far forward the ankle is. */
  readonly z: number;
  /** The foot pitch in degrees. */
  readonly pitch: number;
}

/** The clips every character shares. */
interface SharedClips {
  /** The clips. */
  readonly animations: Clip[];
  /** The measurements of the baked clips, by clip name. */
  readonly report: ReadonlyMap<string, ClipReport>;
}

/** One degree, in radians. */
const DEG: number = Math.PI / 180;

/** The suffixes of the bones of both sides, with the sign of their X. */
export const SIDES: readonly (readonly [string, number])[] = [
  ['L', 1],
  ['R', -1],
];

/** The centre of the head in the rest pose. */
export const HEAD_CENTRE: Triple = [0, 1.27, 0];

/** The radii of the head. */
const HEAD_RADII: Triple = [0.3, 0.285, 0.285];

/** The skin tones. */
export const SKINS = { light: '#f7cfa4', tan: '#e0a877', brown: '#a56a43' };

/** The looks of the eight characters. */
export const VARIANTS: readonly Look[] = [
  {
    style: 'bob',
    hair: '#6e3f22',
    accent: '#f2c12e',
    skin: 'light',
    tunic: '#3f7fd6',
    trim: '#f4ead2',
  },
  {
    style: 'ponytail',
    hair: '#f3c93f',
    accent: '#e8473f',
    skin: 'light',
    tunic: '#ee8a2c',
    trim: '#fbe9c8',
  },
  {
    style: 'twintails',
    hair: '#2b2a33',
    accent: '#fff3f6',
    skin: 'tan',
    tunic: '#ec6fa2',
    trim: '#fff3f6',
  },
  {
    style: 'buns',
    hair: '#d9502a',
    accent: '#f6e27a',
    skin: 'light',
    tunic: '#2aa79b',
    trim: '#f4ead2',
  },
  {
    style: 'long',
    hair: '#3a4f9e',
    accent: '#ffffff',
    skin: 'brown',
    tunic: '#f2c230',
    trim: '#7a4a25',
  },
  {
    style: 'braid',
    hair: '#5fc9a0',
    accent: '#e8473f',
    skin: 'tan',
    tunic: '#f3efe2',
    trim: '#3f7fd6',
  },
  {
    style: 'spiky',
    hair: '#eceff4',
    accent: '#e8473f',
    skin: 'brown',
    tunic: '#3b8a4c',
    trim: '#f2c12e',
  },
  {
    style: 'puffs',
    hair: '#f08fc0',
    accent: '#8fe0f0',
    skin: 'light',
    tunic: '#4a4f66',
    trim: '#e8473f',
  },
];

/**
 * Finds a point on the surface of the head.
 *
 * @param {number} yaw - The angle from the front towards the left, in
 *   degrees.
 * @param {number} down - The angle below the equator, in degrees.
 * @param {number} [factor] - The distance from the centre, in head radii.
 * @returns {Triple} The point in model space.
 */
function findHeadPoint(yaw: number, down: number, factor = 1): Triple {
  const direction: Triple = [
    Math.sin(yaw * DEG) * Math.cos(down * DEG),
    -Math.sin(down * DEG),
    Math.cos(yaw * DEG) * Math.cos(down * DEG),
  ];
  return [
    HEAD_CENTRE[0] + direction[0] * HEAD_RADII[0] * factor,
    HEAD_CENTRE[1] + direction[1] * HEAD_RADII[1] * factor,
    HEAD_CENTRE[2] + direction[2] * HEAD_RADII[2] * factor,
  ];
}

/**
 * Adds the head and the face.  The head is smooth-shaded; the features on
 * it are flat-shaded.
 *
 * The model needs the materials `skin`, `eye`, `white`, `blush` and
 * `mouth`.
 *
 * @param {Model} model - The model.
 * @param {string} bone - The head bone.
 */
export function addHead(model: Model, bone: string): void {
  model.add(
    'skin',
    place(createEllipsoid(HEAD_RADII, 2), { pos: HEAD_CENTRE }),
    bone,
    { smooth: true },
  );
  for (const side of [1, -1]) {
    model.add(
      'eye',
      place(createEllipsoid([0.043, 0.068, 0.02], 1), {
        pos: findHeadPoint(23 * side, 4, 0.985),
        rot: [4, 23 * side, 0],
      }),
      bone,
    );
    model.add(
      'white',
      place(createEllipsoid([0.015, 0.02, 0.01], 0), {
        pos: findHeadPoint(23 * side + 3, -3, 1.035),
        rot: [0, 23 * side, 0],
      }),
      bone,
    );
    model.add(
      'blush',
      place(createEllipsoid([0.042, 0.022, 0.01], 0), {
        pos: findHeadPoint(41 * side, 21, 0.995),
        rot: [21, 41 * side, 0],
      }),
      bone,
    );
    model.add(
      'skin',
      place(createEllipsoid([0.03, 0.05, 0.04], 0), {
        pos: findHeadPoint(90 * side, 5, 0.98),
      }),
      bone,
    );
  }
  model.add(
    'mouth',
    place(createEllipsoid([0.026, 0.013, 0.01], 0), {
      pos: findHeadPoint(0, 25, 0.995),
      rot: [25, 0, 0],
    }),
    bone,
  );
}

/**
 * Creates the cap of hair that covers the skull.
 *
 * @param {readonly number[]} lines - How far down the hair reaches, in
 *   degrees from the crown, at nine steps from the front to the back.
 * @param {number} flare - How much the hair stands off the head towards
 *   its lower edge, in head radii.
 * @returns {Shape} The cap in model space.
 */
function createHairCap(lines: readonly number[], flare: number): Shape {
  const columns = 16;
  const rows = 5;
  const findPoint = (i: number, j: number, inner = false): Vector3 => {
    const k: number = Math.min(i % columns, columns - (i % columns));
    const phi: number = getItem(lines, k) * DEG * (j / rows);
    const theta: number = (2 * Math.PI * i) / columns;
    const low: number = Math.min(Math.max((phi / DEG - 60) / 60, 0), 1);
    const factor: number = inner ? 0.96 : 1.075 + flare * low * low;
    return new Vector3(
      HEAD_CENTRE[0] + HEAD_RADII[0] * factor * Math.sin(phi) * Math.sin(theta),
      HEAD_CENTRE[1] + 0.012 + HEAD_RADII[1] * factor * Math.cos(phi),
      HEAD_CENTRE[2] -
        0.012 +
        HEAD_RADII[2] * factor * Math.sin(phi) * Math.cos(theta),
    );
  };
  const centre = new Vector3(...HEAD_CENTRE);
  const out: Shape = [];
  const pushTriangle = (
    a: Vector3,
    b: Vector3,
    c: Vector3,
    outward: Vector3,
  ): void => {
    const normal: Vector3 = new Vector3()
      .subVectors(b, a)
      .cross(new Vector3().subVectors(c, a));
    if (normal.length() < 1e-9) {
      return;
    }
    out.push(normal.dot(outward) < 0 ? [a, c, b] : [a, b, c]);
  };
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const quad: readonly [Vector3, Vector3, Vector3, Vector3] = [
        findPoint(i, j),
        findPoint(i + 1, j),
        findPoint(i + 1, j + 1),
        findPoint(i, j + 1),
      ];
      const outward = new Vector3();
      for (const p of quad) {
        outward.addScaledVector(p, 0.25);
      }
      outward.sub(centre);
      pushTriangle(quad[0], quad[1], quad[2], outward);
      pushTriangle(quad[0], quad[2], quad[3], outward);
    }
    const rim: readonly [Vector3, Vector3, Vector3, Vector3] = [
      findPoint(i, rows),
      findPoint(i + 1, rows),
      findPoint(i + 1, rows, true),
      findPoint(i, rows, true),
    ];
    const down: Vector3 = new Vector3()
      .subVectors(rim[0], findPoint(i, rows - 1))
      .add(new Vector3().subVectors(rim[1], findPoint(i + 1, rows - 1)));
    pushTriangle(rim[0], rim[1], rim[2], down);
    pushTriangle(rim[0], rim[2], rim[3], down);
  }
  return out;
}

/**
 * Moves shapes given relative to the head centre into model space.
 *
 * @param {readonly Shape[]} shapes - The shapes.
 * @returns {Shape} The merged shape in model space.
 */
function liftToHead(shapes: readonly Shape[]): Shape {
  return place(shapes.flat(), { pos: HEAD_CENTRE });
}

/**
 * Pairs a shape with its mirror image across the YZ plane.
 *
 * @param {Shape} shape - The shape.
 * @returns {Shape[]} The shape and its mirror image.
 */
function pairWithMirror(shape: Shape): Shape[] {
  return [shape, mirrorShape(shape)];
}

/**
 * Creates a hairstyle.
 *
 * @param {HairStyle} style - The style.
 * @returns {Hair} The hair and its ribbons, in model space.
 */
export function createHair(style: HairStyle): Hair {
  switch (style) {
    case 'bob':
      return {
        hair: createHairCap([61, 54, 66, 114, 124, 128, 130, 130, 130], 0.16),
        accent: liftToHead([
          place(createEllipsoid([0.035, 0.05, 0.03], 0), {
            pos: [0.23, 0.13, 0.2],
            rot: [0, 40, 30],
          }),
        ]),
      };
    case 'ponytail':
      return {
        hair: [
          ...createHairCap([58, 63, 57, 102, 110, 110, 106, 102, 100], 0.03),
          ...liftToHead([
            createTube(
              [
                [0, 0.2, -0.25],
                [0, 0.29, -0.4],
                [0, 0.2, -0.54],
                [0, -0.04, -0.6],
                [0, -0.3, -0.56],
                [0, -0.42, -0.5],
              ],
              [0.05, 0.09, 0.105, 0.095, 0.06, 0],
              6,
              [0, 1, 0.01],
            ),
          ]),
        ],
        accent: liftToHead([
          place(createEllipsoid([0.075, 0.075, 0.05], 0), {
            pos: [0, 0.22, -0.3],
            rot: [-40, 0, 0],
          }),
        ]),
      };
    case 'twintails': {
      const tail: Shape = createTube(
        [
          [0.25, 0.16, -0.06],
          [0.38, 0.17, -0.08],
          [0.47, 0.02, -0.09],
          [0.47, -0.24, -0.08],
          [0.43, -0.46, -0.06],
          [0.4, -0.56, -0.05],
        ],
        [0.045, 0.085, 0.1, 0.09, 0.055, 0],
        6,
      );
      const tie: Shape = place(createEllipsoid([0.06, 0.07, 0.07], 0), {
        pos: [0.3, 0.17, -0.07],
      });
      return {
        hair: [
          ...createHairCap([62, 55, 64, 108, 116, 114, 110, 106, 104], 0.04),
          ...liftToHead(pairWithMirror(tail)),
        ],
        accent: liftToHead(pairWithMirror(tie)),
      };
    }
    case 'buns': {
      const bun: Shape = place(createBlob(1, 11, 0.06), {
        pos: [0.21, 0.27, -0.04],
        scale: 0.135,
      });
      const pin: Shape = place(createEllipsoid([0.035, 0.035, 0.035], 0), {
        pos: [0.3, 0.36, 0.02],
      });
      return {
        hair: [
          ...createHairCap([60, 65, 59, 106, 114, 116, 116, 116, 116], 0.06),
          ...liftToHead(pairWithMirror(bun)),
        ],
        accent: liftToHead(pairWithMirror(pin)),
      };
    }
    case 'long':
      return {
        hair: [
          ...createHairCap([57, 61, 67, 120, 130, 136, 138, 138, 138], 0.08),
          ...liftToHead([
            createTube(
              [
                [0, 0, -0.2],
                [0, -0.3, -0.25],
                [0, -0.55, -0.23],
                [0, -0.7, -0.2],
              ],
              [
                [0.26, 0.1],
                [0.29, 0.1],
                [0.25, 0.075],
                [0.14, 0.03],
              ],
              8,
              [0, 0, -1],
            ),
          ]),
        ],
        accent: liftToHead([
          createLathe(
            [
              [0.275, 0.115],
              [0.325, 0.115],
              [0.325, 0.16],
              [0.275, 0.16],
            ],
            16,
            { phase: 0 },
          ),
        ]),
      };
    case 'braid': {
      const knots: Shape[] = [];
      for (let i = 0; i < 5; i++) {
        knots.push(
          place(createBlob(0, 20 + i, 0.05), {
            pos: [
              (i % 2 ? 1 : -1) * 0.025,
              -0.12 - i * 0.115,
              -0.31 + i * 0.012,
            ],
            scale: [0.095 - i * 0.008, 0.085, 0.085 - i * 0.006],
          }),
        );
      }
      knots.push(
        place(createCone(0.05, 0.02, 0.1, 5), {
          pos: [0, -0.76, -0.25],
          rot: [180, 0, 0],
        }),
      );
      return {
        hair: [
          ...createHairCap([60, 55, 63, 108, 118, 124, 126, 126, 126], 0.07),
          ...liftToHead(knots),
        ],
        accent: liftToHead([
          place(createEllipsoid([0.06, 0.035, 0.06], 0), {
            pos: [0, -0.665, -0.255],
          }),
        ]),
      };
    }
    case 'spiky': {
      const spots: Pair[] = [
        [0, 20],
        [40, 25],
        [-40, 25],
        [75, 10],
        [-75, 10],
        [0, 55],
        [38, 60],
        [-38, 60],
        [0, 88],
        [24, -10],
        [-24, -10],
      ];
      const spikes: Shape[] = spots.map(([turn, tilt]: Pair) => {
        const tilted: Shape = place(
          place(createCone(0.1, 0, 0.2, 5), { pos: [0, 0.25, 0] }),
          { rot: [-tilt, 0, 0] },
        );
        return place(tilted, { rot: [0, turn, 0] });
      });
      return {
        hair: [
          ...createHairCap([56, 66, 54, 98, 108, 110, 108, 106, 104], 0.05),
          ...liftToHead(spikes),
        ],
        accent: liftToHead([
          createLathe(
            [
              [0.288, 0.085],
              [0.335, 0.085],
              [0.335, 0.135],
              [0.288, 0.135],
            ],
            16,
            { phase: 0 },
          ),
          place(createBox(0.05, 0.16, 0.02), {
            pos: [0.05, 0.02, -0.34],
            rot: [0, 0, 18],
          }),
          place(createBox(0.05, 0.13, 0.02), {
            pos: [-0.04, 0.03, -0.34],
            rot: [0, 0, -14],
          }),
        ]),
      };
    }
    case 'bun': {
      const bun: Shape = place(createBlob(1, 50, 0.06), {
        pos: [0, 0.23, -0.27],
        scale: [0.15, 0.13, 0.13],
      });
      return {
        hair: [
          ...createHairCap([56, 60, 56, 100, 110, 116, 120, 122, 122], 0.02),
          ...liftToHead([bun]),
        ],
        accent: liftToHead([
          place(
            createLathe(
              [
                [0.105, -0.03],
                [0.125, -0.02],
                [0.125, 0.02],
                [0.105, 0.03],
              ],
              8,
            ),
            { pos: [0, 0.2, -0.235], rot: [-50, 0, 0] },
          ),
        ]),
      };
    }
    case 'puffs': {
      const spots: (readonly [number, number, number, number])[] = [
        [0.3, -0.1, -0.02, 0.15],
        [-0.3, -0.1, -0.02, 0.15],
        [0.25, -0.2, -0.2, 0.15],
        [-0.25, -0.2, -0.2, 0.15],
        [0, -0.22, -0.3, 0.16],
        [0.17, 0.02, -0.28, 0.13],
        [-0.17, 0.02, -0.28, 0.13],
        [0, 0.19, -0.27, 0.12],
      ];
      const puffs: Shape[] = spots.map(([x, y, z, r], index: number) =>
        place(createBlob(1, 40 + index, 0.1), { pos: [x, y, z], scale: r }),
      );
      const loop: Shape = place(createEllipsoid([0.085, 0.06, 0.035], 0), {
        pos: [0.085, 0.33, 0.05],
        rot: [0, 0, 20],
      });
      return {
        hair: [
          ...createHairCap([58, 54, 61, 110, 120, 124, 124, 124, 124], 0.1),
          ...liftToHead(puffs),
        ],
        accent: liftToHead([
          ...pairWithMirror(loop),
          place(createEllipsoid([0.035, 0.04, 0.04], 0), {
            pos: [0, 0.325, 0.05],
          }),
        ]),
      };
    }
  }
}

/**
 * Defines the materials every humanoid face needs.
 *
 * @param {Model} model - The model.
 * @param {string} skin - The skin colour as `#rrggbb`.
 */
export function setFaceMaterials(model: Model, skin: string): void {
  model.setMaterial('skin', skin);
  model.setMaterial('eye', '#231814', { roughness: 0.5 });
  model.setMaterial('white', '#ffffff', { roughness: 0.5 });
  model.setMaterial('blush', '#f08a84');
  model.setMaterial('mouth', '#b9483f');
}

/**
 * Creates the shape of a foot or a blade from a side profile.
 *
 * @param {readonly Pair[]} profile - The [z, y] outline.
 * @param {number} width - The thickness along X.
 * @returns {Shape} The solid.
 */
function createSideProfile(profile: readonly Pair[], width: number): Shape {
  return place(createExtrusion(profile, width), { rot: [0, -90, 0] });
}

/**
 * Builds the mesh and the skeleton of a character.
 *
 * @param {string} name - The name of the root node.
 * @param {Look} look - The look of the character.
 * @returns {Model} The model without animations.
 */
function buildBody(name: string, look: Look): Model {
  const model = new Model(name);
  setFaceMaterials(model, SKINS[look.skin]);
  model.setMaterial('hair', look.hair);
  model.setMaterial('accent', look.accent);
  model.setMaterial('tunic', look.tunic);
  model.setMaterial('trim', look.trim);
  model.setMaterial('leather', '#8a5a2e');
  model.setMaterial('boot', '#6a4226');
  model.setMaterial('legs', '#4b3a36');
  model.setMaterial('gold', '#f2c12e', { roughness: 0.5 });
  model.setMaterial('blade', '#e3e9f0', { roughness: 0.4 });

  model.addBone('Hips', null, [0, 0.56, 0]);
  model.addBone('Chest', 'Hips', [0, 0.66, 0]);
  model.addBone('Head', 'Chest', [0, 0.98, 0]);
  for (const [side, x] of SIDES) {
    model.addBone(`UpperArm${side}`, 'Chest', [0.24 * x, 0.9, 0]);
    model.addBone(`ForeArm${side}`, `UpperArm${side}`, [0.24 * x, 0.73, 0]);
    model.addBone(`Hand${side}`, `ForeArm${side}`, [0.24 * x, 0.57, 0]);
    model.addBone(`Thigh${side}`, 'Hips', [0.095 * x, 0.55, 0]);
    model.addBone(`Shin${side}`, `Thigh${side}`, [0.095 * x, 0.3, 0]);
    model.addBone(`Foot${side}`, `Shin${side}`, [0.095 * x, 0.08, 0]);
  }

  addHead(model, 'Head');
  const hair: Hair = createHair(look.style);
  model.add('hair', hair.hair, 'Head');
  model.add('accent', hair.accent, 'Head');

  const flat: Placement = { scale: [1, 1, 0.8] };
  model.add(
    'skin',
    createLathe(
      [
        [0.062, 0.95],
        [0.062, 1.04],
      ],
      6,
    ),
    'Chest',
  );
  model.add(
    'tunic',
    place(
      createLathe(
        [
          [0, 0.63],
          [0.17, 0.64],
          [0.19, 0.76],
          [0.18, 0.87],
          [0.125, 0.95],
          [0, 0.96],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  model.add(
    'trim',
    place(
      createLathe(
        [
          [0.13, 0.925],
          [0.148, 0.93],
          [0.11, 0.985],
          [0.07, 0.985],
        ],
        8,
      ),
      flat,
    ),
    'Chest',
  );
  model.add(
    'trim',
    place(
      createExtrusion(
        [
          [-0.05, 0.93],
          [0.05, 0.93],
          [0, 0.8],
        ],
        0.02,
      ),
      { pos: [0, 0, 0.146] },
    ),
    'Chest',
  );
  model.add(
    'tunic',
    place(
      createLathe(
        [
          [0, 0.45],
          [0.25, 0.44],
          [0.18, 0.67],
          [0, 0.68],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'trim',
    place(
      createLathe(
        [
          [0.243, 0.432],
          [0.268, 0.432],
          [0.258, 0.485],
          [0.236, 0.485],
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
          [0.17, 0.62],
          [0.2, 0.62],
          [0.2, 0.68],
          [0.17, 0.68],
        ],
        8,
      ),
      flat,
    ),
    'Hips',
  );
  model.add(
    'gold',
    place(createBox(0.07, 0.07, 0.03), { pos: [0, 0.65, 0.16] }),
    'Hips',
  );
  model.add(
    'leather',
    place(createBox(0.1, 0.11, 0.07), {
      pos: [0.17, 0.6, -0.1],
      rot: [0, -30, 0],
    }),
    'Hips',
  );

  for (const [side, x] of SIDES) {
    const moveAside = (shape: Shape, px = 0.24): Shape =>
      place(shape, { pos: [px * x, 0, 0] });
    model.add(
      'tunic',
      moveAside(
        createLathe(
          [
            [0, 0.955],
            [0.065, 0.935],
            [0.082, 0.86],
            [0.078, 0.77],
            [0, 0.76],
          ],
          6,
        ),
      ),
      `UpperArm${side}`,
    );
    model.add(
      'trim',
      moveAside(
        createLathe(
          [
            [0.078, 0.76],
            [0.088, 0.76],
            [0.088, 0.79],
            [0.078, 0.79],
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
            [0, 0.8],
            [0.052, 0.78],
            [0.048, 0.66],
            [0, 0.65],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'leather',
      moveAside(
        createLathe(
          [
            [0, 0.69],
            [0.06, 0.68],
            [0.056, 0.585],
            [0, 0.575],
          ],
          6,
        ),
      ),
      `ForeArm${side}`,
    );
    model.add(
      'skin',
      place(createEllipsoid([0.058, 0.062, 0.062], 1), {
        pos: [0.24 * x, 0.555, 0],
      }),
      `Hand${side}`,
    );
    model.add(
      'legs',
      moveAside(
        createLathe(
          [
            [0, 0.59],
            [0.082, 0.57],
            [0.076, 0.3],
            [0, 0.285],
          ],
          6,
        ),
        0.095,
      ),
      `Thigh${side}`,
    );
    model.add(
      'boot',
      moveAside(
        createLathe(
          [
            [0, 0.335],
            [0.086, 0.325],
            [0.08, 0.07],
            [0, 0.06],
          ],
          6,
        ),
        0.095,
      ),
      `Shin${side}`,
    );
    model.add(
      'leather',
      moveAside(
        createLathe(
          [
            [0.084, 0.29],
            [0.1, 0.29],
            [0.1, 0.34],
            [0.084, 0.34],
          ],
          6,
        ),
        0.095,
      ),
      `Shin${side}`,
    );
    model.add(
      'boot',
      moveAside(
        createSideProfile(
          [
            [-0.09, 0],
            [0.165, 0],
            [0.175, 0.04],
            [0.13, 0.085],
            [0.03, 0.105],
            [-0.09, 0.105],
          ],
          0.155,
        ),
        0.095,
      ),
      `Foot${side}`,
    );
  }

  const sword: Triple = [-0.24, 0.555, 0];
  model.add(
    'leather',
    place(createBox(0.032, 0.032, 0.15), {
      pos: [sword[0], sword[1], 0.005],
    }),
    'HandR',
  );
  model.add(
    'gold',
    place(createEllipsoid([0.03, 0.03, 0.03], 0), {
      pos: [sword[0], sword[1], -0.085],
    }),
    'HandR',
  );
  model.add(
    'gold',
    place(createBox(0.045, 0.19, 0.04), {
      pos: [sword[0], sword[1], 0.095],
    }),
    'HandR',
  );
  model.add(
    'blade',
    place(
      createSideProfile(
        [
          [0.11, -0.042],
          [0.63, -0.042],
          [0.74, 0],
          [0.63, 0.042],
          [0.11, 0.042],
        ],
        0.024,
      ),
      { pos: [sword[0], sword[1], 0] },
    ),
    'HandR',
  );
  return model;
}

/**
 * Computes where a foot is on the ground at a point of its cycle.
 *
 * @param {number} v - The phase of the cycle, within the share spent on the
 *   ground.
 * @param {Gait} gait - The gait.
 * @returns {Step} The ankle position and the foot pitch.
 */
function computeStance(v: number, gait: Gait): Step {
  const { duty, stride, ankle, heel, toe, strike, push, centre } = gait;
  const travel: number = stride * duty;
  const contact: number = centre + travel / 2 - (travel * v) / duty;
  let pitch = 0;
  if (v < 0.25 * duty) {
    pitch = -strike * (1 - v / (0.25 * duty));
  } else if (v > 0.6 * duty) {
    pitch = push * easeProgress((v - 0.6 * duty) / (0.4 * duty));
  }
  const [sin, cos]: Pair = [Math.sin(pitch * DEG), Math.cos(pitch * DEG)];
  const [py, pz]: Pair = pitch < 0 ? [ankle, heel] : [ankle, -toe];
  const pivot: number = pitch < 0 ? contact - heel : contact + toe;
  return { y: py * cos - pz * sin, z: pivot + py * sin + pz * cos, pitch };
}

/**
 * Computes where a walking foot is at a point of its cycle.
 *
 * The foot lands at phase zero, rolls from the heel to the toe while it
 * moves backwards on the ground at the walking speed, then swings forward.
 *
 * @param {number} phase - The phase of the cycle; any real number.
 * @param {Gait} gait - The gait.
 * @returns {Step} The ankle position and the foot pitch.
 */
export function computeStep(phase: number, gait: Gait): Step {
  const u: number = phase - Math.floor(phase);
  const { duty, stride, lift } = gait;
  if (u < duty) {
    return computeStance(u, gait);
  }
  const s: number = (u - duty) / (1 - duty);
  const a: Step = computeStance(duty, gait);
  const b: Step = computeStance(0, gait);
  const speed: number = -stride * (1 - duty);
  const h: number = s * s * (3 - 2 * s);
  const z: number =
    (2 * s ** 3 - 3 * s ** 2 + 1) * a.z +
    (s ** 3 - 2 * s ** 2 + s) * speed +
    (-2 * s ** 3 + 3 * s ** 2) * b.z +
    (s ** 3 - s ** 2) * speed;
  return {
    y: a.y + (b.y - a.y) * h + lift * Math.sin(Math.PI * s) ** 2,
    z,
    pitch: a.pitch + (b.pitch - a.pitch) * easeProgress(s * 1.3),
  };
}

const GAIT: Gait = {
  duty: 0.37,
  stride: 1.5,
  lift: 0.1,
  ankle: 0.08,
  heel: 0.09,
  toe: 0.17,
  strike: 14,
  push: 32,
  centre: 0.02,
};
const STANCE = { x: 0.105, yaw: 9 };
const LEGS: Readonly<Record<'L' | 'R', LegBones>> = {
  L: ['ThighL', 'ShinL', 'FootL'],
  R: ['ThighR', 'ShinR', 'FootR'],
};
const IDLE: PoseSpec = {
  Chest: [2, 0, 0],
  Head: [0, 0, 0],
  UpperArmL: [6, 0, 9],
  ForeArmL: [-18, 0, 0],
  UpperArmR: [-12, 0, -14],
  ForeArmR: [-58, 0, 0],
  HandR: [24, -16, 0],
};

/**
 * Plants both feet on the ground under a pose.
 *
 * @param {Rig} rig - The rig.
 * @param {Pose} pose - The pose to change.
 * @returns {Pose} The same pose.
 */
function plantFeet(rig: Rig, pose: Pose): Pose {
  rig.reachLeg(pose, LEGS.L, [STANCE.x, 0.08, 0], { yaw: STANCE.yaw });
  rig.reachLeg(pose, LEGS.R, [-STANCE.x, 0.08, 0], { yaw: -STANCE.yaw });
  return pose;
}

/**
 * Adds the four animation clips to a character.
 *
 * @param {Model} model - The character.
 * @returns {ReadonlyMap<string, ClipReport>} The measurements of the baked
 *   clips, by clip name.
 */
function animateBody(model: Model): ReadonlyMap<string, ClipReport> {
  const rig = new Rig(model);
  const poseIdle = (breath: number, sway: number): Pose =>
    plantFeet(
      rig,
      rig.createPose({
        ...IDLE,
        offset: [0, -0.012 - 0.014 * breath, 0],
        Chest: [2 + 2 * breath, 0, 0],
        Head: [-1.5 * breath, 4 * sway, 1.5 * sway],
        UpperArmL: [6, 0, 9 + 3 * breath],
        ForeArmR: [-58 - 5 * breath, 0, 0],
      }),
    );
  const idleStart: Pose = poseIdle(0, 0);

  rig.bake(
    'Idle',
    2.4,
    (t: number): PoseSample => {
      const angle: number = (2 * Math.PI * t) / 2.4;
      return { pose: poseIdle((1 - Math.cos(angle)) / 2, Math.sin(angle)) };
    },
    { loop: true },
  );

  let overreach = 0;
  rig.bake(
    'Walk',
    1,
    (t: number): PoseSample => {
      const c: number = Math.cos(2 * Math.PI * t);
      const s: number = Math.sin(2 * Math.PI * t);
      const pose: Pose = rig.createPose({
        offset: [0, -0.12 - 0.02 * Math.cos(4 * Math.PI * (t - 0.2)), 0],
        Hips: [5, -8 * c, 0],
        Chest: [7, 15 * c, 0],
        Head: [-6, -7 * c, 0],
        UpperArmL: [34 * c - 4, 0, 10],
        ForeArmL: [-42 + 22 * c, 0, 0],
        UpperArmR: [-12 - 16 * c, 0, -14],
        ForeArmR: [-62 - 6 * s, 0, 0],
        HandR: [24, -16, 0],
      });
      const left: Step = computeStep(t, GAIT);
      const right: Step = computeStep(t + 0.5, GAIT);
      overreach = Math.max(
        overreach,
        rig.reachLeg(pose, LEGS.L, [STANCE.x, left.y, left.z], {
          pitch: left.pitch,
          yaw: 3,
        }),
        rig.reachLeg(pose, LEGS.R, [-STANCE.x, right.y, right.z], {
          pitch: right.pitch,
          yaw: -3,
        }),
      );
      return { pose };
    },
    { loop: true },
  );
  rig.noteOverreach('Walk', overreach);

  const slashKeys: PoseKey[] = [
    { t: 0, pose: idleStart },
    {
      t: 0.15,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, -0.03, -0.05],
        Hips: [-4, -14, 0],
        Chest: [-10, -38, 0],
        Head: [4, 30, 0],
        UpperArmL: [-30, 0, 30],
        ForeArmL: [-50, 0, 0],
        UpperArmR: [-125, 0, -25],
        ForeArmR: [-45, 0, 0],
        HandR: [25, 0, 0],
      }),
    },
    {
      t: 0.27,
      ease: 'in',
      pose: rig.createPose({
        offset: [0, -0.1, 0.12],
        Hips: [10, 14, 0],
        Chest: [20, 38, 0],
        Head: [-12, -30, 0],
        UpperArmL: [45, 0, 25],
        ForeArmL: [-30, 0, 0],
        UpperArmR: [-60, 0, 25],
        ForeArmR: [-8, 0, 0],
        HandR: [30, 0, 0],
      }),
    },
    {
      t: 0.38,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, -0.11, 0.13],
        Hips: [12, 18, 0],
        Chest: [24, 46, 0],
        Head: [-14, -36, 0],
        UpperArmL: [50, 0, 25],
        ForeArmL: [-30, 0, 0],
        UpperArmR: [-28, 0, 40],
        ForeArmR: [-5, 0, 0],
        HandR: [22, 10, 0],
      }),
    },
    { t: 0.6, pose: idleStart },
  ];
  rig.bake(
    'Slash',
    0.6,
    (t: number): PoseSample => {
      const pose: Pose = rig.interpolate(slashKeys, t);
      const step: number =
        0.16 * easeProgress(Math.min(t / 0.27, (0.6 - t) / 0.2));
      rig.reachLeg(pose, LEGS.L, [STANCE.x, 0.08, 0], { yaw: STANCE.yaw });
      rig.reachLeg(
        pose,
        LEGS.R,
        [
          -STANCE.x,
          0.08 + 0.05 * Math.sin(Math.PI * Math.min(t / 0.27, 1)),
          step,
        ],
        { yaw: -STANCE.yaw },
      );
      return { pose };
    },
    { settle: true },
  );

  const lying: PoseSpec = {
    offset: [0, -0.38, 0.55],
    Hips: [90, 0, 0],
    Chest: [-4, 0, 0],
    Head: [-38, 0, 0],
    UpperArmL: [0, 0, 128],
    ForeArmL: [0, 0, -30],
    UpperArmR: [0, 0, -112],
    ForeArmR: [0, 0, 20],
    HandR: [0, -90, 0],
    ThighL: [0, 0, 12],
    ShinL: [0, 0, 0],
    FootL: [72, 0, 0],
    ThighR: [0, 0, -9],
    ShinR: [0, 0, 0],
    FootR: [72, 0, 0],
  };
  const dieKeys: PoseKey[] = [
    { t: 0, pose: idleStart },
    {
      t: 0.14,
      ease: 'out',
      pose: rig.createPose({
        offset: [0, -0.02, -0.06],
        Hips: [-10, 0, 0],
        Chest: [-18, 0, 0],
        Head: [-24, 0, 0],
        UpperArmL: [-60, 0, 55],
        ForeArmL: [-30, 0, 0],
        UpperArmR: [-70, 0, -55],
        ForeArmR: [-30, 0, 0],
        HandR: [0, -20, 0],
      }),
    },
    {
      t: 0.38,
      pose: rig.createPose({
        offset: [0, -0.2, 0.06],
        Hips: [22, 0, 0],
        Chest: [22, 0, 0],
        Head: [14, 0, 0],
        UpperArmL: [-20, 0, 40],
        ForeArmL: [-40, 0, 0],
        UpperArmR: [-30, 0, -40],
        ForeArmR: [-40, 0, 0],
        HandR: [0, -50, 0],
        ThighL: [-60, 0, 8],
        ShinL: [100, 0, 0],
        FootL: [30, 0, 0],
        ThighR: [-60, 0, -8],
        ShinR: [100, 0, 0],
        FootR: [30, 0, 0],
      }),
    },
    { t: 0.62, ease: 'in', pose: rig.createPose(lying) },
    {
      t: 0.74,
      ease: 'out',
      pose: rig.createPose({
        ...lying,
        Hips: [84, 0, 0],
        Head: [-50, 0, 0],
        ThighL: [14, 0, 12],
        ShinL: [35, 0, 0],
        ThighR: [10, 0, -9],
        ShinR: [28, 0, 0],
      }),
    },
    { t: 0.92, ease: 'in', pose: rig.createPose(lying) },
    { t: 1.3, pose: rig.createPose(lying) },
  ];
  rig.bake('Die', 1.3, (t: number): PoseSample => {
    const free: Pose = rig.interpolate(dieKeys, t);
    const planted: Pose = plantFeet(rig, free.clone());
    return {
      pose: planted.blend(free, easeProgress((t - 0.3) / 0.16)),
      snap: easeProgress((t - 0.45) / 0.17),
    };
  });
  return rig.report;
}

/** The clips every character shares, once they are baked. */
let sharedClips: SharedClips | null = null;

/**
 * Bakes the clips every character shares.
 *
 * The clips keep every character above the ground, whatever its hairstyle.
 *
 * @returns {SharedClips} The clips and the measurements taken while baking.
 */
function bakeSharedClips(): SharedClips {
  if (sharedClips === null) {
    const union: Model = buildBody('Union', getItem(VARIANTS, 0));
    for (const look of VARIANTS.slice(1)) {
      const hair: Hair = createHair(look.style);
      union.add('hair', hair.hair, 'Head');
      union.add('accent', hair.accent, 'Head');
    }
    const report: ReadonlyMap<string, ClipReport> = animateBody(union);
    sharedClips = { animations: union.animations, report };
  }
  return sharedClips;
}

/**
 * Builds one of the eight characters.
 *
 * @param {number} index - The index of the look in {@link VARIANTS}.
 * @returns {BuiltModel} The animated model and the measurements taken while
 *   baking.
 * @throws {RangeError} If there is no such look.
 */
export function buildCharacter(index: number): BuiltModel {
  const model: Model = buildBody(
    `Character0${String(index + 1)}`,
    getItem(VARIANTS, index),
  );
  const { animations, report } = bakeSharedClips();
  model.animations = animations;
  model.centreOn(['FootL', 'FootR']);
  return { model, report };
}
