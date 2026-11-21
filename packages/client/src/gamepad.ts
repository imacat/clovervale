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
 * @module client/gamepad Turning the gamepads, as the browser tells them
 *   at every frame, into what the person at the page wants.
 */

import { CAMERA_ORBIT_RATE, CAMERA_TILT_RATE } from './camera-keys.ts';
import type { CameraHold, CameraTurn } from './camera-keys.ts';

/** A button of a gamepad, as the browser tells it. */
export interface PadButtonState {
  /** Whether the button is pressed. */
  readonly pressed: boolean;
}

/**
 * A gamepad, as the browser tells it at a moment, as a `Gamepad` of the
 * Gamepad API does.
 */
export interface PadState {
  /**
   * The place of the pad among those of the browser, for as long as the pad
   * stays connected.
   */
  readonly index: number;
  /** Whether the pad is still connected. */
  readonly connected: boolean;
  /** The layout of the buttons and the axes, `standard` for the standard. */
  readonly mapping: string;
  /** The axes, each from -1 to 1. */
  readonly axes: readonly number[];
  /** The buttons. */
  readonly buttons: readonly PadButtonState[];
}

/**
 * A button of a gamepad the game uses: A, B and Y; LB and RB, the left and
 * right shoulder buttons; Start; and the left stick pushed up, down, left
 * or right, which tells as a button too, for choosing.
 */
export type PadButton =
  | 'a'
  | 'b'
  | 'y'
  | 'lb'
  | 'rb'
  | 'start'
  | 'up'
  | 'down'
  | 'left'
  | 'right';

/**
 * What is open on the page, as it tells what the buttons do: nothing, the
 * help sheet, or the bag or a dialogue to choose in.
 */
export type PadScreen = 'play' | 'help' | 'choice';

/**
 * Which way the left stick walks the player, as the walking keys do: each
 * part 1, 0 or -1.
 */
export interface PadWalk {
  /** Forwards positive, the way the camera looks, and backwards negative. */
  readonly ahead: number;
  /** To the right positive, and to the left negative. */
  readonly aside: number;
}

/**
 * How far the left stick is to be pushed before it walks the player, as a
 * share of its full push.
 */
export const WALK_DEAD_ZONE = 0.3;
/**
 * How far the right stick is to be pushed before it turns the view, as a
 * share of its full push.
 */
export const TURN_DEAD_ZONE = 0.2;
/**
 * How many times farther LB takes the camera from what it looks at in a
 * second, and how many times nearer RB brings it.
 */
export const ZOOM_RATE = 2;
/** How long the left stick is held pushed before it repeats, in seconds. */
export const CHOICE_REPEAT_DELAY = 0.4;
/** How long the left stick held pushed waits between repeats, in seconds. */
export const CHOICE_REPEAT_INTERVAL = 0.15;

/** The places of the buttons the game uses, in the standard mapping. */
const BUTTON_PLACES: readonly (readonly [PadButton, number])[] = [
  ['a', 0],
  ['b', 1],
  ['y', 3],
  ['lb', 4],
  ['rb', 5],
  ['start', 9],
];

/** The buttons that repeat while held: the ways of the left stick. */
const REPEATED: ReadonlySet<PadButton> = new Set([
  'up',
  'down',
  'left',
  'right',
]);

/** The keys the left stick acts as in the bag and in dialogues. */
const CHOICE_KEYS: Readonly<Partial<Record<PadButton, string>>> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/** The keys LB and RB act as on the help sheet. */
const HELP_KEYS: Readonly<Partial<Record<PadButton, string>>> = {
  lb: 'ArrowLeft',
  rb: 'ArrowRight',
};

/** The keys the other buttons act as, wherever they are pressed. */
const BUTTON_KEYS: Readonly<Partial<Record<PadButton, string>>> = {
  b: 'Escape',
  y: 'KeyI',
  start: 'KeyH',
};

/** The places of the axes of the sticks, in the standard mapping. */
const AXES = { leftX: 0, leftY: 1, rightX: 2, rightY: 3 } as const;

/** No walk. */
const STANDING: PadWalk = { ahead: 0, aside: 0 };

/** No turn. */
const NO_TURN: CameraTurn = { orbit: 0, tilt: 0 };

/** A gamepad as it was last read. */
interface ReadPad {
  /** The buttons held down. */
  readonly held: ReadonlySet<PadButton>;
  /** The time each button that repeats has been held, in seconds. */
  readonly heldTimes: ReadonlyMap<PadButton, number>;
  /** Which way the left stick walks the player. */
  readonly walk: PadWalk;
  /** The right stick, beyond its dead zone, each part from -1 to 1. */
  readonly turnX: number;
  /** The right stick, beyond its dead zone, downwards positive. */
  readonly turnY: number;
  /**
   * Whether the left stick is held from choosing until it comes back within
   * its dead zone.
   */
  readonly isStickHeld: boolean;
  /**
   * The places of all the buttons held down, and `-1` and `-2` for the
   * left and the right sticks pushed beyond their dead zones.
   */
  readonly touched: ReadonlySet<number>;
}

/**
 * The gamepads of the standard mapping connected to the browser, as last
 * read: each button tells once per press; the left stick walks the player
 * in the eight directions of the walking keys, and tells as a button too,
 * the way it is pushed most, once per push and repeating while held after
 * a delay, for choosing in the bag and in dialogues; the right stick turns the view as the
 * arrow keys do, in proportion to its push; and LB and RB held zoom out
 * and in.  A pad that is gone holds nothing any more.  While paused, the
 * sticks and the shoulder buttons do nothing, and the buttons still tell
 * their presses.
 */
export class Gamepads implements CameraHold {
  /**
   * Whether the sticks and the shoulder buttons are held from play, as
   * while the bag, the help sheet or a dialogue is open.
   */
  isPaused = false;
  #pads = new Map<number, ReadPad>();
  #isNudged = false;

  /**
   * Whether the last read found fresh input on a pad, even while paused:
   * any button pressed, or a stick pushed beyond its dead zone, that was
   * not so at the read before.
   *
   * @returns {boolean} Whether there was fresh input.
   */
  get isNudged(): boolean {
    return this.#isNudged;
  }

  /**
   * Whether the owner holds the camera with a pad now.
   *
   * @returns {boolean} Whether the right stick of a pad is pushed beyond its
   *   dead zone, while not paused.
   */
  get isHeld(): boolean {
    if (this.isPaused) {
      return false;
    }
    return [...this.#pads.values()].some(
      (pad: ReadPad) => pad.turnX !== 0 || pad.turnY !== 0,
    );
  }

  /**
   * Reads the gamepads as the browser tells them now.
   *
   * @param {readonly (PadState | null)[]} states - The pads, as from
   *   `navigator.getGamepads()`; those not connected, or not of the
   *   standard mapping, do not count.
   * @param {number} seconds - The time since the pads were last read, in
   *   seconds.
   * @returns {PadButton[]} The buttons pressed since the pads were last
   *   read, once for each pad that pressed them, the left stick pushed
   *   beyond its dead zone as the way it is pushed most, and the left
   *   stick held long enough to repeat.
   */
  readPads(
    states: readonly (PadState | null)[],
    seconds: number,
  ): PadButton[] {
    const pressed: PadButton[] = [];
    const pads = new Map<number, ReadPad>();
    let isNudged = false;
    for (const state of states) {
      if (
        state === null ||
        !state.connected ||
        state.mapping !== 'standard' ||
        pads.has(state.index)
      ) {
        continue;
      }
      const last: ReadPad | undefined = this.#pads.get(state.index);
      const leftX: number = readAxis(state, AXES.leftX);
      const leftY: number = readAxis(state, AXES.leftY);
      const inputs: PadButton[] = BUTTON_PLACES.filter(
        ([, place]: readonly [PadButton, number]) =>
          state.buttons[place]?.pressed === true,
      ).map(([button]: readonly [PadButton, number]) => button);
      const stick: PadButton | null = findStickWay(leftX, leftY);
      const isStickHeld: boolean =
        stick !== null && last?.isStickHeld === true;
      if (stick !== null && !isStickHeld) {
        inputs.push(stick);
      }
      const held = new Set<PadButton>();
      const heldTimes = new Map<PadButton, number>();
      for (const button of inputs) {
        held.add(button);
        if (last?.held.has(button) !== true) {
          pressed.push(button);
          heldTimes.set(button, 0);
          continue;
        }
        if (!REPEATED.has(button)) {
          continue;
        }
        const before: number = last.heldTimes.get(button) ?? 0;
        const after: number = before + seconds;
        heldTimes.set(button, after);
        if (countRepeats(after) > countRepeats(before)) {
          pressed.push(button);
        }
      }
      const [turnX, turnY] = scaleStick(
        readAxis(state, AXES.rightX),
        readAxis(state, AXES.rightY),
        TURN_DEAD_ZONE,
      );
      const touched = new Set<number>();
      state.buttons.forEach((button: PadButtonState, place: number) => {
        if (button.pressed) {
          touched.add(place);
        }
      });
      if (Math.hypot(leftX, leftY) > WALK_DEAD_ZONE) {
        touched.add(-1);
      }
      if (turnX !== 0 || turnY !== 0) {
        touched.add(-2);
      }
      for (const place of touched) {
        if (last?.touched.has(place) !== true) {
          isNudged = true;
        }
      }
      pads.set(state.index, {
        held,
        heldTimes,
        walk: resolveStickWalk(leftX, leftY),
        turnX,
        turnY,
        isStickHeld,
        touched,
      });
    }
    this.#pads = pads;
    this.#isNudged = isNudged;
    return pressed;
  }

  /**
   * Holds the left sticks pushed now from choosing, as when the bag or a
   * dialogue opens: each tells as a button again only once it has come back
   * within its dead zone and is pushed afresh.  It still walks the player
   * while not paused.
   */
  holdStickChoice(): void {
    for (const [index, pad] of this.#pads) {
      const isStickHeld: boolean =
        pad.walk.ahead !== 0 || pad.walk.aside !== 0;
      this.#pads.set(index, { ...pad, isStickHeld });
    }
  }

  /**
   * Resolves which way the left sticks walk the player.
   *
   * @returns {PadWalk} The walk of the first pad whose left stick is pushed
   *   beyond its dead zone, or none while paused.
   */
  resolveWalk(): PadWalk {
    if (this.isPaused) {
      return STANDING;
    }
    for (const pad of this.#pads.values()) {
      if (pad.walk.ahead !== 0 || pad.walk.aside !== 0) {
        return pad.walk;
      }
    }
    return STANDING;
  }

  /**
   * Resolves how far the right sticks turn the camera over some time: at
   * most as fast as the arrow keys, to where they are pushed.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {CameraTurn} The turn, which is none while paused.
   */
  resolveTurn(seconds: number): CameraTurn {
    if (this.isPaused) {
      return NO_TURN;
    }
    let x = 0;
    let y = 0;
    for (const pad of this.#pads.values()) {
      x += pad.turnX;
      y += pad.turnY;
    }
    return {
      orbit: clampUnit(x) * CAMERA_ORBIT_RATE * seconds + 0,
      tilt: clampUnit(y) * CAMERA_TILT_RATE * seconds + 0,
    };
  }

  /**
   * Resolves how far the shoulder buttons held zoom over some time.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {number} How many times farther the camera is to be from what
   *   it looks at: above 1 to zoom out, below 1 to zoom in, and 1 while
   *   paused, or while neither or both of LB and RB are held.
   */
  resolveZoom(seconds: number): number {
    if (this.isPaused) {
      return 1;
    }
    const pads: ReadPad[] = [...this.#pads.values()];
    const isOut: boolean = pads.some((pad: ReadPad) => pad.held.has('lb'));
    const isIn: boolean = pads.some((pad: ReadPad) => pad.held.has('rb'));
    if (isOut === isIn) {
      return 1;
    }
    return ZOOM_RATE ** ((isOut ? 1 : -1) * seconds);
  }
}

/**
 * Finds the key a button pressed acts as: A as the space bar, or as Enter
 * on the help sheet, in the bag and in dialogues; B as Esc; Y as I; Start as H; the left stick
 * pushed as the arrow keys in the bag and in dialogues; and LB and RB as
 * the left and right arrows on the help sheet.
 *
 * @param {PadButton} button - The button.
 * @param {PadScreen} screen - What is open on the page.
 * @returns {string | null} The code of the key, as in a keyboard event, or
 *   `null` if the button acts as no key there.
 */
export function findPadKey(
  button: PadButton,
  screen: PadScreen,
): string | null {
  if (button === 'a') {
    return screen === 'play' ? 'Space' : 'Enter';
  }
  const keys: Readonly<Partial<Record<PadButton, string>>> =
    screen === 'choice' ? CHOICE_KEYS : screen === 'help' ? HELP_KEYS : {};
  return keys[button] ?? BUTTON_KEYS[button] ?? null;
}

/**
 * Finds the way a left stick is pushed most, as the button it tells as,
 * once it is pushed beyond its dead zone.
 *
 * @param {number} x - The stick, to the right positive.
 * @param {number} y - The stick, downwards positive.
 * @returns {PadButton | null} The way, or `null` within the dead zone.
 */
function findStickWay(x: number, y: number): PadButton | null {
  if (Math.hypot(x, y) <= WALK_DEAD_ZONE) {
    return null;
  }
  if (Math.abs(x) > Math.abs(y)) {
    return x > 0 ? 'right' : 'left';
  }
  return y > 0 ? 'down' : 'up';
}

/**
 * Counts how many times a button that repeats has repeated after it has
 * been held for some time.
 *
 * @param {number} time - The time it has been held, in seconds.
 * @returns {number} The number of repeats.
 */
function countRepeats(time: number): number {
  if (time < CHOICE_REPEAT_DELAY) {
    return 0;
  }
  return Math.floor((time - CHOICE_REPEAT_DELAY) / CHOICE_REPEAT_INTERVAL) + 1;
}

/**
 * Reads an axis of a pad.
 *
 * @param {PadState} state - The pad.
 * @param {number} place - The place of the axis.
 * @returns {number} The axis, from -1 to 1, or 0 if the pad has no such
 *   axis.
 */
function readAxis(state: PadState, place: number): number {
  const value: number | undefined = state.axes[place];
  return value === undefined || Number.isNaN(value) ? 0 : clampUnit(value);
}

/**
 * Keeps a number from -1 to 1.
 *
 * @param {number} value - The number.
 * @returns {number} The number kept so.
 */
function clampUnit(value: number): number {
  return Math.min(Math.max(value, -1), 1);
}

/**
 * Scales a stick beyond its dead zone, so that its push grows from nothing
 * at the edge of the zone to its full at the full push, in the direction it
 * is pushed.
 *
 * @param {number} x - The stick, to the right positive.
 * @param {number} y - The stick, downwards positive.
 * @param {number} deadZone - The dead zone, as a share of the full push.
 * @returns {[number, number]} The stick scaled, the push at most 1.
 */
export function scaleStick(
  x: number,
  y: number,
  deadZone: number,
): [number, number] {
  const push: number = Math.hypot(x, y);
  if (push <= deadZone) {
    return [0, 0];
  }
  const scale: number = Math.min((push - deadZone) / (1 - deadZone), 1) / push;
  return [x * scale, y * scale];
}

/**
 * Resolves which way a left stick walks the player: the nearest of the
 * eight directions of the walking keys, once it is pushed beyond its dead
 * zone.
 *
 * @param {number} x - The stick, to the right positive.
 * @param {number} y - The stick, downwards positive.
 * @returns {PadWalk} The walk.
 */
export function resolveStickWalk(x: number, y: number): PadWalk {
  if (Math.hypot(x, y) <= WALK_DEAD_ZONE) {
    return STANDING;
  }
  const eighth: number = Math.PI / 4;
  const angle: number = Math.round(Math.atan2(-y, x) / eighth) * eighth;
  // Adding zero turns a negative zero into a plain one.
  return {
    ahead: Math.round(Math.sin(angle)) + 0,
    aside: Math.round(Math.cos(angle)) + 0,
  };
}
