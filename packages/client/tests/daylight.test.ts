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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/daylight Tests for the light and the colours of the
 *   village through the day.
 */

import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { NOON, findPhaseTime } from '@clovervale/shared';

import { findDaylight } from '../src/daylight.ts';
import type { DaylightLook } from '../src/daylight.ts';
import { createVillageScene } from '../src/village-scene.ts';

/** The number of moments of the day to sample. */
const SAMPLES = 20_000;

/** The time of day at midnight. */
const MIDNIGHT = 0;

/**
 * Lists everything a look holds as numbers, so that looks can be compared.
 *
 * @param {DaylightLook} look - The look.
 * @returns {number[]} The numbers: the colours of the sky and of the
 *   light of the sky and of the ground, as they light the village, the
 *   light of the sun or the moon, along its direction, and how strongly
 *   the stars, the windows and the mountains show.
 */
function listNumbers(look: DaylightLook): number[] {
  const light: Vector3 = look.lightDirection
    .clone()
    .multiplyScalar(look.lightIntensity);
  return [
    ...look.sky.toArray(),
    ...look.skyLight.clone().multiplyScalar(look.ambient).toArray(),
    ...look.groundLight.clone().multiplyScalar(look.ambient).toArray(),
    ...look.lightColour
      .toArray()
      .flatMap((channel: number) =>
        light.toArray().map((part: number) => channel * part),
      ),
    look.stars,
    look.windows,
    look.mountainTint,
  ];
}

/**
 * Measures how much light falls on level ground, from the sky, the ground
 * and the sun or the moon together.
 *
 * @param {DaylightLook} look - The look.
 * @returns {number} The light, as the brightness of white ground.
 */
function measureLight(look: DaylightLook): number {
  const measureLuminance = (colour: Color): number =>
    0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
  const ambient: number =
    (look.ambient *
      (measureLuminance(look.skyLight) +
        measureLuminance(look.groundLight))) /
    2;
  const direct: number =
    look.lightIntensity *
    look.lightDirection.y *
    measureLuminance(look.lightColour);
  return ambient + direct;
}

/**
 * Finds the colour level ground of a colour takes in the light of a look,
 * from the sky and the sun or the moon together.
 *
 * @param {DaylightLook} look - The look.
 * @param {string} hex - The colour of the ground, as `#rrggbb`.
 * @returns {Color} The colour it takes, before it is shaded for the screen.
 */
function lightGround(look: DaylightLook, hex: string): Color {
  const light: Color = look.skyLight
    .clone()
    .multiplyScalar(look.ambient)
    .add(
      look.lightColour
        .clone()
        .multiplyScalar(look.lightIntensity * look.lightDirection.y),
    );
  return new Color(hex).multiply(light);
}

/**
 * Finds how high a body stands above the horizon.
 *
 * @param {Vector3} direction - The direction towards the body.
 * @returns {number} Its elevation, in degrees.
 */
function findElevation(direction: Vector3): number {
  return (Math.asin(direction.y) * 180) / Math.PI;
}

/**
 * Finds the direction along the ground towards a body.
 *
 * @param {Vector3} direction - The direction towards the body.
 * @returns {Vector3} The direction along the ground, of unit length.
 */
function findBearing(direction: Vector3): Vector3 {
  return new Vector3(direction.x, 0, direction.z).normalize();
}

/**
 * Tells how warm a colour is: how much redder it is than blue.
 *
 * @param {Color} colour - The colour.
 * @returns {number} The red of the colour over its blue.
 */
function measureWarmth(colour: Color): number {
  return colour.r / colour.b;
}

describe('findDaylight', () => {
  it('changes every light and colour smoothly through the day', () => {
    let previous: number[] = listNumbers(findDaylight(MIDNIGHT));
    // The last moment is midnight again, where the day comes round.
    for (let sample = 1; sample <= SAMPLES; sample++) {
      const numbers: number[] = listNumbers(
        findDaylight((sample / SAMPLES) % 1),
      );
      const jump: number = Math.max(
        ...numbers.map((value: number, index: number) =>
          Math.abs(value - (previous[index] ?? NaN)),
        ),
      );
      expect([sample / SAMPLES, jump]).toEqual([
        sample / SAMPLES,
        expect.closeTo(0, 2),
      ]);
      previous = numbers;
    }
  });

  it('turns the light sharply only while it barely shines', () => {
    let previous: DaylightLook = findDaylight(MIDNIGHT);
    for (let sample = 1; sample <= SAMPLES; sample++) {
      const look: DaylightLook = findDaylight((sample / SAMPLES) % 1);
      const turn: number = look.lightDirection.angleTo(
        previous.lightDirection,
      );
      if (turn > 0.01) {
        // The light swaps the sun for the moon only while neither shines.
        expect(
          Math.max(look.lightIntensity, previous.lightIntensity),
        ).toBeLessThan(1e-3);
      }
      previous = look;
    }
  });

  it('brightens the village by day and keeps it lit at night', () => {
    const noon: number = measureLight(findDaylight(NOON));
    const lights: number[] = Array.from({ length: SAMPLES }, (_, sample) =>
      measureLight(findDaylight(sample / SAMPLES)),
    );
    expect(Math.max(...lights)).toBeCloseTo(noon, 6);
    expect(measureLight(findDaylight(MIDNIGHT))).toBeLessThan(noon / 2);
    // Even at its darkest, the village is far from black.
    expect(Math.min(...lights)).toBeGreaterThan(noon / 6);
  });

  it('sends the sun up on one side and down on the other', () => {
    const risen: DaylightLook = findDaylight(findPhaseTime('dawn', 0.55));
    const setting: DaylightLook = findDaylight(findPhaseTime('dusk', 0.45));
    expect(risen.body).toBe('sun');
    expect(setting.body).toBe('sun');
    expect(findBearing(risen.sun).dot(findBearing(setting.sun))).toBeLessThan(
      -0.95,
    );
    expect(findElevation(risen.sun)).toBeGreaterThan(0);
    expect(findElevation(risen.sun)).toBeLessThan(5);
  });

  it('keeps the sun low and warm at dawn and dusk, and pale at noon', () => {
    const noon: DaylightLook = findDaylight(NOON);
    for (let sample = 0; sample < SAMPLES; sample += 7) {
      expect(findElevation(findDaylight(sample / SAMPLES).sun)).toBeLessThan(
        findElevation(noon.sun) + 1e-9,
      );
    }
    expect(findElevation(noon.sun)).toBeGreaterThan(45);
    const { r, g, b } = noon.lightColour;
    expect(Math.min(r, g, b)).toBeGreaterThan(0.6);
    // The sun rises halfway through the dawn and sets halfway through the
    // dusk.
    for (const [phase, progress] of [
      ['dawn', 0.75],
      ['dusk', 0.25],
    ] as const) {
      const lowSun: DaylightLook = findDaylight(findPhaseTime(phase, progress));
      expect(lowSun.body).toBe('sun');
      expect(findElevation(lowSun.sun)).toBeLessThan(15);
      expect(measureWarmth(lowSun.lightColour)).toBeGreaterThan(
        1.5 * measureWarmth(noon.lightColour),
      );
      // The shadows fall long, from the sun low in the sky.
      expect(findElevation(lowSun.lightDirection)).toBeLessThan(20);
    }
  });

  it('lights the night with a dim bluish moon that crosses the sky', () => {
    const midnight: DaylightLook = findDaylight(MIDNIGHT);
    const noon: DaylightLook = findDaylight(NOON);
    expect(midnight.body).toBe('moon');
    expect(midnight.lightIntensity).toBeGreaterThan(0);
    expect(midnight.lightIntensity).toBeLessThan(noon.lightIntensity / 2);
    expect(midnight.lightColour.b).toBeGreaterThan(midnight.lightColour.r);
    expect(findElevation(midnight.moon)).toBeGreaterThan(20);
    const rising: DaylightLook = findDaylight(findPhaseTime('night', 0.05));
    const setting: DaylightLook = findDaylight(findPhaseTime('night', 0.95));
    expect(
      findBearing(rising.moon).dot(findBearing(setting.moon)),
    ).toBeLessThan(-0.5);
  });

  it('turns green grass blue-green in the blue light of the night', () => {
    const grass = '#8cc65c';
    const noon: Color = lightGround(findDaylight(NOON), grass);
    const midnight: Color = lightGround(findDaylight(MIDNIGHT), grass);
    // Green under the sun, the grass takes on much of the blue of the
    // night, while its green stays well lit.
    expect(noon.b).toBeLessThan(noon.g / 3);
    expect(midnight.b).toBeGreaterThan(0.6 * midnight.g);
    expect(midnight.r).toBeLessThan(midnight.b);
    expect(midnight.g).toBeGreaterThan(noon.g / 6);
  });

  it('colours the sky through the day as the light changes', () => {
    const dawn: Color = findDaylight(findPhaseTime('dawn', 0.6)).sky;
    const noon: Color = findDaylight(NOON).sky;
    const dusk: Color = findDaylight(findPhaseTime('dusk', 0.5)).sky;
    const night: Color = findDaylight(MIDNIGHT).sky;
    const findLightness = (colour: Color): number =>
      colour.getHSL({ h: 0, s: 0, l: 0 }).l;
    // Pale at dawn, clear blue by day, orange-red at dusk, and deep blue at
    // night.
    expect(findLightness(dawn)).toBeGreaterThan(0.6);
    expect(noon.b).toBeGreaterThan(noon.r);
    expect(dusk.r).toBeGreaterThan(2 * dusk.g);
    expect(dusk.g).toBeGreaterThan(dusk.b);
    expect(night.b).toBeGreaterThan(night.r);
    expect(night.b).toBeGreaterThan(night.g);
    expect(findLightness(night)).toBeLessThan(0.2);
  });

  it(
    'shows no stars or lit windows at noon, and both in full at midnight',
    () => {
      const noon: DaylightLook = findDaylight(NOON);
      const midnight: DaylightLook = findDaylight(MIDNIGHT);
      expect(noon.stars).toBe(0);
      expect(noon.windows).toBe(0);
      expect(midnight.stars).toBe(1);
      expect(midnight.windows).toBe(1);
    },
  );

  it(
    'leaves the mountains untinted at noon and tints them deeply at midnight',
    () => {
      expect(findDaylight(NOON).mountainTint).toBe(0);
      expect(findDaylight(MIDNIGHT).mountainTint).toBeGreaterThan(0.5);
    },
  );
});

describe('Daylight', () => {
  /**
   * Finds the lights of a kind in a scene.
   *
   * @param {Object3D} scene - The scene.
   * @param {new (...args: never[]) => T} kind - The kind of light.
   * @returns {T[]} The lights of that kind.
   * @template T
   */
  function findLights<T extends Object3D>(
    scene: Object3D,
    kind: new (...args: never[]) => T,
  ): T[] {
    return scene.children.filter(
      (child: Object3D): child is T => child instanceof kind,
    );
  }

  it('gives the sky and the fog the colours of the hour', () => {
    const { scene, daylight } = createVillageScene();
    for (let hour = 0; hour < 24; hour += 0.75) {
      const look: DaylightLook = daylight.show(hour / 24);
      const sky: Color = scene.background as Color;
      expect(sky.getHex()).toBe(look.sky.getHex());
      expect((scene.fog as Fog).color.getHex()).toBe(sky.getHex());
    }
  });

  it('lights the village for the hour from the sky and the sun or moon', () => {
    const { scene, daylight } = createVillageScene();
    const [ambient, ...otherAmbients] = findLights(scene, HemisphereLight);
    const [light, ...otherLights] = findLights(scene, DirectionalLight);
    expect(otherAmbients).toEqual([]);
    expect(otherLights).toEqual([]);
    expect(light?.castShadow).toBe(true);
    for (let hour = 0; hour < 24; hour += 0.75) {
      const look: DaylightLook = daylight.show(hour / 24);
      expect(ambient?.intensity).toBe(look.ambient);
      expect(ambient?.color.getHex()).toBe(look.skyLight.getHex());
      expect(ambient?.groundColor.getHex()).toBe(look.groundLight.getHex());
      const towards: Vector3 = (light?.position ?? new Vector3())
        .clone()
        .sub(light?.target.position ?? new Vector3())
        .normalize();
      expect(towards.angleTo(look.lightDirection)).toBeLessThan(1e-6);
      expect(light?.intensity).toBe(look.lightIntensity);
      expect(light?.color.getHex()).toBe(look.lightColour.getHex());
    }
  });

  it('shows the village at noon until told the time', () => {
    const { scene } = createVillageScene();
    expect((scene.background as Color).getHex()).toBe(
      findDaylight(NOON).sky.getHex(),
    );
  });
});
