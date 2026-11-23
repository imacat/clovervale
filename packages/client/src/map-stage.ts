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
 * @module client/map-stage What stands wherever the player of the page is,
 *   and the map it stands in: the latest snapshots, the figures, the hits
 *   and the heals, and the bubbles of what is said, all of which start
 *   afresh in every map.
 */

import type { Object3D } from 'three';

import type { MapId, SnapshotMessage } from '@clovervale/shared';

import type { PlayerSaying } from './chat-channels.ts';
import { EventDisplay } from './event-display.ts';
import { FigureRegistry } from './figure-registry.ts';
import type { FigureFrame, FigureSet } from './figure-set.ts';
import { findFigureTop } from './head-top.ts';
import { SnapshotTimeline } from './interpolation.ts';
import type { MapFade } from './map-fade.ts';
import type { MapScene } from './map-scene.ts';
import { MapSwitch } from './map-switch.ts';
import type { MonsterSource } from './monster-figures.ts';
import { isOnScreen } from './on-screen.ts';
import type { FigureSource } from './player-figures.ts';
import type { SpeechBubble } from './speech-bubble.ts';
import type { Viewport } from './viewport.ts';

/** What the stage is set up with. */
export interface StageParts {
  /** Each map. */
  readonly scenes: Readonly<Record<MapId, MapScene>>;
  /** What darkens the view as the map changes. */
  readonly fade: MapFade;
  /**
   * What goes with the player of the page from map to map, in which the
   * bubbles of what is said stand.
   */
  readonly root: Object3D;
  /** The bubbles of what the villagers and the players say. */
  readonly speech: SpeechBubble;
  /** Makes the figure of a player. */
  readonly createPlayer: FigureSource;
  /** Makes the figure of a monster. */
  readonly createMonster: MonsterSource;
  /**
   * The sets of figures shown besides the items, the players and the
   * monsters, in the order they are shown.
   */
  readonly others: readonly FigureSet[];
  /**
   * Gives the view the page shows, which is asked for only once it is
   * shown.
   *
   * @returns {Viewport} The view.
   */
  readonly readViewport: () => Viewport;
}

/**
 * What stands wherever the player of the page is, which goes with it from
 * map to map, and the map it is in: the latest snapshots it is shown from,
 * every set of figures, the hits and the heals, and the bubbles of what the
 * villagers and the players say.
 */
export class MapStage {
  /** The latest snapshots from the server, to show the players from. */
  readonly timeline = new SnapshotTimeline();
  /** Every set of figures shown. */
  readonly figures: FigureRegistry;
  /** The hits and the heals the server tells of. */
  readonly events: EventDisplay;
  /** The bubbles of what the villagers and the players say. */
  readonly speech: SpeechBubble;
  /** Which map the page shows, and the change from map to map. */
  readonly #switch: MapSwitch;
  /** Gives the view the page shows, once it is shown. */
  readonly #readViewport: () => Viewport;

  /**
   * Sets the stage up in the village.
   *
   * @param {StageParts} parts - What the stage is set up with.
   */
  constructor(parts: StageParts) {
    const { root, readViewport } = parts;
    this.#switch = new MapSwitch(parts.scenes, root, parts.fade, readViewport);
    this.#readViewport = readViewport;
    this.figures = new FigureRegistry(
      root,
      parts.createPlayer,
      parts.createMonster,
      parts.others,
    );
    this.events = new EventDisplay(root);
    this.speech = parts.speech;
  }

  /**
   * The map the player of the page is in, as the page shows it.
   *
   * @returns {MapId} The map.
   */
  get map(): MapId {
    return this.#switch.map;
  }

  /**
   * Takes note of the map the server tells the player of the page is in
   * from now on, which is shown once its first snapshot comes.
   *
   * @param {MapId} map - The map.
   */
  noteComingMap(map: MapId): void {
    this.#switch.noteComingMap(map);
  }

  /**
   * Takes a snapshot from the server in, to show the players from.  The
   * first snapshot of a map the server has told the player of the page is
   * in from now on, as {@link noteComingMap} took note of, shows that map,
   * as {@link MapSwitch.enter} tells, after forgetting what was shown of
   * the map left: the snapshots, and with them the players and the monsters
   * seen, the hits and the heals, as {@link EventDisplay.clear} tells, what
   * a villager or a player there was saying, and every set of figures, as
   * {@link FigureRegistry.clear} tells.  The items, the monsters and the
   * events of each map are numbered on their own, so that nothing of one
   * map is taken for something of another.
   *
   * @param {SnapshotMessage} message - The snapshot.
   * @param {number} now - The time of the page the snapshot came at, in
   *   milliseconds.
   * @returns {MapId | null} The map the player has gone into, if this is
   *   the first snapshot there, or `null` otherwise.
   */
  receiveSnapshot(message: SnapshotMessage, now: number): MapId | null {
    const map: MapId | null = this.#switch.takeComingMap();
    if (map !== null) {
      this.timeline.clear();
      this.events.clear();
      this.speech.clear();
      this.figures.clear(this.map);
    }
    this.timeline.addSnapshot(message, now);
    if (map !== null) {
      this.#switch.enter(map, message.own);
    }
    return map;
  }

  /**
   * Forgets the map coming, the snapshots, the events yet to be shown and
   * every set of figures, as {@link FigureRegistry.clear} tells, as the
   * page disconnects.  A page cut off in the cave shows the village from
   * the plaza, facing the fountain, as a page does before it connects.
   */
  returnToVillage(): void {
    this.#switch.takeComingMap();
    // The figures are cleared while the map left is still the one shown.
    this.figures.clear(this.map);
    this.#switch.returnHome();
    this.timeline.clear();
    this.events.clearSchedule();
  }

  /**
   * Shows every set of figures as things are at a frame, as
   * {@link FigureRegistry.show} tells, with the bubbles of what the players
   * say kept above their heads as they move around, and the hits and the
   * heals whose moment has come, as {@link EventDisplay.show} tells.  A
   * bubble is not seen while its player is off the screen, and is taken
   * away once its player is shown no more.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  show(frame: FigureFrame): void {
    this.figures.show(frame);
    this.#followSaid();
    this.events.show(frame.view, frame.ownId);
  }

  /**
   * Shows what a player says in a bubble above its head, as
   * {@link SpeechBubble.sayAs} tells, if the player is shown and on the
   * screen; what a player off the screen says is not shown.
   *
   * @param {PlayerSaying} saying - What the player says.
   */
  showSaid(saying: PlayerSaying): void {
    const figure: Object3D | null = this.figures.findPlayer(saying.player);
    if (figure !== null && this.#isOnScreen(figure)) {
      this.speech.sayAs(saying, findFigureTop(figure));
    }
  }

  /**
   * Moves the numbers and the bubbles on, and then every set of figures, as
   * {@link FigureRegistry.update} tells.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  update(seconds: number, frame: FigureFrame): void {
    this.events.update(seconds);
    this.speech.update(seconds);
    this.figures.update(seconds, frame);
  }

  /**
   * Tells whether a figure is on the screen.
   *
   * @param {Object3D} figure - The figure.
   * @returns {boolean} Whether it is.
   */
  #isOnScreen(figure: Object3D): boolean {
    return isOnScreen(this.#readViewport().getCamera(), figure, null);
  }

  /**
   * Keeps the bubbles of the players above their heads as they move
   * around: a bubble is not seen while its player is off the screen, and is
   * taken away once its player is shown no more.
   */
  #followSaid(): void {
    for (const player of this.speech.listSpeakers()) {
      const figure: Object3D | null = this.figures.findPlayer(player);
      if (figure === null) {
        this.speech.hushPlayer(player);
      } else {
        this.speech.followPlayer(
          player,
          this.#isOnScreen(figure) ? findFigureTop(figure) : null,
        );
      }
    }
  }
}
