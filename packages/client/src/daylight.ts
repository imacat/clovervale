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
 * @module client/daylight The light and the colors of the village at each
 *   time of day.
 */

import {
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Fog, Object3D, Scene } from 'three';

import { NOON, findPhaseTime } from '@clovervale/shared';
import type { DayPhase } from '@clovervale/shared';

import { tintMountains } from './mountains.ts';
import { Sky } from './sky.ts';

/** Which body lights the village and casts its shadows. */
export type LightBody = 'sun' | 'moon';

/** How the village looks at a time of day. */
export interface DaylightLook {
  /** The color of the sky, which the fog takes too. */
  readonly sky: Color;
  /** The color of the light that falls from the sky. */
  readonly skyLight: Color;
  /** The color of the light that comes up from the ground. */
  readonly groundLight: Color;
  /** How strong the light of the sky and of the ground is. */
  readonly ambient: number;
  /** The body that lights the village and casts its shadows. */
  readonly body: LightBody;
  /**
   * The direction toward that body, of unit length, never lower than the
   * lowest elevation the shadows are cast from.
   */
  readonly lightDirection: Vector3;
  /** The color of the light of that body. */
  readonly lightColor: Color;
  /** How strong the light of that body is. */
  readonly lightIntensity: number;
  /** The direction toward the sun, of unit length, even below the horizon. */
  readonly sun: Vector3;
  /** The direction toward the moon, of unit length, even below the horizon. */
  readonly moon: Vector3;
  /** How strongly the stars show, from 0 to 1. */
  readonly stars: number;
  /** How brightly the windows of the houses glow, from 0 to 1. */
  readonly windows: number;
  /**
   * How far the mountains take on the color of the sky instead of their
   * own, from 0 to 1.
   */
  readonly mountainTint: number;
}

/** The colors and the lights the village has at a moment of the day. */
interface Keyframe {
  /** The part of the day the moment falls in. */
  readonly phase: DayPhase;
  /** How far into that part the moment falls, from 0 to 1. */
  readonly progress: number;
  /** The color of the sky. */
  readonly sky: string;
  /** The color of the light that falls from the sky. */
  readonly skyLight: string;
  /** The color of the light that comes up from the ground. */
  readonly groundLight: string;
  /** How strong the light of the sky and of the ground is. */
  readonly ambient: number;
  /** How strongly the stars show, from 0 to 1. */
  readonly stars: number;
  /** How brightly the windows glow, from 0 to 1. */
  readonly windows: number;
  /** How far the mountains take on the color of the sky, from 0 to 1. */
  readonly mountainTint: number;
}

/** A keyframe placed in the day. */
interface PlacedKeyframe {
  /** The time of day of the keyframe. */
  readonly time: number;
  /** The color of the sky, in sRGB. */
  readonly sky: readonly number[];
  /** The color of the light of the sky, in sRGB. */
  readonly skyLight: readonly number[];
  /** The color of the light of the ground, in sRGB. */
  readonly groundLight: readonly number[];
  /** How strong the light of the sky and of the ground is. */
  readonly ambient: number;
  /** How strongly the stars show. */
  readonly stars: number;
  /** How brightly the windows glow. */
  readonly windows: number;
  /** How far the mountains take on the color of the sky. */
  readonly mountainTint: number;
}

/** How the village looks in full daylight. */
const FULL_DAY = {
  sky: '#bfe4f2',
  skyLight: '#ffffff',
  groundLight: '#8aa868',
  ambient: 1.5,
  stars: 0,
  windows: 0,
  mountainTint: 0,
} as const;

/** How the village looks deep in the night. */
const DEEP_NIGHT = {
  sky: '#0e1a3c',
  skyLight: '#6890ff',
  groundLight: '#384a82',
  ambient: 2,
  stars: 1,
  windows: 1,
  mountainTint: 0.9,
} as const;

/**
 * The colors and the lights of the village at moments through the day,
 * from midnight on; between those moments, they change smoothly.
 */
const KEYFRAMES: readonly Keyframe[] = [
  { phase: 'night', progress: 0.5, ...DEEP_NIGHT },
  {
    phase: 'dawn',
    progress: 0,
    ...DEEP_NIGHT,
    sky: '#142250',
    ambient: 2.15,
  },
  {
    phase: 'dawn',
    progress: 0.5,
    sky: '#dcbdb6',
    skyLight: '#f0d6d0',
    groundLight: '#7c806c',
    ambient: 1.35,
    stars: 0.1,
    windows: 0.5,
    mountainTint: 0.55,
  },
  {
    phase: 'day',
    progress: 0,
    sky: '#d6e7ee',
    skyLight: '#fbf5ee',
    groundLight: '#8aa868',
    ambient: 1.45,
    stars: 0,
    windows: 0,
    mountainTint: 0.25,
  },
  { phase: 'day', progress: 0.12, ...FULL_DAY },
  { phase: 'day', progress: 0.88, ...FULL_DAY },
  {
    phase: 'dusk',
    progress: 0,
    sky: '#f2cf9c',
    skyLight: '#ffe5c2',
    groundLight: '#8f9a62',
    ambient: 1.45,
    stars: 0,
    windows: 0.2,
    mountainTint: 0.3,
  },
  {
    phase: 'dusk',
    progress: 0.5,
    sky: '#e2643c',
    skyLight: '#f3a68a',
    groundLight: '#6f5c56',
    ambient: 1.6,
    stars: 0.1,
    windows: 0.8,
    mountainTint: 0.65,
  },
  {
    phase: 'night',
    progress: 0,
    sky: '#29265a',
    skyLight: '#a4a4e6',
    groundLight: '#4c4b70',
    ambient: 1.75,
    stars: 0.75,
    windows: 1,
    mountainTint: 0.85,
  },
];

/**
 * The direction toward the sun at noon, some 51 degrees above the
 * horizon.
 */
const NOON_SUN: Vector3 = new Vector3(-22, 36, 19).normalize();
/**
 * The direction along the ground in which the sun and the moon rise, at
 * right angles to the direction of the sun at noon.  They set in the
 * opposite direction.
 */
const RISING: Vector3 = new Vector3(19, 0, 22).normalize();
/** How high the moon stands at its highest, at midnight, in degrees. */
const MOON_HEIGHT = 40;
/**
 * The direction toward the moon at midnight: the way the sun is at noon,
 * but lower.
 */
const MIDNIGHT_MOON: Vector3 = new Vector3(NOON_SUN.x, 0, NOON_SUN.z)
  .normalize()
  .multiplyScalar(Math.cos(MathUtils.degToRad(MOON_HEIGHT)))
  .setY(Math.sin(MathUtils.degToRad(MOON_HEIGHT)));

/** The time of day the sun rises, halfway through the dawn. */
const SUNRISE: number = findPhaseTime('dawn', 0.5);
/** The time of day the sun sets, halfway through the dusk. */
const SUNSET: number = findPhaseTime('dusk', 0.5);

/** The lowest elevation the shadows are cast from, in degrees. */
const LOWEST_LIGHT = 8;

/** How strong the light of the sun is at its strongest. */
const SUN_INTENSITY = 2.4;
/** How high the sun must be to shine at its full strength, in degrees. */
const SUN_FULL_HEIGHT = 20;
/** The color of the sun high in the sky, a warm off-white. */
const SUN_HIGH_COLOR = '#fff1d8';
/** The color of the sun on the horizon. */
const SUN_LOW_COLOR = '#ff8a4a';
/** How high the sun is when its light starts to warm, in degrees. */
const SUN_WARM_HEIGHT = 35;
/** How strong the light of the moon is at its strongest. */
const MOON_INTENSITY = 1;
/** How high the moon must be to shine at its full strength, in degrees. */
const MOON_FULL_HEIGHT = 15;
/** The color of the moonlight. */
const MOON_COLOR = '#82a1ff';

/** What the light of the sun and of the moon is aimed at. */
const LIGHT_TARGET: Vector3 = new Vector3(0, 0, -5);
/** How far the light is placed from what it is aimed at, in meters. */
const LIGHT_DISTANCE = 60;
/** Half the width of the square of ground that receives shadows, in meters. */
const SHADOW_REACH = 34;
/** How far the shadows of each body are blurred, in texels of the map. */
const SHADOW_BLUR: Readonly<Record<LightBody, number>> = { sun: 1, moon: 3 };
/** How dark the shadows of each body are, from 0 to 1. */
const SHADOW_DARKNESS: Readonly<Record<LightBody, number>> = {
  sun: 1,
  moon: 0.8,
};

/**
 * Reads a color as its channels in sRGB.
 *
 * @param {string} hex - The color, as `#rrggbb`.
 * @returns {number[]} The red, the green and the blue, from 0 to 1.
 */
function readChannels(hex: string): number[] {
  const { r, g, b } = new Color(hex).getRGB(
    { r: 0, g: 0, b: 0 },
    SRGBColorSpace,
  );
  return [r, g, b];
}

/**
 * Mixes two colors given by their channels in sRGB.
 *
 * @param {readonly number[]} from - One color.
 * @param {readonly number[]} to - The other color.
 * @param {number} share - How much of the other color, from 0 to 1.
 * @returns {Color} The mixture.
 */
function mixChannels(
  from: readonly number[],
  to: readonly number[],
  share: number,
): Color {
  const [r = 0, g = 0, b = 0] = from.map(
    (channel: number, index: number) =>
      channel + ((to[index] ?? channel) - channel) * share,
  );
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}

/** The keyframes, placed in the day, the earliest after midnight first. */
const PLACED: readonly PlacedKeyframe[] = KEYFRAMES.map(
  (key: Keyframe): PlacedKeyframe => ({
    time: findPhaseTime(key.phase, key.progress),
    sky: readChannels(key.sky),
    skyLight: readChannels(key.skyLight),
    groundLight: readChannels(key.groundLight),
    ambient: key.ambient,
    stars: key.stars,
    windows: key.windows,
    mountainTint: key.mountainTint,
  }),
).toSorted((a: PlacedKeyframe, b: PlacedKeyframe) => a.time - b.time);

/**
 * Finds the keyframes on either side of a time of day, and how far the
 * time is from one to the other.
 *
 * @param {number} time - The time of day, from 0 up to 1.
 * @returns {[PlacedKeyframe, PlacedKeyframe, number]} The keyframe at or
 *   before the time, the one after it, past midnight if need be, and how
 *   far between them the time is, from 0 to 1, eased in and out.
 */
function findKeyframes(
  time: number,
): [PlacedKeyframe, PlacedKeyframe, number] {
  const count: number = PLACED.length;
  const index: number = PLACED.findLastIndex(
    (key: PlacedKeyframe) => key.time <= time,
  );
  const before: PlacedKeyframe | undefined = PLACED[(index + count) % count];
  const after: PlacedKeyframe | undefined = PLACED[(index + 1) % count];
  if (before === undefined || after === undefined) {
    throw new Error('The day has no keyframes.');
  }
  const span: number = (after.time - before.time + 1) % 1 || 1;
  const elapsed: number = (time - before.time + 1) % 1;
  return [before, after, MathUtils.smoothstep(elapsed / span, 0, 1)];
}

/**
 * Finds the direction toward a body that rises in one direction and sets
 * in the opposite one, moving along a circle through its highest point.
 *
 * @param {Vector3} highest - The direction toward it at its highest.
 * @param {number} progress - How far it is from its rising to its setting,
 *   from 0 to 1, or beyond them while it is below the horizon.
 * @returns {Vector3} The direction toward it, of unit length.
 */
function findBodyDirection(highest: Vector3, progress: number): Vector3 {
  const angle: number = Math.PI * (progress - 0.5);
  return RISING.clone()
    .multiplyScalar(-Math.sin(angle))
    .addScaledVector(highest, Math.cos(angle));
}

/**
 * Finds how far a body is from its rising to its setting.
 *
 * @param {number} time - The time of day.
 * @param {number} rise - The time of day it rises.
 * @param {number} set - The time of day it sets.
 * @returns {number} How far, from 0 at its rising to 1 at its setting, and
 *   on to 2 at its next rising.  It passes the rest of the day below the
 *   horizon at its own pace, from setting to rising.
 */
function findBodyProgress(time: number, rise: number, set: number): number {
  const up: number = (set - rise + 1) % 1;
  const since: number = (time - rise + 1) % 1;
  return since <= up ? since / up : 1 + (since - up) / (1 - up);
}

/**
 * Finds how high a body stands above the horizon.
 *
 * @param {Vector3} direction - The direction toward it.
 * @returns {number} Its elevation, in degrees.
 */
function findElevation(direction: Vector3): number {
  return MathUtils.radToDeg(Math.asin(MathUtils.clamp(direction.y, -1, 1)));
}

/**
 * Lifts a direction that is lower than the lowest elevation the shadows
 * are cast from up to that elevation, keeping its bearing.
 *
 * @param {Vector3} direction - The direction.
 * @returns {Vector3} The direction, lifted.
 */
function liftDirection(direction: Vector3): Vector3 {
  if (findElevation(direction) >= LOWEST_LIGHT) {
    return direction.clone();
  }
  const lowest: number = MathUtils.degToRad(LOWEST_LIGHT);
  return new Vector3(direction.x, 0, direction.z)
    .normalize()
    .multiplyScalar(Math.cos(lowest))
    .setY(Math.sin(lowest));
}

/**
 * Finds how the village looks at a time of day.
 *
 * The sun rises halfway through the dawn, crosses the sky and sets halfway
 * through the dusk on the other side, low and warm as it rises and sets,
 * pale and only faintly warm at noon.  The moon crosses the sky the same
 * way while the sun is down, but lower, blue and dim.  Whichever is up
 * lights the village and casts its shadows, and neither gives any light as
 * it rises or sets.  Everything changes smoothly, through midnight too.
 *
 * @param {number} time - The time of day, from 0 up to 1.
 * @returns {DaylightLook} How the village looks then.
 */
export function findDaylight(time: number): DaylightLook {
  const [before, after, share] = findKeyframes(time);
  const mix = (key: 'ambient' | 'stars' | 'windows' | 'mountainTint'): number =>
    before[key] + (after[key] - before[key]) * share;
  const sunProgress: number = findBodyProgress(time, SUNRISE, SUNSET);
  const sun: Vector3 = findBodyDirection(NOON_SUN, sunProgress);
  const moon: Vector3 = findBodyDirection(
    MIDNIGHT_MOON,
    findBodyProgress(time, SUNSET, SUNRISE),
  );
  const body: LightBody = sunProgress <= 1 ? 'sun' : 'moon';
  let lightColor: Color;
  let lightIntensity: number;
  if (body === 'sun') {
    const height: number = findElevation(sun);
    const warmth: number = MathUtils.smoothstep(height, 2, SUN_WARM_HEIGHT);
    lightColor = mixChannels(
      readChannels(SUN_LOW_COLOR),
      readChannels(SUN_HIGH_COLOR),
      warmth,
    );
    lightIntensity =
      SUN_INTENSITY * MathUtils.smoothstep(height, 0, SUN_FULL_HEIGHT);
  } else {
    lightColor = new Color(MOON_COLOR);
    lightIntensity =
      MOON_INTENSITY *
      MathUtils.smoothstep(findElevation(moon), 0, MOON_FULL_HEIGHT);
  }
  return {
    sky: mixChannels(before.sky, after.sky, share),
    skyLight: mixChannels(before.skyLight, after.skyLight, share),
    groundLight: mixChannels(before.groundLight, after.groundLight, share),
    ambient: mix('ambient'),
    body,
    lightDirection: liftDirection(body === 'sun' ? sun : moon),
    lightColor,
    lightIntensity,
    sun,
    moon,
    stars: mix('stars'),
    windows: mix('windows'),
    mountainTint: mix('mountainTint'),
  };
}

/**
 * Creates the light of the sun and of the moon, which casts the shadows of
 * the village.
 *
 * @returns {DirectionalLight} The light, aimed at the village.
 */
function createBodyLight(): DirectionalLight {
  const light = new DirectionalLight();
  light.target.position.copy(LIGHT_TARGET);
  light.castShadow = true;
  light.shadow.mapSize.set(4096, 4096);
  light.shadow.camera.left = -SHADOW_REACH;
  light.shadow.camera.right = SHADOW_REACH;
  light.shadow.camera.bottom = -SHADOW_REACH;
  light.shadow.camera.top = SHADOW_REACH;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 120;
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.03;
  return light;
}

/**
 * The light and the colors of the village through the day: the sky and
 * the fog, the light of the sky and the ground, the light of the sun or of
 * the moon with its shadows, the stars, the sun and the moon in the sky,
 * and the mountains melting into the sky.
 */
export class Daylight {
  readonly #fog: Fog;
  readonly #sky: Color = new Color();
  readonly #ambient: HemisphereLight = new HemisphereLight();
  readonly #light: DirectionalLight = createBodyLight();
  readonly #heavens: Sky;
  readonly #mountains: Object3D;

  /**
   * Lights a scene, and gives it a sky, as at noon until told the time.
   *
   * @param {Scene} scene - The scene.
   * @param {Fog} fog - The fog of the scene.
   * @param {Object3D} mountains - The mountains of the scene.
   */
  constructor(scene: Scene, fog: Fog, mountains: Object3D) {
    this.#fog = fog;
    this.#mountains = mountains;
    scene.background = this.#sky;
    scene.add(this.#ambient, this.#light, this.#light.target);
    this.#heavens = new Sky(scene);
    this.show(NOON);
  }

  /**
   * Shows the village as it looks at a time of day.
   *
   * @param {number} time - The time of day, from 0 up to 1.
   * @returns {DaylightLook} How the village looks then.
   */
  show(time: number): DaylightLook {
    const look: DaylightLook = findDaylight(time);
    this.#sky.copy(look.sky);
    this.#fog.color.copy(look.sky);
    this.#ambient.color.copy(look.skyLight);
    this.#ambient.groundColor.copy(look.groundLight);
    this.#ambient.intensity = look.ambient;
    this.#light.position
      .copy(LIGHT_TARGET)
      .addScaledVector(look.lightDirection, LIGHT_DISTANCE);
    this.#light.color.copy(look.lightColor);
    this.#light.intensity = look.lightIntensity;
    this.#light.shadow.radius = SHADOW_BLUR[look.body];
    this.#light.shadow.intensity = SHADOW_DARKNESS[look.body];
    this.#heavens.show(look);
    tintMountains(this.#mountains, look.sky, look.mountainTint);
    return look;
  }
}
