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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/check-models/model Checks each model file on its own: its
 *   format, its budgets, its origin and size, and its rig and clips.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { Vector3 } from 'three';

import { MODEL_FILES } from '../../packages/client/src/model-catalog.ts';

import { checkClips } from './clips.ts';
import { TOLERANCE, modelsDir } from './constants.ts';
import type { Check } from './constants.ts';
import { classifyModel } from './files.ts';
import type { ModelKind } from './files.ts';
import { hashRig, parseGlb } from './glb.ts';
import type { GltfNode, ParsedGlb } from './glb.ts';
import { measureModel } from './measure.ts';
import type { ClipMeasurements, ModelMeasurements } from './measure.ts';

/** The parts of the Khronos glTF Validator the check uses. */
interface Validator {
  /** Validates a glTF file. */
  readonly validateBytes: (data: Uint8Array) => Promise<ValidationReport>;
}

/** The report of the Khronos glTF Validator on a file. */
interface ValidationReport {
  /** What the validator found. */
  readonly issues: {
    /** The number of errors. */
    readonly numErrors: number;
    /** The number of warnings. */
    readonly numWarnings: number;
    /** The findings. */
    readonly messages: {
      /** The severity: 0 for an error, up to 3 for a hint. */
      readonly severity: number;
      /** The code of the finding. */
      readonly code: string;
    }[];
  };
}

/** The outcome of checking a model. */
export interface ModelResult {
  /** The file name of the model. */
  readonly file: string;
  /** What the model stands for in the game. */
  readonly kind: ModelKind;
  /** The summary of the model, for the owner to read. */
  readonly summary: string;
  /** The requirements the model does not meet. */
  readonly failures: string[];
  /** The digest of the skeleton, if the model has one. */
  readonly skeletonHash: string;
  /** The digest of the animation clips, if the model has any. */
  readonly clipsHash: string;
}

/** The Khronos glTF Validator. */
const validator = createRequire(import.meta.url)(
  'gltf-validator',
) as Validator;

/**
 * The bounds of the height of Toby, in meters: clearly shorter than the
 * grown-ups, which stand 1.5 m to 1.8 m tall.
 */
const CHILD_HEIGHT: readonly [number, number] = [1, 1.2];
/** The severities of the findings of the validator, by number. */
const SEVERITIES: readonly string[] = ['error', 'warning', 'info', 'hint'];

/**
 * Checks the size of a static model: that its origin is the center of its
 * footprint, and that the models the village has a size for are that
 * size.
 *
 * @param {string} file - The file name of the model.
 * @param {ModelMeasurements} measured - The measurements of the model.
 * @param {Check} check - Notes each requirement.
 */
function checkStaticSize(
  file: string,
  measured: ModelMeasurements,
  check: Check,
): void {
  const { min, max } = measured.rest;
  const size: Vector3 = measured.rest.getSize(new Vector3());
  const height: number = max.y;
  check(
    Math.abs(min.x + max.x) < 2e-3 && Math.abs(min.z + max.z) < 2e-3,
    'origin is not the center of the footprint',
  );
  if (file === MODEL_FILES['weapon-shop']) {
    check(
      size.x <= 8 && size.z <= 8 && height <= 6,
      'weapon shop too large',
    );
  }
  if (file === MODEL_FILES.fountain) {
    check(size.x <= 4 && size.z <= 4, 'fountain too wide');
  }
  if (file === MODEL_FILES['village-sign']) {
    // The whole sign, to the top of the stake above its board, stands
    // about as tall as a person: no shorter than a character, and at
    // most a little taller, so that it does not tower over the players.
    check(height >= 1.5 && height <= 1.9, `height ${String(height)}`);
  }
  if (file === MODEL_FILES['chief-house']) {
    // The largest house of the village: much wider than a cottage, which
    // is 5.5 m across under its roof and 5.4 m tall, and with its two
    // stories well above it, yet under a roof of a gentle pitch that does
    // not tower, and not so large as to crowd its corner.
    check(height >= 7 && height <= 8.2, `height ${String(height)}`);
    check(size.x >= 7.5 && size.x <= 9, `width ${String(size.x)}`);
    check(size.z <= 8, `depth ${String(size.z)}`);
  }
  if (file === MODEL_FILES['yard-wall']) {
    // A two-meter stretch that reaches a little past each end, about
    // thigh-high on a player, low enough to see the porch over.
    check(size.x >= 2 && size.x <= 2.4, `length ${String(size.x)}`);
    check(height >= 0.6 && height <= 0.8, `height ${String(height)}`);
  }
  if (file === MODEL_FILES['yard-wall-end']) {
    // A ragged end shorter than a whole stretch, from its tall end, no
    // taller than a whole stretch, to its low stones, with the stones
    // fallen from it lying close by on either side.
    check(size.x >= 1.3 && size.x <= 1.7, `length ${String(size.x)}`);
    check(size.z <= 1.5, `depth ${String(size.z)}`);
    check(height >= 0.5 && height <= 0.7, `height ${String(height)}`);
  }
  if (file === MODEL_FILES['old-well']) {
    // No more than 1.5 m across, its stonework being 1.4 m across and the
    // little roof over it only a little wider; and no more than 2 m tall
    // with its roof, a little taller than a player.
    check(size.x <= 1.5 && size.z <= 1.5, 'old well too wide');
    check(height <= 2, `height ${String(height)}`);
  }
}

/**
 * Checks the origin and the size of a model: that it stands on the ground,
 * is as tall as its kind may be, has its origin in the middle, and faces
 * +Z.
 *
 * @param {string} file - The file name of the model.
 * @param {ModelKind} kind - What the model stands for in the game.
 * @param {ModelMeasurements} measured - The measurements of the model.
 * @param {Check} check - Notes each requirement.
 */
function checkOriginAndSize(
  file: string,
  kind: ModelKind,
  measured: ModelMeasurements,
  check: Check,
): void {
  const { min, max } = measured.rest;
  check(min.y >= -TOLERANCE, 'rest pose reaches below the ground');
  check(min.y < 0.01, 'rest pose floats above the ground');
  const height: number = max.y;
  if (file === MODEL_FILES.toby) {
    const [shortest, tallest] = CHILD_HEIGHT;
    check(
      height >= shortest && height <= tallest,
      `height ${String(height)}`,
    );
  } else if (kind === 'character' || kind === 'npc') {
    check(height >= 1.5 && height <= 1.8, `height ${String(height)}`);
  } else if (kind === 'monster') {
    check(height >= 1 && height <= 2.5, `height ${String(height)}`);
  } else {
    checkStaticSize(file, measured, check);
  }
  if (measured.feet !== null) {
    const center: Vector3 = measured.feet.getCenter(new Vector3());
    check(
      Math.abs(center.x) < 2e-3 && Math.abs(center.z) < 2e-3,
      'origin is not the center of the feet',
    );
  }
  const front: Vector3 | undefined =
    measured.centroids.get('eye') ??
    measured.centroids.get('pupil') ??
    measured.centroids.get('door');
  if (front !== undefined) {
    check(front.z > 0.1, 'the front does not face +Z');
  }
}

/**
 * Summarizes a model for the owner to read.
 *
 * @param {Buffer} glb - The file.
 * @param {ValidationReport} report - What the validator found in it.
 * @param {ModelMeasurements} measured - The measurements of the model.
 * @returns {string} The summary.
 */
function summarizeModel(
  glb: Buffer,
  report: ValidationReport,
  measured: ModelMeasurements,
): string {
  const size: Vector3 = measured.rest.getSize(new Vector3());
  const codes: string[] = [
    ...new Set(
      report.issues.messages.map(
        (message) =>
          `${SEVERITIES[message.severity] ?? 'hint'}:${message.code}`,
      ),
    ),
  ];
  const clipSummaries: string[] = [...measured.clips].map(
    ([name, clip]: [string, ClipMeasurements]) =>
      `, ${name} ${clip.duration.toFixed(3)}s low ${clip.lowest.toFixed(4)}`,
  );
  return (
    `${String(measured.triangles)} tris, ` +
    `${(glb.length / 1024).toFixed(1)} KB, size ` +
    `${size.toArray().map((x: number) => x.toFixed(2)).join(' x ')}, ` +
    `validator ${String(report.issues.numErrors)}E/` +
    `${String(report.issues.numWarnings)}W [${codes.join(', ')}]` +
    clipSummaries.join('')
  );
}

/**
 * Checks a model file.
 *
 * @param {string} file - The file name of the model.
 * @returns {Promise<ModelResult>} The outcome.
 */
export async function checkModel(file: string): Promise<ModelResult> {
  const glb: Buffer = readFileSync(path.join(modelsDir, file));
  const parsed: ParsedGlb = parseGlb(glb);
  const { gltf } = parsed;
  const kind: ModelKind = classifyModel(file);
  const rigged: boolean = kind !== 'static';
  const failures: string[] = [];
  const check: Check = (ok: boolean, message: string): void => {
    if (!ok) {
      failures.push(message);
    }
  };
  const report: ValidationReport = await validator.validateBytes(
    new Uint8Array(glb),
  );
  const measured: ModelMeasurements = await measureModel(glb);

  // Format.
  const nodes: readonly GltfNode[] = gltf.nodes ?? [];
  const names: (string | undefined)[] = nodes.map(
    (node: GltfNode) => node.name,
  );
  check(new Set(names).size === names.length, 'node names repeat');

  // Budgets.
  const [maxTriangles, maxBytes] = rigged
    ? [3000, 500 * 1024]
    : [5000, 1024 * 1024];
  check(measured.triangles <= maxTriangles, 'too many triangles');
  check(glb.length <= maxBytes, 'file too large');

  // Acceptance.
  check(report.issues.numErrors === 0, 'glTF Validator reports errors');

  checkOriginAndSize(file, kind, measured, check);

  // Skeleton and animation.
  let skeletonHash = '';
  let clipsHash = '';
  if (rigged) {
    check(
      gltf.skins?.length === 1 && (gltf.skins[0]?.joints.length ?? 0) <= 40,
      'more than 40 bones',
    );
    [skeletonHash, clipsHash] = hashRig(parsed);
    checkClips(file, kind, measured, check);
  } else {
    check(
      gltf.skins === undefined && gltf.animations === undefined,
      'a static model is rigged or animated',
    );
  }

  const summary: string = summarizeModel(glb, report, measured);
  return { file, kind, summary, failures, skeletonHash, clipsHash };
}
