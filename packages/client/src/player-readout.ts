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
 * @module client/player-readout Telling the owner what is synchronised.
 */

import { MONSTER_HEALTH, PLAYER_HEALTH } from '@clovervale/shared';
import type {
  GroundVector,
  MonsterState,
  PlayerState,
  SlashJudgement,
} from '@clovervale/shared';

import type { PlayersView } from './interpolation.ts';

/** What the owner reads about the player of the page and the snapshots. */
export interface PlayerReadout {
  /** The identifier and the appearance of the player of the page. */
  readonly player: string;
  /** The number of players in the latest snapshot. */
  readonly players: string;
  /** The position of the player of the page in the latest snapshot. */
  readonly position: string;
  /** The yaw of the player of the page in the latest snapshot. */
  readonly yaw: string;
  /** What the player of the page is doing in the latest snapshot. */
  readonly action: string;
  /**
   * The health of the player of the page in the latest snapshot, and
   * whether it is dead.
   */
  readonly health: string;
}

/** What the owner reads about the monster in the latest snapshot. */
export interface MonsterReadout {
  /** What the monster is up to. */
  readonly mode: string;
  /** What the monster is doing. */
  readonly action: string;
  /** The health of the monster. */
  readonly health: string;
  /** The position of the monster. */
  readonly position: string;
}

/** What the owner reads about the player of the page as it is shown. */
export interface DisplayReadout {
  /** The position the player of the page is shown at. */
  readonly drawnAt: string;
  /**
   * How far behind the latest snapshot the players are shown, in time, and
   * how far from where it tells the player of the page is shown, in
   * distance.
   */
  readonly behind: string;
}

/** What the owner reads about the prediction of the player of the page. */
export interface PredictionReadout {
  /** The position the player of the page is predicted to be at. */
  readonly predicted: string;
  /** The number of corrections so far, and the size of the last one. */
  readonly corrections: string;
}

/** What the owner reads about the latest slash of the player of the page. */
export interface SlashReadout {
  /** Whether the slash hit. */
  readonly result: string;
  /** How far back the server judged the slash, in time. */
  readonly judgedBack: string;
}

/** What there is to tell about a prediction. */
export interface PredictionSummary {
  /** Where the player is predicted to be. */
  readonly motion: GroundVector;
  /** The number of times the server has contradicted the prediction. */
  readonly correctionCount: number;
  /**
   * How far the last correction moved the player, in metres, or `null`
   * before the first correction.
   */
  readonly lastCorrection: number | null;
}

/** What stands for a value that is not known yet. */
const UNKNOWN = '–';

/**
 * Describes the player of the page and the latest snapshot.
 *
 * @param {number | null} ownId - The identifier of the player of the page,
 *   or `null` before the server has told it.
 * @param {(readonly PlayerState[]) | null} players - The players in the latest
 *   snapshot, or `null` before the first one.
 * @returns {PlayerReadout} What the owner reads.
 */
export function describeSnapshot(
  ownId: number | null,
  players: readonly PlayerState[] | null,
): PlayerReadout {
  const own: PlayerState | undefined = players?.find(
    (player: PlayerState) => player.id === ownId,
  );
  const id: string = ownId === null ? UNKNOWN : `#${String(ownId)}`;
  const count: string = players === null ? UNKNOWN : String(players.length);
  if (own === undefined) {
    return {
      player: id,
      players: count,
      position: UNKNOWN,
      yaw: UNKNOWN,
      action: UNKNOWN,
      health: UNKNOWN,
    };
  }
  const health = `${String(own.health)} / ${String(PLAYER_HEALTH)}`;
  return {
    player: `${id}, appearance ${String(own.appearance)}`,
    players: count,
    position: `${formatNumber(own.x, 2)}, ${formatNumber(own.z, 2)}`,
    yaw: `${formatNumber(own.yaw, 1)}°`,
    action: own.action,
    health: own.action === 'Die' ? `${health}, dead` : health,
  };
}

/**
 * Describes the monster in the latest snapshot.
 *
 * @param {(readonly MonsterState[]) | null} monsters - The monsters in the
 *   latest snapshot, or `null` before the first one.
 * @returns {MonsterReadout} What the owner reads, which reports the
 *   monster as gone when the snapshot has none.
 */
export function describeMonster(
  monsters: readonly MonsterState[] | null,
): MonsterReadout {
  if (monsters === null) {
    return {
      mode: UNKNOWN,
      action: UNKNOWN,
      health: UNKNOWN,
      position: UNKNOWN,
    };
  }
  const [monster] = monsters;
  if (monster === undefined) {
    return {
      mode: 'gone',
      action: UNKNOWN,
      health: UNKNOWN,
      position: UNKNOWN,
    };
  }
  return {
    mode: monster.mode,
    action: monster.action,
    health: `${String(monster.health)} / ${String(MONSTER_HEALTH)}`,
    position: `${formatNumber(monster.x, 2)}, ${formatNumber(monster.z, 2)}`,
  };
}

/**
 * Describes the player of the page as it is shown, against the latest
 * snapshot.
 *
 * @param {number | null} ownId - The identifier of the player of the page,
 *   or `null` before the server has told it.
 * @param {(readonly PlayerState[]) | null} players - The players in the latest
 *   snapshot, or `null` before the first one.
 * @param {PlayersView} view - The players as they are shown.
 * @returns {DisplayReadout} What the owner reads.
 */
export function describeDisplay(
  ownId: number | null,
  players: readonly PlayerState[] | null,
  view: PlayersView,
): DisplayReadout {
  if (players === null) {
    return { drawnAt: UNKNOWN, behind: UNKNOWN };
  }
  const isOwn = (player: PlayerState): boolean => player.id === ownId;
  const latest: PlayerState | undefined = players.find(isOwn);
  const drawn: PlayerState | undefined = view.players.find(isOwn);
  const time = `${formatNumber(view.lag, 0)} ms`;
  if (drawn === undefined) {
    return { drawnAt: UNKNOWN, behind: time };
  }
  const drawnAt = `${formatNumber(drawn.x, 2)}, ${formatNumber(drawn.z, 2)}`;
  if (latest === undefined) {
    return { drawnAt, behind: time };
  }
  const distance: number = Math.hypot(latest.x - drawn.x, latest.z - drawn.z);
  return { drawnAt, behind: `${time}, ${formatNumber(distance, 2)} m` };
}

/**
 * Describes the prediction of the player of the page.
 *
 * @param {PredictionSummary | null} prediction - The prediction, or `null`
 *   while there is none.
 * @returns {PredictionReadout} What the owner reads.
 */
export function describePrediction(
  prediction: PredictionSummary | null,
): PredictionReadout {
  if (prediction === null) {
    return { predicted: UNKNOWN, corrections: UNKNOWN };
  }
  const { motion, correctionCount, lastCorrection } = prediction;
  const x: string = formatNumber(motion.x, 2);
  const predicted = `${x}, ${formatNumber(motion.z, 2)}`;
  const count = String(correctionCount);
  if (lastCorrection === null) {
    return { predicted, corrections: count };
  }
  const size = `${formatNumber(lastCorrection, 2)} m`;
  return { predicted, corrections: `${count}, last ${size}` };
}

/**
 * Describes the latest slash of the player of the page, as the server
 * judged it.
 *
 * @param {SlashJudgement | null} slash - How the slash was judged, or
 *   `null` before the first slash.
 * @returns {SlashReadout} What the owner reads.
 */
export function describeSlash(slash: SlashJudgement | null): SlashReadout {
  if (slash === null) {
    return { result: UNKNOWN, judgedBack: UNKNOWN };
  }
  return {
    result: slash.isHit ? 'hit' : 'missed',
    judgedBack: `${formatNumber(slash.rewind, 0)} ms`,
  };
}

/**
 * Formats a number with a fixed number of decimal places.
 *
 * @param {number} value - The number.
 * @param {number} places - The number of decimal places.
 * @returns {string} The number, without a sign if it rounds to zero.
 */
function formatNumber(value: number, places: number): string {
  const scale: number = 10 ** places;
  return (Math.round(value * scale) / scale + 0).toFixed(places);
}
