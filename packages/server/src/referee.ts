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
 * @module server/referee The strikes of a world, as judged, the health
 *   they take and what heals, and the record of the events they make.
 */

import {
  SLASH_DAMAGE,
  SLASH_REACH,
  isFighting,
  isWithinStrike,
} from '@clovervale/shared';
import type { EntityRef, GameEvent, MonsterState } from '@clovervale/shared';

import type { Strike, Striker, Target } from './combatants.ts';
import type { ItemKeeper } from './item-keeper.ts';
import type { Player } from './player.ts';
import type { RecalledMonsters, SlashHistory } from './slash-history.ts';

/** A player whose slash starts at a step, to be judged. */
export interface Slasher {
  /** The player. */
  readonly player: Player;
  /**
   * The time on the clock of the server the slash names to be judged on,
   * if it names one.
   */
  readonly viewTime: number | undefined;
}

/** What a referee of a world judges with. */
export interface RefereeOptions {
  /** What the slashes of the players can strike in the world. */
  readonly targets: readonly Target[];
  /** The monsters as the snapshots of the world told them. */
  readonly history: SlashHistory;
  /**
   * What there is to pick in the world, where an item given to a player
   * without room is laid.
   */
  readonly items: ItemKeeper;
  /**
   * Gives a random number from 0 up to but not including 1, for the
   * silver coins a monster killed gives.
   */
  readonly drawRandom: () => number;
  /** Gives the number of the current step of the world. */
  readonly getStep: () => number;
}

/**
 * Tells of a monster, or Martha, as the events do.
 *
 * @param {Target | Striker} monster - The monster, or Martha.
 * @returns {EntityRef} Who the monster is.
 */
function referToMonster(monster: Target | Striker): EntityRef {
  return { kind: 'monster', id: monster.id };
}

/**
 * Tells of a player as the events do.
 *
 * @param {Player} player - The player.
 * @returns {EntityRef} Who the player is.
 */
function referToPlayer(player: Player): EntityRef {
  return { kind: 'player', id: player.id };
}

/**
 * The referee of a world, who judges the strikes of the players and the
 * monsters, takes the health they cost, gives health back, and records
 * every hit and heal as an event, which names the monster by its
 * identifier.  The players cannot hurt each other.
 *
 * A player with no health left dies, as {@link Player.hurt} tells.
 */
export class Referee {
  readonly #targets: readonly Target[];
  readonly #history: SlashHistory;
  readonly #items: ItemKeeper;
  readonly #drawRandom: () => number;
  readonly #getStep: () => number;
  #events: GameEvent[] = [];
  #lastEventId = 0;

  /**
   * Starts with no events.
   *
   * @param {RefereeOptions} options - What the referee judges with.
   */
  constructor({
    targets,
    history,
    items,
    drawRandom,
    getStep,
  }: RefereeOptions) {
    this.#targets = targets;
    this.#history = history;
    this.#items = items;
    this.#drawRandom = drawRandom;
    this.#getStep = getStep;
  }

  /**
   * Takes the events that have happened since they were last taken.
   *
   * @returns {GameEvent[]} The events, in the order they happened, each
   *   taken only once.
   */
  takeEvents(): GameEvent[] {
    const events: GameEvent[] = this.#events;
    this.#events = [];
    return events;
  }

  /**
   * Gives a player health back, as much as it lacks of its full health at
   * most, which is an event unless it is none.
   *
   * @param {Player} player - The player.
   * @param {number} amount - The health to give back.
   */
  heal(player: Player, amount: number): void {
    const gained: number = player.heal(amount);
    if (gained <= 0) {
      return;
    }
    this.#events.push({
      type: 'heal',
      id: ++this.#lastEventId,
      step: this.#getStep(),
      target: referToPlayer(player),
      amount: gained,
    });
  }

  /**
   * Judges a slash that starts at the current step, and keeps how it was
   * judged for its player: as a hit if it hit anything.
   *
   * The slash hits everything it can strike that the player can hit now,
   * as {@link Target.canBeHitBy} tells, and that was fighting, as
   * {@link isFighting} tells, in front of the player and within reach in
   * the world at the time the slash names, as {@link SlashHistory.recall}
   * tells, each by where it was then, with the player where it stands now:
   * a monster while it is alive, and Martha only by the player she fights,
   * and only while she chases it.  A slash that beats what it hits gives
   * the player its spoils: from none up to the most silver coins it gives,
   * each number as likely as any other, if it gives any, and the item it
   * gives, if any, laid at the feet of the player as if put down if its
   * inventory has no room for it.
   *
   * @param {Slasher} slasher - The player that slashes, and the time the
   *   slash names.
   * @param {readonly MonsterState[]} current - The monsters to be seen
   *   now.
   */
  judgeSlash(
    { player, viewTime }: Slasher,
    current: readonly MonsterState[],
  ): void {
    const step: number = this.#getStep();
    const { rewind, monsters: seen }: RecalledMonsters = this.#history.recall(
      viewTime,
      step,
      current,
    );
    const hit: Target[] = this.#targets.filter((target: Target) => {
      const state: MonsterState | undefined = seen.find(
        (candidate: MonsterState) => candidate.id === target.id,
      );
      return (
        target.canBeHitBy(player.id) &&
        state !== undefined &&
        isFighting(state) &&
        isWithinStrike(player.mover.motion, state, SLASH_REACH)
      );
    });
    player.lastSlash = { step, rewind, isHit: hit.length > 0 };
    for (const target of hit) {
      const damage: number = target.takeHit(SLASH_DAMAGE, player.id);
      this.#recordHit(referToPlayer(player), referToMonster(target), damage);
      if (target.isBeaten) {
        this.#giveSpoils(player, target);
      }
    }
  }

  /**
   * Has the strikes that strike now hit every player alive among those
   * each may hit, in front of it and within its reach, if it can strike
   * that player now, as {@link Striker.canStrike} tells, for its bite
   * damage, one strike after another; a player killed by one strike is not
   * hit by another.
   *
   * @param {readonly Strike[]} strikes - The strikes, in order.
   */
  letStrike(strikes: readonly Strike[]): void {
    for (const { striker, players } of strikes) {
      for (const player of players) {
        if (
          player.isAlive &&
          striker.canStrike(player.id) &&
          isWithinStrike(
            striker.pose,
            player.mover.motion,
            striker.strikeReach,
          )
        ) {
          this.#hurtPlayer(player, striker);
        }
      }
    }
  }

  /**
   * Gives a player what it gets for beating something it struck.
   *
   * @param {Player} player - The player.
   * @param {Target} target - What it beat.
   */
  #giveSpoils(player: Player, target: Target): void {
    const { maxSilver, prize } = target.spoils;
    if (maxSilver > 0) {
      player.earnSilver(Math.floor(this.#drawRandom() * (maxSilver + 1)));
    }
    if (prize !== null) {
      this.#items.give(player, prize);
    }
  }

  /**
   * Has a monster bite a player, or Martha thrust at it.
   *
   * @param {Player} player - The player.
   * @param {Striker} striker - The monster, or Martha.
   */
  #hurtPlayer(player: Player, striker: Striker): void {
    const lost: number = player.hurt(striker.biteDamage);
    this.#recordHit(referToMonster(striker), referToPlayer(player), lost);
  }

  /**
   * Records a hit as an event.
   *
   * @param {EntityRef} attacker - Who struck.
   * @param {EntityRef} target - Who was struck.
   * @param {number} damage - The health the target lost.
   */
  #recordHit(attacker: EntityRef, target: EntityRef, damage: number): void {
    this.#events.push({
      type: 'hit',
      id: ++this.#lastEventId,
      step: this.#getStep(),
      attacker,
      target,
      damage,
    });
  }
}
