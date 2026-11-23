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
 * @module shared/martha What Martha, the village chief, who is the enemy
 *   spy and fights as a monster, can be up to among the monsters.
 */

/** What Martha can be up to among the monsters. */
export const MARTHA_MODES = [
  'idle',
  'approach',
  'talk',
  'chase',
  'return',
  'sit',
] as const;

/**
 * What Martha is up to: idling at home, walking up to a player, talking
 * with it, fighting it, walking back home, or sitting on the ground once
 * beaten.  She chases only the player she fights.
 */
export type MarthaMode = (typeof MARTHA_MODES)[number];

/**
 * The modes in which Martha is free to be talked to: while she idles or
 * walks back home, not while she walks up to a player, talks with one,
 * fights or sits on the ground.
 */
export const MARTHA_FREE_MODES: readonly MarthaMode[] = ['idle', 'return'];

/** The modes in which Martha is in a fight: only while she chases. */
export const MARTHA_FIGHT_MODES: readonly MarthaMode[] = ['chase'];
