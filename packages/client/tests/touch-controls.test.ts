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
 * @module client/tests/touch-controls Tests for reading the fingers on the
 *   screen of a touch device.
 */

import { describe, expect, it } from 'vitest';

import { CAMERA_ORBIT_RATE, CAMERA_TILT_RATE } from '../src/camera-keys.ts';
import type { CameraTurn } from '../src/camera-keys.ts';
import type { PadWalk } from '../src/gamepad.ts';
import {
  STICK_DEAD_ZONE,
  TURN_DEAD_DISTANCE,
  TURN_REACH,
  TouchControls,
  noticePointerType,
} from '../src/touch-controls.ts';
import type { StickPlace } from '../src/touch-controls.ts';

/** The stick, as a page may place it. */
const STICK: StickPlace = { x: 100, y: 300, radius: 60 };

/** A finger on the stick. */
const STICK_FINGER = 1;
/** A finger on the scene. */
const VIEW_FINGER = 2;
/** Another finger on the scene. */
const OTHER_FINGER = 3;

/**
 * Makes the controls with a finger pressed on the middle of the stick and
 * pushed by some way.
 *
 * @param {number} x - How far to the right, in pixels.
 * @param {number} y - How far down, in pixels.
 * @returns {TouchControls} The controls.
 */
function pushStick(x: number, y: number): TouchControls {
  const controls = new TouchControls();
  controls.pressStick(STICK_FINGER, STICK.x, STICK.y, STICK);
  controls.movePointer(STICK_FINGER, STICK.x + x, STICK.y + y);
  return controls;
}

/**
 * Makes the controls with a finger pressed on the scene and dragged by
 * some way.
 *
 * @param {number} x - How far to the right, in pixels.
 * @param {number} y - How far down, in pixels.
 * @returns {TouchControls} The controls.
 */
function dragView(x: number, y: number): TouchControls {
  const controls = new TouchControls();
  controls.pressView(VIEW_FINGER, 400, 200);
  controls.movePointer(VIEW_FINGER, 400 + x, 200 + y);
  return controls;
}

describe('telling a touch device by its pointers', () => {
  it('turns to touch on a touch and back on a mouse', () => {
    expect(noticePointerType(false, 'touch')).toBe(true);
    expect(noticePointerType(true, 'touch')).toBe(true);
    expect(noticePointerType(true, 'mouse')).toBe(false);
    expect(noticePointerType(false, 'mouse')).toBe(false);
  });

  it('stays as it was on a pen or anything else', () => {
    for (const isTouch of [false, true]) {
      expect(noticePointerType(isTouch, 'pen')).toBe(isTouch);
      expect(noticePointerType(isTouch, '')).toBe(isTouch);
    }
  });
});

describe('the stick of the touch controls', () => {
  const radius: number = STICK.radius;

  it('walks the eight directions of the walking keys', () => {
    const cases: readonly (readonly [number, number, PadWalk])[] = [
      [0, -radius, { ahead: 1, aside: 0 }],
      [0, radius, { ahead: -1, aside: 0 }],
      [radius, 0, { ahead: 0, aside: 1 }],
      [-radius, 0, { ahead: 0, aside: -1 }],
      [radius, -radius, { ahead: 1, aside: 1 }],
      [-radius, radius, { ahead: -1, aside: -1 }],
    ];
    for (const [x, y, walk] of cases) {
      expect(pushStick(x, y).resolveWalk()).toEqual(walk);
    }
  });

  it('stands within its dead zone', () => {
    const near: number = radius * STICK_DEAD_ZONE * 0.9;
    expect(pushStick(near, 0).resolveWalk()).toEqual({ ahead: 0, aside: 0 });
    const far: number = radius * STICK_DEAD_ZONE * 1.1;
    expect(pushStick(far, 0).resolveWalk()).toEqual({ ahead: 0, aside: 1 });
  });

  it('keeps its knob within its base', () => {
    const controls: TouchControls = pushStick(radius * 3, 0);
    expect(controls.stickPush).toEqual({ x: 1, y: 0 });
    controls.movePointer(STICK_FINGER, STICK.x + radius / 2, STICK.y);
    expect(controls.stickPush).toEqual({ x: 0.5, y: 0 });
  });

  it('stops walking once the finger is lifted', () => {
    const controls: TouchControls = pushStick(radius, 0);
    controls.releasePointer(STICK_FINGER);
    expect(controls.resolveWalk()).toEqual({ ahead: 0, aside: 0 });
    expect(controls.stickPush).toEqual({ x: 0, y: 0 });
  });

  it('takes one finger at a time', () => {
    const controls: TouchControls = pushStick(radius, 0);
    expect(controls.pressStick(OTHER_FINGER, STICK.x, STICK.y, STICK)).toBe(
      false,
    );
    controls.movePointer(OTHER_FINGER, STICK.x - radius, STICK.y);
    expect(controls.resolveWalk()).toEqual({ ahead: 0, aside: 1 });
  });

  it('does not turn the view', () => {
    const controls: TouchControls = pushStick(radius, -radius);
    expect(controls.isHeld).toBe(false);
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
  });
});

describe('dragging on the scene with the touch controls', () => {
  it('turns the view the way it is dragged, as the arrow keys do', () => {
    expect(dragView(TURN_REACH, 0).resolveTurn(1)).toEqual({
      orbit: CAMERA_ORBIT_RATE,
      tilt: 0,
    });
    expect(dragView(-TURN_REACH * 2, 0).resolveTurn(0.5)).toEqual({
      orbit: -CAMERA_ORBIT_RATE / 2,
      tilt: 0,
    });
    expect(dragView(0, -TURN_REACH).resolveTurn(1)).toEqual({
      orbit: 0,
      tilt: -CAMERA_TILT_RATE,
    });
  });

  it('turns slower for a shorter drag', () => {
    const turn: CameraTurn = dragView(
      (TURN_REACH + TURN_DEAD_DISTANCE) / 2,
      0,
    ).resolveTurn(1);
    expect(turn.orbit).toBeCloseTo(CAMERA_ORBIT_RATE / 2);
    expect(turn.tilt).toBe(0);
  });

  it('does not turn the view within its dead zone', () => {
    const controls: TouchControls = dragView(TURN_DEAD_DISTANCE * 0.9, 0);
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
  });

  it('holds the camera while a finger is on the scene', () => {
    const controls: TouchControls = dragView(0, 0);
    expect(controls.isHeld).toBe(true);
    controls.releasePointer(VIEW_FINGER);
    expect(controls.isHeld).toBe(false);
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
  });

  it('turns the view while another finger walks', () => {
    const controls: TouchControls = pushStick(STICK.radius, 0);
    controls.pressView(VIEW_FINGER, 400, 200);
    controls.movePointer(VIEW_FINGER, 400 - TURN_REACH, 200);
    expect(controls.resolveWalk()).toEqual({ ahead: 0, aside: 1 });
    expect(controls.resolveTurn(1)).toEqual({
      orbit: -CAMERA_ORBIT_RATE,
      tilt: 0,
    });
  });
});

describe('pinching on the scene with the touch controls', () => {
  /**
   * Makes the controls with two fingers pressed on the scene, a distance
   * apart.
   *
   * @param {number} distance - How far apart, in pixels.
   * @returns {TouchControls} The controls.
   */
  function pinch(distance: number): TouchControls {
    const controls = new TouchControls();
    controls.pressView(VIEW_FINGER, 400, 200);
    controls.pressView(OTHER_FINGER, 400 + distance, 200);
    return controls;
  }

  it('zooms in as the fingers spread, and out as they close', () => {
    const controls: TouchControls = pinch(100);
    controls.movePointer(OTHER_FINGER, 600, 200);
    expect(controls.takeZoom()).toBeCloseTo(0.5);
    expect(controls.takeZoom()).toBe(1);
    controls.movePointer(VIEW_FINGER, 500, 200);
    expect(controls.takeZoom()).toBeCloseTo(2);
  });

  it('does not turn the view while pinching', () => {
    const controls: TouchControls = pinch(100);
    controls.movePointer(VIEW_FINGER, 400 - TURN_REACH, 200 - TURN_REACH);
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
    expect(controls.isHeld).toBe(true);
  });

  it('turns the view from where the finger left is once one is lifted', () => {
    const controls: TouchControls = pinch(100);
    controls.movePointer(VIEW_FINGER, 300, 200);
    controls.releasePointer(OTHER_FINGER);
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
    controls.movePointer(VIEW_FINGER, 300 + TURN_REACH, 200);
    expect(controls.resolveTurn(1)).toEqual({
      orbit: CAMERA_ORBIT_RATE,
      tilt: 0,
    });
  });

  it('takes no third finger', () => {
    const controls: TouchControls = pinch(100);
    expect(controls.pressView(4, 0, 0)).toBe(false);
    controls.movePointer(4, 900, 900);
    expect(controls.takeZoom()).toBe(1);
  });

  it('does not zoom with the stick and one finger on the scene', () => {
    const controls: TouchControls = pushStick(0, 0);
    controls.pressView(VIEW_FINGER, 400, 200);
    controls.movePointer(STICK_FINGER, STICK.x + STICK.radius, STICK.y);
    controls.movePointer(VIEW_FINGER, 420, 200);
    expect(controls.takeZoom()).toBe(1);
  });
});

describe('the touch controls held', () => {
  it('neither walk, turn nor zoom while paused, and take no finger', () => {
    const controls: TouchControls = pushStick(STICK.radius, 0);
    controls.pressView(VIEW_FINGER, 400, 200);
    controls.pressView(OTHER_FINGER, 500, 200);
    controls.movePointer(OTHER_FINGER, 600, 200);
    controls.isPaused = true;
    expect(controls.resolveWalk()).toEqual({ ahead: 0, aside: 0 });
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
    expect(controls.takeZoom()).toBe(1);
    expect(controls.isHeld).toBe(false);
    expect(controls.pressView(4, 0, 0)).toBe(false);
  });

  it('let go of every finger when told', () => {
    const controls: TouchControls = pushStick(STICK.radius, 0);
    controls.pressView(VIEW_FINGER, 400, 200);
    controls.movePointer(VIEW_FINGER, 400 + TURN_REACH, 200);
    controls.releaseAll();
    expect(controls.resolveWalk()).toEqual({ ahead: 0, aside: 0 });
    expect(controls.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
    expect(controls.hasPointer(STICK_FINGER)).toBe(false);
    expect(controls.hasPointer(VIEW_FINGER)).toBe(false);
    controls.movePointer(STICK_FINGER, 0, 0);
    expect(controls.stickPush).toEqual({ x: 0, y: 0 });
  });
});
