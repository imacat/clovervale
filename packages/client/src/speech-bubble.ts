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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/speech-bubble The bubble above the head of a villager that
 *   shows what it says, and the bubbles above the heads of the players
 *   that show what they say.
 */

import type { Camera, Object3D, Sprite, Vector3 } from 'three';

import type { Villager, VillagerId } from '@clovervale/shared';

import {
  disposeBubble,
  enlargeBubble,
  findTextSize,
  findWidest,
  paintSpeech,
  placeBubble,
  setOpacity,
  stackBubble,
} from './bubble-sprite.ts';
import type { SpeechScreen, ViewSize } from './bubble-sprite.ts';
import type { PlayerSaying } from './chat-channels.ts';
import type { PlainMessageId } from './messages/en.ts';
import { SpeechLines } from './speech-lines.ts';
import type { SpeechWords } from './speech-lines.ts';
import { measureSpeechDuration } from './speech-text.ts';
import type { Translator } from './translator.ts';

/** How long a bubble takes to fade away at its end, in seconds. */
const FADE_DURATION = 0.5;
/** The room between the top of the head and the bubble, in metres. */
const BUBBLE_MARGIN = 0.15;

/** What a bubble shows, and where. */
export interface SpeechView {
  /** The name of the villager who speaks. */
  readonly name: string;
  /** What the villager says. */
  readonly line: string;
  /** The position of the foot of the bubble along the X axis, in metres. */
  readonly x: number;
  /** The height of the foot of the bubble, in metres. */
  readonly y: number;
  /** The position of the foot of the bubble along the Z axis, in metres. */
  readonly z: number;
  /**
   * The size of the words on the screen, in CSS pixels, or `null` before
   * the bubble is told the view.
   */
  readonly textSize: number | null;
  /**
   * Where the bubble is on the screen as it was last drawn, or `null`
   * before it is drawn in a view it was told, or while the one who speaks
   * is behind the camera, where it is not seen.
   */
  readonly screen: SpeechScreen | null;
}

/** What the bubble of a player shows, and where. */
export interface SaidView {
  /** The identifier of the player who speaks. */
  readonly player: number;
  /** What the player says. */
  readonly line: string;
  /** The position of the foot of the bubble along the X axis, in metres. */
  readonly x: number;
  /** The height of the foot of the bubble, in metres. */
  readonly y: number;
  /** The position of the foot of the bubble along the Z axis, in metres. */
  readonly z: number;
  /**
   * Whether the bubble is to be seen, which it is not while the player is
   * off the screen.
   */
  readonly isShown: boolean;
  /**
   * Where the bubble is on the screen as it was last drawn, or `null`
   * before it is drawn in a view it was told, or while it is not seen.
   */
  readonly screen: SpeechScreen | null;
}

/** A bubble being shown. */
interface ShownSpeech {
  /** The villager who speaks, or `null` for a player. */
  readonly villager: Villager | null;
  /** The position of the line the villager says among its lines. */
  readonly lineIndex: number;
  /**
   * The message of the line the villager says, if it was given, in place of
   * one of its lines, or the message of the phrase a player says, if it
   * says one.
   */
  readonly lineId: PlainMessageId | null;
  /** What the bubble shows. */
  words: SpeechWords;
  /** The bubble, drawn on a sprite. */
  sprite: Sprite;
  /** The width and height of the bubble as it was drawn. */
  painted: readonly [number, number];
  /** The widest the bubble was laid out to be, in pixels. */
  widest: number;
  /** Where the bubble is on the screen, or `null` where it is not. */
  screen: SpeechScreen | null;
  /** How long it is shown for, in seconds. */
  readonly duration: number;
  /** How long it has been shown, in seconds. */
  age: number;
  /**
   * How far above the other bubbles it is drawn: 0 for the bubble of a
   * villager, and a higher number for each later bubble of a player.
   */
  readonly layer: number;
}

/**
 * The bubble that shows what the villager last talked to says, and a
 * bubble for each player that shows what it last said.
 */
export class SpeechBubble {
  readonly #parent: Object3D;
  readonly #lines: SpeechLines;
  readonly #paint: (words: SpeechWords, widest: number) => Sprite;
  #shown: ShownSpeech | null = null;
  /** The bubbles of the players, by the identifiers of the players. */
  readonly #said = new Map<number, ShownSpeech>();
  /** The number of bubbles of players shown so far. */
  #saidCount = 0;
  /** The view the bubbles are seen in, or `null` until it is told. */
  #view: ViewSize | null = null;

  /**
   * Starts without a bubble.
   *
   * @param {Object3D} parent - What the bubble is added to.
   * @param {Translator} translator - The translator of the text of the page.
   * @param {(words: SpeechWords, widest: number) => Sprite} [paint] - Draws
   *   a bubble no wider than told, in pixels, unless its name or a single
   *   word is wider, with the tip of its tail at its position, and its tail,
   *   if it has one of its own, as a sprite added to it, as a readable
   *   bubble with the name of the villager and what it says by default.
   * @param {() => number} [random] - Gives a random number in [0, 1) each
   *   time it is called, to pick the line a villager says by, as
   *   `Math.random` does by default.
   */
  constructor(
    parent: Object3D,
    translator: Translator,
    paint: (words: SpeechWords, widest: number) => Sprite = paintSpeech,
    random: () => number = Math.random,
  ) {
    this.#parent = parent;
    this.#lines = new SpeechLines(translator, random);
    this.#paint = paint;
  }

  /**
   * Shows what a villager says, in the language of the page, in a bubble
   * just above its head, for as long as {@link measureSpeechDuration}
   * tells, in place of any bubble of a villager shown before.  The
   * bubbles of the players stay as they are.
   *
   * A villager says the line it is given, or else, with several lines, one
   * of them, picked at random, but never the line it said the time before,
   * save that one who greets first says its first line the first time.
   * It is called by the name it goes by once it has told the player of the
   * page who it is, if it has, as {@link noticeAcquaintances} was last told.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   * @param {PlainMessageId | null} [lineId] - The message of the line it says,
   *   or `null` for one of its own lines, which it is by default.
   */
  say(
    villager: Villager,
    head: Vector3,
    lineId: PlainMessageId | null = null,
  ): void {
    this.#hide();
    const lineIndex: number =
      lineId === null ? this.#lines.pickLine(villager) : 0;
    const words: SpeechWords = this.#lines.describeVillagerLine(
      villager,
      lineIndex,
      lineId,
    );
    this.#shown = this.#show(villager, lineIndex, lineId, words, head, 0);
  }

  /**
   * Shows what a player says in a bubble of its own just above its head,
   * for as long as {@link measureSpeechDuration} tells, in place of the
   * bubble of that player shown before, if any: a line as it typed it, or
   * a phrase in the language of the page.  The bubbles of the other players
   * and that of a villager stay as they are, and a later bubble is drawn
   * over the earlier ones where they overlap.
   *
   * @param {PlayerSaying} saying - What the player says.
   * @param {Vector3} head - The top of the head of the player.
   */
  sayAs(saying: PlayerSaying, head: Vector3): void {
    const { player, line, lineId } = saying;
    this.hushPlayer(player);
    const words: SpeechWords = this.#lines.describePlayerLine(line, lineId);
    const layer: number = ++this.#saidCount;
    this.#said.set(player, this.#show(null, 0, lineId, words, head, layer));
  }

  /**
   * Draws a new bubble just above a head, and adds it to the parent.
   *
   * @param {Villager | null} villager - The villager who speaks, or `null`
   *   for a player.
   * @param {number} lineIndex - The position of the line the villager says
   *   among its lines.
   * @param {PlainMessageId | null} lineId - The message of the line or the
   *   phrase it says, if any.
   * @param {SpeechWords} words - What the bubble shows.
   * @param {Vector3} head - The top of the head of the one who speaks.
   * @param {number} layer - How far above the other bubbles it is drawn.
   * @returns {ShownSpeech} The bubble, from the start of its time.
   */
  #show(
    villager: Villager | null,
    lineIndex: number,
    lineId: PlainMessageId | null,
    words: SpeechWords,
    head: Vector3,
    layer: number,
  ): ShownSpeech {
    const widest: number = findWidest(this.#view);
    const [sprite, painted] = this.#prepare(words, widest);
    if (layer > 0) {
      stackBubble(sprite, layer);
    }
    sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    this.#parent.add(sprite);
    return {
      villager,
      lineIndex,
      lineId,
      words,
      sprite,
      painted,
      widest,
      screen: null,
      duration: measureSpeechDuration(words.line),
      age: 0,
      layer,
    };
  }

  /**
   * Moves the bubble of a player, if it has one, to just above its head,
   * where the head is now, as it goes on speaking while it goes about, or
   * keeps the bubble from being seen while the player is off the screen.
   * The bubble goes on ageing unseen.
   *
   * @param {number} player - The identifier of the player.
   * @param {Vector3 | null} head - The top of the head of the player, or
   *   `null` while the player is off the screen.
   */
  followPlayer(player: number, head: Vector3 | null): void {
    const shown: ShownSpeech | undefined = this.#said.get(player);
    if (shown === undefined) {
      return;
    }
    shown.sprite.visible = head !== null;
    if (head === null) {
      shown.screen = null;
    } else {
      shown.sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    }
  }

  /**
   * Takes the bubble of a player away at once, if it has one.
   *
   * @param {number} player - The identifier of the player.
   */
  hushPlayer(player: number): void {
    const shown: ShownSpeech | undefined = this.#said.get(player);
    if (shown !== undefined) {
      this.#dispose(shown.sprite);
      this.#said.delete(player);
    }
  }

  /**
   * Lists the players who have a bubble now.
   *
   * @returns {number[]} The identifiers of the players, in the order they
   *   spoke.
   */
  listSpeakers(): number[] {
    return [...this.#said.keys()];
  }

  /**
   * Takes in the view the bubbles are seen in, and draws the bubbles shown,
   * if any, and those to come, at the size for it: as painted in a view at
   * least 600 pixels tall, and as large as in a view that tall in a shorter
   * one, as on a phone held on its side.  In a narrow view, as on a phone
   * held upright, a bubble is no wider than 85% of the view, unless a
   * single word is, its words wrapped onto more lines instead.
   *
   * @param {number} width - The width of the view, in CSS pixels.
   * @param {number} height - The height of the view, in CSS pixels.
   * @param {number} fieldOfView - The field of view of the camera, from top
   *   to bottom, in degrees.
   */
  fitView(width: number, height: number, fieldOfView: number): void {
    this.#view = { width, height, fieldOfView };
    for (const shown of this.#listShown()) {
      if (shown.widest === findWidest(this.#view)) {
        enlargeBubble(shown.sprite, shown.painted, this.#view);
      } else {
        this.#repaint(shown, shown.words);
      }
    }
  }

  /**
   * Takes in which villagers have told the player of the page who they are,
   * for the bubbles to come to call them by the names they then go by.
   *
   * @param {readonly VillagerId[]} acquaintances - The villagers.
   */
  noticeAcquaintances(acquaintances: readonly VillagerId[]): void {
    this.#lines.noticeAcquaintances(acquaintances);
  }

  /**
   * Moves the bubble of a villager to just above its head, where the head
   * is now, if the bubble being shown is that of the villager, as it goes
   * on speaking while it goes about.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   */
  follow(villager: Villager, head: Vector3): void {
    if (this.#shown?.villager?.id !== villager.id) {
      return;
    }
    this.#shown.sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
  }

  /**
   * Shows the bubble of a villager being shown, if any, and the phrases
   * the players say, in the language of the page now, in the same place,
   * until the same end.  What the players typed stays as they typed it,
   * drawn in the fonts of that language.
   */
  relabel(): void {
    for (const shown of this.#listShown()) {
      const { villager, lineId, words } = shown;
      const relabelled: SpeechWords =
        villager === null
          ? this.#lines.describePlayerLine(words.line, lineId)
          : this.#lines.describeVillagerLine(
              villager,
              shown.lineIndex,
              lineId,
            );
      this.#repaint(shown, relabelled);
    }
  }

  /**
   * Lets the bubbles age, fading each away at its end and taking it away
   * once it is over.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    const shown: ShownSpeech | null = this.#shown;
    if (shown !== null && !this.#age(shown, seconds)) {
      this.#hide();
    }
    for (const [player, said] of [...this.#said]) {
      if (!this.#age(said, seconds)) {
        this.hushPlayer(player);
      }
    }
  }

  /**
   * Takes every bubble away at once, that of a villager and those of the
   * players.
   */
  clear(): void {
    this.#hide();
    for (const player of this.listSpeakers()) {
      this.hushPlayer(player);
    }
  }

  /**
   * Takes the bubble of a villager away at once, if there is one, and
   * leaves those of the players.
   */
  hushVillagers(): void {
    this.#hide();
  }

  /**
   * Describes the bubble of a villager as it is shown now.
   *
   * @returns {SpeechView | null} What the bubble shows and where, or `null`
   *   while there is none.
   */
  describe(): SpeechView | null {
    if (this.#shown === null) {
      return null;
    }
    const { words, sprite, screen } = this.#shown;
    const { x, y, z } = sprite.position;
    const textSize: number | null =
      this.#view === null ? null : findTextSize(this.#view);
    return { name: words.name, line: words.line, x, y, z, textSize, screen };
  }

  /**
   * Describes the bubbles of the players as they are shown now.
   *
   * @returns {SaidView[]} What each bubble shows and where, in the order
   *   the players spoke.
   */
  describeSaid(): SaidView[] {
    return [...this.#said].map(
      ([player, { words, sprite, screen }]: [number, ShownSpeech]) => ({
        player,
        line: words.line,
        x: sprite.position.x,
        y: sprite.position.y,
        z: sprite.position.z,
        isShown: sprite.visible,
        screen,
      }),
    );
  }

  /**
   * Lists every bubble shown now.
   *
   * @returns {ShownSpeech[]} The bubble of a villager, if any, and then
   *   those of the players.
   */
  #listShown(): ShownSpeech[] {
    const said: ShownSpeech[] = [...this.#said.values()];
    return this.#shown === null ? said : [this.#shown, ...said];
  }

  /**
   * Lets a bubble age, fading it away at its end.
   *
   * @param {ShownSpeech} shown - The bubble.
   * @param {number} seconds - The time that has passed, in seconds.
   * @returns {boolean} Whether the bubble is still to be shown.
   */
  #age(shown: ShownSpeech, seconds: number): boolean {
    shown.age += seconds;
    const left: number = shown.duration - shown.age;
    if (left <= 0) {
      return false;
    }
    setOpacity(shown.sprite, Math.min(left / FADE_DURATION, 1));
    return true;
  }

  /**
   * Draws a bubble at the size for the view it is seen in, to be placed on
   * the screen, and its place recorded, each time it is drawn, once the
   * view is told.
   *
   * @param {SpeechWords} words - What it shows.
   * @param {number} widest - The widest it may be, in pixels.
   * @returns {[Sprite, [number, number]]} The bubble, and its width and
   *   height as it was drawn.
   */
  #prepare(
    words: SpeechWords,
    widest: number,
  ): [Sprite, [number, number]] {
    const sprite: Sprite = this.#paint(words, widest);
    const painted: [number, number] = [sprite.scale.x, sprite.scale.y];
    enlargeBubble(sprite, painted, this.#view);
    // It is kept on the screen even when the one who speaks is not.
    sprite.frustumCulled = false;
    sprite.onBeforeRender = (
      ...args: Parameters<Sprite['onBeforeRender']>
    ): void => {
      const shown: ShownSpeech | undefined = this.#listShown().find(
        (candidate: ShownSpeech) => candidate.sprite === sprite,
      );
      if (shown !== undefined && this.#view !== null) {
        const camera: Camera = args[2];
        shown.screen = placeBubble(sprite, this.#view, camera);
      }
    };
    return [sprite, painted];
  }

  /**
   * Draws the bubble shown again with what it shows now, laid out for the
   * view it is seen in, in the same place, as faded as it was, until the
   * same end.
   *
   * @param {ShownSpeech} shown - The bubble shown.
   * @param {SpeechWords} words - What it shows now.
   */
  #repaint(shown: ShownSpeech, words: SpeechWords): void {
    const widest: number = findWidest(this.#view);
    const [sprite, painted] = this.#prepare(words, widest);
    sprite.position.copy(shown.sprite.position);
    sprite.visible = shown.sprite.visible;
    if (shown.layer > 0) {
      stackBubble(sprite, shown.layer);
    }
    setOpacity(sprite, shown.sprite.material.opacity);
    this.#dispose(shown.sprite);
    this.#parent.add(sprite);
    shown.words = words;
    shown.sprite = sprite;
    shown.painted = painted;
    shown.widest = widest;
    shown.screen = null;
  }

  /** Takes the bubble of a villager away, if there is one. */
  #hide(): void {
    if (this.#shown === null) {
      return;
    }
    this.#dispose(this.#shown.sprite);
    this.#shown = null;
  }

  /**
   * Takes a bubble away.
   *
   * @param {Sprite} sprite - The bubble.
   */
  #dispose(sprite: Sprite): void {
    this.#parent.remove(sprite);
    disposeBubble(sprite);
  }
}
