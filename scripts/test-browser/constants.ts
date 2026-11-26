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
 * @module scripts/test-browser/constants The timings, places and words that
 *   several checks share.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CLOVER_PATCHES, TOBY_ENDS, TOBY_PATCHES } from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';

/** The root of the repository. */
export const rootDir: string = path.resolve(import.meta.dirname, '../..');
/** The built client. */
export const clientDir: string = path.join(rootDir, 'packages/client/dist');
/** The built game server. */
export const serverFile: string = path.join(
  rootDir,
  'packages/server/dist/server.mjs',
);
/** How long the page may take to draw and connect, in milliseconds. */
export const PAGE_TIMEOUT = 20_000;
/** How long a page may take to show what a player does, in milliseconds. */
export const ACTION_TIMEOUT = 10_000;
/** How long to wait between two looks at the page, in milliseconds. */
export const POLL_INTERVAL = 100;

/** How far a player walks in the check, in meters. */
export const WALK_DISTANCE = 2;
/** The most two positions differ by when they are the same, in meters. */
export const SAME_POSITION = 1e-9;
/** The key value WebDriver gives the left arrow. */
export const LEFT_ARROW = '\uE012';
/** The farthest a player standing still may seem to move, in meters. */
export const STANDING_DRIFT = 0.01;

/** How long a page holds its messages back each way, in milliseconds. */
export const NETWORK_DELAY = 300;

/**
 * How long a player may take to walk a leg to the monster, in
 * milliseconds.
 */
export const LEG_TIMEOUT = 20_000;
/**
 * The least position along the Z axis of the stretch the player walks
 * along to and from the monster, in meters.  Along the whole stretch, the
 * way is clear from the path, between the bush and the rock west of the
 * spawn stones, and between the two stones on that side, to the far side
 * of the stones.
 */
export const ROUTE_LEAST_Z = 8.6;
/** The greatest position along the Z axis of that stretch, in meters. */
export const ROUTE_MOST_Z = 8.95;
/** How long the monster may take to come to the player, in milliseconds. */
export const MONSTER_TIMEOUT = 15_000;
/**
 * How long a key is tapped to step a player, in milliseconds, which is
 * longer than a step of the simulation, so that the press and the release
 * never come into effect at the same step and leave the player as it was.
 */
export const TAP_DURATION = 100;
/** How long a finger taps the screen, in milliseconds. */
export const TOUCH_TAP_DURATION = 40;
/**
 * The most degrees a player may face away from the way its keys walk it,
 * for it to count as facing that way.
 */
export const YAW_TOLERANCE = 1;
/** The health of a player at full health. */
export const FULL_HEALTH = 100;
/** What the panel tells the space bar does by Nancy, facing her. */
export const TALK_KEY = 'talk to Nancy';
/** The prompt a page shows by Nancy, facing her. */
export const TALK_PROMPT = 'Press Space to talk to Nancy';
/** What Nancy says the first time a page talks to her, to welcome it. */
export const NANCY_WELCOME =
  'Welcome to Clovervale! If you need anything, go see the village ' +
  'chief. She lives in the biggest house, right at the back.';
/** The key values WebDriver gives the keys the bag takes, by their names. */
export const BAG_KEYS = {
  enter: '\uE007',
  escape: '\uE00C',
  left: '\uE012',
  right: '\uE014',
} as const;
/**
 * How far from the feet of a player an item it puts down may be shown, in
 * meters.
 */
export const ITEM_NEARNESS = 0.05;
/**
 * How long a key that would walk the player is held down in a dialogue, in
 * milliseconds, and how long the dogs are watched standing still then.
 */
export const DIALOGUE_HOLD_DURATION = 1500;
/** How long a page takes to draw what it has just changed, in ms. */
export const VIEW_SETTLE_DURATION = 500;
/** How long the camera takes to settle after it is handled, in ms. */
export const CAMERA_SETTLE_DURATION = 1500;
/** How far one turn of the mouse wheel goes, in pixels. */
export const ZOOM_DELTA = 100;
/**
 * The directory to save the views of the cave in, if the environment names
 * one.
 */
export const SCREENSHOT_DIR: string | undefined =
  process.env.CLOVERVALE_SCREENSHOTS;
/** The language the pages speak unless told otherwise. */
export const PAGE_LANGUAGE = 'en';
/** The name of the language control of the panel in English. */
export const LANGUAGE_CONTROL = 'Language';
/** The name of Traditional Chinese, as the language control offers it. */
export const ZH_TW_NAME = '正體中文';
/** The name of English, as the language control offers it. */
export const EN_NAME = 'English';
/** The title of the help sheet, and its button that closes it. */
export const HELP_WORDS = {
  title: 'Controls',
  ok: 'OK',
  keyboard: 'Keyboard and mouse',
  gamepad: 'Gamepad',
} as const;
/** The title of the help sheet, and its button, in Traditional Chinese. */
export const ZH_TW_HELP_WORDS = {
  title: '操作說明',
  ok: '確認',
  gamepad: '搖桿',
} as const;
/** The title of the welcome before the help sheet on the first visit. */
export const WELCOME_TITLE = 'Welcome to Clovervale.';
/** The line at the foot of the welcome, on a page used by the keyboard. */
export const WELCOME_HINT = 'Press any key to continue';
/** How many pages the help sheet has before the ending. */
export const HELP_PAGE_COUNT = 3;
/** The page of the credits of the help sheet, once the ending is shown. */
export const CREDITS_PAGE = 3;
/** How many controls the help sheet lists on the page of the keyboard. */
export const KEYBOARD_CONTROL_COUNT = 9;
/** The key values WebDriver gives the keys the help sheet takes. */
export const HELP_KEYS = {
  help: 'h',
  enter: '\uE007',
  escape: '\uE00C',
  left: '\uE012',
  right: '\uE014',
} as const;
/** The version of the game, as its package tells. */
export const GAME_VERSION: string = (
  JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
    readonly version: string;
  }
).version;
/** The words of the ending sheet in English. */
export const ENDING_WORDS = {
  text:
    'With the evidence and the intelligence in hand, you set off for the ' +
    'capital of the kingdom.',
  end: 'The End',
  title: 'Credits',
  lines: [
    'Clovervale',
    `Version ${GAME_VERSION}`,
    'Author',
    'imacat',
    'AI assistance',
    'Claude Code (Anthropic)',
    'Gemini (Google)',
    'Music',
    '“Embers on the Flagstone”',
    'by Kaazoom, from Pixabay',
    'Pixabay Content License',
    'Libraries',
    'three.js — MIT License',
    'lil-gui — MIT License',
    'License',
    'This game project is licensed under the Apache License 2.0; the music ' +
      'and the libraries are under their own licenses.',
  ],
} as const;
/** The notice of the healing potion found in a barrel. */
export const POTION_NOTICE = 'You got a healing potion';
/** How the bag of a player without silver coins tells them, in English. */
export const NO_SILVER_LABEL = '0 silver coins';
/** The name of the language control of the panel in Traditional Chinese. */
export const ZH_TW_LANGUAGE_CONTROL = '語言';
/** The least height of the foot of a speech bubble, in meters. */
export const SPEECH_LEAST_HEIGHT = 1;
/**
 * How long the bubble of what Nancy says may take to go away, in
 * milliseconds, which is well over the time it takes to read it.
 */
export const SPEECH_TIMEOUT = 30_000;
/**
 * The time of day the game server of the check holds its clock at, so that
 * every check sees the village as it is at noon, whenever it runs.
 */
export const HELD_TIME = '12:00';
/** The name of the switch of the panel that previews a time of day. */
export const PREVIEW_CONTROL = 'Time preview';
/** The name of the control of the panel that sets the hour previewed. */
export const PREVIEW_HOUR_CONTROL = 'Time';
/** Midnight, the hour previewed, as the control of the panel shows it. */
export const NIGHT_CLOCK = '00:00';
/**
 * The length of the day of the game server whose clock runs, in minutes:
 * long enough for the pages to load in daylight.
 */
export const RUNNING_DAY_MINUTES = 10;
/**
 * How long Toby may take to be seen to find a four-leaf clover, in
 * milliseconds: more than three of his visits to each patch, of which a
 * patch he has taken the clover of regrows its clover in time for the
 * third.
 */
export const TOBY_FIND_TIMEOUT = 60_000;

/**
 * The keys that walk a player each way in the first view, by the turn of
 * the way from +Z toward +X, in steps of 45 degrees from 0.
 */
export const TURN_KEYS: readonly (readonly string[])[] = [
  ['s'],
  ['s', 'd'],
  ['d'],
  ['w', 'd'],
  ['w'],
  ['w', 'a'],
  ['a'],
  ['s', 'a'],
];

/** How far one turn of the mouse wheel zooms, as a factor of distance. */
export const ZOOM_STEP_FACTOR = 0.95;

/** Where Toby squats at the patch of clover by the gate. */
export const TOBY_SQUAT: GroundVector = TOBY_ENDS[1];
/**
 * Where a player stands to talk to Toby as he picks at the patch of clover
 * by the gate: beyond the patch from where he squats, out of his way.
 */
export const BY_TOBY: GroundVector = (() => {
  const patch: GroundVector = CLOVER_PATCHES[TOBY_PATCHES[1]] ?? TOBY_SQUAT;
  const [first, second] = TOBY_ENDS;
  const apart: number = Math.hypot(second.x - first.x, second.z - first.z);
  return {
    x: patch.x + ((second.x - first.x) / apart) * 0.8,
    z: patch.z + ((second.z - first.z) / apart) * 0.8,
  };
})();

/** The size of the screen of a phone held upright, in CSS pixels. */
export const PORTRAIT_VIEWPORT = { width: 384, height: 832 } as const;
/** The size of the screen of a phone held on its side, in CSS pixels. */
export const LANDSCAPE_VIEWPORT = { width: 832, height: 384 } as const;
/** The pixels of the screen of the phone to each CSS pixel. */
export const PHONE_PIXEL_RATIO = 2;
