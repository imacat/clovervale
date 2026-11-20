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
 * @module shared/actions What a player or a monster can be doing, and for
 *   how long.
 */

/** What a player can be doing. */
export const ACTION_STATES = [
  'Idle',
  'Walk',
  'Slash',
  'Drink',
  'Talk',
  'Die',
] as const;

/** What a player is doing. */
export type ActionState = (typeof ACTION_STATES)[number];

/**
 * What a player can do when it interacts with the world: slash, drink from
 * the fountain, or talk to a villager.
 */
export type Interaction = Extract<ActionState, 'Slash' | 'Drink' | 'Talk'>;

/** How long a slash lasts, in seconds. */
export const SLASH_DURATION = 0.6;

/** How long a drink from the fountain lasts, in seconds. */
export const DRINK_DURATION = 1;

/** How long a talk to a villager lasts, in seconds. */
export const TALK_DURATION = 0.5;

/** What a monster can be doing. */
export const MONSTER_ACTIONS = ['Idle', 'Walk', 'Attack', 'Die'] as const;

/** What a monster is doing. */
export type MonsterAction = (typeof MONSTER_ACTIONS)[number];
