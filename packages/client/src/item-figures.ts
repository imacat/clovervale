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
 * @module client/item-figures Showing the four-leaved clovers in the
 *   patches of clover, and the items that lie on the ground.
 */

import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from 'three';
import type { BufferGeometry, Object3D } from 'three';
import {
  mergeGeometries,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { CLOVER_PATCHES } from '@clovervale/shared';
import type { GroundItem, WorldItems } from '@clovervale/shared';

/** What is shown of the items in the world. */
export interface ItemsView {
  /** The numbers of the patches of clover shown with their clover. */
  readonly clovers: readonly number[];
  /** The items shown lying on the ground. */
  readonly items: readonly GroundItem[];
}

/**
 * The outline of a leaflet of clover, as the model of a patch of clover has
 * it, from where it joins the stalk to its notched tip along +Y, in metres.
 */
const LEAFLET_OUTLINE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.046, 0.06],
  [0.026, 0.1],
  [0, 0.085],
  [-0.026, 0.1],
  [-0.046, 0.06],
];

/**
 * How much larger than a leaflet of the patch a leaflet of a four-leaved
 * clover is drawn, so that it stands out among them.
 */
const LEAFLET_SCALE = 2;

/** The thickness of a leaflet, in metres, as the patch has it. */
const LEAFLET_DEPTH = 0.006;

/** How far a leaflet tilts up from lying flat, in degrees. */
const LEAFLET_TILT = 12;

/**
 * The height of the stalk of a four-leaved clover in a patch, in metres,
 * a little above the tallest sprigs of the patch.
 */
const STALK_HEIGHT = 0.24;

/** The colour of the leaves, the lightest the patch has. */
const LEAF_COLOUR = '#5aa746';

/** The colour of the stalk, as the patch has it. */
const STALK_COLOUR = '#6aa84a';

/** How high above the ground the leaves of a lying clover are, in metres. */
const LYING_HEIGHT = 0.02;

/** The turn from one item on the ground to the next, in degrees. */
const LYING_TURN = 137.5;

/**
 * Builds the four leaflets of a four-leaved clover around the top of its
 * stalk, at the origin.
 *
 * @returns {BufferGeometry} The leaflets.
 */
function buildLeaves(): BufferGeometry {
  const shape = new Shape();
  LEAFLET_OUTLINE.forEach(([x, y]: readonly [number, number], index) => {
    if (index === 0) {
      shape.moveTo(x * LEAFLET_SCALE, y * LEAFLET_SCALE);
    } else {
      shape.lineTo(x * LEAFLET_SCALE, y * LEAFLET_SCALE);
    }
  });
  const leaflets: BufferGeometry[] = [0, 1, 2, 3].map((quarter: number) =>
    new ExtrudeGeometry(shape, { depth: LEAFLET_DEPTH, bevelEnabled: false })
      .rotateX(((LEAFLET_TILT - 90) * Math.PI) / 180)
      .rotateY(((quarter * 90 + 45) * Math.PI) / 180),
  );
  return mergeGeometries(leaflets);
}

/** What every four-leaved clover is drawn with. */
interface CloverParts {
  /** The four leaflets around the top of the stalk, at the origin. */
  readonly leaves: BufferGeometry;
  /** The stalk, from the origin up. */
  readonly stalk: BufferGeometry;
  /** The material of the leaves. */
  readonly leafMaterial: MeshStandardMaterial;
  /** The material of the stalk. */
  readonly stalkMaterial: MeshStandardMaterial;
}

/**
 * Builds what every four-leaved clover is drawn with, once for them all.
 *
 * @returns {CloverParts} The parts.
 */
function buildCloverParts(): CloverParts {
  return {
    leaves: buildLeaves(),
    stalk: new CylinderGeometry(0.005, 0.008, STALK_HEIGHT, 5).translate(
      0,
      STALK_HEIGHT / 2,
      0,
    ),
    leafMaterial: new MeshStandardMaterial({
      color: LEAF_COLOUR,
      roughness: 0.8,
    }),
    stalkMaterial: new MeshStandardMaterial({
      color: STALK_COLOUR,
      roughness: 0.9,
    }),
  };
}

/**
 * Makes a mesh that casts and takes shadows.
 *
 * @param {BufferGeometry} geometry - The shape of the mesh.
 * @param {MeshStandardMaterial} material - Its material.
 * @returns {Mesh} The mesh.
 */
function createMesh(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Makes a four-leaved clover that stands up among the sprigs of a patch.
 *
 * @param {CloverParts} parts - What it is drawn with.
 * @returns {Group} The clover, standing at the origin.
 */
function createStandingClover(parts: CloverParts): Group {
  const clover = new Group();
  const leaves: Mesh = createMesh(parts.leaves, parts.leafMaterial);
  leaves.position.y = STALK_HEIGHT;
  clover.add(createMesh(parts.stalk, parts.stalkMaterial), leaves);
  return clover;
}

/**
 * Makes a four-leaved clover that lies on the ground, its stalk along the
 * ground.
 *
 * @param {CloverParts} parts - What it is drawn with.
 * @returns {Group} The clover, its leaves at the origin.
 */
function createLyingClover(parts: CloverParts): Group {
  const clover = new Group();
  const leaves: Mesh = createMesh(parts.leaves, parts.leafMaterial);
  leaves.position.y = LYING_HEIGHT;
  const stalk: Mesh = createMesh(parts.stalk, parts.stalkMaterial);
  stalk.rotation.z = -Math.PI / 2;
  stalk.position.y = LYING_HEIGHT / 2;
  clover.add(stalk, leaves);
  return clover;
}

/**
 * The four-leaved clovers of the patches of clover, and the items on the
 * ground, as the server last told of them.
 */
export class ItemFigures {
  readonly #parent: Object3D;
  readonly #parts: CloverParts = buildCloverParts();
  readonly #patches: Group[];
  readonly #lying = new Map<number, [GroundItem, Group]>();

  /**
   * Starts with a four-leaved clover drawn in no patch, and nothing on the
   * ground.
   *
   * @param {Object3D} parent - What the clovers are added to.
   */
  constructor(parent: Object3D) {
    this.#parent = parent;
    this.#patches = CLOVER_PATCHES.map(({ x, z }) => {
      const clover: Group = createStandingClover(this.#parts);
      clover.position.set(x, 0, z);
      clover.visible = false;
      parent.add(clover);
      return clover;
    });
  }

  /**
   * Shows a four-leaved clover standing in each patch of clover that has
   * its clover, and a four-leaved clover lying on the ground for each item
   * there, where the item lies now, even if an item of the same number lay
   * elsewhere before, and nothing else.
   *
   * @param {WorldItems | null} world - What there is to pick in the world,
   *   or `null` to show nothing.
   */
  show(world: WorldItems | null): void {
    const clovers = new Set<number>(world?.clovers ?? []);
    this.#patches.forEach((clover: Group, patch: number) => {
      clover.visible = clovers.has(patch);
    });
    const items: readonly GroundItem[] = world?.items ?? [];
    const isSame = (a: GroundItem, b: GroundItem): boolean =>
      a.x === b.x && a.z === b.z;
    for (const [id, [lying, clover]] of this.#lying) {
      const item: GroundItem | undefined = items.find(
        (candidate: GroundItem) => candidate.id === id,
      );
      if (item === undefined || !isSame(item, lying)) {
        this.#parent.remove(clover);
        this.#lying.delete(id);
      }
    }
    for (const item of items) {
      if (this.#lying.has(item.id)) {
        continue;
      }
      const clover: Group = createLyingClover(this.#parts);
      clover.position.set(item.x, 0, item.z);
      clover.rotation.y = (((item.id * LYING_TURN) % 360) * Math.PI) / 180;
      this.#parent.add(clover);
      this.#lying.set(item.id, [item, clover]);
    }
  }

  /**
   * Describes what is shown, for looking at.
   *
   * @returns {ItemsView} The patches shown with their clover, and the items
   *   shown on the ground, where they are drawn.
   */
  describe(): ItemsView {
    const clovers: number[] = [];
    this.#patches.forEach((clover: Group, patch: number) => {
      if (clover.visible) {
        clovers.push(patch);
      }
    });
    const items: GroundItem[] = [...this.#lying.values()].map(
      ([item, clover]: [GroundItem, Group]) => ({
        id: item.id,
        kind: item.kind,
        x: clover.position.x,
        z: clover.position.z,
      }),
    );
    return { clovers, items };
  }
}
