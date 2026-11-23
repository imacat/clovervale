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
 * @module client/debug-hook What the page lays out on `window.clovervale`,
 *   for looking at what it shows, and at the latest snapshot it shows that
 *   from, from the console of the browser.
 */

import type { CaveScene } from './cave-scene.ts';
import type { DayClock } from './day-clock.ts';
import type { MapStage } from './map-stage.ts';
import type { MarthaFigure } from './martha-figure.ts';
import type { PlayControls } from './play-controls.ts';
import type { TobyFigure } from './toby-figure.ts';
import type { Viewport } from './viewport.ts';

/** What the page lays out for looking at. */
export interface DebugParts {
  /** The view the page shows. */
  readonly viewport: Viewport;
  /** What stands wherever the player of the page is. */
  readonly stage: MapStage;
  /** The cave. */
  readonly cave: CaveScene;
  /** The controls of play, with the box of the chat and the dialogue. */
  readonly controls: PlayControls;
  /** Toby, as the page shows him. */
  readonly toby: TobyFigure;
  /** Martha, as the page shows her, with her pitchfork. */
  readonly martha: MarthaFigure;
  /** The time of day of the world, as the page reckons it. */
  readonly dayClock: DayClock;
  /**
   * Tells the time of day the page shows.
   *
   * @returns {number} The time of day.
   */
  readonly readShownTime: () => number;
}

/**
 * Lays out on `window.clovervale` what the page shows, and the latest
 * snapshot it shows that from, for looking at from the console of the
 * browser.
 *
 * @param {DebugParts} parts - What the page lays out.
 */
export function exposeDebugHook(parts: DebugParts): void {
  const { viewport, stage, cave, controls, toby, martha, dayClock } = parts;
  Object.defineProperty(window, 'clovervale', {
    value: {
      describeCamera: () => viewport.getFocus(),
      describeHeading: () => viewport.getHeading(),
      describeCameraDistance: () => {
        const { x, z } = viewport.getFocus();
        const { position } = viewport.getCamera();
        return Math.hypot(position.x - x, position.y, position.z - z);
      },
      describeMap: () => stage.map,
      describeFigures: () => stage.figures.describePlayers(),
      describeMonsters: () => stage.figures.describeMonsters(),
      describeItems: () => stage.figures.describeItems(),
      describeContainers: () => cave.describeContainers(),
      listLatestPlayers: () => stage.timeline.latest ?? [],
      listLatestMonsters: () => stage.timeline.latestMonsters ?? [],
      listShownHits: () => stage.events.listShownHits(),
      listShownHeals: () => stage.events.listShownHeals(),
      describeSpeech: () => stage.speech.describe(),
      listSaid: () => stage.speech.describeSaid(),
      describeChat: () => ({ isOpen: controls.isChatOpen }),
      describeDialogue: () => controls.describeDialogue(),
      describeToby: () => toby.describe(),
      describePitchfork: () => martha.describe(),
      describeTimeOfDay: () => ({
        world: dayClock.read(performance.now()),
        shown: parts.readShownTime(),
      }),
    },
  });
}
