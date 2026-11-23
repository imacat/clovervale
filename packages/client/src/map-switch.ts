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
 * @module client/map-switch Which map the page shows, and the change of the
 *   scene and the camera as the player of the page goes from map to map.
 */

import type { Object3D, Scene } from 'three';

import { HOME_MAP, SPAWN_YAW, findSpawnPoint } from '@clovervale/shared';
import type { InputProgress, MapId } from '@clovervale/shared';

import type { MapFade } from './map-fade.ts';
import type { MapScene } from './map-scene.ts';
import { MAP_VIEWS } from './map-views.ts';
import type { Viewport } from './viewport.ts';

/**
 * Which map the page shows, the village at first, and the map the server
 * has told the player of the page is in from now on, until the page shows
 * it.  What goes with the player from map to map stands in the scene of the
 * map shown.
 */
export class MapSwitch {
  /** The scene of each map. */
  readonly #scenes: Readonly<Record<MapId, MapScene>>;
  /** What goes with the player of the page from map to map. */
  readonly #stage: Object3D;
  /** What darkens the view for a moment as the map changes. */
  readonly #fade: MapFade;
  /** Gives the view the page shows, once it is shown. */
  readonly #readViewport: () => Viewport;
  /** The map the page shows. */
  #shownMap: MapId = HOME_MAP;
  /**
   * The map the server has told the player of the page is in from now on,
   * until the page shows it, or `null` while it has not.
   */
  #comingMap: MapId | null = null;

  /**
   * Stands what goes with the player of the page in the village.
   *
   * @param {Readonly<Record<MapId, MapScene>>} scenes - Each map.
   * @param {Object3D} stage - What goes with the player from map to map.
   * @param {MapFade} fade - What darkens the view as the map changes.
   * @param {() => Viewport} readViewport - Gives the view the page shows,
   *   which is asked for only once it is shown.
   */
  constructor(
    scenes: Readonly<Record<MapId, MapScene>>,
    stage: Object3D,
    fade: MapFade,
    readViewport: () => Viewport,
  ) {
    this.#scenes = scenes;
    this.#stage = stage;
    this.#fade = fade;
    this.#readViewport = readViewport;
    scenes[HOME_MAP].scene.add(stage);
  }

  /**
   * The map the page shows.
   *
   * @returns {MapId} The map.
   */
  get map(): MapId {
    return this.#shownMap;
  }

  /**
   * Takes note of the map the server tells the player of the page is in
   * from now on.
   *
   * @param {MapId} map - The map.
   */
  noteComingMap(map: MapId): void {
    this.#comingMap = map;
  }

  /**
   * Takes the map the server has told the player of the page is in from
   * now on, which is no longer coming after this.
   *
   * @returns {MapId | null} The map, or `null` if none is coming.
   */
  takeComingMap(): MapId | null {
    const map: MapId | null = this.#comingMap;
    this.#comingMap = null;
    return map;
  }

  /**
   * Shows a map the player of the page is in now, as the first snapshot
   * there tells of the player.  The view darkens for a moment and shows that
   * map, with the camera at once on the player, looking the way it faces,
   * and down on it as steeply as the map has it.
   *
   * @param {MapId} map - The map.
   * @param {InputProgress} own - How far the player had got with the inputs
   *   of the page, and the motion of the player there, as the snapshot tells.
   */
  enter(map: MapId, own: InputProgress): void {
    this.#shownMap = map;
    const shown: Scene = this.#scenes[map].scene;
    shown.add(this.#stage);
    this.#readViewport().switchScene(
      shown,
      own.motion,
      own.motion.yaw,
      MAP_VIEWS[map].leastElevation,
    );
    this.#fade.darken();
  }

  /**
   * Shows the village from the plaza, facing the fountain, as a page does
   * before it connects, if the page shows another map.
   */
  returnHome(): void {
    if (this.#shownMap === HOME_MAP) {
      return;
    }
    const home: Scene = this.#scenes[HOME_MAP].scene;
    home.add(this.#stage);
    this.#shownMap = HOME_MAP;
    this.#readViewport().switchScene(
      home,
      findSpawnPoint(0),
      SPAWN_YAW,
      MAP_VIEWS[HOME_MAP].leastElevation,
    );
  }
}
