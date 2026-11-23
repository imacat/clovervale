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
 * @module scripts/test-browser/png Decodes the screenshots of the browser, and
 *   measures them.
 */

import { inflateSync } from 'node:zlib';

/** The pixels of an image. */
export interface Pixels {
  /** The width of the image, in pixels. */
  readonly width: number;
  /** The height of the image, in pixels. */
  readonly height: number;
  /** The number of color channels of every pixel. */
  readonly channels: number;
  /** The channels of the pixels, row by row from the top. */
  readonly data: Uint8Array;
}

/** The least a color channel of a lit pixel can be, from 0 to 255. */
const LIT_CHANNEL = 96;
/** The least change of a color channel that changes a pixel, to 255. */
const CHANGED_CHANNEL = 48;

/**
 * Decodes a PNG image.
 *
 * @param {Buffer} png - The image, as 8-bit RGB or RGBA without interlacing.
 * @returns {Pixels} The pixels of the image.
 * @throws {Error} If the image is in another PNG format.
 */
export function decodePng(png: Buffer): Pixels {
  const width: number = png.readUInt32BE(16);
  const height: number = png.readUInt32BE(20);
  const channels: number = png[25] === 6 ? 4 : 3;
  if (png[24] !== 8 || (png[25] !== 2 && png[25] !== 6) || png[28] !== 0) {
    throw new Error('The screenshot is in an unsupported PNG format.');
  }
  const parts: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length: number = png.readUInt32BE(offset);
    if (png.toString('latin1', offset + 4, offset + 8) === 'IDAT') {
      parts.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const filtered: Buffer = inflateSync(Buffer.concat(parts));
  const stride: number = width * channels;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const start: number = y * (stride + 1);
    const filter: number = filtered[start] ?? 0;
    const row: number = y * stride;
    for (let x = 0; x < stride; x++) {
      const left: number = x < channels ? 0 : (data[row + x - channels] ?? 0);
      const up: number = y === 0 ? 0 : (data[row + x - stride] ?? 0);
      const upLeft: number =
        x < channels || y === 0
          ? 0
          : (data[row + x - stride - channels] ?? 0);
      let predicted = 0;
      if (filter === 1) {
        predicted = left;
      } else if (filter === 2) {
        predicted = up;
      } else if (filter === 3) {
        predicted = (left + up) >> 1;
      } else if (filter === 4) {
        const distances: number[] = [left, up, upLeft].map((value) =>
          Math.abs(left + up - upLeft - value),
        );
        const nearest: number = distances.indexOf(Math.min(...distances));
        predicted = [left, up, upLeft][nearest] ?? 0;
      }
      data[row + x] = (filtered[start + 1 + x] ?? 0) + predicted;
    }
  }
  return { width, height, channels, data };
}

/**
 * Measures how much of an image is lit grass.
 *
 * Neither the bare earth nor the page behind the scene counts: the earth is
 * not green, and the page is dark.
 *
 * @param {Pixels} image - The image.
 * @returns {number} The fraction of its pixels that are lit and mostly
 *   green, from 0 to 1.
 */
export function measureGrassFraction(image: Pixels): number {
  let grass = 0;
  for (let at = 0; at < image.data.length; at += image.channels) {
    const red: number = image.data[at] ?? 0;
    const green: number = image.data[at + 1] ?? 0;
    const blue: number = image.data[at + 2] ?? 0;
    if (green >= LIT_CHANNEL && green > red && green > blue) {
      grass++;
    }
  }
  return grass / (image.width * image.height);
}

/**
 * Measures how brightly an image is lit.
 *
 * @param {Pixels} image - The image.
 * @returns {number} The mean brightness of its pixels, from 0 to 255.
 */
export function measureBrightness(image: Pixels): number {
  let sum = 0;
  for (let at = 0; at < image.data.length; at += image.channels) {
    sum +=
      0.2126 * (image.data[at] ?? 0) +
      0.7152 * (image.data[at + 1] ?? 0) +
      0.0722 * (image.data[at + 2] ?? 0);
  }
  return sum / (image.width * image.height);
}

/**
 * Counts the pixels that differ between two images of the same size.
 *
 * @param {Pixels} before - One image.
 * @param {Pixels} after - The other image.
 * @returns {number} The number of pixels of which a color channel differs
 *   clearly.
 * @throws {Error} If the images differ in size.
 */
export function countChangedPixels(before: Pixels, after: Pixels): number {
  if (before.data.length !== after.data.length) {
    throw new Error('The view changed its size during the check.');
  }
  let changed = 0;
  for (let at = 0; at < before.data.length; at += before.channels) {
    for (let channel = 0; channel < 3; channel++) {
      const difference: number =
        (before.data[at + channel] ?? 0) - (after.data[at + channel] ?? 0);
      if (Math.abs(difference) >= CHANGED_CHANNEL) {
        changed++;
        break;
      }
    }
  }
  return changed;
}
