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
 * @module server/martha Martha, the village chief, who is the enemy spy,
 *   as the server moves her: she comes up to whoever she is asked to deal
 *   with, talks with it, and fights it with her pitchfork.
 */

import {
  MARTHA_POST,
  MONSTER_KINDS,
  PITCHFORK_STAND,
  countSteps,
  getVillager,
  isVillagerFree,
  measureDistance,
} from '@clovervale/shared';
import type {
  GroundVector,
  ItemKindId,
  MonsterKind,
  MonsterState,
  Pose,
  StoryNeed,
  Villager,
} from '@clovervale/shared';

import type { Spoils, Strike, Striker, Target } from './combatants.ts';
import { HuntRecord } from './hunt-record.ts';
import { MarthaQueue } from './martha-queue.ts';
import type { Waiting } from './martha-queue.ts';
import { MonsterBody } from './monster-body.ts';
import type { AttackStep, WalkOutcome } from './monster-body.ts';
import type { Player } from './player.ts';
import { BaseResident } from './resident.ts';
import type {
  RequestTaker,
  ResidentView,
  ResidentWorld,
} from './resident.ts';

/** Martha, the village chief, as a villager a player can talk to. */
const MARTHA_VILLAGER: Villager = getVillager('martha');

/**
 * Where Martha stands on the porch of her house, and which way she faces
 * there, which she comes back to whenever she has nobody to deal with.
 */
const MARTHA_HOME: Pose = MARTHA_POST;

/**
 * The farthest a player can be from Martha for a thrust of her pitchfork
 * to hit, from centre to centre, in metres: farther than a slash of a
 * player reaches.
 */
const MARTHA_STRIKE_REACH = 2;

/** The item Martha's foe gets once it has beaten her. */
const SPY_TOKEN: ItemKindId = 'spy-token';

/**
 * How near Martha comes to the player she fights before she stops and
 * thrusts, from centre to centre, in metres: well within the reach of a
 * slash of a player, so that the two can trade blows where they stand,
 * and well short of her own reach, so that a player that steps back as
 * she thrusts is still hit.
 */
const MARTHA_ATTACK_DISTANCE = 1.4;

/**
 * How near Martha comes to a player she walks up to before she talks with
 * it, from centre to centre, in metres.
 */
const MARTHA_GREETING_DISTANCE = 1.2;

/** The numbers of Martha. */
const KIND: MonsterKind = MONSTER_KINDS.martha;

/** The number of steps Martha sits on the ground once beaten. */
const SIT_STEPS: number = countSteps(KIND.respawnDelay);

/** A player, as far as Martha goes. */
interface Suspect {
  /** The identifier of the player. */
  readonly id: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** Whether the player is alive. */
  readonly isAlive: boolean;
  /** Whether Martha hunts the player. */
  readonly isHunted: boolean;
  /** Whether the player is in a dialogue. */
  readonly isInDialogue: boolean;
}

/**
 * What Martha does to a player at a step: opens a dialogue with it, as
 * she has come up to it; strikes at it with her pitchfork; or loses it in a
 * fight, as it has got away or died, so that she hunts it from then on.
 */
interface MarthaDeed {
  /** What she does. */
  readonly type: 'greet' | 'strike' | 'hunt';
  /** The identifier of the player. */
  readonly player: number;
}

/**
 * Tells whether a player is in Martha's area: no farther from her home
 * than her leash.
 *
 * @param {GroundVector} player - Where the player stands.
 * @returns {boolean} Whether it is.
 */
function isInArea(player: GroundVector): boolean {
  return measureDistance(player, MARTHA_HOME) <= KIND.leashRange;
}

/**
 * Martha, the village chief, who is the enemy spy, as the server moves
 * her among the players of her map, with the numbers
 * {@link MONSTER_KINDS} tells of her.
 *
 * She deals with a player she is told needs her, as {@link Martha.request}
 * tells, and with nobody else but those she hunts, as she sees fit for
 * what it needs of her; she hunts a player she loses in a fight, or that
 * leaves her map while she fights it, until it beats her; and a
 * player she comes up to is in a dialogue with her from then on, as the
 * talks of her map tell.  A player in any other dialogue with her leaves it
 * as soon as she is no longer free to be talked to, as
 * {@link isVillagerFree} tells.  She tells her listeners of the player that
 * beats her, as {@link BaseResident.tell} tells, as an event of type
 * `martha-beaten`.
 *
 * She deals with one player at a time, and the others she is to deal with
 * wait in the order they came, each as long as it stays in her area, no
 * farther from her home than her leash.  To a player that has found the
 * prisoner in her cave, or that holds his message, and that she does not
 * hunt, she walks up, around the obstacles, and once near enough
 * opens a dialogue with it; once the dialogue is over, she fights it.  A
 * player she hunts she fights at once, without a word, and she hunts a
 * player she notices, within her notice, in her area.  Whenever she sets
 * out to a player without her pitchfork, she first takes it up from the
 * wall of her house, at {@link PITCHFORK_STAND}, and she comes up to the
 * player, and fights it, only with it in her hands; and whenever she
 * walks back home with it, she first leans it against the wall again.  In
 * a fight, she chases the player and thrusts her pitchfork at it whenever
 * near enough, until it gets out of her area or dies, when she hunts it
 * from then on, or until it beats her, when she drops her pitchfork beside
 * her and sits on the ground for a while, then gets up at full health and
 * takes it up again.  Whenever a fight ends with her not beaten, she is
 * at full health again at once.  A player who leaves her area, or who
 * dies, before she has come up to it she lets go.  With nobody to deal
 * with, she walks back home and stands there as she does.  Only the player
 * she fights can hurt her.  She is stopped by the obstacles like the
 * players, but does not stand in their way, nor they in hers.
 */
export class Martha
  extends BaseResident
  implements RequestTaker, Target, Striker
{
  readonly #id: number;
  readonly #body: MonsterBody;
  #isArmed = false;
  #targetId: number | null = null;
  /** The players waiting for her to deal with them. */
  readonly #queue = new MarthaQueue();
  /** The players she hunts. */
  readonly #hunts = new HuntRecord();
  #sitSteps = 0;

  /**
   * Stands Martha at her home, facing the way she faces there, idling, at
   * full health, with nobody to deal with.
   *
   * @param {number} id - The identifier of Martha among the monsters of
   *   her map, which her state tells.
   * @param {ResidentWorld} world - What she deals with in her map.
   */
  constructor(id: number, world: ResidentWorld) {
    super(MARTHA_VILLAGER, world);
    this.#id = id;
    this.#body = new MonsterBody(
      id,
      MARTHA_VILLAGER.map,
      'martha',
      MARTHA_HOME,
    );
  }

  /**
   * The identifier of Martha among the monsters of her map.
   *
   * @returns {number} The identifier.
   */
  get id(): number {
    return this.#id;
  }

  /**
   * What the slashes of the players can strike of Martha: herself.
   *
   * @returns {Target} Martha.
   */
  override get target(): Target {
    return this;
  }

  /**
   * The health a thrust of her pitchfork that hits takes from a player.
   *
   * @returns {number} The health.
   */
  get biteDamage(): number {
    return KIND.biteDamage;
  }

  /**
   * The farthest a player can be from Martha for a thrust of her pitchfork
   * to hit, from centre to centre: farther than a slash of a player
   * reaches.
   *
   * @returns {number} The reach, 2 metres.
   */
  get strikeReach(): number {
    return MARTHA_STRIKE_REACH;
  }

  /**
   * What the player who beats Martha gets: the spy token.
   *
   * @returns {Spoils} The spoils.
   */
  get spoils(): Spoils {
    return { maxSilver: KIND.maxSilver, prize: SPY_TOKEN };
  }

  /**
   * Whether Martha sits on the ground, beaten.
   *
   * @returns {boolean} Whether she does.
   */
  get isBeaten(): boolean {
    return this.#body.mode === 'sit';
  }

  /**
   * Where Martha stands, and which way she faces.
   *
   * @returns {Pose} The pose.
   */
  get pose(): Pose {
    return this.#body.pose;
  }

  /**
   * Martha as she is to be seen now, as a monster of her own kind.
   *
   * @returns {MonsterState} Her state.
   */
  get state(): MonsterState {
    return { ...this.#body.state, isArmed: this.#isArmed };
  }

  /**
   * Describes Martha as a snapshot taken now is to tell her.
   *
   * @returns {ResidentView} Her state among the monsters, and nothing of
   *   the items.
   */
  override describe(): ResidentView {
    return { monster: this.state, items: {} };
  }

  /**
   * Tells whether a player can hit Martha now: only the player she fights.
   *
   * @param {number} attackerId - The identifier of the player.
   * @returns {boolean} Whether she fights it.
   */
  canBeHitBy(attackerId: number): boolean {
    return this.#isFightingWith(attackerId);
  }

  /**
   * Tells whether a thrust of Martha's pitchfork can hit a player now:
   * only the player she fights.
   *
   * @param {number} playerId - The identifier of the player.
   * @returns {boolean} Whether she fights it.
   */
  canStrike(playerId: number): boolean {
    return this.#isFightingWith(playerId);
  }

  /** Does nothing before the players move at a step. */
  override startStep(): void {
    // Martha goes about her business only once the players have moved.
  }

  /**
   * Tells Martha what a player of her map needs of her in the story, for
   * her to deal with it once she is done with those before it, as she sees
   * fit for the need, unless she deals with it already.  A player that
   * waits for her already keeps its place, with the need it is told to
   * have now.  She lets it go if it leaves her area, or dies, before she has
   * come up to it.
   *
   * @param {number} player - The identifier of the player.
   * @param {StoryNeed} need - What it needs of her.
   */
  request(player: number, need: StoryNeed): void {
    if (player !== this.#targetId) {
      this.#queue.request(player, need);
    }
  }

  /**
   * Has Martha no longer wait to deal with a player, if it waits for her.
   *
   * @param {number} player - The identifier of the player.
   */
  withdraw(player: number): void {
    this.#queue.withdraw(player);
  }

  /**
   * Has Martha let go of a player that has left the game: she no longer
   * waits to deal with it, nor hunts it.
   *
   * @param {number} player - The identifier of the player.
   */
  override forget(player: number): void {
    this.#queue.withdraw(player);
    this.#hunts.spare(player);
  }

  /**
   * Has Martha hunt a player that leaves her map, from then on, if she
   * fights it.
   *
   * @param {Player} player - The player.
   */
  override release(player: Player): void {
    if (this.#isFightingWith(player.id)) {
      this.#hunts.hunt(player.id);
    }
  }

  /**
   * Has Martha go about her business for one step, with every player of
   * her map as it stands now, once the players and the monsters have moved
   * at the step.
   *
   * A player she comes up to is in a dialogue with her from then on, as
   * the talks of her map tell, and a player she loses in a fight she
   * hunts from then on.  A player in any other dialogue with her leaves it
   * as soon as she is no longer free to be talked to, as
   * {@link isVillagerFree} tells.
   *
   * @returns {Strike[]} The thrusts of her pitchfork that strike at the
   *   step, each at the player she strikes at: she strikes once in every
   *   thrust, partway through.
   */
  override finishStep(): Strike[] {
    const { roster, talks } = this.world;
    const deeds: MarthaDeed[] = this.#act(this.#listSuspects());
    const strikes: Strike[] = [];
    for (const deed of deeds) {
      const player: Player | undefined = roster.find(deed.player);
      if (player === undefined) {
        continue;
      }
      if (deed.type === 'greet') {
        talks.approach(player, MARTHA_VILLAGER.id);
      } else if (deed.type === 'hunt') {
        this.#hunts.hunt(player.id);
      } else {
        strikes.push({ striker: this, players: [player] });
      }
    }
    this.#endTalksIfBusy();
    return strikes;
  }

  /**
   * Tells whether Martha deals with a player now, or it waits for her.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether it does.
   */
  #isWaitingOrServed(id: number): boolean {
    return id === this.#targetId || this.#queue.has(id);
  }

  /**
   * Tells whether Martha fights a player now, so that the player alone
   * can hurt her and she strikes at it alone.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether she does.
   */
  #isFightingWith(id: number): boolean {
    return this.#body.mode === 'chase' && this.#targetId === id;
  }

  /**
   * Tells whether Martha talks with a player now, having come up to it.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether she does.
   */
  #isTalkingWith(id: number): boolean {
    return this.#body.mode === 'talk' && this.#targetId === id;
  }

  /**
   * Ends the dialogue of every player with Martha but the one she has come
   * up to, if she is no longer free to be talked to.
   */
  #endTalksIfBusy(): void {
    if (isVillagerFree(MARTHA_VILLAGER, [this.state])) {
      return;
    }
    for (const player of this.world.roster.list()) {
      if (
        player.dialogue?.villager === MARTHA_VILLAGER.id &&
        !this.#isTalkingWith(player.id)
      ) {
        player.leaveDialogue();
      }
    }
  }

  /**
   * Lists the players of her map as Martha sees them.
   *
   * @returns {Suspect[]} The players, in the order they came in.
   */
  #listSuspects(): Suspect[] {
    return this.world.roster.list().map(
      (player: Player): Suspect => ({
        id: player.id,
        x: player.mover.motion.x,
        z: player.mover.motion.z,
        isAlive: player.isAlive,
        isHunted: this.#hunts.isHunted(player.id),
        isInDialogue: player.dialogue !== null,
      }),
    );
  }

  /**
   * Moves Martha one step of the simulation forward.
   *
   * @param {readonly Suspect[]} players - The players of her map, where
   *   they stand now.
   * @returns {MarthaDeed[]} What she does to the players at this step: she
   *   strikes once in every thrust, partway through.
   */
  #act(players: readonly Suspect[]): MarthaDeed[] {
    const deeds: MarthaDeed[] = [];
    this.#queue.keep((id: number): boolean => {
      const player: Suspect | undefined = findSuspect(players, id);
      return player !== undefined && isInArea(player);
    });
    for (const player of players) {
      if (
        player.isHunted &&
        player.isAlive &&
        !this.#isWaitingOrServed(player.id) &&
        measureDistance(player, this.#body.position) <= KIND.noticeRange &&
        isInArea(player)
      ) {
        this.#queue.enqueue(player.id, 'fight');
      }
    }
    if (this.#body.mode === 'sit') {
      if (--this.#sitSteps <= 0) {
        this.#body.restoreHealth();
        this.#isArmed = true;
        this.#targetId = null;
        this.#body.startAction('Idle');
        this.#serveNext(players);
      }
      return deeds;
    }
    const attack: AttackStep = this.#body.stepAttack();
    if (attack !== 'none') {
      if (attack === 'strike' && this.#targetId !== null) {
        deeds.push({ type: 'strike', player: this.#targetId });
      }
      return deeds;
    }
    const target: Suspect | undefined =
      this.#targetId === null
        ? undefined
        : findSuspect(players, this.#targetId);
    switch (this.#body.mode) {
      case 'approach':
        this.#approach(target, players, deeds);
        break;
      case 'talk':
        this.#talk(target, players);
        break;
      case 'chase':
        this.#chase(target, players, deeds);
        break;
      default:
        if (!this.#queue.isEmpty) {
          this.#serveNext(players);
        } else if (this.#body.mode === 'return') {
          this.#goHome();
        }
    }
    return deeds;
  }

  /**
   * Takes a hit, which only the player she fights can deal.  With no
   * health left, she sits on the ground, beaten, takes what the player that
   * beat her was asked for as done, hunts it no more, and tells her
   * listeners of it.
   *
   * @param {number} damage - The health the hit takes.
   * @param {number} attackerId - The identifier of the player that deals
   *   it.
   * @returns {number} The health she lost, which is no more than she had.
   */
  takeHit(damage: number, attackerId: number): number {
    const lost: number = this.#body.loseHealth(damage);
    if (this.#body.health === 0) {
      this.#body.switchMode('sit');
      this.#sitSteps = SIT_STEPS;
      this.#isArmed = false;
      this.#targetId = null;
      this.#body.startAction('Sit');
      this.#queue.withdraw(attackerId);
      this.#hunts.spare(attackerId);
      this.tell('martha-beaten', attackerId);
    }
    return lost;
  }

  /**
   * Walks up to the player she is to talk with, and opens a dialogue with
   * it once near enough.  She lets it go if it is gone, dead or out of her
   * area.
   *
   * @param {Suspect | undefined} target - The player, if it is in the
   *   village.
   * @param {readonly Suspect[]} players - The players.
   * @param {MarthaDeed[]} deeds - What she does at the step, which this
   *   adds to.
   */
  #approach(
    target: Suspect | undefined,
    players: readonly Suspect[],
    deeds: MarthaDeed[],
  ): void {
    if (target === undefined || !target.isAlive || !isInArea(target)) {
      this.#serveNext(players);
      return;
    }
    if (!this.#isArmed) {
      this.#fetchPitchfork();
      return;
    }
    if (
      measureDistance(target, this.#body.position) <= MARTHA_GREETING_DISTANCE
    ) {
      this.#body.face(target);
      this.#body.switchMode('talk');
      this.#body.startAction('Idle');
      deeds.push({ type: 'greet', player: target.id });
      return;
    }
    if (!this.#body.pursue(target)) {
      this.#serveNext(players);
    }
  }

  /**
   * Stands facing the player she talks with, and fights it once the
   * dialogue is over.  She lets it go if it is gone or dead.
   *
   * @param {Suspect | undefined} target - The player, if it is in the
   *   village.
   * @param {readonly Suspect[]} players - The players.
   */
  #talk(target: Suspect | undefined, players: readonly Suspect[]): void {
    if (target?.isAlive !== true) {
      this.#serveNext(players);
      return;
    }
    this.#body.face(target);
    if (!target.isInDialogue) {
      this.#body.switchMode('chase');
    }
  }

  /**
   * Chases the player she fights, around the obstacles, and thrusts at it
   * once near enough.  She gives up if it is gone, and hunts it from then
   * on if it is dead or out of her area.
   *
   * @param {Suspect | undefined} target - The player, if it is in the
   *   village.
   * @param {readonly Suspect[]} players - The players.
   * @param {MarthaDeed[]} deeds - What she does at the step, which this
   *   adds to.
   */
  #chase(
    target: Suspect | undefined,
    players: readonly Suspect[],
    deeds: MarthaDeed[],
  ): void {
    if (target === undefined) {
      this.#serveNext(players);
      return;
    }
    if (!target.isAlive || !isInArea(target)) {
      deeds.push({ type: 'hunt', player: target.id });
      this.#serveNext(players);
      return;
    }
    if (!this.#isArmed) {
      this.#fetchPitchfork();
      return;
    }
    if (!this.#body.chase(target, MARTHA_ATTACK_DISTANCE)) {
      this.#serveNext(players);
    }
  }

  /**
   * Turns to the next player waiting for her, if any, to walk up to it, or
   * to fight it at once if she hunts it, or else sets out for home, at
   * full health either way.
   *
   * @param {readonly Suspect[]} players - The players.
   */
  #serveNext(players: readonly Suspect[]): void {
    this.#body.restoreHealth();
    const waiting: Waiting | undefined = this.#queue.takeNext();
    const next: Suspect | undefined =
      waiting === undefined ? undefined : findSuspect(players, waiting.id);
    if (waiting !== undefined && next !== undefined) {
      this.#targetId = next.id;
      this.#body.switchMode(
        next.isHunted || waiting.approach === 'fight' ? 'chase' : 'approach',
      );
      return;
    }
    this.#targetId = null;
    this.#body.switchMode('return');
    this.#goHome();
  }

  /**
   * Walks to the pitchfork against the wall of her house, and takes it up
   * once there, or once she finds no way there.
   */
  #fetchPitchfork(): void {
    if (!this.#walkTo(PITCHFORK_STAND)) {
      this.#isArmed = true;
      this.#body.dropWay();
    }
  }

  /**
   * Walks back home, by way of the wall of her house to lean her pitchfork
   * against it if she holds it, and stands there once there, or once she
   * finds no way.
   */
  #goHome(): void {
    if (this.#isArmed) {
      if (!this.#walkTo(PITCHFORK_STAND)) {
        this.#isArmed = false;
        this.#body.dropWay();
      }
      return;
    }
    if (!this.#walkTo(MARTHA_HOME)) {
      this.#settle();
    }
  }

  /**
   * Walks one step towards a point, around the obstacles, finding the way
   * there whenever she has none, or is stopped.
   *
   * @param {GroundVector} point - The point.
   * @returns {boolean} Whether she walks on, rather than being there or
   *   finding no way there.
   */
  #walkTo(point: GroundVector): boolean {
    if (measureDistance(point, this.#body.position) === 0) {
      return false;
    }
    if (!this.#body.hasWay && !this.#body.findWay(point)) {
      return false;
    }
    const outcome: WalkOutcome = this.#body.walk(KIND.chaseSpeed);
    if (outcome === 'stopped') {
      this.#body.dropWay();
    }
    return outcome !== 'arrived';
  }

  /** Stands idling where she is, facing as she does at home if there. */
  #settle(): void {
    this.#body.settle();
    if (measureDistance(this.#body.position, MARTHA_HOME) === 0) {
      this.#body.turn(MARTHA_HOME.yaw);
    }
  }
}

/**
 * Finds a player among the players.
 *
 * @param {readonly Suspect[]} players - The players.
 * @param {number} id - The identifier of the player.
 * @returns {Suspect | undefined} The player, if it is among them.
 */
function findSuspect(
  players: readonly Suspect[],
  id: number,
): Suspect | undefined {
  return players.find((player: Suspect) => player.id === id);
}
