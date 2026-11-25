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
 * @module client/item-figures Showing the four-leaf clovers in the
 *   patches of clover, and the items that lie on the ground, each as what
 *   it is.
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
} from 'three/addons/utils/BufferGeometryUtils.js';

import { CLOVER_PATCHES, FIELD_FLOOR_HEIGHT } from '@clovervale/shared';
import type { GroundItem, WorldItems } from '@clovervale/shared';

import type { FigureFrame, FigureSet } from './figure-set.ts';
import { LYING_CLOVER_MODEL, LYING_ITEM_MODELS } from './model-catalog.ts';
import type { LoadedModel } from './model-loader.ts';

/** What is shown of the items in the world. */
export interface ItemsView {
  /** The numbers of the patches of clover shown with their clover. */
  readonly clovers: readonly number[];
  /** The items shown lying on the ground. */
  readonly items: readonly GroundItem[];
}

/**
 * The outline of a leaflet of clover, as the model of a patch of clover has
 * it, from where it joins the stalk to its notched tip along +Y, in meters.
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
 * How much larger than a leaflet of the patch a leaflet of a four-leaf
 * clover is drawn, so that it stands out among them.
 */
const LEAFLET_SCALE = 2;

/** The thickness of a leaflet, in meters, as the patch has it. */
const LEAFLET_DEPTH = 0.006;

/** How far a leaflet tilts up from lying flat, in degrees. */
const LEAFLET_TILT = 12;

/**
 * The height of the stalk of a four-leaf clover in a patch, in meters,
 * a little above the tallest sprigs of the patch.
 */
const STALK_HEIGHT = 0.24;

/** The color of the leaves, the lightest the patch has. */
const LEAF_COLOR = '#5aa746';

/** The color of the stalk, as the patch has it. */
const STALK_COLOR = '#6aa84a';

/**
 * How large a four-leaf clover held in a hand is drawn next to one in a
 * patch, so that it fits the hand of a child yet is seen from afar.
 */
const HELD_SCALE = 0.6;

/** How high above the ground the leaves of a lying clover are, in meters. */
const LYING_HEIGHT = 0.02;

/**
 * How high above the ground an item lying on it is drawn, in meters: just
 * enough for it to lie on top of the bare earth of the lanes of a farm
 * field rather than in it.
 */
const LYING_LIFT: number = 2 * FIELD_FLOOR_HEIGHT;

/** The turn from one item on the ground to the next, in degrees. */
const LYING_TURN = 137.5;

/**
 * Builds the four leaflets of a four-leaf clover around the top of its
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

/** What every four-leaf clover is drawn with. */
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
 * Builds what every four-leaf clover is drawn with, once for them all.
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
      color: LEAF_COLOR,
      roughness: 0.8,
    }),
    stalkMaterial: new MeshStandardMaterial({
      color: STALK_COLOR,
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
 * Makes a four-leaf clover that stands up among the sprigs of a patch.
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
 * Makes a four-leaf clover that lies on the ground, its stalk along the
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
 * Makes a four-leaf clover to be held in a hand, by its stalk.
 *
 * @returns {Group} The clover, the foot of its stalk at the origin and its
 *   leaves up the Y axis, about two thirds as large as one that
 *   stands in a patch.
 */
export function createHeldClover(): Group {
  const clover: Group = createStandingClover(buildCloverParts());
  clover.scale.setScalar(HELD_SCALE);
  return clover;
}

/**
 * The four-leaf clovers of the patches of clover, and the items on the
 * ground, as the server last told of them.
 */
export class ItemFigures implements FigureSet {
  readonly #parent: Object3D;
  readonly #parts: CloverParts = buildCloverParts();
  readonly #patches: Group[];
  readonly #lying = new Map<number, [GroundItem, Group]>();
  /**
   * The model of a four-leaf clover lying on the ground, which the page
   * draws itself.
   */
  readonly #lyingClover: LoadedModel;
  /** The models the items on the ground are drawn with. */
  #models: readonly LoadedModel[];

  /**
   * Starts with a four-leaf clover drawn in no patch, and nothing on the
   * ground.
   *
   * @param {Object3D} parent - What the clovers are added to.
   */
  constructor(parent: Object3D) {
    this.#parent = parent;
    this.#lyingClover = {
      file: LYING_CLOVER_MODEL,
      root: createLyingClover(this.#parts),
      clips: [],
    };
    this.#models = [this.#lyingClover];
    this.#patches = CLOVER_PATCHES.map(({ x, z }) => {
      const clover: Group = createStandingClover(this.#parts);
      clover.position.set(x, 0, z);
      clover.visible = false;
      parent.add(clover);
      return clover;
    });
  }

  /**
   * Draws the items on the ground from now on with the models of their
   * kinds among the models, as {@link LYING_ITEM_MODELS} names them, and
   * those already on the ground at once.  A four-leaf clover is drawn
   * whatever the models.
   *
   * @param {readonly LoadedModel[]} models - The models.
   */
  useModels(models: readonly LoadedModel[]): void {
    this.#models = [this.#lyingClover, ...models];
    for (const [id, [item, figure]] of this.#lying) {
      this.#parent.remove(figure);
      this.#lying.set(id, [item, this.#layItem(item)]);
    }
  }

  /**
   * Shows a four-leaf clover standing in each patch of clover that has
   * its clover, and each item on the ground lying there as what it is, as
   * the model of its kind, where the item lies now, even if an item of the
   * same number lay elsewhere before, and nothing else.  An item whose
   * model is not among the models is not drawn.
   *
   * @param {FigureFrame} frame - How things are shown at the frame, with
   *   what there is to pick in the world, or `null` to show nothing.
   */
  show(frame: FigureFrame): void {
    this.#showItems(frame.items);
  }

  /** Does nothing over time: the items stand still. */
  update(): void {
    // The items stand still.
  }

  /** Shows nothing, as the player of the page leaves its map. */
  clear(): void {
    this.#showItems(null);
  }

  /**
   * Shows what there is to pick, as {@link show} tells.
   *
   * @param {WorldItems | null} world - What there is to pick in the world,
   *   or `null` to show nothing.
   */
  #showItems(world: WorldItems | null): void {
    const clovers = new Set<number>(world?.clovers ?? []);
    this.#patches.forEach((clover: Group, patch: number) => {
      clover.visible = clovers.has(patch);
    });
    const items: readonly GroundItem[] = world?.items ?? [];
    const isSame = (a: GroundItem, b: GroundItem): boolean =>
      a.x === b.x && a.z === b.z;
    for (const [id, [lying, figure]] of this.#lying) {
      const item: GroundItem | undefined = items.find(
        (candidate: GroundItem) => candidate.id === id,
      );
      if (item === undefined || !isSame(item, lying)) {
        this.#parent.remove(figure);
        this.#lying.delete(id);
      }
    }
    for (const item of items) {
      if (!this.#lying.has(item.id)) {
        this.#lying.set(item.id, [item, this.#layItem(item)]);
      }
    }
  }

  /**
   * Lays the figure of an item on the ground where it lies, turned on from
   * the item before it.
   *
   * @param {GroundItem} item - The item.
   * @returns {Group} The figure, a copy of the model of the kind of the
   *   item, or nothing if the model is not among the models.
   */
  #layItem(item: GroundItem): Group {
    const figure = new Group();
    const name: string = LYING_ITEM_MODELS[item.kind];
    const model: LoadedModel | undefined = this.#models.find(
      (candidate: LoadedModel) => candidate.file === name,
    );
    if (model !== undefined) {
      const copy: Object3D = model.root.clone();
      copy.traverse((node: Object3D) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      figure.add(copy);
    }
    figure.position.set(item.x, LYING_LIFT, item.z);
    figure.rotation.y = (((item.id * LYING_TURN) % 360) * Math.PI) / 180;
    this.#parent.add(figure);
    return figure;
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
      ([item, figure]: [GroundItem, Group]) => ({
        id: item.id,
        kind: item.kind,
        x: figure.position.x,
        z: figure.position.z,
      }),
    );
    return { clovers, items };
  }
}
