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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/gamepad Tests for reading the gamepads.
 */

import { describe, expect, it } from 'vitest';

import { CAMERA_ORBIT_RATE, CAMERA_TILT_RATE } from '../src/camera-keys.ts';
import type { CameraTurn } from '../src/camera-keys.ts';
import {
  CHOICE_REPEAT_DELAY,
  CHOICE_REPEAT_INTERVAL,
  Gamepads,
  TURN_DEAD_ZONE,
  WALK_DEAD_ZONE,
  ZOOM_RATE,
  findPadKey,
} from '../src/gamepad.ts';
import type { PadButton, PadState, PadWalk } from '../src/gamepad.ts';

/** The buttons of a pad of the standard mapping, by their names. */
const BUTTONS = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  back: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** How a fake pad is held. */
interface FakeHold {
  /** The names of the buttons held down. */
  readonly buttons?: readonly (keyof typeof BUTTONS)[];
  /** The left stick, right and down positive. */
  readonly left?: readonly [number, number];
  /** The right stick, right and down positive. */
  readonly right?: readonly [number, number];
  /** The place of the pad among those of the browser. */
  readonly index?: number;
  /** The mapping of the pad. */
  readonly mapping?: string;
  /** Whether the pad is connected. */
  readonly connected?: boolean;
}

/**
 * Makes the state of a fake pad, as the browser tells it.
 *
 * @param {FakeHold} hold - How the pad is held.
 * @returns {PadState} The state.
 */
function createPad(hold: FakeHold = {}): PadState {
  const held: ReadonlySet<number> = new Set(
    (hold.buttons ?? []).map((name: keyof typeof BUTTONS) => BUTTONS[name]),
  );
  return {
    index: hold.index ?? 0,
    connected: hold.connected ?? true,
    mapping: hold.mapping ?? 'standard',
    axes: [...(hold.left ?? [0, 0]), ...(hold.right ?? [0, 0])],
    buttons: Array.from({ length: 17 }, (_: unknown, index: number) => ({
      pressed: held.has(index),
    })),
  };
}

/**
 * Reads one pad held so, for a frame of a sixtieth of a second.
 *
 * @param {Gamepads} pads - The reader.
 * @param {FakeHold} hold - How the pad is held.
 * @returns {PadButton[]} The buttons pressed.
 */
function readHold(pads: Gamepads, hold: FakeHold = {}): PadButton[] {
  return pads.readPads([createPad(hold)], 1 / 60);
}

/**
 * Finds how one pad held so walks the player.
 *
 * @param {readonly [number, number]} left - The left stick.
 * @returns {PadWalk} The walk.
 */
function resolveStick(left: readonly [number, number]): PadWalk {
  const pads = new Gamepads();
  readHold(pads, { left });
  return pads.resolveWalk();
}

describe('reading the buttons of the gamepads', () => {
  it('tells each button pressed once per press', () => {
    const pads = new Gamepads();
    expect(readHold(pads)).toEqual([]);
    expect(readHold(pads, { buttons: ['a'] })).toEqual(['a']);
    expect(readHold(pads, { buttons: ['a'] })).toEqual([]);
    expect(readHold(pads)).toEqual([]);
    expect(readHold(pads, { buttons: ['a'] })).toEqual(['a']);
  });

  it('tells the buttons the game uses, by their standard places', () => {
    const pads = new Gamepads();
    const all: PadButton[] = readHold(pads, {
      buttons: [
        'a',
        'b',
        'x',
        'y',
        'lb',
        'rb',
        'back',
        'start',
        'dpadUp',
        'dpadDown',
        'dpadLeft',
        'dpadRight',
      ],
    });
    expect(all).toEqual(['a', 'b', 'y', 'lb', 'rb', 'start']);
  });

  it('ignores the D-pad', () => {
    const pads = new Gamepads();
    expect(
      readHold(pads, {
        buttons: ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'],
      }),
    ).toEqual([]);
  });

  it('does not repeat a button held', () => {
    const pads = new Gamepads();
    const hold: PadState = createPad({ buttons: ['a', 'lb'] });
    expect(pads.readPads([hold], 0)).toEqual(['a', 'lb']);
    expect(pads.readPads([hold], CHOICE_REPEAT_DELAY + 1)).toEqual([]);
  });

  it('tells the presses of each pad on its own', () => {
    const pads = new Gamepads();
    pads.readPads([createPad({ buttons: ['a'] })], 0);
    expect(
      pads.readPads(
        [
          createPad({ buttons: ['a'] }),
          createPad({ index: 1, buttons: ['a'] }),
        ],
        0,
      ),
    ).toEqual(['a']);
  });

  it('ignores the pads without the standard mapping, or disconnected', () => {
    const pads = new Gamepads();
    expect(
      pads.readPads(
        [
          null,
          createPad({ mapping: '', buttons: ['a'], left: [1, 0] }),
          createPad({ index: 2, connected: false, buttons: ['b'] }),
        ],
        0,
      ),
    ).toEqual([]);
    expect(pads.resolveWalk()).toEqual({ ahead: 0, aside: 0 });
  });

  it('tells a button again once its pad comes back', () => {
    const pads = new Gamepads();
    readHold(pads, { buttons: ['b'] });
    pads.readPads([], 0);
    expect(readHold(pads, { buttons: ['b'] })).toEqual(['b']);
  });
});

describe('choosing with the left stick', () => {
  it('tells a push beyond the dead zone as the way it is pushed most', () => {
    const pads = new Gamepads();
    expect(readHold(pads, { left: [0, -1] })).toEqual(['up']);
    expect(readHold(pads, { left: [0, -1] })).toEqual([]);
    readHold(pads);
    expect(readHold(pads, { left: [0, 1] })).toEqual(['down']);
    readHold(pads);
    expect(readHold(pads, { left: [-0.9, 0.3] })).toEqual(['left']);
    readHold(pads);
    expect(readHold(pads, { left: [0.9, -0.3] })).toEqual(['right']);
  });

  it('tells nothing within the dead zone', () => {
    const pads = new Gamepads();
    expect(readHold(pads, { left: [0, WALK_DEAD_ZONE - 0.01] })).toEqual([]);
  });

  it('repeats a push held, after a delay', () => {
    const pads = new Gamepads();
    const hold: PadState = createPad({ left: [0, 1] });
    expect(pads.readPads([hold], 0)).toEqual(['down']);
    expect(pads.readPads([hold], CHOICE_REPEAT_DELAY - 0.01)).toEqual([]);
    expect(pads.readPads([hold], 0.02)).toEqual(['down']);
    expect(pads.readPads([hold], CHOICE_REPEAT_INTERVAL - 0.03)).toEqual([]);
    expect(pads.readPads([hold], 0.04)).toEqual(['down']);
  });

  it('tells a new way at once when the push turns', () => {
    const pads = new Gamepads();
    readHold(pads, { left: [0, 1] });
    expect(readHold(pads, { left: [1, 0] })).toEqual(['right']);
  });

  it('starts the delay afresh on every push', () => {
    const pads = new Gamepads();
    const hold: PadState = createPad({ left: [0, -1] });
    pads.readPads([hold], 0);
    pads.readPads([hold], CHOICE_REPEAT_DELAY - 0.1);
    pads.readPads([createPad()], 0.01);
    expect(pads.readPads([hold], 0.01)).toEqual(['up']);
    expect(pads.readPads([hold], 0.2)).toEqual([]);
  });
});

describe('choosing with a left stick held from play', () => {
  it('chooses nothing until the stick has come back to the centre', () => {
    const pads = new Gamepads();
    const hold: PadState = createPad({ left: [0, -1] });
    pads.readPads([hold], 0);
    pads.readPads([hold], CHOICE_REPEAT_DELAY + 1);
    pads.holdStickChoice();
    expect(pads.readPads([hold], 0.01)).toEqual([]);
    expect(pads.readPads([hold], CHOICE_REPEAT_DELAY + 1)).toEqual([]);
    expect(pads.readPads([createPad({ left: [1, 0] })], 0.01)).toEqual([]);
    expect(readHold(pads)).toEqual([]);
    expect(pads.readPads([hold], 0.01)).toEqual(['up']);
    expect(pads.readPads([hold], CHOICE_REPEAT_DELAY - 0.02)).toEqual([]);
    expect(pads.readPads([hold], 0.02)).toEqual(['up']);
  });

  it('still walks the player with the stick held so', () => {
    const pads = new Gamepads();
    readHold(pads, { left: [0, -1] });
    pads.holdStickChoice();
    readHold(pads, { left: [0, -1] });
    expect(pads.resolveWalk()).toEqual({ ahead: 1, aside: 0 });
  });

  it('chooses at once with a stick at rest when the choice opens', () => {
    const pads = new Gamepads();
    readHold(pads);
    pads.holdStickChoice();
    expect(readHold(pads, { left: [0, 1] })).toEqual(['down']);
  });
});

/** No walk along an axis, which either zero tells. */
const NONE: number = expect.closeTo(0) as number;

describe('walking with the left stick', () => {
  it('stands still within the dead zone', () => {
    expect(resolveStick([0, 0])).toEqual({ ahead: 0, aside: 0 });
    expect(resolveStick([WALK_DEAD_ZONE - 0.01, 0])).toEqual({
      ahead: 0,
      aside: 0,
    });
    expect(resolveStick([0.15, -0.15])).toEqual({ ahead: 0, aside: 0 });
  });

  it('walks in the eight directions the stick is nearest to', () => {
    expect(resolveStick([0, -1])).toEqual({ ahead: 1, aside: 0 });
    expect(resolveStick([0, 1])).toEqual({ ahead: -1, aside: 0 });
    expect(resolveStick([1, 0])).toEqual({ ahead: NONE, aside: 1 });
    expect(resolveStick([-1, 0])).toEqual({ ahead: NONE, aside: -1 });
    expect(resolveStick([0.7, -0.7])).toEqual({ ahead: 1, aside: 1 });
    expect(resolveStick([-0.7, 0.7])).toEqual({ ahead: -1, aside: -1 });
    expect(resolveStick([0.3, -0.9])).toEqual({ ahead: 1, aside: 0 });
    expect(resolveStick([0.5, -0.6])).toEqual({ ahead: 1, aside: 1 });
  });

  it('walks however lightly the stick is pushed beyond the dead zone', () => {
    expect(resolveStick([0, -(WALK_DEAD_ZONE + 0.05)])).toEqual({
      ahead: 1,
      aside: 0,
    });
  });

  it('stops once the pad is gone', () => {
    const pads = new Gamepads();
    readHold(pads, { left: [0, -1] });
    pads.readPads([], 1 / 60);
    expect(pads.resolveWalk()).toEqual({ ahead: 0, aside: 0 });
  });

  it('holds still while paused', () => {
    const pads = new Gamepads();
    readHold(pads, { left: [0, -1] });
    pads.isPaused = true;
    expect(pads.resolveWalk()).toEqual({ ahead: 0, aside: 0 });
    pads.isPaused = false;
    expect(pads.resolveWalk()).toEqual({ ahead: 1, aside: 0 });
  });
});

describe('turning the view with the right stick', () => {
  /**
   * Finds how far one pad held so turns the camera in a second.
   *
   * @param {readonly [number, number]} right - The right stick.
   * @returns {CameraTurn} The turn.
   */
  const resolveTurn = (right: readonly [number, number]): CameraTurn => {
    const pads = new Gamepads();
    readHold(pads, { right });
    return pads.resolveTurn(1);
  };

  it('does not turn within the dead zone', () => {
    expect(resolveTurn([TURN_DEAD_ZONE - 0.01, 0])).toEqual({
      orbit: 0,
      tilt: 0,
    });
    const pads = new Gamepads();
    readHold(pads, { right: [0.1, 0.1] });
    expect(pads.isHeld).toBe(false);
  });

  it('turns towards where the stick is pushed, as the arrows do', () => {
    expect(resolveTurn([1, 0])).toEqual({ orbit: CAMERA_ORBIT_RATE, tilt: 0 });
    expect(resolveTurn([-1, 0])).toEqual({
      orbit: -CAMERA_ORBIT_RATE,
      tilt: 0,
    });
    expect(resolveTurn([0, -1])).toEqual({ orbit: 0, tilt: -CAMERA_TILT_RATE });
    expect(resolveTurn([0, 1])).toEqual({ orbit: 0, tilt: CAMERA_TILT_RATE });
  });

  it('turns in proportion to the push beyond the dead zone', () => {
    const half: number = TURN_DEAD_ZONE + (1 - TURN_DEAD_ZONE) / 2;
    const turn: CameraTurn = resolveTurn([half, 0]);
    expect(turn.orbit).toBeCloseTo(CAMERA_ORBIT_RATE / 2);
    expect(turn.tilt).toBe(0);
  });

  it('turns no faster than the arrows', () => {
    const turn: CameraTurn = resolveTurn([1, 1]);
    expect(turn.orbit).toBeLessThanOrEqual(CAMERA_ORBIT_RATE);
    expect(turn.tilt).toBeLessThanOrEqual(CAMERA_TILT_RATE);
    expect(turn.orbit).toBeGreaterThan(0);
    expect(turn.tilt).toBeGreaterThan(0);
  });

  it('tells whether the owner holds the camera with the stick', () => {
    const pads = new Gamepads();
    readHold(pads, { right: [0.8, 0] });
    expect(pads.isHeld).toBe(true);
    pads.isPaused = true;
    expect(pads.isHeld).toBe(false);
    expect(pads.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
    pads.isPaused = false;
    pads.readPads([], 1 / 60);
    expect(pads.isHeld).toBe(false);
    expect(pads.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
  });
});

describe('zooming with the shoulder buttons', () => {
  it('does not zoom without them', () => {
    const pads = new Gamepads();
    readHold(pads);
    expect(pads.resolveZoom(1)).toBe(1);
  });

  it('zooms out with LB and in with RB, steadily', () => {
    const pads = new Gamepads();
    readHold(pads, { buttons: ['lb'] });
    expect(pads.resolveZoom(1)).toBeCloseTo(ZOOM_RATE);
    expect(pads.resolveZoom(0.5)).toBeCloseTo(Math.sqrt(ZOOM_RATE));
    readHold(pads, { buttons: ['rb'] });
    expect(pads.resolveZoom(1)).toBeCloseTo(1 / ZOOM_RATE);
    readHold(pads, { buttons: ['lb', 'rb'] });
    expect(pads.resolveZoom(1)).toBe(1);
  });

  it('does not zoom while paused, or once the pad is gone', () => {
    const pads = new Gamepads();
    readHold(pads, { buttons: ['lb'] });
    pads.isPaused = true;
    expect(pads.resolveZoom(1)).toBe(1);
    pads.isPaused = false;
    pads.readPads([], 1 / 60);
    expect(pads.resolveZoom(1)).toBe(1);
  });
});

describe('the keys the buttons act as', () => {
  it('acts as the keys of play while nothing is open', () => {
    expect(findPadKey('a', 'play')).toBe('Space');
    expect(findPadKey('b', 'play')).toBe('Escape');
    expect(findPadKey('y', 'play')).toBe('KeyI');
    expect(findPadKey('start', 'play')).toBe('KeyH');
    for (const button of ['lb', 'rb', 'up', 'down', 'left', 'right'] as const) {
      expect(findPadKey(button, 'play')).toBeNull();
    }
  });

  it('chooses and confirms in the bag and in dialogues', () => {
    expect(findPadKey('a', 'choice')).toBe('Enter');
    expect(findPadKey('b', 'choice')).toBe('Escape');
    expect(findPadKey('y', 'choice')).toBe('KeyI');
    expect(findPadKey('start', 'choice')).toBe('KeyH');
    expect(findPadKey('up', 'choice')).toBe('ArrowUp');
    expect(findPadKey('down', 'choice')).toBe('ArrowDown');
    expect(findPadKey('left', 'choice')).toBe('ArrowLeft');
    expect(findPadKey('right', 'choice')).toBe('ArrowRight');
    expect(findPadKey('lb', 'choice')).toBeNull();
    expect(findPadKey('rb', 'choice')).toBeNull();
  });

  it('turns the pages of the help sheet with LB and RB', () => {
    expect(findPadKey('lb', 'help')).toBe('ArrowLeft');
    expect(findPadKey('rb', 'help')).toBe('ArrowRight');
    expect(findPadKey('b', 'help')).toBe('Escape');
    expect(findPadKey('start', 'help')).toBe('KeyH');
    expect(findPadKey('a', 'help')).toBe('Enter');
    for (const button of ['up', 'down', 'left', 'right'] as const) {
      expect(findPadKey(button, 'help')).toBeNull();
    }
  });
});

describe('telling fresh input on the gamepads', () => {
  it('tells each fresh press of any button, once per press', () => {
    const pads = new Gamepads();
    readHold(pads);
    expect(pads.isNudged).toBe(false);
    for (const button of ['a', 'x', 'back', 'dpadUp'] as const) {
      readHold(pads, { buttons: [button] });
      expect(pads.isNudged).toBe(true);
      readHold(pads, { buttons: [button] });
      expect(pads.isNudged).toBe(false);
      readHold(pads);
      expect(pads.isNudged).toBe(false);
    }
  });

  it('tells each stick leaving its dead zone, once per push', () => {
    const pads = new Gamepads();
    for (const hold of [{ left: [1, 0] }, { right: [0, -1] }] as const) {
      readHold(pads, hold);
      expect(pads.isNudged).toBe(true);
      readHold(pads, hold);
      expect(pads.isNudged).toBe(false);
      readHold(pads);
      expect(pads.isNudged).toBe(false);
    }
  });

  it('ignores a stick within its dead zone', () => {
    const pads = new Gamepads();
    readHold(pads, { left: [WALK_DEAD_ZONE, 0], right: [TURN_DEAD_ZONE, 0] });
    expect(pads.isNudged).toBe(false);
  });

  it('tells fresh input while paused', () => {
    const pads = new Gamepads();
    pads.isPaused = true;
    readHold(pads, { buttons: ['lb'] });
    expect(pads.isNudged).toBe(true);
  });
});
