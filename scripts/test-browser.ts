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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/test-browser Checks the built client in headless Firefox.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { inflateSync } from 'node:zlib';

import {
  CAVE_CONTAINERS,
  CAVE_DOG_HOMES,
  CAVE_LANDING,
  CAVE_ROPE,
  SIMULATION_RATE,
  SLASH_REACH,
  TOBY_ACTIVITIES,
  TOBY_GRAB_STEPS,
  TOBY_STOW_STEPS,
  VILLAGERS,
  WELL_STAND,
  findTobyGrab,
  findTobyPose,
  locateVillager,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GroundVector,
  TobyActivity,
  TobyGrab,
  TobyPose,
  Villager,
} from '@clovervale/shared';

/** A message received from the browser over WebDriver BiDi. */
interface BidiMessage {
  /** The kind of message: `success`, `error` or `event`. */
  readonly type?: string;
  /** The identifier of the command a response answers. */
  readonly id?: number;
  /** The result of a successful command. */
  readonly result?: unknown;
  /** The error code of a failed command. */
  readonly error?: string;
  /** The error message of a failed command. */
  readonly message?: string;
  /** The name of an event. */
  readonly method?: string;
  /** The parameters of an event. */
  readonly params?: unknown;
}

/** The callbacks that settle a command sent to the browser. */
interface PendingCommand {
  /** The name of the command. */
  readonly method: string;
  /** Settles the command with its result. */
  readonly resolve: (result: unknown) => void;
  /** Settles the command with its failure. */
  readonly reject: (error: Error) => void;
}

/** A player as a page shows it. */
interface FigureView {
  /** The identifier of the player. */
  readonly id: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** The name of the clip the player plays, or `null` if it has none. */
  readonly clip: string | null;
}

/** What a page tells at one moment. */
interface PageState {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** The values the panel of the client displays, by their names. */
  readonly panel: Readonly<Record<string, string>>;
  /** The players the client shows. */
  readonly figures: readonly FigureView[];
}

/** Martha as a page shows her, and its own player. */
interface MarthaLook {
  /** The map the page shows. */
  readonly map: string;
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: {
    readonly x: number;
    readonly z: number;
    readonly yaw: number;
    readonly action: string;
    readonly health: number;
  } | null;
  /** Martha in the latest snapshot, if she is there. */
  readonly martha: (CaveMonsterView & { readonly isArmed?: boolean }) | null;
  /** Martha as the page draws her, if it does. */
  readonly shown: {
    readonly clip: string | null;
    readonly isBarShown: boolean;
    readonly isPitchforkShown: boolean;
  } | null;
  /**
   * Whether Martha's pitchfork is drawn against the wall, and on the
   * ground, each `null` until its model is loaded.
   */
  readonly pitchfork: {
    readonly isOnWall: boolean | null;
    readonly isOnGround: boolean | null;
  };
  /** The way the camera looks, in degrees, as the yaw of a player. */
  readonly heading: number;
  /** The dialogue box, or `null` while it is closed. */
  readonly dialogue: DialogueLookView | null;
  /** The kinds of the items in the slots of the bag. */
  readonly slots: readonly string[];
  /** The notices of the items got. */
  readonly notices: readonly string[];
}

/** How a page shows its help sheet. */
interface HelpLook {
  /** Whether the sheet is open. */
  readonly isOpen: boolean;
  /** The title of the sheet. */
  readonly title: string;
  /** The words on the button at the foot of the sheet. */
  readonly ok: string;
  /** What each control the sheet lists does. */
  readonly labels: readonly string[];
  /** The key shown on the button of the sheet, or `null` if none is. */
  readonly buttonKey: string | null;
  /** Whether the bag is open. */
  readonly isBagOpen: boolean;
  /** The way the camera looks, in degrees, as the yaw of a player. */
  readonly heading: number;
  /** The players the page shows. */
  readonly figures: readonly FigureView[];
}

/** A monster in the latest snapshot of a page. */
interface CaveMonsterView {
  /** The identifier of the monster. */
  readonly id: number;
  /** The kind of the monster. */
  readonly kind: string;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** What the monster is doing. */
  readonly action: string;
  /** The health of the monster. */
  readonly health: number;
  /** What the monster is up to. */
  readonly mode: string;
}

/** How a page shows the map its player is in, and what it can do there. */
interface CaveLook {
  /** The map the page shows. */
  readonly map: string;
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: {
    readonly x: number;
    readonly z: number;
    readonly yaw: number;
    readonly action: string;
    readonly health: number;
  } | null;
  /** The first monster in the latest snapshot, if there is one. */
  readonly monster: { readonly x: number; readonly z: number } | null;
  /** The monsters in the latest snapshot. */
  readonly monsters: readonly CaveMonsterView[];
  /** The latest hits the page has shown, the latest last. */
  readonly hits: readonly HitView[];
  /** The identifiers of the players the page shows. */
  readonly figures: readonly number[];
  /** What the space bar does, as the panel tells. */
  readonly spaceKey: string;
  /** The prompt at the foot of the page, if it is shown. */
  readonly prompt: string | null;
  /** What the bubble above a villager shows, if one is shown. */
  readonly speech: SpeechView | null;
  /** What the dialogue box shows, if it is open. */
  readonly dialogue: DialogueLookView | null;
  /** Whether each container of the cave is shown open, by its number. */
  readonly containers: readonly boolean[];
  /** Whether the bag is open. */
  readonly isBagOpen: boolean;
  /** The kind of the item in each slot of the bag, or `''` if it is empty. */
  readonly slots: readonly string[];
  /** The name the bag shows of the item under its cursor, or `''`. */
  readonly bagItemName: string;
  /**
   * The actions the open menu of an item lists, each with whether it can
   * be chosen, or `null` if no menu is open.
   */
  readonly menu: readonly MenuActionView[] | null;
  /** The notices of the items got that the page shows, the earliest first. */
  readonly notices: readonly string[];
  /** The latest heals the page has shown, the latest last. */
  readonly heals: readonly HealView[];
}

/** What the dialogue box of a page shows. */
interface DialogueLookView {
  /** The name of the villager. */
  readonly name: string;
  /** What the villager has just said. */
  readonly line: string;
  /** The replies offered, in order. */
  readonly replies: readonly string[];
  /** The place of the reply the cursor is on, from 0. */
  readonly cursor: number;
}

/** An action the open menu of an item in the bag lists. */
interface MenuActionView {
  /** The name of the action. */
  readonly label: string;
  /** Whether it can be chosen. */
  readonly isEnabled: boolean;
}

/** A page as it is at one moment: what it tells, and what it draws. */
interface PageLook extends PageState {
  /** The fraction of the foot of the view that is lit grass, from 0 to 1. */
  readonly grassFraction: number;
}

/** How a page shows a walking player, frame after frame. */
interface WalkSample {
  /** The position along the X axis the page shows the player at. */
  readonly drawn: number;
  /** The position along the X axis the latest snapshot tells. */
  readonly told: number;
}

/** How a page shows its own player, against what the server tells. */
interface OwnView {
  /** Where the page draws the player, or `null` if it does not. */
  readonly drawn: { readonly x: number; readonly z: number } | null;
  /** The player in the latest snapshot, or `null` if it is not there. */
  readonly told: {
    readonly x: number;
    readonly z: number;
    readonly action: string;
  } | null;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
}

/** Where a page has its camera. */
interface CameraView {
  /** The player the camera control of the panel has chosen. */
  readonly chosen: string;
  /** The players the camera control of the panel offers. */
  readonly offered: readonly string[];
  /** Where what the camera looks at stands. */
  readonly focus: { readonly x: number; readonly z: number };
  /** The players the page shows. */
  readonly figures: readonly FigureView[];
}

/** Who takes part in a hit. */
interface HitPartyView {
  /** Whether it is a player or a monster. */
  readonly kind: string;
  /** The identifier of the player or of the monster. */
  readonly id: number;
}

/** A hit a page has shown. */
interface HitView {
  /** The number of the event. */
  readonly id: number;
  /** Who struck. */
  readonly attacker: HitPartyView;
  /** Who was struck. */
  readonly target: HitPartyView;
  /** How much health the target lost. */
  readonly damage: number;
}

/** How a page shows the monster and its own player, and the hits. */
interface MonsterLook {
  /** The player of the page in the latest snapshot, if it is there. */
  readonly own: {
    readonly x: number;
    readonly z: number;
    readonly yaw: number;
    readonly action: string;
    readonly health: number;
  } | null;
  /** The monster in the latest snapshot, if it is there. */
  readonly monster: {
    readonly x: number;
    readonly z: number;
    readonly action: string;
    readonly health: number;
    readonly mode: string;
  } | null;
  /** How much of the health bar of the monster the page fills, if shown. */
  readonly bar: number | null;
  /** The latest hits the page has shown, the latest last. */
  readonly hits: readonly HitView[];
}

/** A heal a page has shown. */
interface HealView {
  /** The number of the event. */
  readonly id: number;
  /** Who got health back. */
  readonly target: HitPartyView;
  /** How much health the target got back. */
  readonly amount: number;
}

/** How a page shows a player by the fountain, and the heals. */
interface FountainLook {
  /** The player in the latest snapshot, if it is there. */
  readonly own: {
    readonly x: number;
    readonly z: number;
    readonly action: string;
    readonly health: number;
  } | null;
  /** How much of the health bar of the player the page fills, if shown. */
  readonly bar: number | null;
  /** The latest heals the page has shown, the latest last. */
  readonly heals: readonly HealView[];
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** What the panel of the page tells the space bar does. */
  readonly spaceKey: string;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
}

/** What the bubble above the head of a villager shows, and where. */
interface SpeechView {
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
}

/** The name of a villager and what it says, as a bubble shows them. */
interface SpeechWordsView {
  /** The name of the villager. */
  readonly name: string;
  /** What it says. */
  readonly line: string;
}

/** How a page shows a player by a villager, and what the villager says. */
interface TalkLook {
  /** The player in the latest snapshot, if it is there. */
  readonly own: {
    readonly x: number;
    readonly z: number;
    readonly action: string;
  } | null;
  /** The bubble the page shows, or `null` if it shows none. */
  readonly speech: SpeechView | null;
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** What the panel of the page tells the space bar does. */
  readonly spaceKey: string;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
  /** How far back the panel of the page tells its last slash was judged. */
  readonly judgedBack: string;
}

/** The time of day a page tells. */
interface TimeOfDayView {
  /**
   * The time of day of the world, from 0 up to 1, or `null` before the
   * page knows it.
   */
  readonly world: number | null;
  /** The time of day the page shows, from 0 up to 1. */
  readonly shown: number;
  /**
   * The moment the page told the time of day, in milliseconds since the
   * Unix epoch, on the clock of the browser, which all its pages share.
   */
  readonly moment: number;
}

/** How a page shows Toby, and when it tells that. */
interface TobyLook {
  /** How the page shows Toby, or `null` while it does not show him. */
  readonly toby: {
    /** The step of the server he is shown at, which may fall between two. */
    readonly step: number;
    /** Where he is shown along the X axis, in metres. */
    readonly x: number;
    /** Where he is shown along the Z axis, in metres. */
    readonly z: number;
    /** The turn around the Y axis from facing +Z towards +X, in degrees. */
    readonly yaw: number;
    /** What he is doing. */
    readonly activity: TobyActivity;
    /** The name of the clip his model plays, or `null` if it has none. */
    readonly clip: string | null;
    /** Whether he is shown holding a four-leaved clover he has found. */
    readonly isHolding: boolean;
  } | null;
  /**
   * The moment the page told it, in milliseconds since the Unix epoch, on
   * the clock of the browser, which all its pages share.
   */
  readonly moment: number;
}

/** How a page shows Toby as he picks, and what is around him. */
interface TobyFindLook {
  /** How the page shows Toby, or `null` while it does not show him. */
  readonly toby: TobyLook['toby'];
  /** What the bubble shown says, and who says it, or `null` for none. */
  readonly speech: { readonly name: string; readonly line: string } | null;
  /** The numbers of the patches shown with their four-leaved clover. */
  readonly clovers: readonly number[];
}

/** An item a page shows lying on the ground. */
interface ItemView {
  /** The identifier of the item. */
  readonly id: number;
  /** Where it lies along the X axis, in metres. */
  readonly x: number;
  /** Where it lies along the Z axis, in metres. */
  readonly z: number;
}

/** How a page shows the bag of its player. */
interface BagLook {
  /** Whether the bag is open. */
  readonly isOpen: boolean;
  /** The key shown on the icon of the bag, or `null` if it shows none. */
  readonly key: string | null;
  /** The slot the cursor of the bag is on, or -1 if on none. */
  readonly cursor: number;
  /** The actions the open menu of an item lists, or `null` if none is open. */
  readonly menu: readonly string[] | null;
  /** The action the cursor of the menu is on, or -1 if on none. */
  readonly menuCursor: number;
}

/** How a page shows a player, the clovers and the items, and its bag. */
interface InventoryLook {
  /** The player in the latest snapshot, if it is there. */
  readonly own: {
    readonly x: number;
    readonly z: number;
    readonly action: string;
  } | null;
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** How the page shows the bag of its player. */
  readonly bag: BagLook;
  /** What the panel of the page tells the space bar does. */
  readonly spaceKey: string;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
  /** The kind of item in each slot the page shows, or `''` if empty. */
  readonly slots: readonly string[];
  /** The patches of clover the page shows with their clover. */
  readonly clovers: readonly number[];
  /** The items the page shows on the ground. */
  readonly items: readonly ItemView[];
}

/** What a page shows in words, in the language it speaks. */
interface LanguageLook {
  /** The language of the page, as its document tells. */
  readonly lang: string;
  /** The title of the page. */
  readonly title: string;
  /** The titles of the panel and of its folders, in order. */
  readonly titles: readonly string[];
  /** The values the panel displays, by their names. */
  readonly panel: Readonly<Record<string, string>>;
  /** The languages the language control of the panel offers. */
  readonly offered: readonly string[];
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** The bubble the page shows, or `null` if it shows none. */
  readonly speech: SpeechView | null;
}

/** The pixels of an image. */
interface Pixels {
  /** The width of the image, in pixels. */
  readonly width: number;
  /** The height of the image, in pixels. */
  readonly height: number;
  /** The number of colour channels of every pixel. */
  readonly channels: number;
  /** The channels of the pixels, row by row from the top. */
  readonly data: Uint8Array;
}

const rootDir: string = path.resolve(import.meta.dirname, '..');
const clientDir: string = path.join(rootDir, 'packages/client/dist');
const serverFile: string = path.join(
  rootDir,
  'packages/server/dist/server.cjs',
);
const firefoxCommand: string = process.env.FIREFOX ?? 'firefox';

/** How long a program may take to start, in milliseconds. */
const START_TIMEOUT = 30_000;
/** How long the browser may take to answer a command, in milliseconds. */
const COMMAND_TIMEOUT = 15_000;
/** How long the page may take to draw and connect, in milliseconds. */
const PAGE_TIMEOUT = 20_000;
/** How long a page may take to show what a player does, in milliseconds. */
const ACTION_TIMEOUT = 10_000;
/** How long to wait between two looks at the page, in milliseconds. */
const POLL_INTERVAL = 100;
/** How long a program may take to stop when asked, in milliseconds. */
const STOP_TIMEOUT = 5_000;

/** The least a colour channel of a lit pixel can be, from 0 to 255. */
const LIT_CHANNEL = 96;
/** The least fraction of the foot of the view that is grass when drawn. */
const DRAWN_FRACTION = 0.1;
/** The model status of a client that has shown the models it could. */
const MODELS_SHOWN_PATTERN = /^\d+ shown/;

/** How far a player walks in the check, in metres. */
const WALK_DISTANCE = 2;
/** The yaw of a player that walks to the left of the first view. */
const LEFTWARD_YAW = -90;
/** The least change of a colour channel that changes a pixel, to 255. */
const CHANGED_CHANNEL = 48;
/** The least number of pixels a player changes by walking across a view. */
const MOVED_PIXELS = 3000;

/** How long a walking player is watched frame by frame, in milliseconds. */
const WATCH_DURATION = 1000;
/** The fewest frames a page draws while a walking player is watched. */
const WATCHED_FRAMES = 20;
/** The least fraction of the frames a smooth player is between snapshots. */
const SMOOTH_FRACTION = 0.8;
/** The most two positions differ by when they are the same, in metres. */
const SAME_POSITION = 1e-9;
/**
 * How far the camera is to go round its player while the left arrow is
 * held down in the check, in degrees.
 */
const KEY_ORBIT = 30;
/** The key value WebDriver gives the left arrow. */
const LEFT_ARROW = '\uE012';
/** The farthest a player standing still may seem to move, in metres. */
const STANDING_DRIFT = 0.01;

/** How long a page holds its messages back each way, in milliseconds. */
const NETWORK_DELAY = 300;
/** How long a player is walked for behind the delay, in milliseconds. */
const DELAYED_WALK_DURATION = 700;
/** The furthest back the server judges a slash, in milliseconds. */
const COMPENSATION_LIMIT = 1000;

/**
 * How long a player may take to walk from the plaza to the cottage on its
 * left, in milliseconds.
 */
const BLOCKED_TIMEOUT = 20_000;
/**
 * The number of looks in a row that must find a walking player where it
 * was, for it to count as stopped.
 */
const BLOCKED_LOOKS = 6;
/** How long a player is walked along an obstacle, in milliseconds. */
const SLIDE_DURATION = 700;

/**
 * How long a player may take to walk a leg to the monster, in
 * milliseconds.
 */
const LEG_TIMEOUT = 20_000;
/**
 * The least position along the Z axis of the stretch the player walks
 * along to and from the monster, in metres.  Along the whole stretch, the
 * way is clear from the path, between the bush and the rock west of the
 * spawn stones, and between the two stones on that side, to the far side
 * of the stones.
 */
const ROUTE_LEAST_Z = 8.6;
/** The greatest position along the Z axis of that stretch, in metres. */
const ROUTE_MOST_Z = 8.95;
/**
 * How far along the X axis the player walks towards the spawn stones, in
 * metres.  Anywhere along the stretch from there to the far side of the
 * stones, the player is less than 1.8 metres from the home of the monster,
 * which never wanders more than 3 metres from its home, so the player is
 * within the 5 metres the monster notices a player from, wherever the
 * monster is.
 */
const APPROACH_X = 9.7;
/** How long the monster may take to come to the player, in milliseconds. */
const MONSTER_TIMEOUT = 15_000;
/**
 * How near the monster must come before the player slashes it, from
 * centre to centre, in metres, which is within the reach of a slash.
 */
const MONSTER_NEARNESS = 1.3;
/** How long a key is tapped to step a player, in milliseconds. */
const TAP_DURATION = 40;
/**
 * The most degrees a player may face away from the way its keys walk it,
 * for it to count as facing that way.
 */
const YAW_TOLERANCE = 1;
/** How long a slash may take to show as a hit, in milliseconds. */
const HIT_TIMEOUT = 2000;
/** The health of a player at full health. */
const FULL_HEALTH = 100;
/**
 * The furthest along the X axis from the centre of the fountain a player
 * is walked to before it walks forward to the fountain, in metres.  From
 * there, it walks within reach of the fountain, facing it, for over two
 * seconds before it slides past the rim.
 */
const FOUNTAIN_X = 0.3;
/** What the panel tells the space bar does by the fountain, facing it. */
const DRINK_KEY = 'drink from the fountain';
/** What the panel tells the space bar does by the fountain, facing away. */
const SLASH_KEY = 'slash';
/** The prompt a page shows by the fountain, facing it. */
const DRINK_PROMPT = 'Press Space to drink from the fountain';
/** Where Nancy the villager stands along the X axis, in metres. */
const NANCY_X = 3.2;
/** Where Nancy the villager stands along the Z axis, in metres. */
const NANCY_Z = -6.4;
/**
 * The least position along the Z axis of the stretch a player is stepped
 * to, before it walks along the X axis towards Nancy from the side of the
 * fountain, in metres.  Along the whole stretch, the way to her is clear,
 * and she stands straight ahead of the player.
 */
const TALK_LEAST_Z = -6.55;
/** The greatest position along the Z axis of that stretch, in metres. */
const TALK_MOST_Z = -6.25;
/** What the panel tells the space bar does by Nancy, facing her. */
const TALK_KEY = 'talk to Nancy';
/** The prompt a page shows by Nancy, facing her. */
const TALK_PROMPT = 'Press Space to talk to Nancy';
/** What Nancy says. */
const NANCY_LINE =
  'There are wild dogs at the village gate, and no one can go out. What ' +
  'are we going to do?';
/**
 * The least position along the X axis of the way down the east side of the
 * plaza to the patch of clover east of the fountain, clear of the fountain
 * and of Nancy, in metres.
 */
const CLOVER_WAY_X = 2.3;
/** The number of the patch of clover east of the fountain. */
const CLOVER_PATCH = 6;
/** What the panel tells the space bar does by a clover to pick. */
const PICK_KEY = 'pick up the four-leaved clover';
/** The prompt a page shows by a clover to pick, facing it. */
const PICK_PROMPT = 'Press Space to pick up the four-leaved clover';
/** The actions the menu of a four-leaved clover in the bag lists. */
const CLOVER_ACTIONS: readonly string[] = ['Drop'];
/** The key values WebDriver gives the keys the bag takes, by their names. */
const BAG_KEYS = {
  enter: '\uE007',
  escape: '\uE00C',
  left: '\uE012',
  right: '\uE014',
} as const;
/**
 * How far from the feet of a player an item it puts down may be shown, in
 * metres.
 */
const ITEM_NEARNESS = 0.05;
/**
 * The farthest east the player walks on its way to the burrow among the
 * spawn stones, in metres, which has it well within reach of the burrow.
 */
const BURROW_X = 10.8;
/** What the panel tells the space bar does in the burrow. */
const ENTER_KEY = 'go down the burrow';
/** The prompt in the burrow. */
const ENTER_PROMPT = 'Press Space to go down the burrow';
/** What the panel tells the space bar does by the rope in the cave. */
const CLIMB_KEY = 'climb up the rope';
/** The prompt by the rope in the cave. */
const CLIMB_PROMPT = 'Press Space to climb up the rope';
/** What the panel tells the space bar does at the bars before the prisoner. */
const EDWIN_TALK_KEY = 'talk to Prisoner';
/** The prompt at the bars before the prisoner. */
const EDWIN_TALK_PROMPT = 'Press Space to talk to Prisoner';
/**
 * What the panel tells the space bar does at the bars before the prisoner,
 * once he has told the player who he is.
 */
const ENVOY_TALK_KEY = 'talk to Envoy Edwin';
/** The prompt at the bars before the prisoner, once he has told who he is. */
const ENVOY_TALK_PROMPT = 'Press Space to talk to Envoy Edwin';
/** The dialogue box as the prisoner first pleads, in English. */
const EDWIN_PLEA: DialogueLookView = {
  name: 'Prisoner',
  line: 'Help! Please help me!',
  replies: ['Who are you? What are you doing in there?'],
  cursor: 0,
};
/** The dialogue box as the prisoner first pleads, in Traditional Chinese. */
const ZH_TW_EDWIN_PLEA: DialogueLookView = {
  name: '囚犯',
  line: '救命！幫幫我！',
  replies: ['你是誰？怎麼會在這裏？'],
  cursor: 0,
};
/** The dialogue box as the prisoner tells who he is, in English. */
const EDWIN_IDENTITY: DialogueLookView = {
  name: 'Envoy Edwin',
  line:
    "I'm Edwin, a royal envoy. I came to spy on the enemy, but I got " +
    "caught, and now I'm locked up in here.",
  replies: ["Hang on, I'll find the key and get you out."],
  cursor: 0,
};
/** The dialogue box as Edwin gives his message, in English. */
const EDWIN_ERRAND: DialogueLookView = {
  name: 'Envoy Edwin',
  line:
    "No, there's no time. I've got news the king has to hear right away. " +
    "I've written it on this bit of cloth. Take it to him, quick. It's " +
    'urgent. Go!',
  replies: [],
  cursor: 0,
};
/** What Edwin reminds a player of who carries his message, in English. */
const EDWIN_REMINDER: SpeechWordsView = {
  name: 'Envoy Edwin',
  line: "Haven't you gone to the king yet? Go on, hurry!",
};
/** What Edwin calls out for help once the dogs are dead, in English. */
const EDWIN_CALL: SpeechWordsView = {
  name: 'Prisoner',
  line: 'Help! Is anyone there?',
};
/** The notice of the message from Clovervale got from Edwin. */
const MESSAGE_NOTICE = 'You got the message from Clovervale';
/** The notice of the token Martha gives up once beaten. */
const TOKEN_NOTICE = 'You got the token of the Clovervale spy';
/**
 * The dialogue box as Martha first asks a player Edwin has told who he is,
 * as it climbs out of her well.
 */
const MARTHA_ASK: DialogueLookView = {
  name: 'Chief Martha',
  line: 'Who are you? What were you doing down the well?',
  replies: [
    "Chief! There's a royal envoy locked up down the well. Quick, go and " +
      'save him!',
  ],
  cursor: 0,
};
/** The dialogue box as Martha owns up to being the spy. */
const MARTHA_CONFESSION: DialogueLookView = {
  name: 'Chief Martha',
  line:
    "Hmph, so you found out! I'm an enemy spy. That royal envoy tried to " +
    "sneak off with what he'd learnt, so I caught him and locked him up. " +
    'Now that you know too, you can stay and keep him company!',
  replies: [],
  cursor: 0,
};
/** How far Martha stands from her porch at the least to have come over. */
const MARTHA_LEAST_WALK = 1.5;
/** How many views of a thrust of Martha's pitchfork are saved. */
const THRUST_VIEW_COUNT = 10;
/** How long after each other the views of a thrust are saved, in ms. */
const THRUST_VIEW_INTERVAL = 60;
/**
 * How far the camera is turned round the player to look at Martha from
 * the side, the side of the well, away from the great tree, as a share of
 * the height of the view to drag across.
 */
const MARTHA_CAMERA_TURN = -0.25;
/**
 * How far the wheel is turned to zoom the camera in on Martha, in pixels,
 * below zero.
 */
const MARTHA_CAMERA_ZOOM = -1000;
/** How long Martha is left sitting before her view is saved, in ms. */
const SIT_SETTLE_DURATION = 1500;
/**
 * How long a key that would walk the player is held down in a dialogue, in
 * milliseconds, and how long the dogs are watched standing still then.
 */
const DIALOGUE_HOLD_DURATION = 1500;
/** What the panel tells the space bar does before a shut chest. */
const OPEN_CHEST_KEY = 'open the chest';
/** The prompt before a shut chest. */
const OPEN_CHEST_PROMPT = 'Press Space to open the chest';
/** What the panel tells the space bar does before a chest looted. */
const EMPTY_CHEST_KEY = 'nothing, as the chest is empty';
/** What the panel tells the space bar does before a shut barrel. */
const OPEN_BARREL_KEY = 'open the barrel';
/** What the panel tells the space bar does before a barrel looted. */
const EMPTY_BARREL_KEY = 'nothing, as the barrel is empty';
/** How many turns of the mouse wheel bring the camera close to the bones. */
const SKELETON_ZOOM_TURNS = 5;
/** How far the camera turns from looking west to look into the south cell. */
const SKELETON_TURN = -0.25;
/**
 * How far down the view the camera is dragged to look steeply down, as a
 * share of its height.
 */
const STEEP_TILT = 0.15;
/** How long a page takes to draw what it has just changed, in ms. */
const VIEW_SETTLE_DURATION = 500;
/**
 * The farthest from the middle of the passage a player is taken to be on
 * it, across it, in metres.
 */
const ON_PASSAGE = 0.15;
/** How long the view takes to clear after the player changes maps, in ms. */
const FADE_DURATION = 1000;
/** The least brightness of the view of the cave, from 0 to 255. */
const CAVE_LEAST_BRIGHTNESS = 6;
/** How long the camera takes to settle after it is handled, in ms. */
const CAMERA_SETTLE_DURATION = 1500;
/** How far one turn of the mouse wheel goes, in pixels. */
const ZOOM_DELTA = 100;
/** How many turns of the mouse wheel bring the camera close to a torch. */
const CLOSE_ZOOM_TURNS = 8;
/** How near a player is shown to where it arrives, in metres. */
const ARRIVAL_NEARNESS = 0.3;
/**
 * The directory to save the views of the cave in, if the environment names
 * one.
 */
const SCREENSHOT_DIR: string | undefined = process.env.CLOVERVALE_SCREENSHOTS;
/** The language the pages speak unless told otherwise. */
const PAGE_LANGUAGE = 'en';
/** The name of the language control of the panel in English. */
const LANGUAGE_CONTROL = 'Language';
/** The languages the language control offers, by their own names. */
const LANGUAGE_NAMES: readonly string[] = [
  'English',
  '正體中文',
  '简体中文',
  '日本語',
];
/** The name of Traditional Chinese, as the language control offers it. */
const ZH_TW_NAME = '正體中文';
/** The name of English, as the language control offers it. */
const EN_NAME = 'English';
/** The title of the help sheet, and its button that closes it. */
const HELP_WORDS = { title: 'Controls', ok: 'OK' } as const;
/** The title of the help sheet, and its button, in Traditional Chinese. */
const ZH_TW_HELP_WORDS = { title: '操作說明', ok: '確認' } as const;
/** How many controls the help sheet lists. */
const HELP_CONTROL_COUNT = 8;
/** The key values WebDriver gives the keys the help sheet takes. */
const HELP_KEYS = {
  help: 'h',
  enter: '\uE007',
  escape: '\uE00C',
} as const;
/** The codes of keys of the browser the game does not use. */
const BROWSER_KEYS: readonly string[] = ['F5', 'F11', 'F12', 'Tab'];
/** The expression that tells how a page shows its help sheet, as JSON. */
const HELP_EXPRESSION = `(() => {
  const sheet = document.querySelector('.help-sheet');
  const button = document.querySelector('.help-button');
  const bag = document.querySelector('.bag-window');
  return JSON.stringify({
    isOpen: sheet !== null && !sheet.hidden,
    title: document.querySelector('.help-title')?.textContent ?? '',
    ok: document.querySelector('.help-ok')?.textContent ?? '',
    labels: [...document.querySelectorAll('.help-label')].map(
      (label) => label.textContent,
    ),
    buttonKey: button?.querySelector('.help-key')?.textContent ?? null,
    isBagOpen: bag !== null && !bag.hidden,
    heading: window.clovervale.describeHeading(),
    figures: window.clovervale.describeFigures(),
  });
})()`;
/** The notice of the sword got from a chest. */
const SWORD_NOTICE = 'You got the short sword';
/** The notice of the leather armour got, in Traditional Chinese. */
const ZH_TW_ARMOUR_NOTICE = '取得皮甲';
/** The name of the sword in Traditional Chinese. */
const ZH_TW_SWORD = '短劍';
/**
 * The expression that clicks the slot of the sword in the bag of a page,
 * and gives the number of the slot, or -1.
 */
const SWORD_SLOT_CLICK_EXPRESSION = `(() => {
  const slots = [...document.querySelectorAll('.bag-slot')];
  const index = slots.findIndex((slot) => slot.dataset.kind === 'sword');
  slots[index]?.click();
  return String(index);
})()`;
/** The notice of the healing potion got from a barrel. */
const POTION_NOTICE = 'You got the healing potion';
/** The name of the healing potion in Traditional Chinese. */
const ZH_TW_POTION = '治療藥水';
/**
 * Lists the actions the menu of the healing potion in the bag lists in
 * Traditional Chinese.
 *
 * @param {boolean} isHurt - Whether the player lacks health.
 * @returns {MenuActionView[]} The actions: using the potion, which can be
 *   chosen only while the player lacks health, and dropping it.
 */
function listZhTwPotionActions(isHurt: boolean): MenuActionView[] {
  return [
    { label: '使用', isEnabled: isHurt },
    { label: '丟棄', isEnabled: true },
  ];
}
/** The health a healing potion gives back. */
const POTION_HEALING = 50;
/**
 * The expression that clicks the slot of the healing potion in the bag of
 * a page, and gives the number of the slot, or -1.
 */
const POTION_SLOT_CLICK_EXPRESSION = `(() => {
  const slots = [...document.querySelectorAll('.bag-slot')];
  const index = slots.findIndex(
    (slot) => slot.dataset.kind === 'healing-potion',
  );
  slots[index]?.click();
  return String(index);
})()`;
/** The name of the language control of the panel in Traditional Chinese. */
const ZH_TW_LANGUAGE_CONTROL = '語言';
/** The title of the page and of the panel in Traditional Chinese. */
const ZH_TW_TITLE = '四葉谷';
/** The title of the folder of the latest snapshot in the panel. */
const SNAPSHOT_FOLDER = 'Latest snapshot';
/** That title in Traditional Chinese. */
const ZH_TW_SNAPSHOT_FOLDER = '最新快照';
/** The name of the space bar readout of the panel in Traditional Chinese. */
const ZH_TW_SPACE_KEY = '空白鍵';
/** What that readout tells by Nancy, facing her, in Traditional Chinese. */
const ZH_TW_TALK_KEY = '與南茜交談';
/** The prompt by Nancy, facing her, in Traditional Chinese. */
const ZH_TW_TALK_PROMPT = '按空白鍵與南茜交談';
/** The name of the server status of the panel in Traditional Chinese. */
const ZH_TW_SERVER = '伺服器';
/** The start of the status of a connected page in Traditional Chinese. */
const ZH_TW_CONNECTED = '已連線';
/** The name of Nancy in Traditional Chinese. */
const ZH_TW_NANCY = '南茜';
/** What Nancy says in Traditional Chinese. */
const ZH_TW_NANCY_LINE = '村口有野狗，大家都沒辦法出門，怎麼辦？';
/**
 * The furthest the foot of the bubble of what Nancy says may be from where
 * she stands along the ground, in metres.
 */
const SPEECH_NEARNESS = 0.05;
/** The least height of the foot of that bubble, in metres. */
const SPEECH_LEAST_HEIGHT = 1;
/**
 * How long the bubble of what Nancy says may take to go away, in
 * milliseconds, which is well over the time it takes to read it.
 */
const SPEECH_TIMEOUT = 30_000;
/**
 * The time of day the game server of the check holds its clock at, so that
 * every check sees the village as it is at noon, whenever it runs.
 */
const HELD_TIME = '12:00';
/** What the panel of a page tells of that time of day. */
const HELD_TIME_OF_DAY = '12:00, day';
/** That time of day, from 0 up to 1. */
const HELD_DAY_SHARE = 0.5;
/** The name of the switch of the panel that previews a time of day. */
const PREVIEW_CONTROL = 'Time preview';
/** The name of the control of the panel that sets the hour previewed. */
const PREVIEW_HOUR_CONTROL = 'Time';
/** The hour previewed to see the village at night: midnight. */
const NIGHT_HOUR = 0;
/** That hour, as the control of the panel shows it. */
const NIGHT_CLOCK = '00:00';
/**
 * The most the foot of the view may be lit at midnight, as a share of how
 * it is lit at noon: clearly darker.
 */
const NIGHT_MOST_SHARE = 0.7;
/**
 * The least the foot of the view may be lit at midnight, as a share of how
 * it is lit at noon: far from black.
 */
const NIGHT_LEAST_SHARE = 0.3;
/**
 * The least brightness the foot of the view may have at midnight, from 0
 * to 255.
 */
const NIGHT_LEAST_BRIGHTNESS = 40;
/**
 * The most the brightness of the foot of the view of a page may change, as
 * a share, while another page previews a different time of day.
 */
const UNCHANGED_SHARE = 0.05;
/**
 * The length of the day of the game server whose clock runs, in minutes:
 * long enough for the pages to load in daylight.
 */
const RUNNING_DAY_MINUTES = 10;
/** The length of the day of the game server whose clock runs, in ms. */
const RUNNING_DAY_DURATION = RUNNING_DAY_MINUTES * 60_000;
/**
 * How far apart the times of day two pages tell for one and the same moment
 * may be, in days: half a second's worth on that server.
 */
const SAME_TIME_OF_DAY = 500 / RUNNING_DAY_DURATION;
/** The least time the time of day of a page is watched moving on, in ms. */
const DAY_WATCH_DURATION = 3000;
/**
 * The most the time of day of a page may run fast or slow, as a share of
 * the time that passes.
 */
const DAY_PACE_TOLERANCE = 0.25;

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;
/**
 * How far apart the steps two pages show Toby at for one and the same
 * moment may be, in steps: a quarter of a second's worth, for the time a
 * snapshot takes to reach each page.
 */
const SAME_TOBY_STEPS = 5;
/**
 * How long Toby may take to be seen to find a four-leaved clover, in
 * milliseconds: more than three of his visits to each patch, of which a
 * patch he has taken the clover of regrows its clover in time for the
 * third.
 */
const TOBY_FIND_TIMEOUT = 60_000;
/** What Toby exclaims as he finds a four-leaved clover, in English. */
const TOBY_FOUND_LINE = 'Found one!';
/**
 * How long Toby may take to be seen to move, in milliseconds: more than
 * he ever stays at one end of his run.
 */
const TOBY_MOVE_TIMEOUT = 15_000;
/**
 * The most the steps a page shows Toby at may run fast or slow, as a share
 * of the time that passes.
 */
const TOBY_PACE_TOLERANCE = 0.25;

/**
 * The least time over which the pace of the steps a page shows Toby at is
 * measured, in milliseconds: long enough that the time from the frame
 * that last showed him to each reading makes little odds.
 */
const TOBY_PACE_SPAN = 3000;

/**
 * The keys that walk a player each way in the first view, by the turn of
 * the way from +Z towards +X, in steps of 45 degrees from 0.
 */
const TURN_KEYS: readonly (readonly string[])[] = [
  ['s'],
  ['s', 'd'],
  ['d'],
  ['w', 'd'],
  ['w'],
  ['w', 'a'],
  ['a'],
  ['s', 'a'],
];

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
};

/** Reads the size of the view and what the client tells of itself. */
const PAGE_EXPRESSION = `(() => {
  const panel = {};
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId)?.textContent;
    if (label) {
      panel[label] = input.value;
    }
  }
  return JSON.stringify({
    width: window.innerWidth,
    height: window.innerHeight,
    panel,
    figures: window.clovervale?.describeFigures() ?? [],
  });
})()`;

/**
 * Reads the time of day a page tells, and the moment it tells it, as JSON.
 */
const TIME_OF_DAY_EXPRESSION = `(() => {
  const time = window.clovervale.describeTimeOfDay();
  return JSON.stringify({
    ...time,
    moment: performance.timeOrigin + performance.now(),
  });
})()`;

/** Reads how a page shows Toby as he picks, and what is around him. */
const TOBY_FIND_EXPRESSION = `(() => JSON.stringify({
  toby: window.clovervale.describeToby(),
  speech: window.clovervale.describeSpeech(),
  clovers: window.clovervale.describeItems().clovers,
}))()`;

/** Reads how a page shows Toby, and the moment it tells that, as JSON. */
const TOBY_EXPRESSION = `(() => JSON.stringify({
  toby: window.clovervale.describeToby(),
  moment: performance.timeOrigin + performance.now(),
}))()`;

/** Reads the action the panel of the client displays. */
const PANEL_ACTION_EXPRESSION = `(() => {
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    if (document.getElementById(labelId)?.textContent === 'Action') {
      return input.value;
    }
  }
  return '';
})()`;

/** Reads what a page shows in words, as JSON. */
const LANGUAGE_LOOK_EXPRESSION = `(() => {
  const panel = {};
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId)?.textContent;
    if (label) {
      panel[label] = input.value;
    }
  }
  let offered = [];
  for (const select of document.querySelectorAll('select')) {
    const texts = [...select.options].map((option) => option.text);
    if (texts.includes('English')) {
      offered = texts;
    }
  }
  const prompt = document.querySelector('.interaction-prompt');
  return JSON.stringify({
    lang: document.documentElement.lang,
    title: document.title,
    titles: [...document.querySelectorAll('.lil-title')]
      .map((title) => title.textContent),
    panel,
    offered,
    prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
    speech: window.clovervale.describeSpeech(),
  });
})()`;

/**
 * Makes the expression that sets a switch of the panel, and gives whether
 * it is set afterwards, as `true` or `false`.
 *
 * @param {string} name - The name of the switch.
 * @param {boolean} isEnabled - Whether to switch it on.
 * @returns {string} The expression.
 */
function createSwitchExpression(name: string, isEnabled: boolean): string {
  return `(() => {
    for (const input of document.querySelectorAll('input[type=checkbox]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === '${name}') {
        if (input.checked !== ${String(isEnabled)}) {
          input.click();
        }
        return String(input.checked);
      }
    }
    return 'missing';
  })()`;
}

/**
 * Makes the expression that types a value into a number field of the
 * panel, and gives what the field holds afterwards.
 *
 * @param {string} name - The name of the field.
 * @param {number | string} value - The value, as a number, or as the
 *   field shows it.
 * @returns {string} The expression.
 */
function createNumberExpression(
  name: string,
  value: number | string,
): string {
  return `(() => {
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (
        input.type !== 'checkbox' &&
        document.getElementById(labelId)?.textContent === '${name}'
      ) {
        input.focus();
        input.value = '${String(value)}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
        return input.value;
      }
    }
    return 'missing';
  })()`;
}

/**
 * Makes the expression that chooses a player in the camera control of the
 * panel, if told to, and gives where the page has its camera, as JSON.
 *
 * @param {string | null} choice - The name of the player to choose, or
 *   `null` to choose nothing.
 * @returns {string} The expression.
 */
function createCameraExpression(choice: string | null): string {
  return `(() => {
    let select = null;
    for (const element of document.querySelectorAll('select')) {
      const labelId = element.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === 'Camera on') {
        select = element;
      }
    }
    const offered = [...(select?.options ?? [])].map((option) => option.text);
    const choice = ${JSON.stringify(choice)};
    if (select !== null && choice !== null && offered.includes(choice)) {
      select.selectedIndex = offered.indexOf(choice);
      select.dispatchEvent(new Event('change'));
    }
    return JSON.stringify({
      chosen: select?.selectedOptions[0]?.text ?? 'missing',
      offered,
      focus: window.clovervale.describeCamera(),
      figures: window.clovervale.describeFigures(),
    });
  })()`;
}

/**
 * Makes the expression that chooses a language in the language control of
 * the panel, and gives the language chosen afterwards, or `missing`.
 *
 * @param {string} control - The name of the language control, in the
 *   language the page speaks.
 * @param {string} choice - The name of the language to choose.
 * @returns {string} The expression.
 */
function createLanguageExpression(control: string, choice: string): string {
  return `(() => {
    const control = ${JSON.stringify(control)};
    for (const select of document.querySelectorAll('select')) {
      const labelId = select.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === control) {
        const offered = [...select.options].map((option) => option.text);
        const index = offered.indexOf(${JSON.stringify(choice)});
        if (index >= 0) {
          select.selectedIndex = index;
          select.dispatchEvent(new Event('change'));
        }
        return select.selectedOptions[0]?.text ?? 'missing';
      }
    }
    return 'missing';
  })()`;
}

/**
 * Makes the expression that tells how a page shows a player, against what
 * the latest snapshot tells of it, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createOwnExpression(id: number): string {
  return `(() => {
    const find = (players) =>
      players.find((player) => player.id === ${String(id)}) ?? null;
    let corrections = '';
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === 'Corrections') {
        corrections = input.value;
      }
    }
    return JSON.stringify({
      drawn: find(window.clovervale.describeFigures()),
      told: find(window.clovervale.listLatestPlayers()),
      corrections,
    });
  })()`;
}

/**
 * Makes the expression that tells how a page shows the monster and a
 * player, and the hits it has shown, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createMonsterExpression(id: number): string {
  return `(() => {
    const own = window.clovervale.listLatestPlayers()
      .find((player) => player.id === ${String(id)}) ?? null;
    return JSON.stringify({
      own,
      monster: window.clovervale.listLatestMonsters()[0] ?? null,
      bar: window.clovervale.describeMonsters()[0]?.health ?? null,
      hits: window.clovervale.listShownHits(),
    });
  })()`;
}

/**
 * Makes the expression that tells how a page shows the map its player is
 * in, and what it can do there, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createCaveExpression(id: number): string {
  return `(() => {
    const panel = {};
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      const label = document.getElementById(labelId)?.textContent;
      if (label) {
        panel[label] = input.value;
      }
    }
    const prompt = document.querySelector('.interaction-prompt');
    return JSON.stringify({
      map: window.clovervale.describeMap(),
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      monster: window.clovervale.listLatestMonsters()[0] ?? null,
      monsters: window.clovervale.listLatestMonsters(),
      hits: window.clovervale.listShownHits(),
      figures: window.clovervale.describeFigures().map((figure) => figure.id),
      spaceKey: panel['Space key'] ?? '',
      prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
      speech: window.clovervale.describeSpeech(),
      dialogue: window.clovervale.describeDialogue(),
      containers: window.clovervale.describeContainers(),
      isBagOpen: (() => {
        const bag = document.querySelector('.bag-window');
        return bag !== null && !bag.hidden;
      })(),
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      bagItemName:
        document.querySelector('.bag-item-name')?.textContent ?? '',
      menu: (() => {
        const menu = document.querySelector('.bag-menu');
        return menu === null || menu.hidden
          ? null
          : [...menu.querySelectorAll('.bag-action')].map((action) => ({
              label: action.textContent,
              isEnabled: action.getAttribute('aria-disabled') !== 'true',
            }));
      })(),
      notices: [...document.querySelectorAll('.item-notice')]
        .map((notice) => notice.textContent),
      heals: window.clovervale.listShownHeals(),
    });
  })()`;
}

/**
 * Makes the expression that tells how a page shows a player and the heals
 * it has shown, and what it tells the space bar does, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createFountainExpression(id: number): string {
  return `(() => {
    const find = (players) =>
      players.find((player) => player.id === ${String(id)}) ?? null;
    const panel = {};
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      const label = document.getElementById(labelId)?.textContent;
      if (label) {
        panel[label] = input.value;
      }
    }
    const prompt = document.querySelector('.interaction-prompt');
    return JSON.stringify({
      own: find(window.clovervale.listLatestPlayers()),
      bar: find(window.clovervale.describeFigures())?.health ?? null,
      heals: window.clovervale.listShownHeals(),
      prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
      spaceKey: panel['Space key'] ?? '',
      corrections: panel.Corrections ?? '',
    });
  })()`;
}

/**
 * Makes the expression that tells how a page shows a player and the
 * bubble above the head of a villager, and what it tells the space bar
 * does, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createTalkExpression(id: number): string {
  return `(() => {
    const panel = {};
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      const label = document.getElementById(labelId)?.textContent;
      if (label) {
        panel[label] = input.value;
      }
    }
    const prompt = document.querySelector('.interaction-prompt');
    return JSON.stringify({
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      speech: window.clovervale.describeSpeech(),
      prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
      spaceKey: panel['Space key'] ?? '',
      corrections: panel.Corrections ?? '',
      judgedBack: panel['Judged back'] ?? '',
    });
  })()`;
}

/**
 * Makes the expression that tells how a page shows a player, the clovers
 * of the patches and the items on the ground, and what is in its slots, as
 * JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createInventoryExpression(id: number): string {
  return `(() => {
    const panel = {};
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      const label = document.getElementById(labelId)?.textContent;
      if (label) {
        panel[label] = input.value;
      }
    }
    const shown = (element) =>
      element === null || element.hidden ? null : element.textContent;
    const drawn = window.clovervale.describeItems();
    return JSON.stringify({
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      prompt: shown(document.querySelector('.interaction-prompt')),
      bag: (() => {
        const indexOf = (elements) =>
          elements.findIndex((element) => element.classList.contains('is-cursor'));
        const window = document.querySelector('.bag-window');
        const key = document.querySelector('.bag-key');
        const menu = document.querySelector('.bag-menu');
        const actions = [...document.querySelectorAll('.bag-action')];
        const isMenuOpen = menu !== null && !menu.hidden;
        return {
          isOpen: window !== null && !window.hidden,
          key: shown(key),
          cursor: indexOf([...document.querySelectorAll('.bag-slot')]),
          menu: isMenuOpen ? actions.map((action) => action.textContent) : null,
          menuCursor: isMenuOpen ? indexOf(actions) : -1,
        };
      })(),
      spaceKey: panel['Space key'] ?? '',
      corrections: panel.Corrections ?? '',
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      clovers: drawn.clovers,
      items: drawn.items.map(({ id, x, z }) => ({ id, x, z })),
    });
  })()`;
}

/**
 * Makes the expression that waits in a page for the next key to go down,
 * and then for the first frame the page draws with a player moved, and
 * gives how long that took, in milliseconds, or `never`.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createResponseExpression(id: number): string {
  return `new Promise((resolve) => {
    const find = () =>
      window.clovervale.describeFigures()
        .find((figure) => figure.id === ${String(id)});
    const start = find();
    const end = performance.now() + ${String(ACTION_TIMEOUT)};
    let pressTime = null;
    window.addEventListener(
      'keydown',
      () => {
        pressTime = performance.now();
      },
      { once: true, capture: true },
    );
    const look = () => {
      const now = performance.now();
      const figure = find();
      if (
        pressTime !== null &&
        (figure?.x !== start?.x || figure?.z !== start?.z)
      ) {
        resolve(String(now - pressTime));
      } else if (now > end) {
        resolve('never');
      } else {
        requestAnimationFrame(look);
      }
    };
    requestAnimationFrame(look);
  })`;
}

/**
 * Makes the expression that watches how a page shows a player, at every
 * frame the page draws for a while, and gives the samples as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createWatchExpression(id: number): string {
  return `new Promise((resolve) => {
    const samples = [];
    const end = performance.now() + ${String(WATCH_DURATION)};
    const findX = (players) =>
      players.find((player) => player.id === ${String(id)})?.x;
    const sample = () => {
      const drawn = findX(window.clovervale.describeFigures());
      const told = findX(window.clovervale.listLatestPlayers());
      if (drawn !== undefined && told !== undefined) {
        samples.push({ drawn, told });
      }
      if (performance.now() < end) {
        requestAnimationFrame(sample);
      } else {
        resolve(JSON.stringify(samples));
      }
    };
    requestAnimationFrame(sample);
  })`;
}

/** The steps that undo what the check has started, in starting order. */
const cleanups: (() => Promise<void> | void)[] = [];

/**
 * Undoes everything the check has started, the latest first.
 *
 * @returns {Promise<void>} A promise settled once everything is undone.
 */
async function cleanUp(): Promise<void> {
  for (let undo = cleanups.pop(); undo !== undefined; undo = cleanups.pop()) {
    try {
      await undo();
    } catch (error: unknown) {
      console.error('Cleaning up failed:', error);
    }
  }
}

/**
 * Waits for a line of output that tells a program has started.
 *
 * @param {ChildProcess} child - The program.
 * @param {Readable | null} output - The output stream to watch.
 * @param {RegExp} pattern - The pattern the awaited output matches.
 * @param {string} name - The name of the program, for the error messages.
 * @returns {Promise<string>} The first captured group of the match.
 */
function waitForOutput(
  child: ChildProcess,
  output: Readable | null,
  pattern: RegExp,
  name: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    const fail = (reason: string): void => {
      clearTimeout(timer);
      const detail: string = text.trim() === '' ? '' : `\n${text.trim()}`;
      reject(new Error(`${name} ${reason}${detail}`));
    };
    const timer: NodeJS.Timeout = setTimeout(() => {
      fail(`did not start within ${String(START_TIMEOUT / 1000)} seconds.`);
    }, START_TIMEOUT);
    child.once('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'ENOENT'
          ? `is not installed: "${child.spawnfile}" was not found.`
          : `could not be started: ${error.message}`,
      );
    });
    child.once('exit', () => {
      fail('exited before it was ready.');
    });
    output?.setEncoding('utf8').on('data', (chunk: string) => {
      text += chunk;
      const captured: string | undefined = pattern.exec(text)?.[1];
      if (captured !== undefined) {
        clearTimeout(timer);
        resolve(captured);
      }
    });
  });
}

/**
 * Stops a program started in its own process group, with all its children.
 *
 * @param {ChildProcess} child - The program.
 * @returns {Promise<void>} A promise settled once the program has exited.
 */
async function stopProcessGroup(child: ChildProcess): Promise<void> {
  const pid: number | undefined = child.pid;
  if (pid === undefined) {
    return;
  }
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      process.kill(-pid, signal);
    } catch {
      // The whole group has already exited.
    }
  };
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    });
    signalGroup('SIGTERM');
    const timer: NodeJS.Timeout = setTimeout(() => {
      signalGroup('SIGKILL');
    }, STOP_TIMEOUT);
    await exited;
    clearTimeout(timer);
  }
  // Whatever the program left behind in its group must go too.
  signalGroup('SIGKILL');
}

/**
 * Starts a program in its own process group, to be stopped on clean-up.
 *
 * @param {string} command - The program to run.
 * @param {string[]} args - The arguments of the program.
 * @param {NodeJS.ProcessEnv} env - The environment of the program.
 * @returns {ChildProcess} The running program.
 */
function startProgram(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child: ChildProcess = spawn(command, args, {
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  cleanups.push(() => stopProcessGroup(child));
  return child;
}

/**
 * Starts the built game server on a free port.
 *
 * @param {readonly string[]} dayArgs - The options that tell the server how
 *   to run the day.
 * @returns {Promise<number>} The port the server is listening on.
 */
async function startGameServer(dayArgs: readonly string[]): Promise<number> {
  const args: string[] = [serverFile, '--port', '0', ...dayArgs];
  const child: ChildProcess = startProgram(process.execPath, args, process.env);
  const pattern = /listening on port (\d+)/;
  return Number(
    await waitForOutput(child, child.stdout, pattern, 'The game server'),
  );
}

/**
 * Starts serving the built client as static files on a free port.
 *
 * @returns {Promise<number>} The port the client is served on.
 */
function startClientServer(): Promise<number> {
  const server: Server = createServer((request, response) => {
    const pathname: string = new URL(request.url ?? '/', 'http://localhost')
      .pathname;
    const relative: string = pathname.endsWith('/')
      ? `${pathname}index.html`
      : pathname;
    const file: string = path.join(clientDir, decodeURIComponent(relative));
    if (!file.startsWith(clientDir + path.sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const type: string =
      MIME_TYPES[path.extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }).end(readFileSync(file));
  });
  cleanups.push(() => {
    server.close();
    server.closeAllConnections();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/**
 * Starts headless Firefox with a temporary profile and a free BiDi port,
 * silenced, so that the music of the page is not heard.
 *
 * @returns {Promise<string>} The WebSocket URL of its WebDriver BiDi server.
 */
async function startFirefox(): Promise<string> {
  const profileDir: string = mkdtempSync(
    path.join(tmpdir(), 'clovervale-firefox-'),
  );
  cleanups.push(() => {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5 });
  });
  writeFileSync(
    path.join(profileDir, 'user.js'),
    'user_pref("media.volume_scale", "0.0");\n' +
      // The pages speak English, whatever language the system has.
      `user_pref("intl.accept_languages", "${PAGE_LANGUAGE}");\n`,
  );
  const args: string[] = [
    '--headless',
    '--no-remote',
    '--profile',
    profileDir,
    '--remote-debugging-port',
    '0',
    '--width',
    '800',
    '--height',
    '600',
  ];
  const child: ChildProcess = startProgram(firefoxCommand, args, process.env);
  const pattern = /WebDriver BiDi listening on (ws:\/\/\S+)/;
  return await waitForOutput(child, child.stderr, pattern, 'Firefox');
}

/** A WebDriver BiDi session with a browser. */
class BidiSession {
  /** The errors the page has logged to its console. */
  readonly pageErrors: string[] = [];
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, PendingCommand>();
  #lastId = 0;

  /**
   * Wraps a WebSocket connected to the BiDi server of a browser.
   *
   * @param {WebSocket} socket - The connected WebSocket.
   */
  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', (event: MessageEvent) => {
      const data: unknown = event.data;
      this.#receive(JSON.parse(String(data)) as BidiMessage);
    });
    socket.addEventListener('close', () => {
      for (const command of this.#pending.values()) {
        command.reject(new Error('Firefox closed the connection.'));
      }
      this.#pending.clear();
    });
  }

  /**
   * Connects to the BiDi server of a browser and starts a session.
   *
   * @param {string} url - The WebSocket URL of the BiDi server.
   * @returns {Promise<BidiSession>} The session.
   */
  static async connect(url: string): Promise<BidiSession> {
    const socket = new WebSocket(`${url}/session`);
    cleanups.push(() => {
      socket.close();
    });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => {
        resolve();
      });
      socket.addEventListener('error', () => {
        reject(new Error(`Firefox refused the connection to ${url}.`));
      });
    });
    const session = new BidiSession(socket);
    await session.send('session.new', { capabilities: {} });
    await session.send('session.subscribe', { events: ['log.entryAdded'] });
    return session;
  }

  /**
   * Sends a command to the browser.
   *
   * @param {string} method - The name of the command.
   * @param {object} params - The parameters of the command.
   * @returns {Promise<unknown>} The result of the command.
   */
  send(method: string, params: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id: number = ++this.#lastId;
      const timer: NodeJS.Timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Firefox did not answer ${method} in time.`));
      }, COMMAND_TIMEOUT);
      this.#pending.set(id, {
        method,
        resolve: (result: unknown) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Handles a message from the browser.
   *
   * @param {BidiMessage} message - The message.
   */
  #receive(message: BidiMessage): void {
    if (message.method === 'log.entryAdded') {
      const entry = message.params as { level?: string; text?: string };
      if (entry.level === 'error') {
        this.pageErrors.push(entry.text ?? '');
      }
      return;
    }
    const command: PendingCommand | undefined = this.#pending.get(
      message.id ?? 0,
    );
    if (command === undefined) {
      return;
    }
    this.#pending.delete(message.id ?? 0);
    if (message.type === 'success') {
      command.resolve(message.result);
    } else {
      const reason: string = message.message ?? message.error ?? 'no reason';
      command.reject(new Error(`Firefox failed ${command.method}: ${reason}`));
    }
  }
}

/**
 * Decodes a PNG image.
 *
 * @param {Buffer} png - The image, as 8-bit RGB or RGBA without interlacing.
 * @returns {Pixels} The pixels of the image.
 * @throws {Error} If the image is in another PNG format.
 */
function decodePng(png: Buffer): Pixels {
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
function measureGrassFraction(image: Pixels): number {
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
function measureBrightness(image: Pixels): number {
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
 * @returns {number} The number of pixels of which a colour channel differs
 *   clearly.
 * @throws {Error} If the images differ in size.
 */
function countChangedPixels(before: Pixels, after: Pixels): number {
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

/**
 * Evaluates an expression in a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} expression - The expression, which gives a string or a
 *   promise of one.
 * @returns {Promise<string>} The string.
 * @throws {Error} If the expression gives anything else.
 */
async function evaluateInPage(
  session: BidiSession,
  context: string,
  expression: string,
): Promise<string> {
  const evaluated = (await session.send('script.evaluate', {
    expression,
    target: { context },
    awaitPromise: true,
  })) as { result?: { value?: unknown } };
  if (typeof evaluated.result?.value !== 'string') {
    throw new Error('The page could not be inspected.');
  }
  return evaluated.result.value;
}

/**
 * Reads what a page tells now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageState>} What the page tells.
 */
async function readPageState(
  session: BidiSession,
  context: string,
): Promise<PageState> {
  const value: string = await evaluateInPage(session, context, PAGE_EXPRESSION);
  return JSON.parse(value) as PageState;
}

/**
 * Captures what a page draws now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {object} [clip] - The part of the view to capture, or the whole
 *   view by default.
 * @returns {Promise<Pixels>} The pixels of the view.
 */
async function captureView(
  session: BidiSession,
  context: string,
  clip?: object,
): Promise<Pixels> {
  const screenshot = (await session.send(
    'browsingContext.captureScreenshot',
    clip === undefined ? { context } : { context, clip },
  )) as { data: string };
  return decodePng(Buffer.from(screenshot.data, 'base64'));
}

/**
 * Captures the foot of the view of a page, which holds the ground, clear of
 * the settings panel.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {PageState} state - What the page tells.
 * @returns {Promise<Pixels>} The pixels of the foot of the view.
 */
function captureGround(
  session: BidiSession,
  context: string,
  state: PageState,
): Promise<Pixels> {
  return captureView(session, context, {
    type: 'box',
    x: 0,
    y: state.height / 2,
    width: state.width,
    height: state.height / 2,
  });
}

/**
 * Looks at what a page tells and draws now.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<PageLook>} The page as it is.
 */
async function lookAtPage(
  session: BidiSession,
  context: string,
): Promise<PageLook> {
  const state: PageState = await readPageState(session, context);
  const view: Pixels = await captureGround(session, context, state);
  return { ...state, grassFraction: measureGrassFraction(view) };
}

/**
 * Looks at something again and again until it is as awaited.
 *
 * @param {() => Promise<T>} look - Looks at it.
 * @param {(seen: T) => boolean} isAwaited - Tells whether it is as awaited.
 * @param {number} timeout - How long to wait at most, in milliseconds.
 * @param {(seen: T) => string} describeProblem - Tells what is wrong with
 *   what was last seen, for the error message.
 * @returns {Promise<T>} What was seen when it was as awaited.
 * @throws {Error} If it is not as awaited in time.
 */
async function waitFor<T>(
  look: () => Promise<T>,
  isAwaited: (seen: T) => boolean,
  timeout: number,
  describeProblem: (seen: T) => string,
): Promise<T> {
  const deadline: number = Date.now() + timeout;
  let seen: T = await look();
  while (!isAwaited(seen) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL);
    seen = await look();
  }
  if (!isAwaited(seen)) {
    const seconds = String(timeout / 1000);
    throw new Error(
      `${describeProblem(seen)}\nThat was after ${seconds} seconds.`,
    );
  }
  return seen;
}

/**
 * Loads the client in a page, and waits until it draws its scene, shows the
 * models it has, and connects to the server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} url - The address of the client.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<void>} A promise settled once the client has done so.
 * @throws {Error} If the client does not do so in time.
 */
async function loadClient(
  session: BidiSession,
  context: string,
  url: string,
  name: string,
): Promise<void> {
  await session.send('browsingContext.navigate', { context, url });
  const isConnected = (look: PageLook): boolean =>
    (look.panel.Server ?? '').startsWith('connected');
  const isShown = (look: PageLook): boolean =>
    MODELS_SHOWN_PATTERN.test(look.panel.Models ?? '');
  const isDrawn = (look: PageLook): boolean =>
    look.grassFraction >= DRAWN_FRACTION;
  await waitFor(
    () => lookAtPage(session, context),
    (look: PageLook) => isConnected(look) && isShown(look) && isDrawn(look),
    PAGE_TIMEOUT,
    (look: PageLook) => {
      const problems: string[] = [];
      if (!isConnected(look)) {
        problems.push(
          `${name} did not connect to the server: its server status is ` +
            `"${look.panel.Server ?? ''}".`,
        );
      }
      if (!isShown(look)) {
        problems.push(
          `${name} did not finish showing its models: its model status is ` +
            `"${look.panel.Models ?? ''}".`,
        );
      }
      if (!isDrawn(look)) {
        const percentage: string = (look.grassFraction * 100).toFixed(1);
        problems.push(
          `${name} did not draw its scene: only ${percentage}% of the ` +
            'foot of the view is lit grass.',
        );
      }
      return problems.join('\n');
    },
  );
}

/**
 * Finds a player among those a page shows.
 *
 * @param {PageState} state - What the page tells.
 * @param {number} id - The identifier of the player.
 * @returns {FigureView | undefined} The player, if the page shows it.
 */
function findFigure(state: PageState, id: number): FigureView | undefined {
  return state.figures.find((figure: FigureView) => figure.id === id);
}

/**
 * Describes how a page shows a player, for the error messages.
 *
 * @param {PageState} state - What the page tells.
 * @param {number} id - The identifier of the player.
 * @returns {string} The description.
 */
function describeFigure(state: PageState, id: number): string {
  const figure: FigureView | undefined = findFigure(state, id);
  if (figure === undefined) {
    return `does not show player ${String(id)}`;
  }
  return (
    `shows player ${String(id)} at x ${figure.x.toFixed(2)}, ` +
    `z ${figure.z.toFixed(2)}, with a yaw of ${figure.yaw.toFixed(1)}, ` +
    `playing ${figure.clip ?? 'nothing'}`
  );
}

/**
 * Waits in a page until an action it tells of becomes `Slash`, or another
 * action if told, and then something else again.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} actionExpression - The expression that reads the action
 *   in the page.
 * @param {string} [action] - The action to wait for, `Slash` by default.
 * @returns {Promise<string>} `over` once the action has come and gone,
 *   `never` if it did not come in time, or `stuck` if it did not go.
 */
function watchAction(
  session: BidiSession,
  context: string,
  actionExpression: string,
  action = 'Slash',
): Promise<string> {
  // The page watches by itself, as an action is too short to be sure to
  // catch by looking in from the outside.
  const expression = `new Promise((resolve) => {
    let outcome = 'never';
    const stop = (result) => {
      clearInterval(interval);
      clearTimeout(timer);
      resolve(result);
    };
    const interval = setInterval(() => {
      const isActing = ${actionExpression} === ${JSON.stringify(action)};
      if (isActing) {
        outcome = 'stuck';
      } else if (outcome === 'stuck') {
        stop('over');
      }
    }, 10);
    const timer = setTimeout(() => stop(outcome), ${String(ACTION_TIMEOUT)});
  })`;
  return evaluateInPage(session, context, expression);
}

/**
 * Presses or releases a key in a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {'keyDown' | 'keyUp'} type - Whether to press or to release.
 * @param {string} value - The character of the key.
 * @returns {Promise<void>} A promise settled once the page has the event.
 */
async function sendKey(
  session: BidiSession,
  context: string,
  type: 'keyDown' | 'keyUp',
  value: string,
): Promise<void> {
  await session.send('input.performActions', {
    context,
    actions: [{ type: 'key', id: 'keyboard', actions: [{ type, value }] }],
  });
}

/**
 * Checks that a player walks, in the page of another player, while a key is
 * held down in its own page, and stops when the key is released.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the other page does not show the player doing so.
 */
async function checkWalk(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const viewBefore: Pixels = await captureView(session, watcher);
  const before: PageState = await readPageState(session, watcher);
  const startX: number = findFigure(before, id)?.x ?? NaN;

  // Both views look the same way, so left is the same for both.
  await sendKey(session, actor, 'keyDown', 'a');
  const isFarLeft = (state: PageState): boolean => {
    const figure: FigureView | undefined = findFigure(state, id);
    return (
      figure !== undefined &&
      figure.x <= startX - WALK_DISTANCE &&
      Math.abs(figure.yaw - LEFTWARD_YAW) < 1 &&
      figure.clip === 'Walk'
    );
  };
  await waitFor(
    () => readPageState(session, watcher),
    isFarLeft,
    ACTION_TIMEOUT,
    (state: PageState) =>
      `With the A key held down in the first page for player ${String(id)}` +
      `, which started at x ${startX.toFixed(2)}, the second page ` +
      `${describeFigure(state, id)}.`,
  );
  const own: PageState = await readPageState(session, actor);
  if (own.panel.Action !== 'Walk') {
    throw new Error(
      'With the A key held down, the panel of the first page tells its ' +
        `player does "${own.panel.Action ?? ''}".`,
    );
  }

  await sendKey(session, actor, 'keyUp', 'a');
  const stopped: PageState = await waitFor(
    () => readPageState(session, watcher),
    (state: PageState) => findFigure(state, id)?.clip === 'Idle',
    ACTION_TIMEOUT,
    (state: PageState) =>
      'With the A key released in the first page, the second page ' +
      `${describeFigure(state, id)}.`,
  );
  await sleep(POLL_INTERVAL * 5);
  const later: PageState = await readPageState(session, watcher);
  if (findFigure(later, id)?.x !== findFigure(stopped, id)?.x) {
    throw new Error(
      'With the A key released in the first page, the second page ' +
        `${describeFigure(later, id)}, still moving.`,
    );
  }

  const viewAfter: Pixels = await captureView(session, watcher);
  const changed: number = countChangedPixels(viewBefore, viewAfter);
  if (changed < MOVED_PIXELS) {
    throw new Error(
      `The second page ${describeFigure(later, id)}, but only ` +
        `${String(changed)} pixels of its view have changed.`,
    );
  }
}

/**
 * Checks how the page of another player shows a player that walks, with the
 * interpolation switched on or off: between the snapshots, moving at about
 * every frame, or exactly as the latest snapshot tells, and in the end
 * where the latest snapshot tells either way.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @param {boolean} isSmooth - Whether the interpolation is switched on.
 * @param {string} key - The character of the key that walks the player
 *   along the X axis.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the other page does not show the player so.
 */
async function checkMotion(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  isSmooth: boolean,
  key: string,
): Promise<void> {
  const mode = `With the interpolation switched ${isSmooth ? 'on' : 'off'}`;
  const switched: string = await evaluateInPage(
    session,
    watcher,
    createSwitchExpression('Interpolate', isSmooth),
  );
  if (switched !== String(isSmooth)) {
    throw new Error(
      `${mode} in the second page, its switch tells "${switched}".`,
    );
  }

  await sendKey(session, actor, 'keyDown', key);
  let samples: WalkSample[];
  try {
    await waitFor(
      () => readPageState(session, watcher),
      (state: PageState) => findFigure(state, id)?.clip === 'Walk',
      ACTION_TIMEOUT,
      (state: PageState) =>
        `${mode}, and the ${key.toUpperCase()} key held down in the first ` +
        `page, the second page ${describeFigure(state, id)}.`,
    );
    samples = JSON.parse(
      await evaluateInPage(session, watcher, createWatchExpression(id)),
    ) as WalkSample[];
  } finally {
    await sendKey(session, actor, 'keyUp', key);
  }

  // The first frame may show a snapshot from before the watch began.
  const frames: WalkSample[] = samples.slice(1);
  const told: number[] = samples.map((sample: WalkSample) => sample.told);
  const between: number = frames.filter((sample: WalkSample) =>
    told.every((x: number) => Math.abs(x - sample.drawn) > SAME_POSITION),
  ).length;
  const snapshots: number = new Set<number>(told).size;
  const seen =
    `the second page drew ${String(frames.length)} frames from ` +
    `${String(snapshots)} snapshots, with the player between two ` +
    `snapshots in ${String(between)} of them`;
  if (frames.length < WATCHED_FRAMES || snapshots < 2) {
    throw new Error(`${mode}, ${seen}, which is too few to tell.`);
  }
  if (isSmooth && between < frames.length * SMOOTH_FRACTION) {
    throw new Error(`${mode}, ${seen}, which is not smooth.`);
  }
  if (!isSmooth && between > 0) {
    throw new Error(`${mode}, ${seen}, not as the latest snapshot tells.`);
  }
  const start: number = frames[0]?.drawn ?? NaN;
  const end: number = frames.at(-1)?.drawn ?? NaN;
  const isBackward: boolean = frames.some(
    (sample: WalkSample, index: number) =>
      (sample.drawn - (frames[index - 1]?.drawn ?? start)) * (end - start) <
      0,
  );
  if (isBackward) {
    throw new Error(`${mode}, the second page drew the player going back.`);
  }

  await waitFor(
    () => readPageState(session, watcher),
    (state: PageState) => findFigure(state, id)?.clip === 'Idle',
    ACTION_TIMEOUT,
    (state: PageState) =>
      `${mode}, and the key released in the first page, the second page ` +
      `${describeFigure(state, id)}.`,
  );
  const rest: WalkSample | undefined = (
    JSON.parse(
      await evaluateInPage(session, watcher, createWatchExpression(id)),
    ) as WalkSample[]
  ).at(-1);
  if (rest === undefined || rest.drawn !== rest.told) {
    throw new Error(
      `${mode}, the second page shows the player at x ` +
        `${String(rest?.drawn)} in the end, and the latest snapshot tells ` +
        `x ${String(rest?.told)}.`,
    );
  }
}

/**
 * Checks that a player slashes once, in its own page and in the page of
 * another player, when the space bar is pressed in its own page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player doing so.
 */
async function checkSlash(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const figureAction =
    '(window.clovervale.describeFigures()' +
    `.find((figure) => figure.id === ${String(id)}) ?? {}).clip`;
  const outcomes: Promise<string[]> = Promise.all([
    watchAction(session, watcher, figureAction),
    watchAction(session, actor, PANEL_ACTION_EXPRESSION),
  ]);
  // A watch that fails must not go unhandled while the keys are sent.
  outcomes.catch(() => undefined);
  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  const [seen = '', told = ''] = await outcomes;
  const problems: Readonly<Record<string, string>> = {
    never: 'never slashing',
    stuck: 'slashing without end',
  };
  if (seen !== 'over') {
    throw new Error(
      'With the space bar pressed in the first page, the second page ' +
        `shows player ${String(id)} ${problems[seen] ?? seen}.`,
    );
  }
  if (told !== 'over') {
    throw new Error(
      'With the space bar pressed in the first page, its panel tells of ' +
        `its player ${problems[told] ?? told}.`,
    );
  }
  const after: PageState = await readPageState(session, watcher);
  if (findFigure(after, id)?.clip !== 'Idle') {
    throw new Error(
      `After the slash, the second page ${describeFigure(after, id)}.`,
    );
  }
}

/**
 * Checks how the server judges a slash of a player behind a slow
 * connection, with the lag compensation switched off and on, as the panel
 * of its page tells: on the world as it is, and on the world as the page
 * showed it, which is at least as far back as the messages to the server
 * are held back, and no further back than the server judges any slash.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @returns {Promise<void>} A promise settled once the slashes have passed.
 * @throws {Error} If the panel does not tell so.
 */
async function checkCompensation(
  session: BidiSession,
  actor: string,
): Promise<void> {
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  for (const isCompensating of [false, true]) {
    const mode =
      `With the lag compensation switched ${isCompensating ? 'on' : 'off'} ` +
      `and its messages held back for ${String(NETWORK_DELAY)} ` +
      'milliseconds each way, the first page';
    await setControl(session, actor, 'Compensate lag', isCompensating);
    await waitFor(
      () => evaluateInPage(session, actor, PANEL_ACTION_EXPRESSION),
      (action: string) => action === 'Idle',
      ACTION_TIMEOUT,
      (action: string) => `${mode} tells its player is "${action}".`,
    );
    const before: PageState = await readPageState(session, actor);
    await sendKey(session, actor, 'keyDown', ' ');
    await sendKey(session, actor, 'keyUp', ' ');
    // The page may show the latest snapshot for a while after the delay
    // goes up, until its clock of the server has caught up.
    const least: number = isCompensating ? NETWORK_DELAY : 0;
    const most: number = isCompensating ? COMPENSATION_LIMIT : 0;
    const readBack = (state: PageState): number =>
      Number(/^(\d+) ms$/.exec(state.panel['Judged back'] ?? '')?.[1]);
    await waitFor(
      () => readPageState(session, actor),
      (state: PageState) =>
        state.panel['Judged back'] !== before.panel['Judged back'] &&
        readBack(state) >= least &&
        readBack(state) <= most &&
        state.panel.Result === 'missed',
      ACTION_TIMEOUT,
      (state: PageState) =>
        `${mode} tells its slash was judged ` +
        `"${state.panel['Judged back'] ?? ''}" back, with the result ` +
        `"${state.panel.Result ?? ''}", after "` +
        `${before.panel['Judged back'] ?? ''}" before.`,
    );
  }
  await setControl(session, actor, 'Net delay (ms)', 0);
}

/**
 * Reads how a page shows a player, against what the server tells of it.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<OwnView>} How the page shows the player.
 */
async function readOwnView(
  session: BidiSession,
  context: string,
  id: number,
): Promise<OwnView> {
  return JSON.parse(
    await evaluateInPage(session, context, createOwnExpression(id)),
  ) as OwnView;
}

/**
 * Sets a control of the panel of a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} name - The name of the control.
 * @param {boolean | number | string} value - What to set it to, as a
 *   switch, or as typed into a field.
 * @returns {Promise<void>} A promise settled once the control is set.
 * @throws {Error} If the control does not take the value.
 */
async function setControl(
  session: BidiSession,
  context: string,
  name: string,
  value: boolean | number | string,
): Promise<void> {
  const expression: string =
    typeof value === 'boolean'
      ? createSwitchExpression(name, value)
      : createNumberExpression(name, value);
  const set: string = await evaluateInPage(session, context, expression);
  if (set !== String(value)) {
    throw new Error(
      `Set to ${String(value)}, the "${name}" control of the panel tells ` +
        `"${set}".`,
    );
  }
}

/**
 * Checks how a page shows its own player behind a slow connection, with the
 * prediction switched on or off: moving at once when a key goes down, or
 * only once the server has answered, and in the end where the server tells,
 * without a correction, in its own page and in the page of another player.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @param {boolean} isPredicting - Whether the prediction is switched on.
 * @param {string} key - The character of the key that walks the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
async function checkPrediction(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  isPredicting: boolean,
  key: string,
): Promise<void> {
  const delay = String(NETWORK_DELAY);
  const mode =
    `With the prediction switched ${isPredicting ? 'on' : 'off'} and its ` +
    `messages held back for ${delay} milliseconds each way, the first page`;
  await setControl(session, actor, 'Predict', isPredicting);
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const before: OwnView = await readOwnView(session, actor, id);
  let response: string;
  try {
    // The page times itself, from the key going down to the frame it draws.
    const watch: Promise<string> = evaluateInPage(
      session,
      actor,
      createResponseExpression(id),
    );
    // A watch that fails must not go unhandled while the key is sent.
    watch.catch(() => undefined);
    await sendKey(session, actor, 'keyDown', key);
    response = await watch;
    await sleep(DELAYED_WALK_DURATION);
  } finally {
    await sendKey(session, actor, 'keyUp', key);
  }
  const elapsed = Number(response);
  const took =
    response === 'never'
      ? 'never drew its player moving'
      : `drew its player moving after ${elapsed.toFixed(0)} milliseconds`;
  if (isPredicting && !(elapsed < NETWORK_DELAY)) {
    throw new Error(`${mode} ${took}, which is not at once.`);
  }
  if (!isPredicting && !(elapsed >= NETWORK_DELAY * 2)) {
    throw new Error(
      `${mode} ${took}, which is not after the server has answered.`,
    );
  }

  const isAt = (view: OwnView, x: number, z: number): boolean =>
    view.drawn?.x === x && view.drawn.z === z;
  const describeView = (view: OwnView): string =>
    `draws its player at x ${String(view.drawn?.x)}, z ` +
    `${String(view.drawn?.z)}, and the server tells x ` +
    `${String(view.told?.x)}, z ${String(view.told?.z)}, doing ` +
    `"${view.told?.action ?? ''}"`;
  const own: OwnView = await waitFor(
    () => readOwnView(session, actor, id),
    (view: OwnView) =>
      view.told?.action === 'Idle' &&
      view.told.x !== before.told?.x &&
      isAt(view, view.told.x, view.told.z),
    ACTION_TIMEOUT,
    (view: OwnView) => `${mode} ${describeView(view)}, with the key released.`,
  );
  await sleep(POLL_INTERVAL * 5 + NETWORK_DELAY * 2);
  const later: OwnView = await readOwnView(session, actor, id);
  if (!isAt(later, own.told?.x ?? NaN, own.told?.z ?? NaN)) {
    throw new Error(`${mode} ${describeView(later)}, still moving.`);
  }
  if (later.corrections !== before.corrections) {
    throw new Error(
      `${mode} counts "${later.corrections}" corrections, after ` +
        `"${before.corrections}" before its player walked.`,
    );
  }
  await waitFor(
    () => readOwnView(session, watcher, id),
    (view: OwnView) => isAt(view, own.told?.x ?? NaN, own.told?.z ?? NaN),
    ACTION_TIMEOUT,
    (view: OwnView) =>
      `${mode} ${describeView(later)}, and the second page ` +
      `${describeView(view)}.`,
  );
  await setControl(session, actor, 'Net delay (ms)', 0);
  await setControl(session, actor, 'Predict', true);
}

/**
 * Checks that a player that walks into an obstacle behind a slow
 * connection, with the outlines of the obstacles drawn, is stopped by it,
 * and slides along it when it walks into it at an angle, and that its own
 * page shows it in the end where the server tells, without a correction,
 * as does the page of another player.
 *
 * The player walks left, which in the first view is towards the cottage
 * on the left of the plaza, whose front faces the plaza.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
async function checkObstacle(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  await setControl(session, actor, 'Show obstacles', true);
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const describeView = (view: OwnView): string =>
    `draws its player at x ${String(view.drawn?.x)}, z ` +
    `${String(view.drawn?.z)}, and the server tells x ` +
    `${String(view.told?.x)}, z ${String(view.told?.z)}, doing ` +
    `"${view.told?.action ?? ''}"`;
  const before: OwnView = await readOwnView(session, actor, id);
  let blocked: OwnView;
  let slid: OwnView;
  try {
    await sendKey(session, actor, 'keyDown', 'a');
    let lastX = NaN;
    let stillLooks = 0;
    blocked = await waitFor(
      () => readOwnView(session, actor, id),
      (view: OwnView) => {
        const isStill =
          view.told?.action === 'Walk' && view.told.x === lastX;
        stillLooks = isStill ? stillLooks + 1 : 0;
        lastX = view.told?.x ?? NaN;
        return stillLooks >= BLOCKED_LOOKS;
      },
      BLOCKED_TIMEOUT,
      (view: OwnView) =>
        `${mode}, with the A key held down, ${describeView(view)}, never ` +
        'stopped by the cottage.',
    );
    if (!((blocked.told?.x ?? NaN) < (before.told?.x ?? NaN))) {
      throw new Error(
        `${mode}, with the A key held down, ${describeView(blocked)}, ` +
          `after x ${String(before.told?.x)} before.`,
      );
    }
    await sendKey(session, actor, 'keyDown', 'w');
    await sleep(SLIDE_DURATION + NETWORK_DELAY * 2);
    slid = await readOwnView(session, actor, id);
  } finally {
    await sendKey(session, actor, 'keyUp', 'w');
    await sendKey(session, actor, 'keyUp', 'a');
  }
  const blockedX: number = blocked.told?.x ?? NaN;
  const blockedZ: number = blocked.told?.z ?? NaN;
  const isAlong: boolean =
    Math.abs((slid.told?.x ?? NaN) - blockedX) < SAME_POSITION &&
    (slid.told?.z ?? NaN) < blockedZ - 0.1;
  if (!isAlong) {
    throw new Error(
      `${mode}, with the W key held down as well against the cottage at ` +
        `x ${String(blockedX)}, z ${String(blockedZ)}, ` +
        `${describeView(slid)}, not sliding along it.`,
    );
  }

  const isAt = (view: OwnView, x: number, z: number): boolean =>
    view.drawn?.x === x && view.drawn.z === z;
  const own: OwnView = await waitFor(
    () => readOwnView(session, actor, id),
    (view: OwnView) =>
      view.told?.action === 'Idle' && isAt(view, view.told.x, view.told.z),
    ACTION_TIMEOUT,
    (view: OwnView) => `${mode} ${describeView(view)}, with the keys released.`,
  );
  await sleep(POLL_INTERVAL * 5 + NETWORK_DELAY * 2);
  const later: OwnView = await readOwnView(session, actor, id);
  if (!isAt(later, own.told?.x ?? NaN, own.told?.z ?? NaN)) {
    throw new Error(`${mode} ${describeView(later)}, still moving.`);
  }
  if (later.corrections !== before.corrections) {
    throw new Error(
      `${mode} counts "${later.corrections}" corrections, after ` +
        `"${before.corrections}" before its player walked into the cottage.`,
    );
  }
  await waitFor(
    () => readOwnView(session, watcher, id),
    (view: OwnView) => isAt(view, own.told?.x ?? NaN, own.told?.z ?? NaN),
    ACTION_TIMEOUT,
    (view: OwnView) =>
      `${mode} ${describeView(later)}, and the second page ` +
      `${describeView(view)}.`,
  );
  await setControl(session, actor, 'Net delay (ms)', 0);
  await setControl(session, actor, 'Show obstacles', false);
}

/**
 * Reads how a page shows the monster and a player, and the hits.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<MonsterLook>} How the page shows them.
 */
async function readMonsterLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<MonsterLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createMonsterExpression(id)),
  ) as MonsterLook;
}

/**
 * Describes how a page shows the monster and a player, for the error
 * messages.
 *
 * @param {MonsterLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeMonsterLook(look: MonsterLook): string {
  const { own, monster } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `health ${String(own.health)}`;
  const shown: string =
    monster === null
      ? 'without the monster'
      : `with the monster ${monster.mode} at x ${monster.x.toFixed(2)}, z ` +
        `${monster.z.toFixed(2)}, health ${String(monster.health)}`;
  return `${player}, ${shown}, and ${String(look.hits.length)} hits shown`;
}

/**
 * Walks the player of a page one way, with keys held down, until it gets
 * where a test tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {string} key - The character of the key that walks it that way.
 * @param {(look: MonsterLook) => boolean} isThere - Tells whether it has
 *   got there.
 * @param {string} where - Where it is to get, for the error messages.
 * @returns {Promise<void>} A promise settled once it has got there.
 * @throws {Error} If it does not get there in time.
 */
async function walkUntil(
  session: BidiSession,
  context: string,
  id: number,
  key: string,
  isThere: (look: MonsterLook) => boolean,
  where: string,
): Promise<void> {
  const look = (): Promise<MonsterLook> =>
    readMonsterLook(session, context, id);
  if (isThere(await look())) {
    return;
  }
  await sendKey(session, context, 'keyDown', key);
  try {
    await waitFor(look, isThere, LEG_TIMEOUT, (seen: MonsterLook) =>
      `With the ${key.toUpperCase()} key held down to walk ${where}, the ` +
      `first page tells ${describeMonsterLook(seen)}.`,
    );
  } finally {
    await sendKey(session, context, 'keyUp', key);
  }
}

/**
 * Steps the player of a page along the Z axis, a tap of a key at a time,
 * until it stands within a stretch.  It waits until the page tells that
 * the player idles before the first tap, and that it has moved and idles
 * again after every tap.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {number} least - The least position along the Z axis of the
 *   stretch, in metres.
 * @param {number} most - The greatest position along the Z axis of the
 *   stretch, in metres.
 * @param {string} where - Where the player is stepped, for the error
 *   messages.
 * @returns {Promise<void>} A promise settled once it stands there.
 * @throws {Error} If it does not get there in time.
 */
async function stepWithin(
  session: BidiSession,
  context: string,
  id: number,
  least: number,
  most: number,
  where: string,
): Promise<void> {
  const look = (): Promise<MonsterLook> =>
    readMonsterLook(session, context, id);
  const describeProblem = (seen: MonsterLook): string =>
    `Stepping its player ${where} to z ${String(least)} to ` +
    `${String(most)}, the first page tells ${describeMonsterLook(seen)}.`;
  const deadline: number = Date.now() + LEG_TIMEOUT;
  let seen: MonsterLook = await waitFor(
    look,
    (shown: MonsterLook) => shown.own?.action === 'Idle',
    ACTION_TIMEOUT,
    describeProblem,
  );
  for (;;) {
    const z: number = seen.own?.z ?? NaN;
    if (z >= least && z <= most) {
      return;
    }
    if (Number.isNaN(z) || Date.now() > deadline) {
      throw new Error(describeProblem(seen));
    }
    const key: string = z < least ? 's' : 'w';
    await sendKey(session, context, 'keyDown', key);
    try {
      await sleep(TAP_DURATION);
    } finally {
      await sendKey(session, context, 'keyUp', key);
    }
    seen = await waitFor(
      look,
      (shown: MonsterLook) =>
        shown.own?.action === 'Idle' && shown.own.z !== z,
      ACTION_TIMEOUT,
      describeProblem,
    );
  }
}

/**
 * Sums up the damage of the hits a page has shown on the monster.
 *
 * @param {MonsterLook} look - How the page shows the hits.
 * @returns {number} The damage.
 */
function sumMonsterDamage(look: MonsterLook): number {
  return look.hits
    .filter((hit: HitView) => hit.target.kind === 'monster')
    .reduce((total: number, hit: HitView) => total + hit.damage, 0);
}

/**
 * Checks that a page has shown no hit twice.
 *
 * @param {MonsterLook} look - How the page shows the hits.
 * @param {string} name - The name of the page, for the error messages.
 * @throws {Error} If it has.
 */
function checkHitsOnce(look: MonsterLook, name: string): void {
  const ids: number[] = look.hits.map((hit: HitView) => hit.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `${name} has shown hits more than once: ${JSON.stringify(ids)}.`,
    );
  }
}

/**
 * Checks that a player that walks to the monster and slashes it once it
 * has come to the player lowers its health in its own page and in the
 * page of another player, and that each page shows the hit once, for as
 * much as the health went down.  The player walks away from the monster
 * as soon as both pages tell that its health went down and the monster
 * has hurt the player, before the hits are checked, so that the monster
 * has little time to hurt it more.
 *
 * The player walks right in the first view to the path, back along the
 * path to a stretch where its way is clear to the spawn stones of the
 * monster, and right again between the stones until the monster notices
 * it, which it does by then wherever it has wandered.  It slashes as it
 * walks towards the monster, which leaves it facing that way, as a
 * slashing player does not turn.  It walks away along the same stretch.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the hit so.
 */
async function checkMonster(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (look: MonsterLook) => (look.own?.x ?? -Infinity) >= -0.8,
    'to the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    's',
    (look: MonsterLook) => (look.own?.z ?? -Infinity) >= ROUTE_LEAST_Z,
    'along the path',
  );
  await stepWithin(
    session,
    actor,
    id,
    ROUTE_LEAST_Z,
    ROUTE_MOST_Z,
    'along the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (look: MonsterLook) =>
      look.monster?.mode === 'chase' ||
      (look.own?.x ?? -Infinity) >= APPROACH_X,
    'towards the spawn stones',
  );
  const measure = (look: MonsterLook): number =>
    look.own === null || look.monster === null
      ? Infinity
      : Math.hypot(look.monster.x - look.own.x, look.monster.z - look.own.z);
  // The monster that chases a player stops walking once it is near it.
  await waitFor(
    () => readMonsterLook(session, actor, id),
    (look: MonsterLook) =>
      look.monster?.mode === 'chase' &&
      look.monster.action !== 'Walk' &&
      measure(look) <= MONSTER_NEARNESS,
    MONSTER_TIMEOUT,
    (look: MonsterLook) =>
      `With its player by the spawn stones, the first page tells ` +
      `${describeMonsterLook(look)}, the monster never coming to it.`,
  );

  const readBoth = (): Promise<[MonsterLook, MonsterLook]> =>
    Promise.all([
      readMonsterLook(session, actor, id),
      readMonsterLook(session, watcher, id),
    ]);
  const [ownBefore, otherBefore] = await readBoth();
  const healthBefore: number = ownBefore.monster?.health ?? NaN;
  const isLowered = (look: MonsterLook): boolean =>
    (look.monster?.health ?? Infinity) < healthBefore;
  const dx: number = (ownBefore.monster?.x ?? NaN) - (ownBefore.own?.x ?? NaN);
  const dz: number = (ownBefore.monster?.z ?? NaN) - (ownBefore.own?.z ?? NaN);
  const turn: number = (Math.round((Math.atan2(dx, dz) * 4) / Math.PI) + 8) % 8;
  const keys: readonly string[] = TURN_KEYS[turn] ?? [];
  const isFacing = (look: MonsterLook): boolean =>
    look.own?.action === 'Walk' &&
    Math.abs(((look.own.yaw - turn * 45 + 540) % 360) - 180) <=
      YAW_TOLERANCE;
  // Two keys let go of one after the other would leave the player facing
  // the way of the later one, and a slash that comes into effect with the
  // walk would leave it facing the way it faced before.  A slash started
  // once the server tells the player walks the way of the keys keeps it
  // facing that way, as a slashing player does not turn.
  try {
    for (const key of keys) {
      await sendKey(session, actor, 'keyDown', key);
    }
    await waitFor(
      () => readMonsterLook(session, actor, id),
      isFacing,
      ACTION_TIMEOUT,
      (look: MonsterLook) =>
        `With ${keys.join(' and ').toUpperCase()} held down to walk ` +
        `towards the monster, the first page tells ` +
        `${describeMonsterLook(look)}, facing ${String(look.own?.yaw)} ` +
        'degrees.',
    );
    await sendKey(session, actor, 'keyDown', ' ');
  } finally {
    await sendKey(session, actor, 'keyUp', ' ');
    for (const key of keys) {
      await sendKey(session, actor, 'keyUp', key);
    }
  }
  await waitFor(
    readBoth,
    ([own, other]: [MonsterLook, MonsterLook]) =>
      isLowered(own) && isLowered(other),
    HIT_TIMEOUT,
    ([own, other]: [MonsterLook, MonsterLook]) =>
      `With its player slashing at the monster, the first page tells ` +
      `${describeMonsterLook(own)}, and the second page ` +
      `${describeMonsterLook(other)}, after a monster health of ` +
      `${String(healthBefore)} before.`,
  );
  // The monster strikes back before long, which leaves the player hurt.
  await waitFor(
    () => readMonsterLook(session, actor, id),
    (look: MonsterLook) => (look.own?.health ?? FULL_HEALTH) < FULL_HEALTH,
    MONSTER_TIMEOUT,
    (look: MonsterLook) =>
      `With its player by the monster it hit, the first page tells ` +
      `${describeMonsterLook(look)}, the monster never hurting it.`,
  );
  await stepWithin(
    session,
    actor,
    id,
    ROUTE_LEAST_Z,
    ROUTE_MOST_Z,
    'away from the monster',
  );
  await walkUntil(
    session,
    actor,
    id,
    'a',
    (look: MonsterLook) => (look.own?.x ?? Infinity) <= 2,
    'away from the monster',
  );

  // The hits are shown as the monster is, a while after the snapshots.
  const isShown = (look: MonsterLook, before: MonsterLook): boolean =>
    (look.bar ?? 1) < 1 &&
    sumMonsterDamage(look) - sumMonsterDamage(before) ===
      (before.monster?.health ?? NaN) - (look.monster?.health ?? NaN);
  const isAllShown = ([own, other]: [MonsterLook, MonsterLook]): boolean =>
    isShown(own, ownBefore) && isShown(other, otherBefore);
  const describeBoth = ([own, other]: [MonsterLook, MonsterLook]): string =>
    `the first page tells ${describeMonsterLook(own)}, and the second ` +
    `page ${describeMonsterLook(other)}`;
  await waitFor(
    readBoth,
    isAllShown,
    HIT_TIMEOUT,
    (looks: [MonsterLook, MonsterLook]) =>
      `After its player hit the monster, ${describeBoth(looks)}, the hits ` +
      'shown not adding up to the health the monster lost.',
  );
  await sleep(HIT_TIMEOUT);
  const after: [MonsterLook, MonsterLook] = await readBoth();
  checkHitsOnce(after[0], 'The first page');
  checkHitsOnce(after[1], 'The second page');
  if (!isAllShown(after)) {
    throw new Error(
      `A while after its player hit the monster, ${describeBoth(after)}, ` +
        'the hits shown no longer adding up to the health the monster lost.',
    );
  }
}

/**
 * Reads how a page shows a player and the heals, and what it tells the
 * space bar does.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<FountainLook>} How the page shows them.
 */
async function readFountainLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<FountainLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createFountainExpression(id)),
  ) as FountainLook;
}

/**
 * Describes how a page shows a player and the heals, and what it tells
 * the space bar does, for the error messages.
 *
 * @param {FountainLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeFountainLook(look: FountainLook): string {
  const { own } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `doing "${own.action}", health ${String(own.health)}, its bar ` +
        `${String(look.bar)} full`;
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  return (
    `${player}, the space bar to "${look.spaceKey}", ${prompt}, ` +
    `${String(look.heals.length)} heals shown, and "${look.corrections}" ` +
    'corrections'
  );
}

/**
 * Sums up the health a page has shown a player get back.
 *
 * @param {FountainLook} look - How the page shows the heals.
 * @param {number} id - The identifier of the player.
 * @returns {number} The health.
 */
function sumHealing(look: FountainLook, id: number): number {
  return look.heals
    .filter(
      (heal: HealView) =>
        heal.target.kind === 'player' && heal.target.id === id,
    )
    .reduce((total: number, heal: HealView) => total + heal.amount, 0);
}

/**
 * Checks that a hurt player that drinks from the fountain behind a slow
 * connection gets health back in its own page and in the page of another
 * player, which shows it drinking, and that each page shows the heal once,
 * for as much as the health went up.  Its own page prompts it to drink by
 * the fountain, and slashes instead once it faces away, without a
 * correction for either.
 *
 * The player walks left in the first view to the middle of the plaza, and
 * forward to the fountain until its page tells the space bar has it drink.
 * It turns away from the fountain with a tap of a key.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
async function checkFountain(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (context: string) => (): Promise<FountainLook> =>
    readFountainLook(session, context, id);
  await walkUntil(
    session,
    actor,
    id,
    'a',
    (seen: MonsterLook) => (seen.own?.x ?? Infinity) <= FOUNTAIN_X,
    'to the middle of the plaza',
  );
  await sendKey(session, actor, 'keyDown', 'w');
  try {
    await waitFor(
      look(actor),
      (seen: FountainLook) => seen.spaceKey === DRINK_KEY,
      LEG_TIMEOUT,
      (seen: FountainLook) =>
        'With the W key held down to walk to the fountain, the first page ' +
        `tells ${describeFountainLook(seen)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'w');
  }

  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const readBoth = (): Promise<[FountainLook, FountainLook]> =>
    Promise.all([look(actor)(), look(watcher)()]);
  const describeBoth = ([own, other]: [FountainLook, FountainLook]): string =>
    `${mode} tells ${describeFountainLook(own)}, and the second page ` +
    describeFountainLook(other);
  const isResting = ([own, other]: [FountainLook, FountainLook]): boolean =>
    own.own?.action === 'Idle' &&
    other.own?.action === 'Idle' &&
    own.own.x === other.own.x &&
    own.own.z === other.own.z;
  const before: [FountainLook, FountainLook] = await waitFor(
    readBoth,
    isResting,
    ACTION_TIMEOUT,
    (looks: [FountainLook, FountainLook]) =>
      `By the fountain, ${describeBoth(looks)}.`,
  );
  const [ownBefore] = before;
  if (ownBefore.prompt !== DRINK_PROMPT) {
    throw new Error(`By the fountain, ${describeBoth(before)}.`);
  }
  if (!((ownBefore.own?.health ?? FULL_HEALTH) < FULL_HEALTH)) {
    throw new Error(
      `By the fountain, ${describeBoth(before)}, the player not hurt.`,
    );
  }

  const toldAction =
    '(window.clovervale.listLatestPlayers()' +
    `.find((player) => player.id === ${String(id)}) ?? {}).action`;
  const drinking: Promise<string> = watchAction(
    session,
    watcher,
    toldAction,
    'Drink',
  );
  // A watch that fails must not go unhandled while the keys are sent.
  drinking.catch(() => undefined);
  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  const seen: string = await drinking;
  if (seen !== 'over') {
    const problem: string =
      seen === 'never' ? 'never drinking' : 'drinking without end';
    throw new Error(
      'With the space bar pressed by the fountain in the first page, the ' +
        `second page shows player ${String(id)} ${problem}.`,
    );
  }
  const isHealed = (after: FountainLook, earlier: FountainLook): boolean => {
    const gained: number =
      (after.own?.health ?? NaN) - (earlier.own?.health ?? NaN);
    return (
      gained > 0 &&
      (after.bar ?? 0) > (earlier.bar ?? 1) &&
      sumHealing(after, id) - sumHealing(earlier, id) === gained
    );
  };
  const isAllHealed = ([own, other]: [FountainLook, FountainLook]): boolean =>
    isHealed(own, before[0]) && isHealed(other, before[1]);
  await waitFor(
    readBoth,
    isAllHealed,
    ACTION_TIMEOUT,
    (looks: [FountainLook, FountainLook]) =>
      `With its player drinking from the fountain, ${describeBoth(looks)}, ` +
      `after a health of ${String(ownBefore.own?.health)} before.`,
  );

  await sendKey(session, actor, 'keyDown', 's');
  try {
    await sleep(TAP_DURATION);
  } finally {
    await sendKey(session, actor, 'keyUp', 's');
  }
  const turned: [FountainLook, FountainLook] = await waitFor(
    readBoth,
    (looks: [FountainLook, FountainLook]) =>
      isResting(looks) && looks[0].own?.z !== ownBefore.own?.z,
    ACTION_TIMEOUT,
    (looks: [FountainLook, FountainLook]) =>
      `With its player turned away from the fountain, ${describeBoth(looks)}.`,
  );
  if (turned[0].spaceKey !== SLASH_KEY || turned[0].prompt !== null) {
    throw new Error(
      `With its player turned away from the fountain, ` +
        `${describeBoth(turned)}.`,
    );
  }
  const figureAction =
    '(window.clovervale.describeFigures()' +
    `.find((figure) => figure.id === ${String(id)}) ?? {}).clip`;
  const slashing: Promise<string> = watchAction(session, watcher, figureAction);
  slashing.catch(() => undefined);
  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  const slashed: string = await slashing;
  if (slashed !== 'over') {
    throw new Error(
      'With the space bar pressed by the fountain, facing away from it, in ' +
        `the first page, the second page shows player ${String(id)} ` +
        `slashing "${slashed}".`,
    );
  }

  await sleep(POLL_INTERVAL * 5 + NETWORK_DELAY * 2);
  const after: [FountainLook, FountainLook] = await readBoth();
  if (after[0].corrections !== ownBefore.corrections) {
    throw new Error(
      `After its player drank and slashed by the fountain, ` +
        `${describeBoth(after)}, after "${ownBefore.corrections}" ` +
        'corrections before.',
    );
  }
  for (const [index, name] of ['The first page', 'The second page'].entries()) {
    const ids: number[] = (after[index]?.heals ?? []).map(
      (heal: HealView) => heal.id,
    );
    if (new Set(ids).size !== ids.length) {
      throw new Error(
        `${name} has shown heals more than once: ${JSON.stringify(ids)}.`,
      );
    }
  }
  await setControl(session, actor, 'Net delay (ms)', 0);
}

/**
 * Reads how a page shows a player and the bubble above the head of a
 * villager, and what it tells the space bar does.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<TalkLook>} How the page shows them.
 */
async function readTalkLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<TalkLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createTalkExpression(id)),
  ) as TalkLook;
}

/**
 * Describes how a page shows a player and the bubble above the head of a
 * villager, and what it tells the space bar does, for the error messages.
 *
 * @param {TalkLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeTalkLook(look: TalkLook): string {
  const { own, speech } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `doing "${own.action}"`;
  const bubble: string =
    speech === null
      ? 'no bubble'
      : `a bubble at x ${speech.x.toFixed(2)}, y ${speech.y.toFixed(2)}, ` +
        `z ${speech.z.toFixed(2)} of ${speech.name} saying "${speech.line}"`;
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  return (
    `${player}, the space bar to "${look.spaceKey}", ${prompt}, ${bubble}, ` +
    `"${look.corrections}" corrections, and the last slash judged ` +
    `"${look.judgedBack}" back`
  );
}

/**
 * Checks that a player that talks to Nancy behind a slow connection shows
 * what she says in a bubble above her head in its own page, for a while
 * and then no more, and nowhere in the page of another player, which shows
 * it talking.  Its own page prompts it to talk by her.  The player does not
 * slash, in either page, and its own page makes no correction.
 *
 * The player is stepped along the Z axis to where Nancy stands straight
 * ahead of it to the right in the first view, and walks right until its
 * page tells the space bar has it talk to her.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the player so.
 */
async function checkTalk(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (context: string) => (): Promise<TalkLook> =>
    readTalkLook(session, context, id);
  await stepWithin(
    session,
    actor,
    id,
    TALK_LEAST_Z,
    TALK_MOST_Z,
    'level with Nancy',
  );
  await sendKey(session, actor, 'keyDown', 'd');
  try {
    await waitFor(
      look(actor),
      (seen: TalkLook) => seen.spaceKey === TALK_KEY,
      LEG_TIMEOUT,
      (seen: TalkLook) =>
        'With the D key held down to walk to Nancy, the first page tells ' +
        `${describeTalkLook(seen)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'd');
  }

  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  await setControl(session, actor, 'Net delay (ms)', NETWORK_DELAY);
  const readBoth = (): Promise<[TalkLook, TalkLook]> =>
    Promise.all([look(actor)(), look(watcher)()]);
  const describeBoth = ([own, other]: [TalkLook, TalkLook]): string =>
    `${mode} tells ${describeTalkLook(own)}, and the second page ` +
    describeTalkLook(other);
  const before: [TalkLook, TalkLook] = await waitFor(
    readBoth,
    ([own, other]: [TalkLook, TalkLook]) =>
      own.own?.action === 'Idle' &&
      other.own?.action === 'Idle' &&
      own.own.x === other.own.x &&
      own.own.z === other.own.z,
    ACTION_TIMEOUT,
    (looks: [TalkLook, TalkLook]) => `By Nancy, ${describeBoth(looks)}.`,
  );
  const [ownBefore, otherBefore] = before;
  if (
    ownBefore.prompt !== TALK_PROMPT ||
    ownBefore.spaceKey !== TALK_KEY ||
    ownBefore.speech !== null ||
    otherBefore.speech !== null
  ) {
    throw new Error(`By Nancy, ${describeBoth(before)}.`);
  }

  const toldAction =
    '(window.clovervale.listLatestPlayers()' +
    `.find((player) => player.id === ${String(id)}) ?? {}).action`;
  const figureAction =
    '(window.clovervale.describeFigures()' +
    `.find((figure) => figure.id === ${String(id)}) ?? {}).clip`;
  // The second page watches for the player to talk and then stop, and
  // both pages watch for a slash, all along until well after the talk.
  const watches: Promise<string[]> = Promise.all([
    watchAction(session, watcher, toldAction, 'Talk'),
    watchAction(session, actor, PANEL_ACTION_EXPRESSION),
    watchAction(session, watcher, figureAction),
  ]);
  // A watch that fails must not go unhandled while the keys are sent.
  watches.catch(() => undefined);
  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  const isSaid = ([own, other]: [TalkLook, TalkLook]): boolean =>
    own.speech !== null &&
    own.speech.name === 'Nancy' &&
    own.speech.line === NANCY_LINE &&
    Math.abs(own.speech.x - NANCY_X) <= SPEECH_NEARNESS &&
    Math.abs(own.speech.z - NANCY_Z) <= SPEECH_NEARNESS &&
    own.speech.y >= SPEECH_LEAST_HEIGHT &&
    other.speech === null;
  await waitFor(
    readBoth,
    isSaid,
    ACTION_TIMEOUT,
    (looks: [TalkLook, TalkLook]) =>
      'With the space bar pressed by Nancy in the first page, ' +
      `${describeBoth(looks)}.`,
  );
  const after: [TalkLook, TalkLook] = await waitFor(
    readBoth,
    ([own, other]: [TalkLook, TalkLook]) =>
      own.speech === null && other.speech === null,
    SPEECH_TIMEOUT,
    (looks: [TalkLook, TalkLook]) =>
      `A while after its player talked to Nancy, ${describeBoth(looks)}.`,
  );
  const [talked = '', ownSlashed = '', otherSlashed = ''] = await watches;
  if (talked !== 'over') {
    const problem: string =
      talked === 'never' ? 'never talking' : 'talking without end';
    throw new Error(
      'With the space bar pressed by Nancy in the first page, the second ' +
        `page tells player ${String(id)} is ${problem}.`,
    );
  }
  if (ownSlashed !== 'never' || otherSlashed !== 'never') {
    throw new Error(
      'With the space bar pressed by Nancy in the first page, the panel ' +
        `of the first page tells its player slashing "${ownSlashed}", and ` +
        `the second page shows it slashing "${otherSlashed}".`,
    );
  }
  if (
    after[0].corrections !== ownBefore.corrections ||
    after[0].judgedBack !== ownBefore.judgedBack
  ) {
    throw new Error(
      `After its player talked to Nancy, ${describeBoth(after)}, after ` +
        `"${ownBefore.corrections}" corrections and the last slash judged ` +
        `"${ownBefore.judgedBack}" back before.`,
    );
  }
  await setControl(session, actor, 'Net delay (ms)', 0);
}

/**
 * Reads how a page shows a player, the clovers and the items, and what is
 * in its slots.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<InventoryLook>} How the page shows them.
 */
async function readInventoryLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<InventoryLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createInventoryExpression(id)),
  ) as InventoryLook;
}

/**
 * Describes how a page shows a player, the clovers and the items, and what
 * is in its slots, for the error messages.
 *
 * @param {InventoryLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeInventoryLook(look: InventoryLook): string {
  const { own } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `doing "${own.action}"`;
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  const { bag } = look;
  const shownBag: string =
    `the bag ${bag.isOpen ? 'open' : 'closed'}, keyed ` +
    `"${String(bag.key)}", with its cursor on slot ${String(bag.cursor)}` +
    (bag.menu === null
      ? ''
      : ` and a menu of ${JSON.stringify(bag.menu)} with its cursor on ` +
        String(bag.menuCursor));
  const items: string = look.items
    .map(
      (item: ItemView) =>
        `${String(item.id)} at x ${item.x.toFixed(2)}, z ${item.z.toFixed(2)}`,
    )
    .join('; ');
  return (
    `${player}, the space bar to "${look.spaceKey}", ${prompt}, ` +
    `${shownBag}, the slots ${JSON.stringify(look.slots)}, the clovers ` +
    `of the patches ${JSON.stringify(look.clovers)}, the items on the ` +
    `ground [${items}], and "${look.corrections}" corrections`
  );
}

/**
 * Counts the filled slots of the bag of a page that hold a four-leaved
 * clover.
 *
 * @param {InventoryLook} look - How the page shows its slots.
 * @returns {number} The number of them, or -1 if any other slot is filled.
 */
function countClovers(look: InventoryLook): number {
  const filled: string[] = look.slots.filter((kind: string) => kind !== '');
  return filled.every((kind: string) => kind === 'clover')
    ? filled.length
    : -1;
}

/**
 * Walks the player of a page down the east side of the plaza until its
 * page tells the space bar picks a four-leaved clover, and waits for it to
 * stop there.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<InventoryLook>} How the page shows it, once stopped.
 * @throws {Error} If the player does not get there in time.
 */
async function walkToClover(
  session: BidiSession,
  context: string,
  id: number,
  name: string,
): Promise<InventoryLook> {
  const look = (): Promise<InventoryLook> =>
    readInventoryLook(session, context, id);
  await walkUntil(
    session,
    context,
    id,
    'd',
    (seen: MonsterLook) => (seen.own?.x ?? -Infinity) >= CLOVER_WAY_X,
    'to the east side of the plaza',
  );
  await sendKey(session, context, 'keyDown', 'w');
  try {
    await waitFor(
      look,
      (seen: InventoryLook) => seen.spaceKey === PICK_KEY,
      LEG_TIMEOUT,
      (seen: InventoryLook) =>
        `With the W key held down to walk to a clover, ${name} tells ` +
        `${describeInventoryLook(seen)}.`,
    );
  } finally {
    await sendKey(session, context, 'keyUp', 'w');
  }
  return waitFor(
    look,
    (seen: InventoryLook) =>
      seen.own?.action === 'Idle' &&
      seen.spaceKey === PICK_KEY &&
      seen.prompt === PICK_PROMPT,
    ACTION_TIMEOUT,
    (seen: InventoryLook) =>
      `By a clover, ${name} tells ${describeInventoryLook(seen)}.`,
  );
}

/**
 * Checks that a player picks the four-leaved clover of a patch with the
 * space bar, and sees it in its slots, while the patch is shown without its
 * clover in both pages and the other page shows nothing in its own slots;
 * that it opens its bag with the I key, moves the cursor of the bag with
 * the arrow keys without walking, opens the menu of the clover with Enter,
 * and drops the clover at its feet with Enter again, where both pages
 * show it lying; and that the player of the other page walks to it, picks
 * it up with the space bar, and sees it in its own slots, while it is gone
 * from the ground in both pages and from the slots of the first.  Neither
 * the pick nor the put-down makes a correction in the first page.
 *
 * Each player walks right in the first view to the east side of the plaza,
 * and then down it until its page tells the space bar picks.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player
 *   that picks the clover of the patch.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player of the first page.
 * @param {number} otherId - The identifier of the player of the other page.
 * @returns {Promise<void>} A promise settled once the players have passed.
 * @throws {Error} If either page does not show the items so.
 */
async function checkInventory(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  otherId: number,
): Promise<void> {
  const readBoth = (): Promise<[InventoryLook, InventoryLook]> =>
    Promise.all([
      readInventoryLook(session, actor, id),
      readInventoryLook(session, watcher, otherId),
    ]);
  const describeBoth = ([own, other]: [InventoryLook, InventoryLook]): string =>
    `the first page tells ${describeInventoryLook(own)}, and the second ` +
    `page ${describeInventoryLook(other)}`;
  const byClover: InventoryLook = await walkToClover(
    session,
    actor,
    id,
    'the first page',
  );
  const [ownBefore, otherBefore] = await readBoth();
  if (
    countClovers(ownBefore) !== 0 ||
    countClovers(otherBefore) !== 0 ||
    ownBefore.bag.isOpen ||
    ownBefore.bag.key !== 'I' ||
    !otherBefore.clovers.includes(CLOVER_PATCH)
  ) {
    throw new Error(`By a clover, ${describeBoth([ownBefore, otherBefore])}.`);
  }

  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  await waitFor(
    readBoth,
    ([own, other]: [InventoryLook, InventoryLook]) =>
      countClovers(own) === 1 &&
      own.bag.key === 'I' &&
      !own.clovers.includes(CLOVER_PATCH) &&
      !other.clovers.includes(CLOVER_PATCH) &&
      countClovers(other) === 0,
    ACTION_TIMEOUT,
    (looks: [InventoryLook, InventoryLook]) =>
      `With the space bar pressed by a clover in the first page, ` +
      `${describeBoth(looks)}.`,
  );

  const press = async (context: string, key: string): Promise<void> => {
    await sendKey(session, context, 'keyDown', key);
    await sendKey(session, context, 'keyUp', key);
  };
  const look = (): Promise<InventoryLook> =>
    readInventoryLook(session, actor, id);
  await press(actor, 'i');
  await press(actor, BAG_KEYS.right);
  await press(actor, BAG_KEYS.left);
  await press(actor, BAG_KEYS.enter);
  const choosing: InventoryLook = await waitFor(
    look,
    (seen: InventoryLook) =>
      seen.bag.isOpen &&
      seen.bag.cursor === 0 &&
      JSON.stringify(seen.bag.menu) === JSON.stringify(CLOVER_ACTIONS) &&
      seen.bag.menuCursor === 0,
    ACTION_TIMEOUT,
    (seen: InventoryLook) =>
      'With I, the right and left arrows and Enter pressed in the first ' +
      `page, it tells ${describeInventoryLook(seen)}.`,
  );
  if (
    choosing.own?.x !== byClover.own?.x ||
    choosing.own?.z !== byClover.own?.z
  ) {
    throw new Error(
      'With the arrow keys pressed in its open bag, the first page tells ' +
        `${describeInventoryLook(choosing)}, after the player stood at x ` +
        `${String(byClover.own?.x)}, z ${String(byClover.own?.z)}.`,
    );
  }
  await press(actor, BAG_KEYS.enter);
  const isLyingThere = (look: InventoryLook): boolean =>
    look.items.length === 1 &&
    look.items.every(
      (item: ItemView) =>
        Math.abs(item.x - (byClover.own?.x ?? NaN)) <= ITEM_NEARNESS &&
        Math.abs(item.z - (byClover.own?.z ?? NaN)) <= ITEM_NEARNESS,
    );
  const dropped: [InventoryLook, InventoryLook] = await waitFor(
    readBoth,
    ([own, other]: [InventoryLook, InventoryLook]) =>
      countClovers(own) === 0 &&
      own.bag.isOpen &&
      own.bag.menu === null &&
      own.bag.key === 'I' &&
      isLyingThere(own) &&
      isLyingThere(other),
    ACTION_TIMEOUT,
    (looks: [InventoryLook, InventoryLook]) =>
      `With Drop chosen in the menu of the first page, ` +
      `${describeBoth(looks)}.`,
  );
  if (dropped[0].corrections !== byClover.corrections) {
    throw new Error(
      `After its player picked a clover and put it down, ` +
        `${describeBoth(dropped)}, after "${byClover.corrections}" ` +
        'corrections before.',
    );
  }

  await press(actor, BAG_KEYS.escape);
  await waitFor(
    look,
    (seen: InventoryLook) => !seen.bag.isOpen,
    ACTION_TIMEOUT,
    (seen: InventoryLook) =>
      `With Esc pressed in the open bag of the first page, it tells ` +
      `${describeInventoryLook(seen)}.`,
  );

  await walkToClover(session, watcher, otherId, 'the second page');
  await sendKey(session, watcher, 'keyDown', ' ');
  await sendKey(session, watcher, 'keyUp', ' ');
  await waitFor(
    readBoth,
    ([own, other]: [InventoryLook, InventoryLook]) =>
      countClovers(other) === 1 &&
      other.bag.key === 'I' &&
      countClovers(own) === 0 &&
      own.items.length === 0 &&
      other.items.length === 0,
    ACTION_TIMEOUT,
    (looks: [InventoryLook, InventoryLook]) =>
      `With the space bar pressed by the clover on the ground in the ` +
      `second page, ${describeBoth(looks)}.`,
  );
}

/**
 * Reads what a page shows in words.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<LanguageLook>} What the page shows.
 */
async function readLanguageLook(
  session: BidiSession,
  context: string,
): Promise<LanguageLook> {
  return JSON.parse(
    await evaluateInPage(session, context, LANGUAGE_LOOK_EXPRESSION),
  ) as LanguageLook;
}

/**
 * Describes what a page shows in words, for the error messages.
 *
 * @param {LanguageLook} look - What the page shows.
 * @returns {string} The description.
 */
function describeLanguageLook(look: LanguageLook): string {
  const panel: string = Object.entries(look.panel)
    .map(([name, value]: [string, string]) => `${name}: "${value}"`)
    .join(', ');
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  const bubble: string =
    look.speech === null
      ? 'no bubble'
      : `a bubble of ${look.speech.name} saying "${look.speech.line}"`;
  return (
    `the language "${look.lang}", the title "${look.title}", the panel ` +
    `titles "${look.titles.join('", "')}", the languages ` +
    `"${look.offered.join('", "')}" offered, ${prompt}, ${bubble}, and ` +
    `the panel values ${panel}`
  );
}

/**
 * Chooses a language in the language control of the panel of a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} control - The name of the language control, in the
 *   language the page speaks.
 * @param {string} choice - The name of the language to choose.
 * @returns {Promise<void>} A promise settled once it is chosen.
 * @throws {Error} If the panel has no such control, or it does not offer
 *   the language.
 */
async function chooseLanguage(
  session: BidiSession,
  context: string,
  control: string,
  choice: string,
): Promise<void> {
  const chosen: string = await evaluateInPage(
    session,
    context,
    createLanguageExpression(control, choice),
  );
  if (chosen !== choice) {
    throw new Error(
      `With "${choice}" chosen in the "${control}" control of its panel, ` +
        `the first page has "${chosen}" chosen.`,
    );
  }
}

/**
 * Checks that a page speaks English at first, and that once Traditional
 * Chinese is chosen in its panel, it words its panel, its title and its
 * prompt in it at once, and that Nancy speaks it when the player talks to
 * her, and that once English is chosen again, it words them all in English
 * again at once, the bubble too while it is shown.
 *
 * The player stands by Nancy, facing her, as {@link checkTalk} leaves it.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not word its text so.
 */
async function checkLanguage(
  session: BidiSession,
  context: string,
): Promise<void> {
  const look = (): Promise<LanguageLook> => readLanguageLook(session, context);
  const isEnglish = (seen: LanguageLook): boolean =>
    seen.lang === PAGE_LANGUAGE &&
    seen.title === 'Clovervale' &&
    seen.titles[0] === 'Clovervale' &&
    seen.titles.includes(SNAPSHOT_FOLDER) &&
    (seen.panel.Server ?? '').startsWith('connected') &&
    seen.panel['Space key'] === TALK_KEY &&
    seen.prompt === TALK_PROMPT &&
    (seen.speech === null ||
      (seen.speech.name === 'Nancy' && seen.speech.line === NANCY_LINE));
  const before: LanguageLook = await look();
  if (
    !isEnglish(before) ||
    before.offered.join('\n') !== LANGUAGE_NAMES.join('\n')
  ) {
    throw new Error(
      `Standing by Nancy and pinned to English, the first page tells ` +
        `${describeLanguageLook(before)}.`,
    );
  }

  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  const isChinese = (seen: LanguageLook): boolean =>
    seen.lang === 'zh-TW' &&
    seen.title === ZH_TW_TITLE &&
    seen.titles[0] === ZH_TW_TITLE &&
    seen.titles.includes(ZH_TW_SNAPSHOT_FOLDER) &&
    (seen.panel[ZH_TW_SERVER] ?? '').startsWith(ZH_TW_CONNECTED) &&
    seen.panel[ZH_TW_SPACE_KEY] === ZH_TW_TALK_KEY &&
    seen.prompt === ZH_TW_TALK_PROMPT;
  await waitFor(
    look,
    isChinese,
    ACTION_TIMEOUT,
    (seen: LanguageLook) =>
      `With "${ZH_TW_NAME}" chosen in its panel by Nancy, the first page ` +
      `tells ${describeLanguageLook(seen)}.`,
  );
  await sendKey(session, context, 'keyDown', ' ');
  await sendKey(session, context, 'keyUp', ' ');
  await waitFor(
    look,
    (seen: LanguageLook) =>
      seen.speech?.name === ZH_TW_NANCY &&
      seen.speech.line === ZH_TW_NANCY_LINE,
    ACTION_TIMEOUT,
    (seen: LanguageLook) =>
      `Standing by Nancy, with the space bar pressed in "${ZH_TW_NAME}", ` +
      `the first page tells ${describeLanguageLook(seen)}.`,
  );

  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  const after: LanguageLook = await waitFor(
    look,
    isEnglish,
    ACTION_TIMEOUT,
    (seen: LanguageLook) =>
      `With "${EN_NAME}" chosen in its panel again, the first page tells ` +
      `${describeLanguageLook(seen)}.`,
  );
  if (after.speech === null) {
    throw new Error(
      `With "${EN_NAME}" chosen in its panel while Nancy speaks, the first ` +
        `page tells ${describeLanguageLook(after)}.`,
    );
  }
  await waitFor(
    look,
    (seen: LanguageLook) => seen.speech === null,
    SPEECH_TIMEOUT,
    (seen: LanguageLook) =>
      `A while after its player talked to Nancy again, the first page ` +
      `tells ${describeLanguageLook(seen)}.`,
  );
}

/**
 * Reads where a page has its camera, after choosing a player in the camera
 * control of its panel, if told to.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string | null} [choice] - The name of the player to choose, or
 *   `null` to choose nothing, by default.
 * @returns {Promise<CameraView>} Where the page has its camera.
 */
async function readCameraView(
  session: BidiSession,
  context: string,
  choice: string | null = null,
): Promise<CameraView> {
  return JSON.parse(
    await evaluateInPage(session, context, createCameraExpression(choice)),
  ) as CameraView;
}

/**
 * Tells whether a page has its camera on a player as it shows it.
 *
 * @param {CameraView} view - Where the page has its camera.
 * @param {number} id - The identifier of the player.
 * @returns {boolean} Whether the camera looks at where the player stands.
 */
function isCameraOn(view: CameraView, id: number): boolean {
  const figure: FigureView | undefined = view.figures.find(
    (shown: FigureView) => shown.id === id,
  );
  return (
    figure !== undefined &&
    Math.abs(figure.x - view.focus.x) < SAME_POSITION &&
    Math.abs(figure.z - view.focus.z) < SAME_POSITION
  );
}

/**
 * Describes where a page has its camera, for the error messages.
 *
 * @param {CameraView} view - Where the page has its camera.
 * @returns {string} The description.
 */
function describeCameraView(view: CameraView): string {
  const figures: string = view.figures
    .map(
      (figure: FigureView) =>
        `player ${String(figure.id)} at x ${figure.x.toFixed(2)}, ` +
        `z ${figure.z.toFixed(2)}`,
    )
    .join(', ');
  return (
    `has "${view.chosen}" chosen out of "${view.offered.join('", "')}", ` +
    `looks at x ${view.focus.x.toFixed(2)}, z ${view.focus.z.toFixed(2)}, ` +
    `and shows ${figures === '' ? 'nobody' : figures}`
  );
}

/**
 * Checks that a page has its camera follow the player of another page once
 * the player is chosen in its panel, while the player walks, and that it
 * has the camera on its own player again once the other page has left.
 * The other page is closed.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} watcher - The browsing context of the page whose camera
 *   is checked.
 * @param {number} ownId - The identifier of the player of that page.
 * @param {string} actor - The browsing context of the other page.
 * @param {number} id - The identifier of the player of the other page.
 * @returns {Promise<void>} A promise settled once the camera has passed.
 * @throws {Error} If the camera of the page does not do so.
 */
async function checkCamera(
  session: BidiSession,
  watcher: string,
  ownId: number,
  actor: string,
  id: number,
): Promise<void> {
  const name = `#${String(id)}`;
  const chosen: CameraView = await readCameraView(session, watcher, name);
  if (chosen.chosen !== name) {
    throw new Error(
      `With player ${String(id)} chosen for its camera, the first page ` +
        `${describeCameraView(chosen)}.`,
    );
  }
  const findX = (view: CameraView): number =>
    view.figures.find((figure: FigureView) => figure.id === id)?.x ?? NaN;
  const startX: number = findX(chosen);
  await sendKey(session, actor, 'keyDown', 'a');
  try {
    await waitFor(
      () => readCameraView(session, watcher),
      (view: CameraView) =>
        isCameraOn(view, id) && findX(view) <= startX - WALK_DISTANCE,
      ACTION_TIMEOUT,
      (view: CameraView) =>
        `With player ${String(id)} chosen for its camera, and walking from ` +
        `x ${startX.toFixed(2)} in the second page, the first page ` +
        `${describeCameraView(view)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'a');
  }

  await session.send('browsingContext.close', { context: actor });
  await waitFor(
    () => readCameraView(session, watcher),
    (view: CameraView) =>
      view.chosen.startsWith('Own player') &&
      !view.offered.includes(name) &&
      isCameraOn(view, ownId),
    ACTION_TIMEOUT,
    (view: CameraView) =>
      `With player ${String(id)} chosen for its camera, and the second page ` +
      `closed, the first page ${describeCameraView(view)}.`,
  );
}

/**
 * Checks that the left arrow held down in a page orbits its camera to the
 * right round its own player, which turns the way the camera looks to the
 * left, without walking the player.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the page.
 * @returns {Promise<void>} A promise settled once the camera has passed.
 * @throws {Error} If the page does not turn its camera so, or walks the
 *   player.
 */
async function checkCameraKeys(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const readHeading = async (): Promise<number> =>
    Number(
      await evaluateInPage(
        session,
        context,
        'String(window.clovervale.describeHeading())',
      ),
    );
  const findOwn = (view: CameraView): FigureView | undefined =>
    view.figures.find((figure: FigureView) => figure.id === id);
  const before: CameraView = await readCameraView(session, context);
  const start: number = await readHeading();
  // The heading turned from the start, above -180 and up to 180 degrees.
  const findTurn = (heading: number): number => {
    const turn: number = (((heading - start) % 360) + 360) % 360;
    return turn > 180 ? turn - 360 : turn;
  };
  await sendKey(session, context, 'keyDown', LEFT_ARROW);
  try {
    await waitFor(
      readHeading,
      (heading: number) => findTurn(heading) >= KEY_ORBIT,
      ACTION_TIMEOUT,
      (heading: number) =>
        `With the left arrow held down, the first page has its camera ` +
        `look at ${heading.toFixed(1)} degrees, from ${start.toFixed(1)}.`,
    );
  } finally {
    await sendKey(session, context, 'keyUp', LEFT_ARROW);
  }
  const after: CameraView = await readCameraView(session, context);
  const was: FigureView | undefined = findOwn(before);
  const is: FigureView | undefined = findOwn(after);
  if (
    was === undefined ||
    is === undefined ||
    Math.hypot(is.x - was.x, is.z - was.z) > STANDING_DRIFT
  ) {
    throw new Error(
      'With the left arrow held down, the first page ' +
        `${describeCameraView(after)}, after it ` +
        `${describeCameraView(before)}.`,
    );
  }
}

/**
 * Reads how a page shows its help sheet.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<HelpLook>} How the page shows it.
 */
async function readHelpLook(
  session: BidiSession,
  context: string,
): Promise<HelpLook> {
  return JSON.parse(
    await evaluateInPage(session, context, HELP_EXPRESSION),
  ) as HelpLook;
}

/**
 * Describes how a page shows its help sheet, for an error message.
 *
 * @param {HelpLook} look - How the page shows it.
 * @returns {string} The description.
 */
function describeHelpLook(look: HelpLook): string {
  return (
    `the help sheet ${look.isOpen ? 'open' : 'closed'}, titled ` +
    `"${look.title}" with "${look.ok}" at its foot and ` +
    `${String(look.labels.length)} controls, its button keyed ` +
    `"${String(look.buttonKey)}", and the bag ` +
    (look.isBagOpen ? 'open' : 'closed')
  );
}

/**
 * Checks that a page leaves the keys of the browser the game does not use
 * to the browser, so that they do what the browser does with them.  The
 * keys are only told to the page, and never reach the browser itself.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} what - What is open on the page, for an error message.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page keeps a key of the browser from it.
 */
async function checkBrowserKeys(
  session: BidiSession,
  context: string,
  what: string,
): Promise<void> {
  const kept: string[] = JSON.parse(
    await evaluateInPage(
      session,
      context,
      `JSON.stringify(${JSON.stringify(BROWSER_KEYS)}.filter((code) => {
        const event = new KeyboardEvent('keydown', {
          code,
          key: code,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }))`,
    ),
  ) as string[];
  if (kept.length > 0) {
    throw new Error(
      `While ${what} is open, the page keeps ${kept.join(', ')} from the ` +
        'browser.',
    );
  }
}

/**
 * Checks the help sheet: that the first page opens it by itself on the
 * first visit of the browser, in English, and the second page, on a later
 * visit, does not; that while it is open, a walking key held down does not
 * walk the player, an arrow key does not turn the camera, I does not open
 * the bag, and the keys of the browser are left to it; that it follows the language chosen in the panel; that
 * Esc, Enter, the H key, its cross and the button at its foot close it, and
 * the H key and its button open it; and that the H key opens it over the
 * open bag, which closes, while the bag, open, holds the player too, and
 * leaves the keys of the browser to it as well.  The
 * sheet is left closed.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the first page.
 * @param {string} other - The browsing context of the second page.
 * @param {number} id - The identifier of the player of the first page.
 * @returns {Promise<void>} A promise settled once the pages have passed.
 * @throws {Error} If a page does not show its help sheet so.
 */
async function checkHelp(
  session: BidiSession,
  context: string,
  other: string,
  id: number,
): Promise<void> {
  const look = (): Promise<HelpLook> => readHelpLook(session, context);
  const press = async (key: string): Promise<void> => {
    await sendKey(session, context, 'keyDown', key);
    await sendKey(session, context, 'keyUp', key);
  };
  const click = async (selector: string): Promise<void> => {
    await evaluateInPage(
      session,
      context,
      `(() => {
        document.querySelector(${JSON.stringify(selector)})?.click();
        return '';
      })()`,
    );
  };
  const expectOpen = async (
    isOpen: boolean,
    what: string,
  ): Promise<HelpLook> =>
    waitFor(
      look,
      (seen: HelpLook) => seen.isOpen === isOpen,
      ACTION_TIMEOUT,
      (seen: HelpLook) =>
        `With ${what}, the first page tells ${describeHelpLook(seen)}.`,
    );

  const first: HelpLook = await look();
  if (
    !first.isOpen ||
    first.title !== HELP_WORDS.title ||
    first.ok !== HELP_WORDS.ok ||
    first.labels.length !== HELP_CONTROL_COUNT ||
    first.buttonKey !== 'H'
  ) {
    throw new Error(
      `On the first visit, the first page tells ${describeHelpLook(first)}.`,
    );
  }
  const later: HelpLook = await readHelpLook(session, other);
  if (later.isOpen || later.buttonKey !== 'H') {
    throw new Error(
      `On a later visit, the second page tells ${describeHelpLook(later)}.`,
    );
  }

  // Held while the sheet or the bag is open.
  const checkHeld = async (what: string): Promise<void> => {
    const before: HelpLook = await look();
    for (const key of ['d', LEFT_ARROW]) {
      await sendKey(session, context, 'keyDown', key);
    }
    await sleep(DIALOGUE_HOLD_DURATION);
    for (const key of ['d', LEFT_ARROW]) {
      await sendKey(session, context, 'keyUp', key);
    }
    const after: HelpLook = await look();
    const was: FigureView | undefined = before.figures.find(
      (figure: FigureView) => figure.id === id,
    );
    const is: FigureView | undefined = after.figures.find(
      (figure: FigureView) => figure.id === id,
    );
    if (
      was === undefined ||
      is === undefined ||
      Math.hypot(is.x - was.x, is.z - was.z) > STANDING_DRIFT ||
      Math.abs(after.heading - before.heading) > YAW_TOLERANCE
    ) {
      throw new Error(
        `With D and the left arrow held down while ${what} is open, the ` +
          `first page moves its player from ${JSON.stringify(was)} to ` +
          `${JSON.stringify(is)} and turns its camera from ` +
          `${before.heading.toFixed(1)} to ${after.heading.toFixed(1)} ` +
          'degrees.',
      );
    }
  };
  await checkHeld('the help sheet');
  await checkBrowserKeys(session, context, 'the help sheet');
  await press('i');
  await sleep(VIEW_SETTLE_DURATION);
  const unbagged: HelpLook = await look();
  if (!unbagged.isOpen || unbagged.isBagOpen) {
    throw new Error(
      `With I pressed while the help sheet is open, the first page tells ` +
        `${describeHelpLook(unbagged)}.`,
    );
  }
  await saveView(session, context, 'help-en.png');

  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await waitFor(
    look,
    (seen: HelpLook) =>
      seen.isOpen &&
      seen.title === ZH_TW_HELP_WORDS.title &&
      seen.ok === ZH_TW_HELP_WORDS.ok,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With "${ZH_TW_NAME}" chosen while the help sheet is open, the ` +
        `first page tells ${describeHelpLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-zh-tw.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await waitFor(
    look,
    (seen: HelpLook) => seen.title === HELP_WORDS.title,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With "${EN_NAME}" chosen again, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );

  await press(HELP_KEYS.escape);
  await expectOpen(false, 'Esc pressed on the help sheet');
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'help-button.png');
  await press(HELP_KEYS.help);
  await expectOpen(true, 'H pressed');
  await press(HELP_KEYS.enter);
  await expectOpen(false, 'Enter pressed on the help sheet');
  await click('.help-button');
  await expectOpen(true, 'its button clicked');
  await click('.help-close');
  await expectOpen(false, 'the cross of the help sheet clicked');
  await press(HELP_KEYS.help);
  await expectOpen(true, 'H pressed again');
  await press(HELP_KEYS.help);
  await expectOpen(false, 'H pressed on the help sheet');
  await click('.help-button');
  await expectOpen(true, 'its button clicked again');
  await click('.help-ok');
  await expectOpen(false, 'the button at the foot of the help sheet clicked');

  await press('i');
  await waitFor(
    look,
    (seen: HelpLook) => seen.isBagOpen && !seen.isOpen,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With I pressed, the first page tells ${describeHelpLook(seen)}.`,
  );
  await checkHeld('the bag');
  await checkBrowserKeys(session, context, 'the bag');
  await press(HELP_KEYS.help);
  await waitFor(
    look,
    (seen: HelpLook) => seen.isOpen && !seen.isBagOpen,
    ACTION_TIMEOUT,
    (seen: HelpLook) =>
      `With H pressed while the bag is open, the first page tells ` +
      `${describeHelpLook(seen)}.`,
  );
  await press(HELP_KEYS.escape);
  await expectOpen(false, 'Esc pressed on the help sheet over the bag');
}

/**
 * Reads how a page shows the map its player is in.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player of the first page.
 * @returns {Promise<CaveLook>} How the page shows it.
 */
async function readCaveLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<CaveLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createCaveExpression(id)),
  ) as CaveLook;
}

/**
 * Describes how a page shows the map its player is in, for the error
 * messages.
 *
 * @param {CaveLook} look - How the page shows it.
 * @returns {string} The description.
 */
function describeCaveLook(look: CaveLook): string {
  const { own } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `facing ${own.yaw.toFixed(0)} degrees, doing "${own.action}", ` +
        `health ${String(own.health)}`;
  const monsters: string = look.monsters
    .map(
      (monster: CaveMonsterView) =>
        `${monster.kind} ${String(monster.id)} ${monster.mode} at x ` +
        `${monster.x.toFixed(2)}, z ${monster.z.toFixed(2)}, health ` +
        String(monster.health),
    )
    .join('; ');
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  const speech: string =
    look.speech === null
      ? 'no bubble'
      : `a bubble of ${look.speech.name} saying "${look.speech.line}"`;
  const dialogue: string =
    look.dialogue === null
      ? 'no dialogue'
      : `the dialogue ${JSON.stringify(look.dialogue)}`;
  return (
    `the ${look.map} ${player}, the players ${JSON.stringify(look.figures)}, ` +
    `the monsters [${monsters}], ` +
    `the space bar to "${look.spaceKey}", ${prompt}, ${speech}, ${dialogue}, the ` +
    `containers open ${JSON.stringify(look.containers)}, the bag ` +
    `${look.isBagOpen ? 'open' : 'closed'} with ${JSON.stringify(look.slots)} ` +
    `naming "${look.bagItemName}" and the menu ${JSON.stringify(look.menu)}, ` +
    `the notices ${JSON.stringify(look.notices)}, the heals ` +
    JSON.stringify(look.heals)
  );
}

/**
 * Saves the view of a page as a picture, if the environment names a
 * directory for the views.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} name - The file name of the picture.
 * @returns {Promise<void>} A promise settled once it is saved, if it is.
 */
async function saveView(
  session: BidiSession,
  context: string,
  name: string,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  const screenshot = (await session.send('browsingContext.captureScreenshot', {
    context,
  })) as { data: string };
  writeFileSync(
    path.join(SCREENSHOT_DIR, name),
    Buffer.from(screenshot.data, 'base64'),
  );
}

/**
 * Turns the camera of a page around what it looks at, by dragging across
 * the view with the left mouse button, and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} share - How far to turn it, as a share of a whole turn,
 *   one way or the other.
 * @returns {Promise<void>} A promise settled once it has settled.
 */
async function turnCamera(
  session: BidiSession,
  context: string,
  share: number,
): Promise<void> {
  const state: PageState = await readPageState(session, context);
  // A drag across the height of the view turns the camera a whole turn.
  const across: number = Math.round(state.height * share);
  // The drag runs across the middle of the left part of the view, clear of
  // the panel on the right, whichever way it goes.
  const x: number = Math.round(state.width / 3 - across / 2);
  const y: number = Math.round(state.height / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', x: x + across, y, duration: 300 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await sleep(CAMERA_SETTLE_DURATION);
}

/**
 * Tilts the camera of a page around what it looks at, by dragging down or
 * up the view with the left mouse button, and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} share - How far to drag, as a share of the height of the
 *   view: down, to look down more steeply, above zero, and up below it.
 * @returns {Promise<void>} A promise settled once it has settled.
 */
async function tiltCamera(
  session: BidiSession,
  context: string,
  share: number,
): Promise<void> {
  const state: PageState = await readPageState(session, context);
  const down: number = Math.round(state.height * share);
  const x: number = Math.round(state.width / 3);
  const y: number = Math.round(state.height / 2 - down / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', x, y: y + down, duration: 300 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await sleep(CAMERA_SETTLE_DURATION);
}

/**
 * Zooms the camera of a page in or out with the mouse wheel over the view,
 * and waits for it to settle.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} delta - How far to turn the wheel, in pixels: up to zoom
 *   in, below zero, and down to zoom out.
 * @returns {Promise<void>} A promise settled once it has settled.
 */
async function zoomCamera(
  session: BidiSession,
  context: string,
  delta: number,
): Promise<void> {
  const state: PageState = await readPageState(session, context);
  const x: number = Math.round(state.width / 4);
  const y: number = Math.round(state.height / 2);
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'wheel',
        id: 'wheel',
        actions: [{ type: 'scroll', x, y, deltaX: 0, deltaY: delta }],
      },
    ],
  });
  await sleep(CAMERA_SETTLE_DURATION);
}

/**
 * Saves more views of the cave for the owner to look at, if the
 * environment names a directory for the views: close by the torches at the
 * landing, and looking back east up the slope to the mouth of the burrow,
 * at noon and at midnight.  The camera ends as it started.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose player
 *   stands at the landing.
 * @returns {Promise<void>} A promise settled once the views are saved.
 */
async function saveCaveViews(
  session: BidiSession,
  context: string,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  for (let turn = 0; turn < CLOSE_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, -ZOOM_DELTA);
  }
  await saveView(session, context, 'cave-torch.png');
  for (let turn = 0; turn < CLOSE_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, ZOOM_DELTA);
  }
  await turnCamera(session, context, 0.5);
  await saveView(session, context, 'cave-mouth-day.png');
  await setControl(session, context, PREVIEW_HOUR_CONTROL, NIGHT_CLOCK);
  await setControl(session, context, PREVIEW_CONTROL, true);
  try {
    await sleep(CAMERA_SETTLE_DURATION);
    await saveView(session, context, 'cave-mouth-night.png');
  } finally {
    await setControl(session, context, PREVIEW_CONTROL, false);
  }
  await turnCamera(session, context, -0.5);
}

/**
 * Walks the player of a page in the cave with a key held down, until the
 * page tells it has got where it is to be, and waits until it idles there.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {string} key - The character of the key that walks it that way.
 * @param {(look: CaveLook) => boolean} isThere - Tells whether it has got
 *   there.
 * @param {string} where - Where it is to get, for the error messages.
 * @returns {Promise<CaveLook>} How the page shows it once it idles there.
 * @throws {Error} If it does not get there in time.
 */
async function walkInCave(
  session: BidiSession,
  context: string,
  id: number,
  key: string,
  isThere: (look: CaveLook) => boolean,
  where: string,
): Promise<CaveLook> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  const describeProblem = (seen: CaveLook): string =>
    `Walking its player ${where} with the ${key.toUpperCase()} key, the ` +
    `first page tells ${describeCaveLook(seen)}.`;
  if (!isThere(await look())) {
    await sendKey(session, context, 'keyDown', key);
    try {
      await waitFor(look, isThere, LEG_TIMEOUT, describeProblem);
    } finally {
      await sendKey(session, context, 'keyUp', key);
    }
  }
  return waitFor(
    look,
    (seen: CaveLook) => seen.own?.action === 'Idle' && isThere(seen),
    ACTION_TIMEOUT,
    describeProblem,
  );
}

/**
 * Has the player of a page loot the container in front of it with the
 * space bar, and waits until the page shows it open, with what it held in
 * the bag.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {number} number - The number of the container.
 * @returns {Promise<CaveLook>} How the page shows it once it is looted.
 * @throws {Error} If the page does not show it so in time.
 */
async function lootContainer(
  session: BidiSession,
  context: string,
  id: number,
  number: number,
): Promise<CaveLook> {
  const container: CaveContainer | undefined = CAVE_CONTAINERS[number];
  const before: CaveLook = await readCaveLook(session, context, id);
  const count = (look: CaveLook): number =>
    look.slots.filter((kind: string) => kind === container?.item).length;
  await sendKey(session, context, 'keyDown', ' ');
  await sendKey(session, context, 'keyUp', ' ');
  return waitFor(
    () => readCaveLook(session, context, id),
    (seen: CaveLook) =>
      seen.containers[number] === true &&
      count(seen) === count(before) + 1 &&
      seen.spaceKey === `nothing, as the ${container?.kind ?? ''} is empty`,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the space bar pressed before the ${container?.kind ?? ''} ` +
      `with the ${container?.item ?? 'nothing'}, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
}

/**
 * Saves views of the cells for the owner to look at, if the environment
 * names a directory for the views: looking steeply down on both cells from
 * the middle of the passage between them, and close on the bones in the
 * south cell from its bars, the camera turned to look into it.  The camera
 * ends as it started, with the player at the bars of the south cell.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the views are saved.
 */
async function saveCellViews(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= -ON_PASSAGE,
    'back to the middle of the passage',
  );
  await tiltCamera(session, context, STEEP_TILT);
  await saveView(session, context, 'cave-cells.png');
  await tiltCamera(session, context, -STEEP_TILT);
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= 1.1,
    'up to the bars of the south cell',
  );
  for (let turn = 0; turn < SKELETON_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, -ZOOM_DELTA);
  }
  await turnCamera(session, context, SKELETON_TURN);
  await saveView(session, context, 'cave-skeleton.png');
  await turnCamera(session, context, -SKELETON_TURN);
  for (let turn = 0; turn < SKELETON_ZOOM_TURNS; turn++) {
    await zoomCamera(session, context, ZOOM_DELTA);
  }
}

/**
 * Saves a view of the north store room for the owner to look at, if the
 * environment names a directory for the views: the camera turned to look
 * into it, and steeply down.  The camera ends as it started.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose player
 *   stands in the north store room.
 * @returns {Promise<void>} A promise settled once the view is saved.
 */
async function saveStoreView(
  session: BidiSession,
  context: string,
): Promise<void> {
  if (SCREENSHOT_DIR === undefined) {
    return;
  }
  await turnCamera(session, context, -SKELETON_TURN);
  await tiltCamera(session, context, STEEP_TILT);
  await saveView(session, context, 'cave-store.png');
  await tiltCamera(session, context, -STEEP_TILT);
  await turnCamera(session, context, SKELETON_TURN);
}

/**
 * Has the player of a page at the bars before the prisoner, facing him and
 * not told yet who he is, talk to him, as {@link checkCaveChambers} tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the talks are over.
 * @throws {Error} If the page does not show them so.
 */
async function talkToEdwin(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  const press = async (key: string): Promise<void> => {
    await sendKey(session, context, 'keyDown', key);
    await sendKey(session, context, 'keyUp', key);
  };
  const isShowing = (seen: CaveLook, shown: DialogueLookView): boolean =>
    JSON.stringify(seen.dialogue) === JSON.stringify(shown) &&
    seen.speech === null &&
    seen.prompt === null;
  const waitForDialogue = async (
    shown: DialogueLookView,
    after: string,
  ): Promise<CaveLook> =>
    await waitFor(
      look,
      (seen: CaveLook) => isShowing(seen, shown),
      ACTION_TIMEOUT,
      (seen: CaveLook) =>
        `With ${after}, the first page tells ${describeCaveLook(seen)}.`,
    );
  const waitForEnd = async (after: string): Promise<CaveLook> =>
    await waitFor(
      look,
      (seen: CaveLook) =>
        seen.dialogue === null &&
        seen.own?.action === 'Idle' &&
        seen.spaceKey === ENVOY_TALK_KEY &&
        seen.prompt === ENVOY_TALK_PROMPT,
      ACTION_TIMEOUT,
      (seen: CaveLook) =>
        `With ${after}, the first page tells ${describeCaveLook(seen)}.`,
    );

  await press(' ');
  const pleading: CaveLook = await waitForDialogue(
    EDWIN_PLEA,
    'the space bar pressed at the bars before the prisoner',
  );
  await sendKey(session, context, 'keyDown', 'a');
  await sleep(DIALOGUE_HOLD_DURATION);
  await sendKey(session, context, 'keyUp', 'a');
  const held: CaveLook = await look();
  if (
    held.own?.x !== pleading.own?.x ||
    held.own?.z !== pleading.own?.z ||
    JSON.stringify(held.monsters) !== JSON.stringify(pleading.monsters) ||
    !isShowing(held, EDWIN_PLEA)
  ) {
    throw new Error(
      `With a key held down in the dialogue, the first page tells ` +
        `${describeCaveLook(held)}, from ${describeCaveLook(pleading)}.`,
    );
  }
  await checkBrowserKeys(session, context, 'the dialogue box');
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await waitForDialogue(
    ZH_TW_EDWIN_PLEA,
    `"${ZH_TW_NAME}" chosen while the prisoner pleads`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'cave-edwin-talk.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await waitForDialogue(
    EDWIN_PLEA,
    `"${EN_NAME}" chosen again while the prisoner pleads`,
  );
  await press(BAG_KEYS.enter);
  await waitForDialogue(EDWIN_IDENTITY, 'the reply to the plea chosen');
  await press(BAG_KEYS.escape);
  await sleep(DIALOGUE_HOLD_DURATION);
  const escaped: CaveLook = await look();
  if (!isShowing(escaped, EDWIN_IDENTITY)) {
    throw new Error(
      `With Esc pressed as Edwin tells who he is, the first page tells ` +
        `${describeCaveLook(escaped)}.`,
    );
  }
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: CaveLook) =>
      isShowing(seen, EDWIN_ERRAND) &&
      seen.slots.includes('clovervale-message') &&
      seen.notices.includes(MESSAGE_NOTICE),
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the key to Edwin's cell offered, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
  await press(BAG_KEYS.enter);
  await waitForEnd('Enter pressed as Edwin gives his message');

  await press(' ');
  await waitFor(
    look,
    (seen: CaveLook) =>
      seen.dialogue === null &&
      seen.speech?.name === EDWIN_REMINDER.name &&
      seen.speech.line === EDWIN_REMINDER.line,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With Edwin talked to by a player carrying his message, the first ` +
      `page tells ${describeCaveLook(seen)}.`,
  );
}

/**
 * Checks that a player in its cave talks to the prisoner through the bars
 * of his cell, loots the chests and two barrels of the store rooms, sees
 * what it takes in its bag, and uses the healing potion from it.
 *
 * The player walks west along the middle of the passage to before the
 * prisoner, and north up to the bars of his cell, which stop it, where its
 * page tells the space bar talks to him.  Once the space bar is pressed,
 * the dialogue box shows his plea and the one reply, without a bubble or a
 * prompt, worded again once Traditional Chinese is chosen in the panel,
 * and once English is again.  A key that would walk the player held down
 * then moves it not at all, the dogs stand still meanwhile, and the keys
 * of the browser are left to it.  Enter has
 * him tell who he is, under his name, and Esc changes nothing then.
 * Enter has him give his message, which shows in the bag and in a notice,
 * and Enter again ends the dialogue, after which the page calls him by his
 * name.  Talked to again, he only reminds the player in a bubble to hurry,
 * without a dialogue.  It walks on to the
 * north store room, up to the chest at its back, where its page tells the
 * space bar opens it; once it is pressed, the chest shows open, the sword
 * shows in the bag, and the space bar does nothing more there.  It loots
 * the barrel with a clover in the corner, and the chest of the south store
 * room and the barrel with the healing potion in its corner, and opens its
 * bag, which shows the sword, the leather armour and a clover, worded in
 * Traditional Chinese for a moment, with the name of the sword under the
 * slots once its slot is clicked.  Once the slot of the potion is clicked,
 * the menu of the potion offers to use it and to drop it.  If the fights
 * have left the player hurt, both can be chosen, and with Enter, the potion
 * is gone from the bag, and the player gets health back, as much as a
 * potion gives or as it lacks, shown as a heal.  If they have not, using
 * it is greyed out, and Enter leaves the potion in the bag, the menu open
 * and the player at full health.  It closes the bag.  Each
 * item looted is told in a notice, in Traditional Chinese too once it is
 * chosen.  It ends on the middle of the passage, before the store rooms.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page of the
 *   player, which stands on the passage east of the prisoner, facing west,
 *   with the camera looking that way.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If the page does not show it so.
 */
async function checkCaveChambers(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, context, id);
  const edwin: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.map === 'cave',
  );
  const atEdwin: GroundVector =
    edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0);
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= atEdwin.x + 0.05,
    'along the passage to the cells',
  );
  const atBars: CaveLook = await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => (seen.own?.z ?? 0) <= -1.1,
    'up to the bars of the cell of the prisoner',
  );
  if (
    atBars.spaceKey !== EDWIN_TALK_KEY ||
    atBars.prompt !== EDWIN_TALK_PROMPT
  ) {
    throw new Error(
      `At the bars before the prisoner, the first page tells ` +
        `${describeCaveLook(atBars)}.`,
    );
  }
  await talkToEdwin(session, context, id);

  await saveCellViews(session, context, id);

  // The chest at the back of the north store room, with the sword.
  const [northChest, cornerBarrel, , southChest, potionBarrel] =
    CAVE_CONTAINERS.map((_: CaveContainer, number: number) => number);
  const north: CaveContainer | undefined = CAVE_CONTAINERS[northChest ?? 0];
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= -ON_PASSAGE,
    'back to the middle of the passage',
  );
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= (north?.x ?? 0) + 0.05,
    'along the passage to the store rooms',
  );
  const byChest: CaveLook = await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => seen.spaceKey === OPEN_CHEST_KEY,
    'up to the chest of the north store room',
  );
  if (byChest.prompt !== OPEN_CHEST_PROMPT) {
    throw new Error(
      `Before the chest of the north store room, the first page tells ` +
        `${describeCaveLook(byChest)}.`,
    );
  }
  const looted: CaveLook = await lootContainer(
    session,
    context,
    id,
    northChest ?? 0,
  );
  if (
    !looted.slots.includes('sword') ||
    looted.spaceKey !== EMPTY_CHEST_KEY ||
    !looted.notices.includes(SWORD_NOTICE)
  ) {
    throw new Error(
      `With the chest of the north store room looted, the first page ` +
        `tells ${describeCaveLook(looted)}.`,
    );
  }

  // The barrel with a clover in the corner beside the chest.
  const corner: CaveContainer | undefined =
    CAVE_CONTAINERS[cornerBarrel ?? 0];
  await walkInCave(
    session,
    context,
    id,
    'w',
    (seen: CaveLook) => (seen.own?.x ?? Infinity) <= (corner?.x ?? 0) + 0.65,
    'across the north store room',
  );
  await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => seen.spaceKey === OPEN_BARREL_KEY,
    'up to the barrel in the corner of the north store room',
  );
  await lootContainer(session, context, id, cornerBarrel ?? 0);
  await saveStoreView(session, context);

  // The chest at the back of the south store room, with the armour.
  const south: CaveContainer | undefined = CAVE_CONTAINERS[southChest ?? 0];
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => (seen.own?.z ?? -Infinity) >= -ON_PASSAGE,
    'back to the middle of the passage',
  );
  await walkInCave(
    session,
    context,
    id,
    's',
    (seen: CaveLook) => (seen.own?.x ?? -Infinity) >= (south?.x ?? 0) - 0.05,
    'along the passage before the store rooms',
  );
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => seen.spaceKey === OPEN_CHEST_KEY,
    'up to the chest of the south store room',
  );
  await lootContainer(session, context, id, southChest ?? 0);
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await waitFor(
    look,
    (seen: CaveLook) => seen.notices.includes(ZH_TW_ARMOUR_NOTICE),
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the leather armour looted and "${ZH_TW_NAME}" chosen, the ` +
      `first page tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'item-notice.png');
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);

  // The barrel with the healing potion in the corner beside the chest.
  const potion: CaveContainer | undefined =
    CAVE_CONTAINERS[potionBarrel ?? 0];
  await walkInCave(
    session,
    context,
    id,
    's',
    (seen: CaveLook) =>
      (seen.own?.x ?? -Infinity) >= (potion?.x ?? 0) - 0.65,
    'across the south store room',
  );
  await walkInCave(
    session,
    context,
    id,
    'a',
    (seen: CaveLook) => seen.spaceKey === OPEN_BARREL_KEY,
    'up to the barrel in the corner of the south store room',
  );
  const byPotion: CaveLook = await lootContainer(
    session,
    context,
    id,
    potionBarrel ?? 0,
  );
  if (!byPotion.notices.includes(POTION_NOTICE)) {
    throw new Error(
      `With the barrel of the healing potion looted, the first page ` +
        `tells ${describeCaveLook(byPotion)}.`,
    );
  }

  // The bag, with what was taken.
  await sendKey(session, context, 'keyDown', 'i');
  await sendKey(session, context, 'keyUp', 'i');
  const isShown = (seen: CaveLook): boolean =>
    seen.isBagOpen &&
    ['sword', 'leather-armour', 'clover'].every((kind: string) =>
      seen.slots.includes(kind),
    );
  await waitFor(look, isShown, ACTION_TIMEOUT, (seen: CaveLook) =>
    `With its bag opened after looting, the first page tells ` +
    `${describeCaveLook(seen)}.`,
  );
  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'cave-bag.png');
  await evaluateInPage(session, context, SWORD_SLOT_CLICK_EXPRESSION);
  await sendKey(session, context, 'keyDown', BAG_KEYS.escape);
  await sendKey(session, context, 'keyUp', BAG_KEYS.escape);
  await waitFor(
    look,
    (seen: CaveLook) => seen.isBagOpen && seen.bagItemName === ZH_TW_SWORD,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the slot of the sword clicked in its open bag, the first page ` +
      `tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'bag-name.png');

  // The healing potion, used from the bag after the fights if they left
  // the player hurt, and refused otherwise.
  const hurt: CaveLook = await look();
  const health: number = hurt.own?.health ?? FULL_HEALTH;
  const isHurt: boolean = health < FULL_HEALTH;
  const lastHeal: number = Math.max(
    0,
    ...hurt.heals.map((heal: HealView) => heal.id),
  );
  await evaluateInPage(session, context, POTION_SLOT_CLICK_EXPRESSION);
  await waitFor(
    look,
    (seen: CaveLook) =>
      seen.bagItemName === ZH_TW_POTION &&
      JSON.stringify(seen.menu) ===
        JSON.stringify(listZhTwPotionActions(isHurt)),
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With the slot of the healing potion clicked in its open bag, the ` +
      `first page tells ${describeCaveLook(seen)}.`,
  );
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, context, 'potion-menu.png');
  await sendKey(session, context, 'keyDown', BAG_KEYS.enter);
  await sendKey(session, context, 'keyUp', BAG_KEYS.enter);
  if (isHurt) {
    const healed: number = Math.min(health + POTION_HEALING, FULL_HEALTH);
    await waitFor(
      look,
      (seen: CaveLook) =>
        seen.own?.health === healed &&
        !seen.slots.includes('healing-potion') &&
        seen.heals.some(
          (heal: HealView) =>
            heal.id > lastHeal &&
            heal.target.kind === 'player' &&
            heal.target.id === id &&
            heal.amount === healed - health,
        ),
      ACTION_TIMEOUT,
      (seen: CaveLook) =>
        `With the healing potion used at health ${String(health)}, the ` +
        `first page tells ${describeCaveLook(seen)}.`,
    );
  } else {
    await sleep(VIEW_SETTLE_DURATION);
    const refused: CaveLook = await look();
    if (
      refused.own?.health !== FULL_HEALTH ||
      !refused.slots.includes('healing-potion') ||
      JSON.stringify(refused.menu) !==
        JSON.stringify(listZhTwPotionActions(false))
    ) {
      throw new Error(
        `With Enter pressed on the disabled use of the healing potion at ` +
          `full health, the first page tells ${describeCaveLook(refused)}.`,
      );
    }
  }
  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  await sendKey(session, context, 'keyDown', 'i');
  await sendKey(session, context, 'keyUp', 'i');
  await waitFor(
    look,
    (seen: CaveLook) => !seen.isBagOpen && seen.spaceKey === EMPTY_BARREL_KEY,
    ACTION_TIMEOUT,
    (seen: CaveLook) =>
      `With its bag closed again, the first page tells ` +
      `${describeCaveLook(seen)}.`,
  );
  await walkInCave(
    session,
    context,
    id,
    'd',
    (seen: CaveLook) => (seen.own?.z ?? Infinity) <= ON_PASSAGE,
    'back to the middle of the passage',
  );
}

/**
 * Has the player of a page in its cave fight a wild dog of the cave until
 * the page tells the dog is dead.  The player stands where it is, and
 * presses the space bar for a slash whenever the page tells it is not
 * slashing already and the dog stands alive within the reach of a slash,
 * after a tap of the keys that turn it towards the dog if it does not face
 * it.  A dog that comes to the player is never out of the reach of its
 * slashes for long, as the dog stops in front of it to bite.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page, whose camera
 *   looks west down the passage.
 * @param {number} id - The identifier of the player.
 * @param {number} dogId - The identifier of the dog.
 * @param {string | null} shot - The file name to save the view under once
 *   the page shows the second hit of the player on the dog, or `null` to
 *   save none.
 * @returns {Promise<CaveLook>} How the page shows them once the dog is
 *   dead.
 * @throws {Error} If the dog is not dead in time, or the player dies.
 */
async function fightCaveDog(
  session: BidiSession,
  context: string,
  id: number,
  dogId: number,
  shot: string | null,
): Promise<CaveLook> {
  const describeProblem = (seen: CaveLook): string =>
    `Fighting dog ${String(dogId)} of the cave, the first page tells ` +
    `${describeCaveLook(seen)}.`;
  const deadline: number = Date.now() + MONSTER_TIMEOUT * 2;
  let isShot: boolean = shot === null;
  for (;;) {
    const seen: CaveLook = await readCaveLook(session, context, id);
    const dog: CaveMonsterView | undefined = seen.monsters.find(
      (monster: CaveMonsterView) => monster.id === dogId,
    );
    const own: CaveLook['own'] = seen.own;
    if (dog?.mode === 'dead') {
      return seen;
    }
    if (own === null || own.action === 'Die' || Date.now() > deadline) {
      throw new Error(describeProblem(seen));
    }
    const hits: number = seen.hits.filter(
      (hit: HitView) =>
        hit.attacker.kind === 'player' &&
        hit.attacker.id === id &&
        hit.target.kind === 'monster' &&
        hit.target.id === dogId,
    ).length;
    if (!isShot && hits >= 2 && shot !== null) {
      await saveView(session, context, shot);
      isShot = true;
    }
    if (
      dog !== undefined &&
      own.action !== 'Slash' &&
      Math.hypot(dog.x - own.x, dog.z - own.z) <= SLASH_REACH - 0.1
    ) {
      const turn: number =
        (Math.round(
          (Math.atan2(dog.x - own.x, dog.z - own.z) * 4) / Math.PI,
        ) +
          8) %
        8;
      const isFacing: boolean =
        Math.abs(((own.yaw - turn * 45 + 540) % 360) - 180) <= 45;
      if (!isFacing) {
        // The camera looks west, which turns the keys a quarter round
        // from the first view of the village.
        const keys: readonly string[] = TURN_KEYS[(turn + 6) % 8] ?? [];
        for (const key of keys) {
          await sendKey(session, context, 'keyDown', key);
        }
        await sleep(TAP_DURATION);
        for (const key of keys) {
          await sendKey(session, context, 'keyUp', key);
        }
      }
      await sendKey(session, context, 'keyDown', ' ');
      await sendKey(session, context, 'keyUp', ' ');
    }
    await sleep(POLL_INTERVAL);
  }
}

/**
 * Checks that a player goes down into a cave of its own at the burrow of
 * the wild dog among the spawn stones, and climbs back up out of it by the
 * rope at the bottom of the old well shaft.  In the burrow, its page tells
 * the space bar goes down, and once the space bar is pressed, the page
 * shows the cave, lit by its torches, with the player at the landing at the
 * foot of the slope, alone but for the two wild dogs of the cave, while the
 * other page no longer shows the player.  The dog by the cells notices the
 * player at once, and the player kills it there with its slashes, as
 * {@link fightCaveDog} tells; it then walks west until the other dog
 * notices it, and kills that one too.  The prisoner, on the screen, then
 * calls out for help in a bubble.  The player talks to the prisoner
 * and loots the store rooms, as {@link checkCaveChambers} tells, and walks
 * on west down the passage to the rope, where its
 * page tells the space bar climbs up, and once it is pressed, both pages
 * show the player beside the old well in the yard of the chief's house.
 *
 * The player walks to the spawn stones as in {@link checkMonster}.  The dog
 * is left alive: while it stands where a slash would hit it, the space bar
 * slashes, and the player turns away from it, a tap of a key at a time,
 * until the space bar goes down.  In the cave, the camera looks the way
 * the player faces as it arrives, west down the passage, and the player
 * walks forward until its page tells the space bar climbs up.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show the cave so.
 */
async function checkCave(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (): Promise<CaveLook> => readCaveLook(session, actor, id);
  const readBoth = (): Promise<[CaveLook, CaveLook]> =>
    Promise.all([look(), readCaveLook(session, watcher, id)]);
  await walkUntil(
    session,
    actor,
    id,
    'a',
    (seen: MonsterLook) => (seen.own?.x ?? Infinity) <= 1.5,
    'to the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (seen: MonsterLook) => (seen.own?.x ?? -Infinity) >= -0.8,
    'to the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    's',
    (seen: MonsterLook) => (seen.own?.z ?? -Infinity) >= ROUTE_LEAST_Z,
    'along the path',
  );
  await stepWithin(
    session,
    actor,
    id,
    ROUTE_LEAST_Z,
    ROUTE_MOST_Z,
    'along the path',
  );
  await walkUntil(
    session,
    actor,
    id,
    'd',
    (seen: MonsterLook) => (seen.own?.x ?? -Infinity) >= BURROW_X,
    'into the burrow',
  );
  const deadline: number = Date.now() + LEG_TIMEOUT;
  let seen: CaveLook = await look();
  while (seen.map !== 'cave') {
    if (Date.now() > deadline) {
      throw new Error(
        `In the burrow, the first page tells ${describeCaveLook(seen)}.`,
      );
    }
    if (seen.spaceKey === ENTER_KEY && seen.own?.action === 'Idle') {
      if (seen.prompt !== ENTER_PROMPT) {
        throw new Error(
          `In the burrow, the first page tells ${describeCaveLook(seen)}.`,
        );
      }
      await sendKey(session, actor, 'keyDown', ' ');
      await sendKey(session, actor, 'keyUp', ' ');
    } else if (seen.own !== null && seen.monster !== null) {
      // Turn away from the dog, which stands where a slash would hit it.
      const dx: number = seen.own.x - seen.monster.x;
      const dz: number = seen.own.z - seen.monster.z;
      const turn: number =
        (Math.round((Math.atan2(dx, dz) * 4) / Math.PI) + 8) % 8;
      for (const key of TURN_KEYS[turn] ?? []) {
        await sendKey(session, actor, 'keyDown', key);
      }
      await sleep(TAP_DURATION);
      for (const key of TURN_KEYS[turn] ?? []) {
        await sendKey(session, actor, 'keyUp', key);
      }
    }
    await sleep(POLL_INTERVAL * 3);
    seen = await look();
  }

  const isNear = (
    own: CaveLook['own'],
    place: { readonly x: number; readonly z: number },
  ): boolean =>
    own !== null &&
    Math.hypot(own.x - place.x, own.z - place.z) <= ARRIVAL_NEARNESS;
  const [below] = await waitFor(
    readBoth,
    ([own, other]: [CaveLook, CaveLook]) =>
      own.map === 'cave' &&
      isNear(own.own, CAVE_LANDING) &&
      own.figures.length === 1 &&
      own.figures[0] === id &&
      own.monsters.length === CAVE_DOG_HOMES.length &&
      own.monsters.every(
        (monster: CaveMonsterView) =>
          monster.kind === 'cave-dog' && monster.mode !== 'dead',
      ) &&
      !other.figures.includes(id),
    ACTION_TIMEOUT,
    ([own, other]: [CaveLook, CaveLook]) =>
      `With its player gone down the burrow, the first page tells ` +
      `${describeCaveLook(own)}, and the second page ` +
      `${describeCaveLook(other)}.`,
  );
  await sleep(FADE_DURATION);
  const landing: Pixels = await captureView(session, actor);
  const brightness: number = measureBrightness(landing);
  if (brightness < CAVE_LEAST_BRIGHTNESS) {
    throw new Error(
      `With its player in the cave, the first page draws a brightness of ` +
        `${brightness.toFixed(1)}, ${describeCaveLook(below)}.`,
    );
  }
  await saveView(session, actor, 'cave-dogs.png');
  await fightCaveDog(session, actor, id, 1, 'cave-dog-fight.png');
  await saveView(session, actor, 'cave-landing.png');
  await saveCaveViews(session, actor);
  await walkInCave(
    session,
    actor,
    id,
    'w',
    (shown: CaveLook) =>
      shown.monsters.some(
        (monster: CaveMonsterView) =>
          monster.id === 2 && monster.mode === 'chase',
      ),
    'until the other dog notices it',
  );
  await fightCaveDog(session, actor, id, 2, null);
  await waitFor(
    look,
    (shown: CaveLook) =>
      shown.speech?.name === EDWIN_CALL.name &&
      shown.speech.line === EDWIN_CALL.line,
    ACTION_TIMEOUT,
    (shown: CaveLook) =>
      `With both dogs of the cave dead, the first page tells ` +
      `${describeCaveLook(shown)}.`,
  );
  await checkCaveChambers(session, actor, id);

  await sendKey(session, actor, 'keyDown', 'w');
  try {
    await waitFor(
      look,
      (shown: CaveLook) => shown.spaceKey === CLIMB_KEY,
      LEG_TIMEOUT,
      (shown: CaveLook) =>
        `With the W key held down to walk to the rope, the first page ` +
        `tells ${describeCaveLook(shown)}.`,
    );
  } finally {
    await sendKey(session, actor, 'keyUp', 'w');
  }
  await waitFor(
    look,
    (shown: CaveLook) =>
      shown.own?.action === 'Idle' &&
      shown.spaceKey === CLIMB_KEY &&
      shown.prompt === CLIMB_PROMPT &&
      shown.own.x < CAVE_ROPE.x + 1.5,
    ACTION_TIMEOUT,
    (shown: CaveLook) =>
      `By the rope, the first page tells ${describeCaveLook(shown)}.`,
  );
  await saveView(session, actor, 'cave-well.png');
  await sendKey(session, actor, 'keyDown', ' ');
  await sendKey(session, actor, 'keyUp', ' ');
  await waitFor(
    readBoth,
    ([own, other]: [CaveLook, CaveLook]) =>
      own.map === 'village' &&
      isNear(own.own, WELL_STAND) &&
      own.figures.includes(id) &&
      other.figures.includes(id) &&
      isNear(other.own, WELL_STAND),
    ACTION_TIMEOUT,
    ([own, other]: [CaveLook, CaveLook]) =>
      `With its player climbed up the rope, the first page tells ` +
      `${describeCaveLook(own)}, and the second page ` +
      `${describeCaveLook(other)}.`,
  );
  await sleep(FADE_DURATION);
  await saveView(session, actor, 'cave-out.png');
}

/**
 * Makes the expression that tells how a page shows Martha and its own
 * player, as JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createMarthaExpression(id: number): string {
  return `(() => {
    const martha = window.clovervale.listLatestMonsters()
      .find((monster) => monster.kind === 'martha') ?? null;
    const shown = martha === null
      ? undefined
      : window.clovervale.describeMonsters()
          .find((monster) => monster.id === martha.id);
    return JSON.stringify({
      map: window.clovervale.describeMap(),
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      martha,
      shown: shown ?? null,
      pitchfork: window.clovervale.describePitchfork(),
      heading: window.clovervale.describeHeading(),
      dialogue: window.clovervale.describeDialogue(),
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      notices: [...document.querySelectorAll('.item-notice')]
        .map((notice) => notice.textContent),
    });
  })()`;
}

/**
 * Reads how a page shows Martha and its own player.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<MarthaLook>} How the page shows them.
 */
async function readMarthaLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<MarthaLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createMarthaExpression(id)),
  ) as MarthaLook;
}

/**
 * Describes how a page shows Martha and its own player, for the error
 * messages.
 *
 * @param {MarthaLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeMarthaLook(look: MarthaLook): string {
  return (
    `the ${look.map} with the player ${JSON.stringify(look.own)}, Martha ` +
    `${JSON.stringify(look.martha)} drawn as ${JSON.stringify(look.shown)}, ` +
    `the pitchfork ${JSON.stringify(look.pitchfork)}, the dialogue ` +
    `${JSON.stringify(look.dialogue)}, the bag ${JSON.stringify(look.slots)} ` +
    `and the notices ${JSON.stringify(look.notices)}`
  );
}

/**
 * Checks that Martha comes over to a player that has climbed out of her
 * well, talks with it, fights it with her pitchfork, and sits down beaten.
 *
 * Both pages see her come away from her porch with her pitchfork, which
 * is no longer drawn against the wall of her house, and stand by the
 * player on her guard; the page of the player shows her asking who it is,
 * with the reply that tells of the envoy, as Edwin has told it who he is,
 * and Esc changes nothing.  Enter has her own up to being the spy, and
 * Enter again ends the dialogue, after which she fights the player, her
 * health shown.  The player slashes at her, stepping up to her and
 * turning to face her, until she
 * sits beaten on the ground, her pitchfork dropped beside her, which both
 * pages show, and it gets her token, which shows in the bag and in a
 * notice.  The camera of the page of the player is turned to look at the
 * two of them from the side, and zoomed in, while she talks and fights,
 * and turned and zoomed back after; the keys that turn the player turn it
 * the way the camera then has them.
 * The views of her on her guard, of a thrust of her pitchfork, frame by
 * frame, of the fight and of her sitting are saved if the environment
 * names a directory for them.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player,
 *   which stands beside the well, the camera behind it.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the player has passed.
 * @throws {Error} If either page does not show it so.
 */
async function checkMartha(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
): Promise<void> {
  const look = (): Promise<MarthaLook> => readMarthaLook(session, actor, id);
  const readBoth = (): Promise<[MarthaLook, MarthaLook]> =>
    Promise.all([look(), readMarthaLook(session, watcher, id)]);
  const press = async (key: string): Promise<void> => {
    await sendKey(session, actor, 'keyDown', key);
    await sendKey(session, actor, 'keyUp', key);
  };
  const porch = VILLAGERS.find(
    (villager: Villager) => villager.id === 'martha',
  );
  if (porch === undefined) {
    throw new Error('There is no Martha among the villagers.');
  }
  const home: GroundVector = locateVillager(porch, 0);
  const isArmedFor = (seen: MarthaLook): boolean =>
    seen.martha?.isArmed === true &&
    seen.shown?.isPitchforkShown === true &&
    seen.pitchfork.isOnWall === false &&
    seen.pitchfork.isOnGround === false &&
    Math.hypot(seen.martha.x - home.x, seen.martha.z - home.z) >=
      MARTHA_LEAST_WALK;
  const isAsking = (seen: MarthaLook): boolean =>
    JSON.stringify(seen.dialogue) === JSON.stringify(MARTHA_ASK);
  const isHelpOpen = async (): Promise<boolean> =>
    (await readHelpLook(session, actor)).isOpen;
  // The help sheet, opened as Martha comes over, closes as she starts to
  // talk, if she has not started already.
  await press(HELP_KEYS.help);
  await waitFor(
    readBoth,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      isAsking(own) &&
      own.martha?.mode === 'talk' &&
      own.shown?.isBarShown === false &&
      isArmedFor(own) &&
      other.martha?.mode === 'talk' &&
      isArmedFor(other),
    LEG_TIMEOUT,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      `With its player climbed out of the well, the first page tells ` +
      `${describeMarthaLook(own)}, and the second page ` +
      `${describeMarthaLook(other)}.`,
  );
  await waitFor(
    isHelpOpen,
    (isOpen: boolean) => !isOpen,
    ACTION_TIMEOUT,
    () => 'As Martha asks, the first page shows its help sheet.',
  );
  await press(HELP_KEYS.help);
  await sleep(VIEW_SETTLE_DURATION);
  if ((await isHelpOpen()) || !isAsking(await look())) {
    throw new Error(
      'With H pressed as Martha asks, the first page shows its help ' +
        `sheet, and tells ${describeMarthaLook(await look())}.`,
    );
  }
  await turnCamera(session, actor, MARTHA_CAMERA_TURN);
  await zoomCamera(session, actor, MARTHA_CAMERA_ZOOM);
  await sleep(VIEW_SETTLE_DURATION);
  await saveView(session, actor, 'martha-guard.png');
  await press(BAG_KEYS.escape);
  await sleep(DIALOGUE_HOLD_DURATION);
  const escaped: MarthaLook = await look();
  if (!isAsking(escaped)) {
    throw new Error(
      `With Esc pressed as Martha asks, the first page tells ` +
        `${describeMarthaLook(escaped)}.`,
    );
  }
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: MarthaLook) =>
      JSON.stringify(seen.dialogue) === JSON.stringify(MARTHA_CONFESSION),
    ACTION_TIMEOUT,
    (seen: MarthaLook) =>
      `With the reply to Martha chosen, the first page tells ` +
      `${describeMarthaLook(seen)}.`,
  );
  await press(BAG_KEYS.enter);
  await waitFor(
    look,
    (seen: MarthaLook) =>
      seen.dialogue === null &&
      seen.martha?.mode === 'chase' &&
      seen.shown?.isBarShown === true,
    ACTION_TIMEOUT,
    (seen: MarthaLook) =>
      `With Martha's confession ended, the first page tells ` +
      `${describeMarthaLook(seen)}.`,
  );

  const deadline: number = Date.now() + MONSTER_TIMEOUT * 2;
  let isThrustSaved = SCREENSHOT_DIR === undefined;
  let isFightSaved = SCREENSHOT_DIR === undefined;
  for (;;) {
    const seen: MarthaLook = await look();
    const { own, martha } = seen;
    if (martha?.mode === 'sit') {
      break;
    }
    if (own === null || own.action === 'Die' || Date.now() > deadline) {
      throw new Error(
        `Fighting Martha, the first page tells ${describeMarthaLook(seen)}.`,
      );
    }
    if (!isThrustSaved && seen.shown?.clip === 'Attack') {
      const start: number = Date.now();
      for (let frame = 1; frame <= THRUST_VIEW_COUNT; frame++) {
        const at = String(Date.now() - start).padStart(3, '0');
        await saveView(
          session,
          actor,
          `martha-thrust-${String(frame).padStart(2, '0')}-${at}ms.png`,
        );
        await sleep(THRUST_VIEW_INTERVAL);
      }
      isThrustSaved = true;
      continue;
    }
    if (!isFightSaved && (martha?.health ?? Infinity) < 100) {
      await saveView(session, actor, 'martha-fight.png');
      isFightSaved = true;
    }
    if (martha !== null && own.action !== 'Slash') {
      const apart: number = Math.hypot(martha.x - own.x, martha.z - own.z);
      const turn: number =
        (Math.round(
          (Math.atan2(martha.x - own.x, martha.z - own.z) * 4) / Math.PI,
        ) +
          8) %
        8;
      const isFacing: boolean =
        Math.abs(((own.yaw - turn * 45 + 540) % 360) - 180) <= 45;
      const isNear: boolean = apart <= SLASH_REACH - 0.1;
      // The player steps towards her while she is out of its reach, and
      // turns to face her where it is not facing her.
      if (!isNear || !isFacing) {
        // The keys walk the way they do as the camera looks, which a key
        // walking down the view from the first view of the village, north,
        // as the player faced as it climbed out.
        const shift: number = Math.round((seen.heading - 180) / 45);
        const keys: readonly string[] =
          TURN_KEYS[(((turn - shift) % 8) + 8) % 8] ?? [];
        for (const key of keys) {
          await sendKey(session, actor, 'keyDown', key);
        }
        await sleep(TAP_DURATION);
        for (const key of keys) {
          await sendKey(session, actor, 'keyUp', key);
        }
      }
      if (isNear) {
        await press(' ');
      }
    }
    await sleep(POLL_INTERVAL);
  }
  await waitFor(
    readBoth,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      own.shown?.clip === 'Sit' &&
      !own.shown.isBarShown &&
      !own.shown.isPitchforkShown &&
      own.pitchfork.isOnGround === true &&
      own.pitchfork.isOnWall === false &&
      other.pitchfork.isOnGround === true &&
      own.slots.includes('spy-token') &&
      own.notices.includes(TOKEN_NOTICE) &&
      other.martha?.mode === 'sit' &&
      other.shown?.clip === 'Sit',
    ACTION_TIMEOUT,
    ([own, other]: [MarthaLook, MarthaLook]) =>
      `With Martha beaten, the first page tells ${describeMarthaLook(own)}, ` +
      `and the second page ${describeMarthaLook(other)}.`,
  );
  await sleep(SIT_SETTLE_DURATION);
  await saveView(session, actor, 'martha-sitting.png');
  await zoomCamera(session, actor, -MARTHA_CAMERA_ZOOM);
  await turnCamera(session, actor, -MARTHA_CAMERA_TURN);
}

/**
 * Reads the time of day a page tells.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TimeOfDayView>} The time of day.
 */
async function readTimeOfDay(
  session: BidiSession,
  context: string,
): Promise<TimeOfDayView> {
  return JSON.parse(
    await evaluateInPage(session, context, TIME_OF_DAY_EXPRESSION),
  ) as TimeOfDayView;
}

/**
 * Measures how brightly the foot of the view of a page is lit once it shows
 * a time of day.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} shown - The time of day, from 0 up to 1.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<number>} The mean brightness, from 0 to 255.
 * @throws {Error} If the page does not show the time of day in time.
 */
async function measureShownTime(
  session: BidiSession,
  context: string,
  shown: number,
  name: string,
): Promise<number> {
  await waitFor(
    () => readTimeOfDay(session, context),
    (seen: TimeOfDayView) => seen.shown === shown,
    ACTION_TIMEOUT,
    (seen: TimeOfDayView) =>
      `${name} shows the time of day ${String(seen.shown)} instead of ` +
      `${String(shown)}.`,
  );
  // The time of day is shown from the next frame drawn.
  await sleep(2 * POLL_INTERVAL);
  const state: PageState = await readPageState(session, context);
  return measureBrightness(await captureGround(session, context, state));
}

/**
 * Checks that two pages on a server whose clock is held at noon both tell
 * the time of day the server holds; that when its panel previews
 * midnight, one page shows the village clearly darker, yet far from black,
 * while still telling the time of day the server holds; and that the
 * other page goes on showing noon meanwhile.  The preview is then switched
 * off again.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} viewer - The browsing context of the page that previews.
 * @param {string} other - The browsing context of the other page.
 * @returns {Promise<void>} A promise settled once the pages have passed.
 * @throws {Error} If either page does not show the time of day as it
 *   should.
 */
async function checkNight(
  session: BidiSession,
  viewer: string,
  other: string,
): Promise<void> {
  for (const [context, name] of [
    [viewer, 'The first page'],
    [other, 'The second page'],
  ] as const) {
    const told: string = (await readPageState(session, context)).panel[
      'Time of day'
    ] ?? '';
    const time: TimeOfDayView = await readTimeOfDay(session, context);
    if (told !== HELD_TIME_OF_DAY || time.world !== HELD_DAY_SHARE) {
      throw new Error(
        `On a server held at ${HELD_TIME}, ${name.toLowerCase()} tells ` +
          `the time of day as "${told}" in its panel, and as ` +
          `${String(time.world)} of a day.`,
      );
    }
  }
  const noon: number = await measureShownTime(
    session,
    viewer,
    HELD_DAY_SHARE,
    'The first page',
  );
  const otherNoon: number = await measureShownTime(
    session,
    other,
    HELD_DAY_SHARE,
    'The second page',
  );
  await setControl(session, viewer, PREVIEW_HOUR_CONTROL, NIGHT_CLOCK);
  await setControl(session, viewer, PREVIEW_CONTROL, true);
  try {
    const night: number = await measureShownTime(
      session,
      viewer,
      NIGHT_HOUR / 24,
      'Previewing midnight, the first page',
    );
    if (
      night > noon * NIGHT_MOST_SHARE ||
      night < noon * NIGHT_LEAST_SHARE ||
      night < NIGHT_LEAST_BRIGHTNESS
    ) {
      throw new Error(
        'Previewing midnight, the first page lights the foot of its view ' +
          `at a brightness of ${night.toFixed(1)}, against ` +
          `${noon.toFixed(1)} at noon.`,
      );
    }
    const previewTold: string = (await readPageState(session, viewer)).panel[
      'Time of day'
    ] ?? '';
    const previewTime: TimeOfDayView = await readTimeOfDay(session, viewer);
    if (
      previewTold !== HELD_TIME_OF_DAY ||
      previewTime.world !== HELD_DAY_SHARE
    ) {
      throw new Error(
        'Previewing midnight, the first page tells the time of day as ' +
          `"${previewTold}" in its panel, and as ` +
          `${String(previewTime.world)} of a day.`,
      );
    }
    const otherNight: number = await measureShownTime(
      session,
      other,
      HELD_DAY_SHARE,
      'With the first page previewing midnight, the second page',
    );
    const otherTime: TimeOfDayView = await readTimeOfDay(session, other);
    if (
      Math.abs(otherNight - otherNoon) > otherNoon * UNCHANGED_SHARE ||
      otherTime.world !== HELD_DAY_SHARE
    ) {
      throw new Error(
        'With the first page previewing midnight, the second page lights ' +
          `the foot of its view at a brightness of ` +
          `${otherNight.toFixed(1)}, against ${otherNoon.toFixed(1)} ` +
          `before, and tells the time of day as ` +
          `${String(otherTime.world)} of a day.`,
      );
    }
  } finally {
    await setControl(session, viewer, PREVIEW_CONTROL, false);
  }
  await measureShownTime(
    session,
    viewer,
    HELD_DAY_SHARE,
    'With the preview switched off, the first page',
  );
}

/**
 * Checks that two pages on a server whose day goes on, one joining after
 * the other, tell the same time of day for one and the same moment, and
 * that it goes on at the pace of the day of the server in both, against
 * the time that passes on the clock of the browser.  The pages are left on
 * that server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} first - The browsing context of the page that joins
 *   first.
 * @param {string} second - The browsing context of the page that joins
 *   later.
 * @param {string} url - The address of the client, on that server.
 * @returns {Promise<void>} A promise settled once the pages have passed.
 * @throws {Error} If the pages do not tell the time of day as they should.
 */
async function checkDayAgreement(
  session: BidiSession,
  first: string,
  second: string,
  url: string,
): Promise<void> {
  await loadClient(session, first, url, 'The first page on a running day');
  await loadClient(session, second, url, 'The second page on a running day');
  // A page knows the time of day of the world only from its first snapshot,
  // which may come some time after it is welcomed.
  for (const [context, name] of [
    [first, 'first'],
    [second, 'second'],
  ] as const) {
    await waitFor(
      () => readTimeOfDay(session, context),
      (seen: TimeOfDayView) => seen.world !== null,
      ACTION_TIMEOUT,
      () =>
        `On a running day, the ${name} page does not tell the time of day ` +
        'of the world.',
    );
  }
  const readBoth = async (): Promise<[TimeOfDayView, TimeOfDayView]> => [
    await readTimeOfDay(session, first),
    await readTimeOfDay(session, second),
  ];
  const measureGap = (a: number, b: number): number => {
    const gap: number = Math.abs(a - b) % 1;
    return Math.min(gap, 1 - gap);
  };
  const before: [TimeOfDayView, TimeOfDayView] = await readBoth();
  await sleep(DAY_WATCH_DURATION);
  const after: [TimeOfDayView, TimeOfDayView] = await readBoth();
  for (const [early, late] of [before, after]) {
    // The time of day of the first page, carried forward at the pace of the
    // server to the moment the second page was read.
    const between: number = late.moment - early.moment;
    const carried: number =
      (early.world ?? NaN) + between / RUNNING_DAY_DURATION;
    if (!(measureGap(carried, late.world ?? NaN) <= SAME_TIME_OF_DAY)) {
      throw new Error(
        `On a running day, the first page tells the time of day as ` +
          `${String(early.world)} of a day, and the second page, which ` +
          `joined later, as ${String(late.world)}, ` +
          `${between.toFixed(1)} ms after.`,
      );
    }
  }
  for (const index of [0, 1] as const) {
    const change: number =
      (after[index].world ?? NaN) - (before[index].world ?? NaN);
    const passed: number = ((change % 1) + 1) % 1;
    const elapsed: number = after[index].moment - before[index].moment;
    const expected: number = elapsed / RUNNING_DAY_DURATION;
    if (!(Math.abs(passed - expected) <= expected * DAY_PACE_TOLERANCE)) {
      throw new Error(
        `On a running day, the time of day of the ` +
          `${index === 0 ? 'first' : 'second'} page goes on by ` +
          `${passed.toExponential(3)} of a day in ` +
          `${elapsed.toFixed(1)} ms, instead of ` +
          `${expected.toExponential(3)}.`,
      );
    }
  }
}

/**
 * Reads how a page shows Toby.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TobyLook>} How the page shows him.
 */
async function readTobyLook(
  session: BidiSession,
  context: string,
): Promise<TobyLook> {
  return JSON.parse(
    await evaluateInPage(session, context, TOBY_EXPRESSION),
  ) as TobyLook;
}

/**
 * Describes how a page shows Toby, for the error messages.
 *
 * @param {TobyLook} look - How the page shows him.
 * @returns {string} The description.
 */
function describeTobyLook(look: TobyLook): string {
  const { toby } = look;
  if (toby === null) {
    return 'does not show Toby';
  }
  return (
    `shows Toby at step ${toby.step.toFixed(2)}, at x ` +
    `${toby.x.toFixed(3)}, z ${toby.z.toFixed(3)}, facing ` +
    `${toby.yaw.toFixed(1)}, doing "${toby.activity}" with the clip ` +
    `"${String(toby.clip)}"`
  );
}

/**
 * Checks that two pages show Toby alike, where the shared course has him
 * at the step each shows him at, to the last bit, doing what the course
 * has him do with the clip of that name, at steps that agree for the same
 * moment, and that he moves on at the pace of the server.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} first - The browsing context of one page.
 * @param {string} second - The browsing context of the other page.
 * @returns {Promise<void>} A promise settled once both pages have passed.
 * @throws {Error} If the pages do not show him so.
 */
async function checkToby(
  session: BidiSession,
  first: string,
  second: string,
): Promise<void> {
  const pages: readonly (readonly [string, string])[] = [
    [first, 'first'],
    [second, 'second'],
  ];
  const isShownRightly = (look: TobyLook): boolean => {
    const { toby } = look;
    if (toby === null) {
      return false;
    }
    const pose: TobyPose = findTobyPose(toby.step);
    return (
      toby.x === pose.x &&
      toby.z === pose.z &&
      toby.yaw === pose.yaw &&
      toby.activity === pose.activity &&
      (toby.clip === pose.activity ||
        (toby.clip === 'Find' && pose.activity === 'Pick'))
    );
  };
  for (const [context, name] of pages) {
    await waitFor(
      () => readTobyLook(session, context),
      isShownRightly,
      ACTION_TIMEOUT,
      (look: TobyLook) =>
        `The ${name} page ${describeTobyLook(look)}, where his course has ` +
        `him at x ${String(findTobyPose(look.toby?.step ?? 0).x)}, z ` +
        `${String(findTobyPose(look.toby?.step ?? 0).z)}, doing ` +
        `"${findTobyPose(look.toby?.step ?? 0).activity}".`,
    );
  }
  const readBoth = async (): Promise<[TobyLook, TobyLook]> => [
    await readTobyLook(session, first),
    await readTobyLook(session, second),
  ];
  const [early, late] = await readBoth();
  const carried: number =
    (early.toby?.step ?? NaN) +
    (late.moment - early.moment) / STEP_MILLISECONDS;
  if (!(Math.abs(carried - (late.toby?.step ?? NaN)) <= SAME_TOBY_STEPS)) {
    throw new Error(
      `The first page ${describeTobyLook(early)}, and the second page, ` +
        `${(late.moment - early.moment).toFixed(1)} ms after, ` +
        `${describeTobyLook(late)}.`,
    );
  }
  for (const [context, name] of pages) {
    const before: TobyLook = await readTobyLook(session, context);
    const moved: TobyLook = await waitFor(
      () => readTobyLook(session, context),
      (look: TobyLook) =>
        isShownRightly(look) &&
        (look.toby?.x !== before.toby?.x || look.toby?.z !== before.toby?.z),
      TOBY_MOVE_TIMEOUT,
      (look: TobyLook) =>
        `Toby does not move in the ${name} page, which first ` +
        `${describeTobyLook(before)}, and then ${describeTobyLook(look)}.`,
    );
    const later: TobyLook = await waitFor(
      () => readTobyLook(session, context),
      (look: TobyLook) =>
        isShownRightly(look) && look.moment - before.moment >= TOBY_PACE_SPAN,
      TOBY_PACE_SPAN + TOBY_MOVE_TIMEOUT,
      (look: TobyLook) =>
        `In the ${name} page, Toby is not shown rightly ` +
        `${(look.moment - moved.moment).toFixed(1)} ms after he moves: ` +
        `the page ${describeTobyLook(look)}.`,
    );
    const elapsed: number = later.moment - before.moment;
    const stepped: number =
      (later.toby?.step ?? NaN) - (before.toby?.step ?? NaN);
    const expected: number = elapsed / STEP_MILLISECONDS;
    if (!(Math.abs(stepped - expected) <= expected * TOBY_PACE_TOLERANCE)) {
      throw new Error(
        `In the ${name} page, Toby goes on by ${stepped.toFixed(1)} steps ` +
          `in ${elapsed.toFixed(1)} ms, instead of ${expected.toFixed(1)}.`,
      );
    }
  }
  const seen = new Set<TobyActivity>();
  const deadline: number = Date.now() + TOBY_MOVE_TIMEOUT;
  while (seen.size < TOBY_ACTIVITIES.length && Date.now() < deadline) {
    const { toby } = await readTobyLook(session, first);
    if (toby !== null) {
      seen.add(toby.activity);
    }
    await sleep(POLL_INTERVAL);
  }
  if (seen.size < TOBY_ACTIVITIES.length) {
    throw new Error(
      `Over ${String(TOBY_MOVE_TIMEOUT / 1000)} seconds, the first page ` +
        `shows Toby only ${[...seen].join(', ')}.`,
    );
  }
}

/**
 * Reads how a page shows Toby as he picks, and what is around him.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<TobyFindLook>} How the page shows him.
 */
async function readTobyFindLook(
  session: BidiSession,
  context: string,
): Promise<TobyFindLook> {
  return JSON.parse(
    await evaluateInPage(session, context, TOBY_FIND_EXPRESSION),
  ) as TobyFindLook;
}

/**
 * Describes how a page shows Toby as he picks, for the error messages.
 *
 * @param {TobyFindLook} look - How the page shows him.
 * @returns {string} The description.
 */
function describeTobyFindLook(look: TobyFindLook): string {
  const holding: string =
    look.toby?.isHolding === true ? 'holding a clover' : 'empty-handed';
  const speech: string =
    look.speech === null
      ? 'no bubble'
      : `${look.speech.name} saying "${look.speech.line}"`;
  return (
    `${describeTobyLook({ toby: look.toby, moment: 0 })}, ${holding}, ` +
    `with ${speech}, and the patches ${look.clovers.join()} with their ` +
    'clovers'
  );
}

/**
 * Checks that a page behind a slow connection, and another page, show
 * Toby finding a four-leaved clover alike: holding it in his hand as he
 * picks, from his grab until he puts it away, and never otherwise, with
 * his bubble saying he found one, while the patch is shown without its
 * clover, and that the page goes on showing so as the server tells it of
 * the find, without taking it back.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} first - The browsing context of the page behind the
 *   slow connection.
 * @param {string} second - The browsing context of the other page.
 * @returns {Promise<void>} A promise settled once both pages have passed.
 * @throws {Error} If the pages do not show him so.
 */
async function checkTobyFind(
  session: BidiSession,
  first: string,
  second: string,
): Promise<void> {
  const hold: number = TOBY_STOW_STEPS - TOBY_GRAB_STEPS;
  const mode =
    `With its messages held back for ${String(NETWORK_DELAY)} ` +
    'milliseconds each way, the first page';
  const isHoldingRightly = (look: TobyFindLook): boolean => {
    const { toby } = look;
    if (toby === null) {
      return true;
    }
    const since: number = toby.step - findTobyGrab(toby.step).step;
    return !toby.isHolding || (toby.activity === 'Pick' && since < hold);
  };
  await setControl(session, first, 'Net delay (ms)', NETWORK_DELAY);
  try {
    const found: TobyFindLook = await waitFor(
      () => readTobyFindLook(session, first),
      (look: TobyFindLook) => {
        if (!isHoldingRightly(look)) {
          throw new Error(`${mode} ${describeTobyFindLook(look)}.`);
        }
        return look.toby?.isHolding === true;
      },
      TOBY_FIND_TIMEOUT,
      (look: TobyFindLook) =>
        `${mode} never shows Toby holding a clover: it ` +
        `${describeTobyFindLook(look)}.`,
    );
    const grab: TobyGrab = findTobyGrab(found.toby?.step ?? NaN);
    const isFinding = (look: TobyFindLook): boolean =>
      look.toby !== null &&
      findTobyGrab(look.toby.step).step === grab.step &&
      look.toby.isHolding &&
      look.toby.clip === 'Find' &&
      look.speech?.line === TOBY_FOUND_LINE &&
      !look.clovers.includes(grab.patch);
    for (const [context, name] of [
      [first, 'first'],
      [second, 'second'],
    ] as const) {
      await waitFor(
        () => readTobyFindLook(session, context),
        isFinding,
        ACTION_TIMEOUT,
        (look: TobyFindLook) =>
          `Toby grabs at patch ${String(grab.patch)} at step ` +
          `${String(grab.step)}, and the ${name} page ` +
          `${describeTobyFindLook(look)}.`,
      );
    }
    // By the time he puts it away, the first page has heard of the find.
    await waitFor(
      () => readTobyFindLook(session, first),
      (look: TobyFindLook) => {
        if (!isHoldingRightly(look)) {
          throw new Error(`${mode} ${describeTobyFindLook(look)}.`);
        }
        const step: number = look.toby?.step ?? NaN;
        if (step < grab.step + hold && !isFinding(look)) {
          throw new Error(
            `${mode} takes back the clover Toby grabs at step ` +
              `${String(grab.step)}: it ${describeTobyFindLook(look)}.`,
          );
        }
        return step >= grab.step + hold;
      },
      ACTION_TIMEOUT,
      (look: TobyFindLook) =>
        `${mode} never shows Toby putting the clover away: it ` +
        `${describeTobyFindLook(look)}.`,
    );
  } finally {
    await setControl(session, first, 'Net delay (ms)', 0);
  }
}

/**
 * Checks the built client in two pages connected to one server: that each
 * draws its scene, shows the models it has and connects, that what the
 * player of one page does with the keyboard shows in the other page,
 * smoothly or snapshot by snapshot as the panel of that page is set, that
 * a page shows its own player ahead of a slow connection, or behind it, as
 * its panel is set, that an obstacle stops a player, in both pages
 * alike and without a correction behind a slow connection, that a slash
 * of a player near the monster lowers its health in both pages, each of
 * which shows the hit once, that a hurt player that drinks from the
 * fountain gets health back in both pages, each of which shows the heal
 * once, without a correction behind a slow connection, that both pages
 * show Toby going round his course alike, and finding a four-leaved clover
 * alike, behind a slow connection or not, that a player that talks to
 * Nancy sees what she says above her head in its own page alone, for a
 * while, without a slash or a correction, that a page words its text in
 * the language chosen in its panel at once, that a player that picks a
 * four-leaved clover sees it in its slots, and that once it puts the clover
 * down, the player of the other page sees it on the ground, picks it up and
 * sees it in its own slots, and that the camera of a page
 * follows the player of the other page when its panel is set to, until
 * that player leaves.  The server holds its clock at noon, which both
 * pages tell, and a page that previews midnight in its panel shows the
 * village clearly darker, yet far from black, while the other goes on
 * showing noon.  On another server, whose day runs, two pages, one
 * joining later than the other, tell the same time of day as it goes on.
 *
 * @returns {Promise<void>} A promise settled once the client has passed.
 * @throws {Error} If the client fails the check, or the check cannot run.
 */
async function checkClient(): Promise<void> {
  for (const built of [clientDir, serverFile]) {
    if (!existsSync(built)) {
      const missing: string = path.relative(rootDir, built);
      throw new Error(`${missing} is missing.  Run "npm run build" first.`);
    }
  }
  const serverPort: number = await startGameServer(['--hold-time', HELD_TIME]);
  const clientPort: number = await startClientServer();
  const session: BidiSession = await BidiSession.connect(await startFirefox());

  const tree = (await session.send('browsingContext.getTree', {})) as {
    contexts: { context: string }[];
  };
  const first: string | undefined = tree.contexts[0]?.context;
  if (first === undefined) {
    throw new Error('Firefox has no page to load the client in.');
  }
  const url =
    `http://127.0.0.1:${String(clientPort)}/` +
    `?server=ws://127.0.0.1:${String(serverPort)}`;
  try {
    await loadClient(session, first, url, 'The first page');
    // A window of its own keeps the second page drawing like the first.
    const created = (await session.send('browsingContext.create', {
      type: 'window',
    })) as { context: string };
    const second: string = created.context;
    await loadClient(session, second, url, 'The second page');
    // The checks walk the players with the keys along the ways of the world
    // they move them in under a camera that keeps its heading.
    for (const page of [first, second]) {
      await setControl(session, page, 'Trailing camera', false);
    }

    const isPair = (state: PageState): boolean =>
      state.figures.length === 2 && state.panel.Players === '2';
    const describePair = (name: string) => (state: PageState) =>
      `With two pages connected, ${name} shows ` +
      `${String(state.figures.length)} players, and its panel counts ` +
      `"${state.panel.Players ?? ''}".`;
    const own: PageState = await waitFor(
      () => readPageState(session, first),
      isPair,
      ACTION_TIMEOUT,
      describePair('the first page'),
    );
    await waitFor(
      () => readPageState(session, second),
      isPair,
      ACTION_TIMEOUT,
      describePair('the second page'),
    );
    const id = Number(/^#(\d+)/.exec(own.panel.Player ?? '')?.[1]);
    if (findFigure(own, id) === undefined) {
      throw new Error(
        'The panel of the first page tells its player is ' +
          `"${own.panel.Player ?? ''}", which the page does not show.`,
      );
    }

    await checkHelp(session, first, second, id);
    await checkToby(session, first, second);
    await checkTobyFind(session, first, second);
    await checkNight(session, first, second);
    await checkWalk(session, first, second, id);
    await checkMotion(session, first, second, id, false, 'd');
    await checkMotion(session, first, second, id, true, 'a');
    await checkSlash(session, first, second, id);
    await checkCompensation(session, first);
    await checkPrediction(session, first, second, id, false, 'd');
    await checkPrediction(session, first, second, id, true, 'a');
    await checkObstacle(session, first, second, id);
    await checkMonster(session, first, second, id);
    await checkFountain(session, first, second, id);
    await checkTalk(session, first, second, id);
    await checkLanguage(session, first);
    const other: PageState = await readPageState(session, second);
    const otherId = Number(/^#(\d+)/.exec(other.panel.Player ?? '')?.[1]);
    await checkInventory(session, first, second, id, otherId);
    await checkCave(session, first, second, id);
    await checkMartha(session, first, second, id);
    await checkCamera(session, first, id, second, otherId);
    await checkCameraKeys(session, first, id);

    const dayPort: number = await startGameServer([
      '--day-length',
      String(RUNNING_DAY_MINUTES),
    ]);
    const later = (await session.send('browsingContext.create', {
      type: 'window',
    })) as { context: string };
    const dayUrl =
      `http://127.0.0.1:${String(clientPort)}/` +
      `?server=ws://127.0.0.1:${String(dayPort)}`;
    await checkDayAgreement(session, first, later.context, dayUrl);
  } catch (error: unknown) {
    const reason: string =
      error instanceof Error ? error.message : String(error);
    const logged: string[] = session.pageErrors.map(
      (text: string) => `A page logged an error: ${text}`,
    );
    throw new Error([reason, ...logged].join('\n'), { cause: error });
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, () => {
    void cleanUp().finally(() => {
      process.exit(1);
    });
  });
}

try {
  await checkClient();
  console.log(
    'Browser check passed: two clients draw their scenes, connect, show ' +
      'each other what their players do, predict their own, have their ' +
      'slashes judged on what they showed, stop them at obstacles, hurt ' +
      'the monster, show each hit once, heal at the fountain, show Toby ' +
      'alike, finding a clover, hear what Nancy says, speak the language ' +
      'chosen, show the controls, pick, ' +
      'carry and put down a clover, go down into a cave of their own, kill ' +
      'its two wild dogs, talk ' +
      'to the prisoner through his bars, loot the store rooms, use a ' +
      'healing potion, and climb back up, have Martha come over, talk ' +
      'with her and beat her, have the ' +
      'camera follow another player, turn the camera with the arrow keys, ' +
      'darken at night, preview a time of ' +
      'day on their own, and agree on the time of day.',
  );
} catch (error: unknown) {
  const reason: string = error instanceof Error ? error.message : String(error);
  console.error(`Browser check failed: ${reason}`);
  process.exitCode = 1;
} finally {
  await cleanUp();
}
