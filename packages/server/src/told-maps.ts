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
 * @module server/told-maps Which map each peer has been told its player is
 *   in.
 */

import { createMapMessage } from '@clovervale/shared';
import type { MapId, MapMessage } from '@clovervale/shared';

/**
 * Which map each peer has been told its player is in, the village for a
 * peer told of none, as a peer is welcomed into the village.
 */
export class ToldMaps {
  readonly #maps = new Map<number, MapId>();

  /**
   * Tells the peer of a player which map the player is in, if that is not
   * the map it was last told of.
   *
   * @param {number} id - The identifier of the player.
   * @param {MapId} map - The map the player is in.
   * @returns {MapMessage | null} The message to send the peer, or `null` if
   *   it has been told of the map already.
   */
  tell(id: number, map: MapId): MapMessage | null {
    if ((this.#maps.get(id) ?? 'village') === map) {
      return null;
    }
    this.#maps.set(id, map);
    return createMapMessage(map);
  }

  /**
   * Forgets which map the peer of a player was told of, as the player has
   * left.
   *
   * @param {number} id - The identifier of the player.
   */
  forget(id: number): void {
    this.#maps.delete(id);
  }
}
