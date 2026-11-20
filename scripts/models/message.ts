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
 * @module scripts/models/message The message from Clovervale that Edwin
 *   writes for the king, as it lies on the ground once put down.
 */

import { createBox, createExtrusion, place } from './geometry.ts';
import type { Pair, Shape } from './geometry.ts';
import { Model } from './model.ts';
import type { BuiltModel } from './rig.ts';

/**
 * The outline of the piece of cloth, seen from above, in metres from its
 * middle: roughly square, but torn ragged all round, as if ripped from a
 * sleeve.
 */
const CLOTH_OUTLINE: readonly Pair[] = [
  [-0.16, 0.12],
  [-0.11, 0.135],
  [-0.075, 0.118],
  [-0.03, 0.14],
  [0.02, 0.122],
  [0.06, 0.138],
  [0.1, 0.116],
  [0.15, 0.132],
  [0.142, 0.08],
  [0.162, 0.035],
  [0.138, -0.01],
  [0.158, -0.06],
  [0.14, -0.12],
  [0.095, -0.104],
  [0.05, -0.128],
  [0.005, -0.108],
  [-0.045, -0.13],
  [-0.09, -0.11],
  [-0.155, -0.126],
  [-0.14, -0.075],
  [-0.162, -0.03],
  [-0.138, 0.02],
  [-0.158, 0.07],
];

/**
 * The strokes of the writing scrawled across the cloth, line by line from
 * the top: each line as the height of its middle, in metres from the
 * middle of the cloth, and the lengths of its strokes from the left, each
 * stroke tilted against the one before, as a hurried hand writes.
 */
const WRITING: readonly (readonly [number, readonly number[]])[] = [
  [0.085, [0.04, 0.03, 0.05, 0.035, 0.04]],
  [0.042, [0.035, 0.045, 0.025, 0.04, 0.045]],
  [0, [0.05, 0.035, 0.04, 0.03, 0.045]],
  [-0.042, [0.03, 0.045, 0.05, 0.035]],
  [-0.085, [0.045, 0.035, 0.025]],
];

/** Where the writing starts along each line, from the middle of the cloth. */
const WRITING_LEFT = -0.12;

/** The gap between two strokes of the writing, in metres. */
const STROKE_GAP = 0.008;

/** How far each stroke of the writing is tilted, in degrees. */
const STROKE_TILT = 9;

/** The thickness of the cloth, in metres. */
const CLOTH_THICKNESS = 0.005;

/**
 * Builds the message from Clovervale, as it lies flat on the ground: a
 * torn piece of pale cloth with lines of dark writing scrawled across it,
 * its top towards -Z.
 *
 * @returns {BuiltModel} The model.
 */
export function buildItemClovervaleMessage(): BuiltModel {
  const model = new Model('ItemClovervaleMessage');
  model.setMaterial('cloth', '#e3d8bd', { roughness: 0.95 });
  model.setMaterial('ink', '#3e2018');
  const lie = (shape: Shape, height: number): Shape =>
    place(shape, { pos: [0, height, 0], rot: [-90, 0, 0] });
  model.add(
    'cloth',
    lie(createExtrusion(CLOTH_OUTLINE, CLOTH_THICKNESS), CLOTH_THICKNESS / 2),
  );
  WRITING.forEach(([y, lengths], row: number) => {
    let x: number = WRITING_LEFT;
    lengths.forEach((length: number, index: number) => {
      const tilt: number =
        (index + row) % 2 === 0 ? STROKE_TILT : -STROKE_TILT;
      model.add(
        'ink',
        lie(
          place(createBox(length, 0.007, 0.002), {
            pos: [x + length / 2, y, 0],
            rot: [0, 0, tilt],
          }),
          CLOTH_THICKNESS + 0.001,
        ),
      );
      x += length + STROKE_GAP;
    });
  });
  model.centreFootprint();
  return { model };
}
