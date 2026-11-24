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
 * @module client/game-session The play of the page with the game server:
 *   what it does at every frame, with every message from the server, with
 *   every input of its player, and as it is cut off.
 */

import type { Object3D } from 'three';

import {
  NOON,
  PLAYER_HEALTH,
  PROTOCOL_VERSION,
  STEP_MILLISECONDS,
  areMonstersPaused,
  createInteractMessage,
  decodeServerMessage,
  findQuest,
} from '@clovervale/shared';
import type {
  ClientMessage,
  DialogueView,
  MapId,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  ServerMessage,
  SnapshotMessage,
  StampedInput,
  VillagerId,
} from '@clovervale/shared';

import type { BackgroundMusic } from './background-music.ts';
import { keepFollowedPlayer } from './camera-choice.ts';
import { isHeardMessage, readSaying } from './chat-channels.ts';
import { findShownTime } from './day-clock.ts';
import type { DayClock } from './day-clock.ts';
import type { DrawnPusherStep } from './drawn-pusher-step.ts';
import type { FigureFrame } from './figure-set.ts';
import type { PlayersView } from './interpolation.ts';
import type { ItemNotices } from './item-notices.ts';
import type { MapScene } from './map-scene.ts';
import type { MapStage } from './map-stage.ts';
import type { OwnPlayer } from './own-player.ts';
import type { PanelReadouts } from './panel-readouts.ts';
import type { PlayControls } from './play-controls.ts';
import { chooseSpaceInput } from './player-input.ts';
import type { PlayerRecord } from './player-record.ts';
import { placeOwnPlayer } from './prediction.ts';
import type { PlayerPrediction } from './prediction.ts';
import type { ServerLink } from './server-link.ts';
import type { ClientSettings } from './settings.ts';
import { applySnapshot } from './snapshot-intake.ts';
import type { SnapshotGains, SnapshotParts } from './snapshot-intake.ts';
import { findSpaceAction } from './space-action.ts';
import type { SpaceAction, SpaceContext } from './space-action.ts';
import { describePrompt } from './space-words.ts';
import type { StoryFigures } from './story-figures.ts';
import { findShownItems } from './toby-finds.ts';
import type { WorldNews } from './toby-finds.ts';
import type { Translator } from './translator.ts';
import type { Viewport } from './viewport.ts';

/** What the page plays with. */
export interface SessionParts {
  /** The translator of the text of the page. */
  readonly translator: Translator;
  /** The settings the client runs by. */
  readonly settings: ClientSettings;
  /** What the settings panel reads out of the play of the page. */
  readonly readouts: PanelReadouts;
  /** What the server has told the page of its player and of the world. */
  readonly record: PlayerRecord;
  /** The player of the page as the page draws it. */
  readonly ownPlayer: OwnPlayer;
  /** The connection to the game server. */
  readonly link: ServerLink;
  /** What stands wherever the player of the page is. */
  readonly stage: MapStage;
  /** Each map, as it is shown whoever is connected. */
  readonly scenes: Readonly<Record<MapId, MapScene>>;
  /** The villagers as the story has them shown. */
  readonly story: StoryFigures;
  /** The controls of play, and the sheets and the boxes over play. */
  readonly controls: PlayControls;
  /** The notices of the items and the silver coins the player gets. */
  readonly itemNotices: ItemNotices;
  /** The music of the village. */
  readonly music: BackgroundMusic;
  /** The time of day of the world, as the page reckons it. */
  readonly dayClock: DayClock;
  /** The outlines of the obstacles of every map. */
  readonly outlines: readonly Object3D[];
  /**
   * Shows each container open and empty if it holds nothing or has been
   * looted, and shut otherwise.
   *
   * @param {readonly number[]} looted - The numbers of the containers that
   *   have been looted.
   */
  readonly showLooted: (looted: readonly number[]) => void;
  /**
   * Gives the view the page shows, which is asked for only once it is
   * shown.
   *
   * @returns {Viewport} The view.
   */
  readonly readViewport: () => Viewport;
}

/**
 * The play of the page with the game server, from before it connects until
 * it is cut off: what is shown at every frame, what each message from the
 * server changes, and what the inputs of the player of the page send.
 */
export class GameSession {
  /** What the page plays with. */
  readonly #parts: SessionParts;
  /** What a snapshot from the server is taken into. */
  readonly #snapshotParts: SnapshotParts;
  /**
   * The time of day the page last showed, which it goes on showing while it
   * does not know the time of day of the world.
   */
  #shownTime: number = NOON;

  /**
   * Takes what the page plays with, without connecting yet.
   *
   * @param {SessionParts} parts - What the page plays with.
   */
  constructor(parts: SessionParts) {
    this.#parts = parts;
    const { record, ownPlayer, stage, dayClock } = parts;
    this.#snapshotParts = { record, ownPlayer, stage, dayClock };
  }

  /**
   * The time of day the page shows.
   *
   * @returns {number} The time of day, from 0 up to 1.
   */
  get shownTime(): number {
    return this.#shownTime;
  }

  /**
   * Shows a frame: the controls of play are read, as
   * {@link PlayControls.update} tells, and the lines due to be said are
   * sent; every set of figures is shown as things are at the frame, as the
   * settings have them shown, with what the panel reads of how the players
   * are shown, the prompt of the space bar, and the camera on the player
   * the settings have it follow, as it is shown; then the ending sheet, the
   * time of day, the outlines of the obstacles and the music, and last
   * everything moves on by the time since the last frame.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   */
  showFrame(seconds: number): void {
    const {
      settings,
      readouts,
      record,
      ownPlayer,
      link,
      stage,
      scenes,
      controls,
      music,
      outlines,
    } = this.#parts;
    controls.update(seconds);
    link.sendDueSay();
    const now: number = performance.now();
    const frame: FigureFrame = this.#readFrame(now);
    stage.show(frame);
    readouts.showFrame(frame, stage.timeline.latest, ownPlayer.prediction);
    this.#showPrompt(frame, now);
    this.#followCamera(frame);
    controls.showEnding(
      findQuest(record.quests, 'clovervale')?.isDone === true,
      stage.map,
    );
    this.#showTimeOfDay();
    for (const outline of outlines) {
      outline.visible = settings.obstacles.isShown;
    }
    music.update(settings.music);
    for (const scene of Object.values(scenes)) {
      scene.update(seconds);
    }
    stage.update(seconds, frame);
  }

  /**
   * Handles a message from the game server.
   *
   * @param {string} data - The message as received.
   */
  receiveMessage(data: string): void {
    const { translator, readouts, record, ownPlayer, stage, story, dayClock } =
      this.#parts;
    let message: ServerMessage;
    try {
      message = decodeServerMessage(data);
    } catch {
      readouts.showServer(() => translator.translate('server.misbehaving'));
      return;
    }
    if (message.type === 'map') {
      stage.noteComingMap(message.map);
      return;
    }
    if (message.type === 'snapshot') {
      const gains: SnapshotGains | null = applySnapshot(
        message,
        performance.now(),
        this.#snapshotParts,
      );
      if (gains !== null) {
        this.#showSnapshot(message, gains);
      }
      return;
    }
    if (message.type === 'speech') {
      if (record.playerId !== null) {
        const step: number = ownPlayer.prediction?.step ?? 0;
        story.showSpeech(message.villager, message.line, step, stage.map);
      }
      return;
    }
    if (isHeardMessage(message)) {
      if (record.playerId !== null) {
        stage.showSaid(readSaying(message));
      }
      return;
    }
    if (message.type === 'events') {
      if (record.playerId !== null) {
        stage.events.receive(message.events);
      }
      return;
    }
    const version = String(message.protocolVersion);
    if (message.protocolVersion !== PROTOCOL_VERSION || message.day === null) {
      readouts.showServer(() =>
        translator.translate('server.incompatible', { version }),
      );
      return;
    }
    record.welcome(message.playerId);
    dayClock.start(message.day);
    readouts.showServer(() =>
      translator.translate('server.connected', { version }),
    );
    readouts.showWelcome();
  }

  /**
   * Gives the player of the page an input, which the prediction shows from
   * now on and which is sent to the server, if the server has told the
   * page of the player and the connection is still open.
   *
   * An interaction names the time of the server at which the world was as
   * the page shows it at the step the interaction shows from, for the
   * server to judge it on, if the settings have it so.
   *
   * @param {PlayerInput} input - The input.
   * @returns {boolean} Whether the player was given the input.
   */
  sendInput(input: PlayerInput): boolean {
    const { settings, ownPlayer, link, stage } = this.#parts;
    const prediction: PlayerPrediction | null = ownPlayer.prediction;
    if (prediction === null || !link.isOpen) {
      return false;
    }
    const stamped: StampedInput = prediction.issueInput(
      input,
      performance.now(),
    );
    let message: ClientMessage = stamped;
    if (stamped.type === 'interact' && settings.compensation.isEnabled) {
      const { isEnabled, delay } = settings.interpolation;
      const viewTime: number | null = stage.timeline.findViewTime(
        prediction.inputStepTime,
        isEnabled ? delay : null,
      );
      message = createInteractMessage(stamped, viewTime);
    }
    link.send(message);
    return true;
  }

  /**
   * Has the player of the page say a line to the players nearby, if the
   * connection is open, as {@link ServerLink.say} tells.  Who hears it is
   * for the server to decide, and it shows above the player once the
   * server tells of it.
   *
   * @param {string} line - The line.
   */
  sayLine(line: string): void {
    const { record, link } = this.#parts;
    if (record.playerId !== null && link.isOpen) {
      link.say(line);
    }
  }

  /**
   * Finds what the space bar has the player of the page do now: what the
   * prompt tells it picks, as the page knows it now.
   *
   * @returns {PlayerInput | null} The input, or `null` while there is no
   *   prediction or the player is dead, when it is not to interact.
   */
  findSpaceInput(): PlayerInput | null {
    const prediction: PlayerPrediction | null =
      this.#parts.ownPlayer.prediction;
    if (prediction === null || prediction.motion.action === 'Die') {
      return null;
    }
    const step: number = prediction.readNextStep(performance.now());
    return chooseSpaceInput(
      findSpaceAction(this.#findSpaceContext(prediction.motion, step)),
    );
  }

  /**
   * Shows the page disconnected from the game server: it forgets its player
   * and the world, and shows the village as it does before it connects.
   */
  showDisconnected(): void {
    const {
      translator,
      settings,
      readouts,
      record,
      ownPlayer,
      link,
      stage,
      controls,
      dayClock,
    } = this.#parts;
    link.forget();
    record.forget();
    stage.returnToVillage();
    ownPlayer.forget();
    controls.closeChat();
    dayClock.reset();
    readouts.showServer(() => translator.translate('server.disconnected'));
    controls.showBag(null, PLAYER_HEALTH);
    this.#showDialogue(null, []);
    settings.camera.followedId = null;
    readouts.showSnapshot(null, null);
  }

  /**
   * Words everything the page shows in the language it speaks now, outside
   * the names in the panel, which the panel words itself, and what the page
   * words afresh at every frame.
   */
  relabel(): void {
    const { translator, readouts, stage } = this.#parts;
    document.documentElement.lang = translator.language;
    document.title = translator.translate('title');
    readouts.relabel(stage.timeline.latest, stage.timeline.latestMonsters);
    stage.speech.relabel();
  }

  /**
   * Reads how things are to be shown at a frame, as the settings have them
   * shown, once the prediction of the player of the page has gone on to
   * now.  The player of the page is shown as predicted, gliding over its
   * corrections and, while it rests, pushed out of the way of the pushers
   * as foreseen, if the settings have it so, or like the others.  The others
   * and the monsters are shown either smoothly, as they were a while ago,
   * or exactly as the latest snapshot tells them, and so are the hits among
   * them.  The step of the server shown is the one the player of the page
   * is shown at as it walks, running on evenly whether it walks or rests,
   * while the player of the page is shown as predicted, and that of the
   * others otherwise; the patches of clover are shown with their clovers as
   * they are at that step, as far as those Toby takes go.  The monsters
   * stand still as the server holds them.
   *
   * @param {number} now - The time of the page, in milliseconds.
   * @returns {FigureFrame} How things are to be shown.
   */
  #readFrame(now: number): FigureFrame {
    const { settings, record, ownPlayer, stage, controls } = this.#parts;
    const ownId: number | null = record.playerId;
    const prediction: PlayerPrediction | null = ownPlayer.prediction;
    const { isEnabled, delay } = settings.interpolation;
    let view: PlayersView = isEnabled
      ? stage.timeline.readPast(now, delay)
      : stage.timeline.readLatest();
    const isOwn = (player: PlayerState): boolean => player.id === ownId;
    const latest: PlayerState | undefined = stage.timeline.latest?.find(isOwn);
    prediction?.advance(now);
    const pusherStep: DrawnPusherStep | null = ownPlayer.pusherStep;
    let shownStep: number | null = null;
    if (settings.prediction.isEnabled && pusherStep !== null) {
      shownStep = pusherStep.read(now);
    } else if (view.time !== null) {
      shownStep = view.time / STEP_MILLISECONDS;
    }
    // The smoothing and the forecast are told of every frame, so that a glide
    // or a push ends as soon as prediction is switched off.
    const drawn: PlayerMotion | null = ownPlayer.readDrawn(
      now,
      stage.map,
      shownStep,
    );
    if (
      settings.prediction.isEnabled &&
      drawn !== null &&
      latest !== undefined
    ) {
      const players: PlayerState[] = placeOwnPlayer(
        view.players,
        latest,
        drawn,
      );
      view = { ...view, players };
    }
    const news: WorldNews | null = record.worldNews;
    return {
      map: stage.map,
      ownId,
      view,
      latestMonsters: stage.timeline.latestMonsters,
      shownStep,
      items:
        news === null ? null : findShownItems(news, shownStep ?? news.step),
      ownMotion: prediction?.motion ?? null,
      ownStep: prediction?.step ?? 0,
      areMonstersPaused: areMonstersPaused(stage.map, controls.isInDialogue),
    };
  }

  /**
   * Has the camera follow the player the settings have it follow, the
   * player of the page by default, as it is shown at a frame.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  #followCamera(frame: FigureFrame): void {
    const followedId: number | null =
      this.#parts.settings.camera.followedId ?? frame.ownId;
    const followed: PlayerState | undefined = frame.view.players.find(
      (player: PlayerState) => player.id === followedId,
    );
    if (followed !== undefined) {
      this.#parts.readViewport().follow(followed);
    }
  }

  /**
   * Shows what the space bar has the player of the page do at a frame, as
   * the player is predicted and would start an interaction at its next
   * step, in the prompt, hidden while the player is in a dialogue, and in
   * the panel.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   * @param {number} now - The time of the page, in milliseconds.
   */
  #showPrompt(frame: FigureFrame, now: number): void {
    const { translator, readouts, record, ownPlayer, controls } = this.#parts;
    const nextStep: number = ownPlayer.prediction?.readNextStep(now) ?? 0;
    const action: SpaceAction | null =
      frame.ownMotion === null
        ? null
        : findSpaceAction(this.#findSpaceContext(frame.ownMotion, nextStep));
    const { acquaintances } = record;
    controls.prompt.show(
      controls.isInDialogue
        ? null
        : describePrompt(translator, action, acquaintances, controls.isTouch()),
    );
    readouts.showSpaceKey(action);
  }

  /**
   * Gathers what tells what the space bar makes the player of the page do,
   * as the page knows it now.
   *
   * @param {PlayerMotion} motion - The motion of the player as predicted.
   * @param {number} step - The step an interaction would start at.
   * @returns {SpaceContext} What tells it.
   */
  #findSpaceContext(motion: PlayerMotion, step: number): SpaceContext {
    const { record, stage } = this.#parts;
    return {
      motion,
      step,
      world: record.findWorldItems(step),
      inventory: record.inventory ?? [],
      map: stage.map,
      monsters: stage.timeline.latestMonsters ?? [],
    };
  }

  /**
   * Shows every map as it looks at the time of day the settings preview,
   * or else at the time of day of the world, as
   * {@link MapScene.showTimeOfDay} tells, and tells the time of day of the
   * world in the panel.  The preview is the page's alone: the server is
   * never told of it.
   */
  #showTimeOfDay(): void {
    const { settings, readouts, dayClock, scenes } = this.#parts;
    const worldTime: number | null = dayClock.read(performance.now());
    readouts.showTimeOfDay(worldTime);
    this.#shownTime =
      findShownTime(worldTime, settings.timePreview) ?? this.#shownTime;
    for (const scene of Object.values(scenes)) {
      scene.showTimeOfDay(this.#shownTime);
    }
  }

  /**
   * Shows what a snapshot from the server tells, once the page has taken
   * it in: the camera choices, the readouts of the panel, a notice of each
   * item and of the silver coins the player of the page has gained, the
   * containers looted, what the player carries, and the dialogue it is in.
   *
   * @param {SnapshotMessage} message - The snapshot.
   * @param {SnapshotGains} gains - What the player has gained since the
   *   snapshot before.
   */
  #showSnapshot(message: SnapshotMessage, gains: SnapshotGains): void {
    const { settings, readouts, record, itemNotices, controls, showLooted } =
      this.#parts;
    const ownId: number | null = record.playerId;
    settings.camera.followedId = keepFollowedPlayer(
      settings.camera.followedId,
      message.players,
    );
    readouts.showSnapshot(message.players, message.monsters);
    for (const kind of gains.items) {
      itemNotices.show(kind);
    }
    if (gains.silver > 0) {
      itemNotices.showSilver(gains.silver);
    }
    showLooted(message.looted);
    const health: number =
      message.players.find((player: PlayerState) => player.id === ownId)
        ?.health ?? PLAYER_HEALTH;
    controls.showBag(message.inventory, health, message.silver);
    this.#showDialogue(message.dialogue, message.acquaintances);
  }

  /**
   * Shows the dialogue the player of the page is in, as the server tells,
   * with the villagers called by the names they go by once they have told
   * the player who they are.  As a dialogue opens, the bubble of any
   * villager is taken away, though not those of the players, and the
   * controls of play are held, as {@link PlayControls.showDialogue} tells.
   *
   * @param {DialogueView | null} dialogue - The dialogue, or `null` while
   *   the player is in none.
   * @param {readonly VillagerId[]} known - The villagers who have told the
   *   player who they are.
   */
  #showDialogue(
    dialogue: DialogueView | null,
    known: readonly VillagerId[],
  ): void {
    const { stage, controls } = this.#parts;
    stage.speech.noticeAcquaintances(known);
    if (controls.showDialogue(dialogue, known)) {
      stage.speech.hushVillagers();
    }
  }
}
