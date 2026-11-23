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
 * @module scripts/check-models/clips Checks the animation clips of a rigged
 *   model: which it has, how long they last, and how they move it.
 */

import { Vector3 } from 'three';

import { SIMULATION_RATE, TOBY_ACTIVITY_STEPS } from '@clovervale/shared';
import type { TobyActivity } from '@clovervale/shared';
import { MODEL_FILES } from '../../packages/client/src/model-catalogue.ts';

import { TOLERANCE } from './constants.ts';
import type { Check } from './constants.ts';
import { CHIEF_FILE } from './files.ts';
import type { ModelKind } from './files.ts';
import { TREADING_SPEEDS } from './measure.ts';
import type { ClipMeasurements, ModelMeasurements } from './measure.ts';
import { measureDifference } from './pose.ts';

/** The file name of the model of Toby. */
const TOBY_FILE: string = MODEL_FILES.toby;
/** The shortest and the longest each clip may last, in seconds, by kind. */
const CLIP_DURATIONS: Readonly<
  Record<ModelKind, Readonly<Record<string, readonly [number, number]>>>
> = {
  character: {
    Idle: [0, Infinity],
    Walk: [0.9, 1.1],
    Slash: [0, 0.6],
    Die: [0, 1.5],
  },
  npc: { Idle: [0, Infinity] },
  monster: {
    Idle: [0, Infinity],
    Walk: [0.9, 1.1],
    Attack: [0, 0.6],
    Die: [0, 1.5],
  },
  static: {},
};
/**
 * The shortest and the longest each clip of Martha, the village chief, may
 * last, in seconds: she fights as a monster, walking, standing and walking
 * on her guard with her pitchfork, thrusting it as long as an attack of a
 * monster lasts, and sitting down on the ground once beaten, which she
 * does not do as a monster dies.
 */
const CHIEF_CLIP_DURATIONS: Readonly<
  Record<string, readonly [number, number]>
> = {
  Idle: [0, Infinity],
  IdleArmed: [0, Infinity],
  Walk: [0.9, 1.1],
  WalkArmed: [0.9, 1.1],
  Attack: [0, 0.6],
  Sit: [0, 1.5],
};
/**
 * The clip of Martha each of her clips that does not loop starts from, by
 * name: she thrusts her pitchfork, and sits down beaten, from her guard.
 */
const CHIEF_CLIP_ORIGINS: Readonly<Record<string, string>> = {
  Attack: 'IdleArmed',
  Sit: 'IdleArmed',
};
/**
 * The shortest and the longest each clip an NPC may have besides those it
 * must have may last, in seconds.  An NPC may work.
 */
const OPTIONAL_NPC_CLIP_DURATIONS: Readonly<
  Record<string, readonly [number, number]>
> = { Work: [0, Infinity] };
/** How long each activity of Toby lasts on his course, in seconds. */
const CHILD_ACTIVITY_DURATIONS: Readonly<Record<TobyActivity, number>> = {
  Squat: TOBY_ACTIVITY_STEPS.Squat / SIMULATION_RATE,
  Pick: TOBY_ACTIVITY_STEPS.Pick / SIMULATION_RATE,
  Rise: TOBY_ACTIVITY_STEPS.Rise / SIMULATION_RATE,
  Turn: TOBY_ACTIVITY_STEPS.Turn / SIMULATION_RATE,
  Run: TOBY_ACTIVITY_STEPS.Run / SIMULATION_RATE,
};
/**
 * The shortest and the longest each clip of Toby may last, in seconds:
 * squatting down, standing up and turning round each as long as his course
 * gives them, no round of picking or stride of his run longer than his
 * picking or his run, and his picking when he finds a four-leaved clover
 * as long as his picking.
 */
const CHILD_CLIP_DURATIONS: Readonly<
  Record<string, readonly [number, number]>
> = Object.fromEntries([
  ['Idle', [0, Infinity]],
  [
    'Find',
    [CHILD_ACTIVITY_DURATIONS.Pick - 1e-6, CHILD_ACTIVITY_DURATIONS.Pick],
  ],
  ...Object.entries(CHILD_ACTIVITY_DURATIONS).map(
    ([activity, duration]: [string, number]): [string, [number, number]] => [
      activity,
      activity === 'Pick' || activity === 'Run'
        ? [0, duration]
        : [duration - 1e-6, duration],
    ],
  ),
] satisfies [string, [number, number]][]);
/**
 * The clips of Toby that lead from one into another, by name, with the
 * clips whose first frame each starts from and ends on, so that he goes on
 * without a jump as his course takes him from one to the next.
 */
const CHILD_CLIP_CHAIN: Readonly<
  Record<string, readonly [from: string, to: string]>
> = {
  Squat: ['Run', 'Pick'],
  Find: ['Pick', 'Pick'],
  Rise: ['Pick', 'Idle'],
  Turn: ['Idle', 'Run'],
};
/**
 * The highest the hands of Toby must come down to as he picks at the
 * clover, in metres: among its leaves, a centimetre below the tops of the
 * tallest, which reach up to 13 cm.
 */
const CLOVER_HEIGHT = 0.12;
/**
 * The least distance in front of the middle of his feet the hands of Toby
 * must reach down at as he picks, in metres: over the patch of clover,
 * whose edge lies just in front of his toes.
 */
const CLOVER_AHEAD = 0.12;
/** The clips that loop. */
const LOOPING_CLIPS: readonly string[] = [
  'Idle',
  'IdleArmed',
  'Walk',
  'WalkArmed',
  'Work',
  'Run',
  'Pick',
];
/** The clips that end on the pose they start from. */
const SETTLING_CLIPS: readonly string[] = ['Slash', 'Attack'];

/**
 * Checks where a clip of a model starts and ends: a looping clip ends on
 * the pose it starts from, a clip of Toby that leads from one into another
 * starts from and ends on the first frames of those clips, and any other
 * clip starts from the first frame of the clip it comes from, and, if it
 * settles, ends there.
 *
 * @param {string} file - The file name of the model.
 * @param {string} name - The name of the clip.
 * @param {ClipMeasurements} clip - The measurements of the clip.
 * @param {ModelMeasurements} measured - The measurements of the model.
 * @param {Check} check - Notes each requirement.
 */
function checkClipEnds(
  file: string,
  name: string,
  clip: ClipMeasurements,
  measured: ModelMeasurements,
  check: Check,
): void {
  const chain: readonly [string, string] | undefined =
    file === TOBY_FILE ? CHILD_CLIP_CHAIN[name] : undefined;
  if (LOOPING_CLIPS.includes(name)) {
    check(clip.seam < TOLERANCE, `${name} does not loop seamlessly`);
  } else if (chain !== undefined) {
    const [from, to] = chain;
    const fromStart: readonly number[] = measured.clips.get(from)?.start ?? [];
    const toStart: readonly number[] = measured.clips.get(to)?.start ?? [];
    check(
      fromStart.length > 0 &&
        measureDifference(clip.start, fromStart) < TOLERANCE,
      `${name} does not start from the first ${from} frame`,
    );
    check(
      toStart.length > 0 && measureDifference(clip.end, toStart) < TOLERANCE,
      `${name} does not end on the first ${to} frame`,
    );
  } else {
    const origin: string =
      (file === CHIEF_FILE ? CHIEF_CLIP_ORIGINS[name] : undefined) ?? 'Idle';
    const originStart: readonly number[] =
      measured.clips.get(origin)?.start ?? [];
    check(
      originStart.length > 0 &&
        measureDifference(clip.start, originStart) < TOLERANCE,
      `${name} does not start from the first ${origin} frame`,
    );
    if (SETTLING_CLIPS.includes(name)) {
      check(
        measureDifference(clip.end, originStart) < TOLERANCE,
        `${name} does not end on the first ${origin} frame`,
      );
    }
  }
}

/**
 * Checks what only the clips of Toby must do: that his run fits a whole
 * number of strides, that he sets both feet on the ground as he runs, and
 * that his hands reach down into the clover in front of him as he picks.
 *
 * @param {ModelMeasurements} measured - The measurements of Toby.
 * @param {Check} check - Notes each requirement.
 */
function checkTobyClips(measured: ModelMeasurements, check: Check): void {
  const run: ClipMeasurements | undefined = measured.clips.get('Run');
  const strides: number =
    CHILD_ACTIVITY_DURATIONS.Run / (run?.duration ?? Infinity);
  check(
    Math.abs(strides - Math.round(strides)) < 1e-6 && strides >= 1,
    'Run does not fit a whole number of times into his run',
  );
  check(
    (run?.footSpeeds.size ?? 0) === 2,
    'Run does not set both feet on the ground',
  );
  const reach = measured.clips.get('Pick')?.handReach ?? null;
  const centre: number = measured.feet?.getCenter(new Vector3()).z ?? 0;
  check(
    reach !== null &&
      reach[0] <= CLOVER_HEIGHT &&
      reach[1] - centre >= CLOVER_AHEAD,
    'Pick does not reach down into the clover in front of him',
  );
}

/**
 * Checks the clips of a rigged model: that it has the clips its kind must
 * have and no others, that each lasts as long as it may, stays above the
 * ground, keeps its hips in place unless it may move them, starts and ends
 * where it must, and treads the ground without sliding its feet.
 *
 * @param {string} file - The file name of the model.
 * @param {ModelKind} kind - What the model stands for in the game.
 * @param {ModelMeasurements} measured - The measurements of the model.
 * @param {Check} check - Notes each requirement.
 */
export function checkClips(
  file: string,
  kind: ModelKind,
  measured: ModelMeasurements,
  check: Check,
): void {
  const required =
    file === TOBY_FILE
      ? CHILD_CLIP_DURATIONS
      : file === CHIEF_FILE
        ? CHIEF_CLIP_DURATIONS
        : CLIP_DURATIONS[kind];
  const durations = {
    ...(kind === 'npc' ? OPTIONAL_NPC_CLIP_DURATIONS : {}),
    ...required,
  };
  const clipNames: string[] = [...measured.clips.keys()];
  check(
    Object.keys(required).every((name: string) =>
      clipNames.includes(name),
    ) && clipNames.every((name: string) => name in durations),
    `clips are ${clipNames.join()}`,
  );
  for (const [name, clip] of measured.clips) {
    const [shortest, longest] = durations[name] ?? [0, Infinity];
    check(
      clip.duration >= shortest && clip.duration <= longest + 1e-6,
      `${name} lasts ${String(clip.duration)}`,
    );
    check(
      clip.lowest >= -TOLERANCE,
      `${name} reaches ${String(clip.lowest)} below the ground`,
    );
    const chain: readonly [string, string] | undefined =
      file === TOBY_FILE ? CHILD_CLIP_CHAIN[name] : undefined;
    // A clip that leads from one into another may move the hips, as the
    // poses at its ends do.
    check(
      name === 'Die' ||
        chain !== undefined ||
        (Math.abs(clip.hipsDrift[0]) < TOLERANCE &&
          Math.abs(clip.hipsDrift[1]) < TOLERANCE),
      `${name} drifts`,
    );
    checkClipEnds(file, name, clip, measured, check);
    const treading: number = TREADING_SPEEDS[name]?.(clip.duration) ?? 0;
    for (const [foot, speed] of clip.footSpeeds) {
      check(
        Math.abs(speed + treading) < 0.05,
        `${foot} slides in ${name}: ${String(speed)} m/s on the ground`,
      );
    }
  }
  if (file === TOBY_FILE) {
    checkTobyClips(measured, check);
  }
}
