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
 * @module scripts/models/token The token of the Clovervale spy, a signet
 *   ring, which Martha gives up once beaten, as it rests on the ground once
 *   put down.
 */

import { createEllipsoid, createLathe, place } from './geometry.ts';
import type { Pair } from './geometry.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/** The number of sides of the band and of the bezel of the ring. */
const SIDES = 16;

/** The radius of the hole in the band of the ring, in metres. */
const INNER = 0.034;

/** The outer radius of the band of the ring, in metres. */
const OUTER = 0.054;

/** The width of the band of the ring, in metres. */
const WIDTH = 0.032;

/** The radius of the bezel of the ring, across the band, in metres. */
const BEZEL = 0.036;

/** The thickness of the bezel of the ring, in metres. */
const BEZEL_THICKNESS = 0.022;

/**
 * Builds the token of the Clovervale spy, as it rests on the ground: a
 * chunky gold signet ring of the old style, standing on its thick, rounded
 * band, with a broad oval bezel on top, held between two swelling
 * shoulders, and the enemy's emblem engraved in its face.
 *
 * @returns {BuiltModel} The model.
 */
export function buildItemSpyToken(): BuiltModel {
  const model = new Model('ItemSpyToken');
  model.setMaterial('gold', '#d1a23f', { roughness: 0.35, metallic: 0.7 });
  model.setMaterial('engraving', '#5c3d1a', { roughness: 0.7, metallic: 0.3 });
  const half: number = WIDTH / 2;
  const band: Pair[] = [
    [INNER, -half * 0.6],
    [INNER + 0.005, -half],
    [OUTER - 0.005, -half],
    [OUTER, -half * 0.5],
    [OUTER, half * 0.5],
    [OUTER - 0.005, half],
    [INNER + 0.005, half],
    [INNER, half * 0.6],
    [INNER, -half * 0.6],
  ];
  model.add('gold', place(createLathe(band, SIDES), { rot: [90, 0, 0] }));
  for (const side of [-1, 1]) {
    model.add(
      'gold',
      place(createEllipsoid([0.014, 0.018, half * 1.05], 1), {
        pos: [side * 0.03, OUTER - 0.01, 0],
        rot: [0, 0, side * 40],
      }),
    );
  }
  const base: number = OUTER - 0.006;
  model.add(
    'gold',
    place(
      createLathe(
        [
          [0, 0],
          [BEZEL - 0.006, 0],
          [BEZEL, 0.007],
          [BEZEL, BEZEL_THICKNESS - 0.005],
          [BEZEL - 0.004, BEZEL_THICKNESS],
          [0, BEZEL_THICKNESS],
        ],
        SIDES,
      ),
      { pos: [0, base, 0], scale: [1, 1, 0.8] },
    ),
  );
  const face: number = base + BEZEL_THICKNESS;
  model.add(
    'engraving',
    place(
      createLathe(
        [
          [0, 0],
          [BEZEL - 0.01, 0],
          [BEZEL - 0.01, 0.0015],
          [0, 0.0015],
        ],
        SIDES,
      ),
      { pos: [0, face - 0.001, 0], scale: [1, 1, 0.8] },
    ),
  );
  for (const [x, z, w, d, turn] of [
    [0, 0, 0.007, 0.018, 0],
    [0, -0.004, 0.016, 0.005, 0],
    [-0.009, 0.009, 0.006, 0.004, 35],
    [0.009, 0.009, 0.006, 0.004, -35],
  ] as const) {
    model.add(
      'gold',
      place(createEllipsoid([w, 0.0025, d], 0), {
        pos: [x, face + 0.0005, z],
        rot: [0, turn, 0],
      }),
    );
  }
  model.centreFootprint();
  return { model };
}
