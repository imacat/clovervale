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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/monster-figures Showing the monsters of the map the
 *   player is in.
 */

import type { Object3D } from 'three';

import { MONSTER_KINDS, isFighting } from '@clovervale/shared';
import type { MonsterKindId, MonsterState } from '@clovervale/shared';

import { Actor } from './actor.ts';
import { HealthBar } from './health-bar.ts';
import type { Figure } from './player-figures.ts';

/** The colour of the health bars of the monsters. */
const HEALTH_COLOUR = '#e0453a';

/**
 * The name of the bone of the pitchfork in the hands of Martha, who holds
 * it only while she is out to deal with a player.
 */
export const PITCHFORK_BONE = 'Pitchfork';

/**
 * Makes the model to show a monster of a kind with.
 *
 * @param {MonsterKindId} kind - The kind of the monster.
 * @returns {Figure | null} The model, or `null` if there is none for now.
 */
export type MonsterSource = (kind: MonsterKindId) => Figure | null;

/** A monster as it is shown. */
export interface MonsterView {
  /** The identifier of the monster. */
  readonly id: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** The name of the clip the monster plays, or `null` if it has none. */
  readonly clip: string | null;
  /** How much of the health bar of the monster is filled, from 0 to 1. */
  readonly health: number;
  /** Whether the health bar of the monster is to be seen. */
  readonly isBarShown: boolean;
  /**
   * Whether the monster holds a pitchfork, as Martha does while she is out
   * to deal with a player, which is `false` for a monster that has none.
   */
  readonly isPitchforkShown: boolean;
}

/** A monster that is shown. */
interface ShownMonster {
  /** The root of the model of the monster. */
  readonly root: Object3D;
  /** The model of the monster, playing its clips. */
  readonly actor: Actor;
  /** The health bar above the monster. */
  readonly bar: HealthBar;
  /** The bone of the pitchfork in its hands, if it has one. */
  readonly pitchfork: Object3D | null;
  /** The action count of the action the model is playing the clip of. */
  actionCount: number;
  /** Whether the model plays its clip as holding a weapon. */
  isArmed: boolean;
}

/** The monsters, shown exactly as they are told from moment to moment. */
export class MonsterFigures {
  readonly #parent: Object3D;
  readonly #createFigure: MonsterSource;
  readonly #shown = new Map<number, ShownMonster>();

  /**
   * Starts without monsters.
   *
   * @param {Object3D} parent - What the models of the monsters are added
   *   to.
   * @param {MonsterSource} createFigure - Makes the model to show a monster
   *   with.
   */
  constructor(parent: Object3D, createFigure: MonsterSource) {
    this.#parent = parent;
    this.#createFigure = createFigure;
  }

  /**
   * Shows the given monsters, and no others.
   *
   * Each monster stands where its state tells, facing the way it tells, and
   * plays the clip of the action it tells, which starts over whenever the
   * action count of the monster changes, with a health bar above it that
   * shows its health against the full health of its kind, which is shown
   * only while it is in a fight, as {@link isFighting} tells: hidden once
   * it is dead, and for Martha, but while she fights.  Martha holds her
   * pitchfork only while her state tells she does, and plays her clips as
   * holding it then.  A monster without a model to show it with is left
   * out.
   *
   * @param {readonly MonsterState[]} monsters - The monsters as they are to
   *   be shown.
   */
  showMonsters(monsters: readonly MonsterState[]): void {
    const ids = new Set<number>(
      monsters.map((monster: MonsterState) => monster.id),
    );
    for (const [id, shown] of this.#shown) {
      if (!ids.has(id)) {
        this.#parent.remove(shown.root);
        this.#shown.delete(id);
      }
    }
    for (const monster of monsters) {
      const shown: ShownMonster | null =
        this.#shown.get(monster.id) ?? this.#addMonster(monster);
      if (shown === null) {
        continue;
      }
      shown.root.position.set(monster.x, 0, monster.z);
      shown.root.rotation.y = (monster.yaw * Math.PI) / 180;
      shown.bar.show(monster.health, MONSTER_KINDS[monster.kind].health);
      shown.bar.isVisible = isFighting(monster);
      shown.pitchfork?.scale.setScalar(monster.isArmed === true ? 1 : 0);
      const isArmed: boolean = monster.isArmed === true;
      if (
        shown.actionCount !== monster.actionCount ||
        shown.isArmed !== isArmed
      ) {
        shown.actionCount = monster.actionCount;
        shown.isArmed = isArmed;
        shown.actor.play(monster.action, isArmed);
      }
    }
  }

  /**
   * Moves the animations of the monsters forward in time.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    for (const shown of this.#shown.values()) {
      shown.actor.update(seconds);
    }
  }

  /**
   * Describes the monsters as they are shown now.
   *
   * @returns {MonsterView[]} The monsters, in the order they were first
   *   shown.
   */
  describeMonsters(): MonsterView[] {
    return [...this.#shown].map(([id, shown]: [number, ShownMonster]) => ({
      id,
      x: shown.root.position.x,
      z: shown.root.position.z,
      yaw: (shown.root.rotation.y * 180) / Math.PI,
      clip: shown.actor.clipName,
      health: shown.bar.fraction,
      isBarShown: shown.bar.isVisible,
      isPitchforkShown:
        shown.pitchfork !== null && shown.pitchfork.scale.x > 0,
    }));
  }

  /**
   * Starts showing a monster, playing the clip of its action.
   *
   * @param {MonsterState} monster - The monster.
   * @returns {ShownMonster | null} The monster as shown, or `null` if there
   *   is no model to show it with.
   */
  #addMonster(monster: MonsterState): ShownMonster | null {
    const figure: Figure | null = this.#createFigure(monster.kind);
    if (figure === null) {
      return null;
    }
    const shown: ShownMonster = {
      root: figure.root,
      actor: new Actor(figure.root, figure.clips),
      bar: new HealthBar(figure.root, HEALTH_COLOUR),
      pitchfork: figure.root.getObjectByName(PITCHFORK_BONE) ?? null,
      actionCount: monster.actionCount,
      isArmed: monster.isArmed === true,
    };
    shown.actor.play(monster.action, shown.isArmed);
    this.#parent.add(figure.root);
    this.#shown.set(monster.id, shown);
    return shown;
  }
}
