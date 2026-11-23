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
 * @module client/toby-figure Showing Toby as his course has him at a step
 *   of the server, with the clovers he finds.
 */

import { AnimationMixer, Box3, LoopRepeat, Vector3 } from 'three';
import type {
  AnimationAction,
  AnimationClip,
  Object3D,
  Scene,
} from 'three';

import {
  TOBY_ACTIVITY_STEPS,
  TOBY_FOUND_LINE,
  TOBY_GRAB_STEPS,
  TOBY_STOW_STEPS,
  findTobyGrab,
  findTobyPose,
  getVillager,
} from '@clovervale/shared';
import type {
  MonsterState,
  TobyActivity,
  TobyPose,
  Villager,
} from '@clovervale/shared';

import { createVillagerFigure } from './figure-copies.ts';
import type { FigureFrame } from './figure-set.ts';
import { createHeldClover } from './item-figures.ts';
import { MODEL_FILES } from './model-catalog.ts';
import { isOnScreen } from './on-screen.ts';
import type { Figure } from './player-figures.ts';
import { hasTobyFound } from './toby-finds.ts';
import { findStandingHead } from './villager-figure.ts';
import type { FigureContext, VillagerFigure } from './villager-figure.ts';

/** Toby, the child who runs around by the gate, as a villager. */
const TOBY_VILLAGER: Villager = getVillager('toby');

/** What the figure of Toby shows. */
export interface TobyView {
  /** The step of the server he is shown at, which may fall between two. */
  readonly step: number;
  /** Where he is shown along the X axis, in meters. */
  readonly x: number;
  /** Where he is shown along the Z axis, in meters. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z toward +X, in degrees. */
  readonly yaw: number;
  /** What he is doing. */
  readonly activity: TobyActivity;
  /** The name of the clip the figure plays. */
  readonly clip: string;
  /** Whether he is shown holding a four-leaf clover he has found. */
  readonly isHolding: boolean;
}

/**
 * The activities of Toby that go on in a loop for as long as they last;
 * the others are played once over their whole length.
 */
const LOOPING_ACTIVITIES: readonly TobyActivity[] = ['Pick', 'Run'];

/** The name of the bone the head of the model goes with. */
const HEAD_BONE = 'Head';

/** The name of the bone the right hand of the model goes with. */
const HAND_BONE = 'HandR';

/**
 * Where the foot of the stalk of a four-leaf clover held in the right
 * hand is, in the frame of the bone of the hand, in meters: in his fist,
 * which the bone points out of along -Y, as the arm does.
 */
const HELD_CLOVER_OFFSET = -0.035;

/**
 * The name of the clip of his picking at a patch of clover as he finds its
 * four-leaf clover, over the whole of his picking.
 */
const FIND_CLIP = 'Find';

/**
 * How many steps after his hand grabs at a four-leaf clover he finds
 * Toby holds it, until he has put it away.
 */
const HOLD_STEPS: number = TOBY_STOW_STEPS - TOBY_GRAB_STEPS;

/**
 * How many steps after his hand grabs at a patch of clover Toby goes on
 * picking there.
 */
const PICK_ON_STEPS: number = TOBY_ACTIVITY_STEPS.Pick - TOBY_GRAB_STEPS;

/**
 * The model of Toby, stood where his course has him and posed as he is
 * there, wholly by the step of the server it shows him at.
 *
 * Each activity of his plays the clip of its name, from where he is in it:
 * squatting down, standing up and turning around once over their length,
 * picking at the clover over and over, and running over and over at the
 * pace of his run, so that his feet keep to the ground he covers.  As he
 * picks after his hand has grabbed at a four-leaf clover he has found,
 * the model plays the clip of finding one in its place, from where he is in
 * his picking, and he holds the clover in his right hand until he has put
 * it away.
 */
export class TobyModel {
  readonly #root: Object3D;
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  readonly #mixer: AnimationMixer;
  readonly #head: Object3D | null;
  readonly #headRise: number | null;
  readonly #clover: Object3D;
  #action: AnimationAction | null = null;
  #view: TobyView | null = null;

  /**
   * Makes a model show Toby, which hides the model until told a step.
   *
   * @param {Object3D} root - The root of the model, standing in the
   *   village.
   * @param {readonly AnimationClip[]} clips - The clips of the model.
   * @param {Object3D} clover - The four-leaf clover he holds as he
   *   finds one, which is put in the right hand of the model, hidden.
   * @throws {Error} If the model has no right hand.
   */
  constructor(
    root: Object3D,
    clips: readonly AnimationClip[],
    clover: Object3D,
  ) {
    this.#root = root;
    root.visible = false;
    this.#clips = new Map(
      clips.map((clip: AnimationClip) => [clip.name, clip]),
    );
    this.#mixer = new AnimationMixer(root);
    this.#head = root.getObjectByName(HEAD_BONE) ?? null;
    root.updateMatrixWorld(true);
    const top: number = new Box3().setFromObject(root).max.y;
    this.#headRise =
      this.#head === null || !Number.isFinite(top)
        ? null
        : top - this.#head.getWorldPosition(new Vector3()).y;
    this.#clover = clover;
    clover.visible = false;
    const hand: Object3D | undefined = root.getObjectByName(HAND_BONE);
    if (hand === undefined) {
      throw new Error('The model of Toby has no right hand.');
    }
    // The stalk sticks out of his fist the way his fingers point.
    clover.position.set(0, HELD_CLOVER_OFFSET, 0);
    clover.rotation.set(Math.PI, 0, 0);
    hand.add(clover);
  }

  /**
   * Shows Toby as he is at a step of the server.
   *
   * @param {number} step - The number of the step, which may fall between
   *   two steps.
   * @param {boolean} [isFound] - Whether he found a four-leaf clover at
   *   the latest grab of his hand at the step or before it, which he did
   *   not by default.
   * @throws {Error} If the model lacks the clip of what he does.
   */
  show(step: number, isFound = false): void {
    const pose: TobyPose = findTobyPose(step);
    this.#root.visible = true;
    this.#root.position.set(pose.x, 0, pose.z);
    this.#root.rotation.y = (pose.yaw * Math.PI) / 180;
    const since: number = step - findTobyGrab(step).step;
    const isFinding: boolean =
      isFound && pose.activity === 'Pick' && since < PICK_ON_STEPS;
    const name: string = isFinding ? FIND_CLIP : pose.activity;
    const clip: AnimationClip | undefined = this.#clips.get(name);
    if (clip === undefined) {
      throw new Error(`The model of Toby has no clip ${name}.`);
    }
    this.#pose(clip, pose);
    const isHolding: boolean = isFinding && since < HOLD_STEPS;
    this.#clover.visible = isHolding;
    const { x, z, yaw, activity } = pose;
    this.#view = {
      step,
      x,
      z,
      yaw,
      activity,
      clip: name,
      isHolding,
    };
  }

  /**
   * Describes Toby as he is shown now.
   *
   * @returns {TobyView | null} Where he is shown and what he does, or
   *   `null` before he has been shown at any step.
   */
  describe(): TobyView | null {
    return this.#view;
  }

  /**
   * Finds the top of his head as he is shown now, as he stands, squats or
   * runs.
   *
   * @returns {Vector3 | null} The point above where he stands, at the
   *   height of the top of his head, or `null` before he has been shown at
   *   any step, or if the model has no head bone, or nothing to show.
   */
  findHeadTop(): Vector3 | null {
    if (this.#view === null || this.#head === null || this.#headRise === null) {
      return null;
    }
    const head: Vector3 = this.#head.getWorldPosition(new Vector3());
    return new Vector3(
      this.#root.position.x,
      head.y + this.#headRise,
      this.#root.position.z,
    );
  }

  /**
   * Poses the model as a clip has it, at the moment of the clip that the
   * pose of Toby falls on.
   *
   * @param {AnimationClip} clip - The clip.
   * @param {TobyPose} pose - The pose of Toby.
   */
  #pose(clip: AnimationClip, pose: TobyPose): void {
    const action: AnimationAction = this.#mixer.clipAction(clip);
    if (action !== this.#action) {
      this.#mixer.stopAllAction();
      action.setLoop(LoopRepeat, Infinity);
      action.play();
      this.#action = action;
    }
    // His finding is played once over the whole of his picking.
    const isLooping: boolean =
      clip.name !== FIND_CLIP && LOOPING_ACTIVITIES.includes(pose.activity);
    action.time = isLooping ? pose.elapsed % clip.duration : pose.elapsed;
    this.#mixer.update(0);
  }
}

/**
 * The figure of Toby, the child who runs around by the gate, as his course
 * has him at the step of the server the page shows, holding a four-leaf
 * clover he finds, as {@link hasTobyFound} tells, in the village, and
 * otherwise as he goes on.  When he finds one, he exclaims a line to the
 * players nearby, but only while he is on the screen and no other
 * villager's speech bubble is shown.
 */
export class TobyFigure implements VillagerFigure {
  /** What the figure is shown with. */
  readonly #context: FigureContext;
  /** Whether Toby moves around his map, which he does. */
  readonly movesAround = true;
  /** The model of Toby, once it has been loaded. */
  #model: TobyModel | null = null;
  /** The root of the model of Toby, once it has been loaded. */
  #root: Object3D | null = null;

  /**
   * Makes the figure of Toby, without his model until it is loaded.
   *
   * @param {FigureContext} context - What the figure is shown with.
   */
  constructor(context: FigureContext) {
    this.#context = context;
  }

  /**
   * Toby, as a villager.
   *
   * @returns {Villager} The villager.
   */
  get villager(): Villager {
    return TOBY_VILLAGER;
  }

  /**
   * Shows Toby in the village, as far as his model has been loaded.
   *
   * @param {Scene} scene - The village.
   */
  useModels(scene: Scene): void {
    const child: Figure | null = createVillagerFigure(
      this.#context.models.models,
      MODEL_FILES.toby,
    );
    if (child !== null) {
      scene.add(child.root);
      this.#root = child.root;
      this.#model = new TobyModel(child.root, child.clips, createHeldClover());
    }
  }

  /**
   * Shows Toby at the step of the server the page shows: in his map,
   * holding a four-leaf clover he finds, and elsewhere as he goes on.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  show({ map, shownStep }: FigureFrame): void {
    if (shownStep === null) {
      return;
    }
    if (map === this.villager.map) {
      this.#model?.show(
        shownStep,
        hasTobyFound(findTobyGrab(shownStep), this.#context.record.worldNews),
      );
    } else {
      this.#model?.show(shownStep);
    }
  }

  /** Does nothing over time: the step of the server has him as he is. */
  update(): void {
    // Toby is shown wholly by the step of the server.
  }

  /** Has nothing to forget: he goes on as his course has him. */
  clear(): void {
    // Toby is shown wholly by the step of the server.
  }

  /**
   * Finds the top of the head of Toby as he is shown.
   *
   * @param {number | null} step - The step of the server he is shown at,
   *   which may fall between two, or `null` while the page shows none.
   * @param {readonly MonsterState[]} monsters - The monsters as they are
   *   shown.
   * @returns {Vector3 | null} The top of his head as his model shows him,
   *   or where his course has him at the step if it shows him nowhere, or
   *   `null` while the page shows no step.
   */
  findHeadTop(
    step: number | null,
    monsters: readonly MonsterState[],
  ): Vector3 | null {
    if (step === null) {
      return null;
    }
    return (
      this.#model?.findHeadTop() ??
      findStandingHead(TOBY_VILLAGER, this.#context.models, step, monsters)
    );
  }

  /**
   * Tells whether Toby is to say a line the server tells of.
   *
   * @param {string} line - The message of the line.
   * @returns {boolean} Whether it is any line but the one he exclaims as
   *   he finds a four-leaf clover, or, for that one, whether no other
   *   bubble of a villager is shown and he is on the screen.
   */
  canSay(line: string): boolean {
    return (
      line !== TOBY_FOUND_LINE ||
      (this.#context.speech.describe() === null &&
        this.#root !== null &&
        isOnScreen(this.#context.readViewport().getCamera(), this.#root, null))
    );
  }

  /**
   * Describes Toby as he is shown, for looking at.
   *
   * @returns {TobyView | null} How he is shown, or `null` before his model
   *   has been loaded or he has been shown at any step.
   */
  describe(): TobyView | null {
    return this.#model?.describe() ?? null;
  }
}
