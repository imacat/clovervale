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
 * @module scripts/test-browser/talk Checks what Nancy says, and her speech
 *   bubble.
 */

import { setTimeout as sleep } from 'node:timers/promises';

import type { PlayerState } from '@clovervale/shared';
import type { SpeechScreen } from '../../packages/client/src/bubble-sprite.ts';
import type { SpeechView } from '../../packages/client/src/speech-bubble.ts';

import type { BidiSession } from './bidi.ts';
import { zoomCamera } from './camera.ts';
import {
  ACTION_TIMEOUT,
  LANDSCAPE_VIEWPORT,
  LEG_TIMEOUT,
  NANCY_WELCOME,
  NETWORK_DELAY,
  PHONE_PIXEL_RATIO,
  POLL_INTERVAL,
  PORTRAIT_VIEWPORT,
  SPEECH_LEAST_HEIGHT,
  SPEECH_TIMEOUT,
  TALK_KEY,
  TALK_PROMPT,
  TAP_DURATION,
  VIEW_SETTLE_DURATION,
  ZOOM_DELTA,
  ZOOM_STEP_FACTOR,
} from './constants.ts';
import { stepWithin } from './monster.ts';
import {
  PANEL_ACTION_EXPRESSION,
  evaluateInPage,
  readPageState,
  saveView,
  sendKey,
  setControl,
  tapKey,
  waitFor,
  watchAction,
} from './page.ts';

/** How a page shows a player by a villager, and what the villager says. */
interface TalkLook {
  /** The player in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
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

/** Where Nancy the villager stands along the X axis, in meters. */
const NANCY_X = 3.2;
/** Where Nancy the villager stands along the Z axis, in meters. */
const NANCY_Z = -6.4;
/**
 * The least position along the Z axis of the stretch a player is stepped
 * to, before it walks along the X axis toward Nancy from the side of the
 * fountain, in meters.  Along the whole stretch, the way to her is clear,
 * and she stands straight ahead of the player.
 */
const TALK_LEAST_Z = -6.55;
/** The greatest position along the Z axis of that stretch, in meters. */
const TALK_MOST_Z = -6.25;
/**
 * The farthest the foot of the bubble of what Nancy says may be from where
 * she stands along the ground, in meters.
 */
const SPEECH_NEARNESS = 0.05;

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

/** The least size of the words of a bubble on a phone, in CSS pixels. */
const LEAST_PHONE_TEXT_SIZE = 15;

/**
 * Checks that a page shows the words of the bubble it shows as large on a
 * phone, held upright or on its side, as at least
 * {@link LEAST_PHONE_TEXT_SIZE} pixels, and that it shows them at the same
 * size as before once back at its own size.  The bubble is saved at each
 * size, if the environment names a directory to.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
async function checkSpeechSize(
  session: BidiSession,
  context: string,
): Promise<void> {
  const readSpeech = async (): Promise<SpeechView | null> =>
    JSON.parse(
      await evaluateInPage(
        session,
        context,
        'JSON.stringify(window.clovervale.describeSpeech())',
      ),
    ) as SpeechView | null;
  const before: SpeechView | null = await readSpeech();
  await saveView(session, context, 'speech-desktop.png');
  const sizes: [string, number | null][] = [];
  try {
    for (const [name, viewport] of [
      ['landscape', LANDSCAPE_VIEWPORT],
      ['portrait', PORTRAIT_VIEWPORT],
    ] as const) {
      await session.send('browsingContext.setViewport', {
        context,
        viewport,
        devicePixelRatio: PHONE_PIXEL_RATIO,
      });
      await sleep(VIEW_SETTLE_DURATION);
      await saveView(session, context, `speech-${name}.png`);
      sizes.push([name, (await readSpeech())?.textSize ?? null]);
    }
  } finally {
    await session.send('browsingContext.setViewport', {
      context,
      viewport: null,
      devicePixelRatio: null,
    });
    await sleep(VIEW_SETTLE_DURATION);
  }
  const after: SpeechView | null = await readSpeech();
  const problems: string[] = sizes
    .filter(
      ([, size]: [string, number | null]) =>
        size === null || size < LEAST_PHONE_TEXT_SIZE,
    )
    .map(
      ([name, size]: [string, number | null]) =>
        `${size === null ? 'no' : size.toFixed(1)} pixels tall on a phone ` +
        `held ${name}`,
    );
  if (before?.textSize == null || after?.textSize !== before.textSize) {
    problems.push(
      `${String(before?.textSize)} pixels tall at its own size, and ` +
        `${String(after?.textSize)} once back at it`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      'With Nancy talked to, the page shows the words of her bubble ' +
        `${problems.join(', and ')}.`,
    );
  }
}

/**
 * Checks that a player that talks to Nancy behind a slow connection shows
 * what she says, her welcome the first time its page talks to her, in a
 * bubble above her head in its own page, for a while
 * and then no more, and nowhere in the page of another player, which shows
 * it talking, its words legible on a phone, as {@link checkSpeechSize}
 * checks.  Its own page prompts it to talk by her.  The player does not
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
export async function checkTalk(
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
  await tapKey(session, actor, ' ');
  const isSaid = ([own, other]: [TalkLook, TalkLook]): boolean =>
    own.speech !== null &&
    own.speech.name === 'Nancy' &&
    own.speech.line === NANCY_WELCOME &&
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
  await checkSpeechSize(session, actor);
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
 * How far in from the edge of the view the foot of the bubble of Nancy is
 * brought, in CSS pixels.
 */
const SPEECH_EDGE_INSET = 25;
/**
 * How far from {@link SPEECH_EDGE_INSET} in from the edge the foot of the
 * bubble may be left, in CSS pixels.
 */
const SPEECH_EDGE_NEARNESS = 25;
/**
 * The least room a bubble leaves between itself and the edge of the view,
 * in CSS pixels.
 */
const LEAST_SPEECH_MARGIN = 4;
/**
 * The farthest the tip of the tail of a bubble may be from just above the
 * head of the one who speaks, along the view, with the head in the view,
 * in CSS pixels.
 */
const FARTHEST_TIP_OFFSET = 40;
/** The widest share of the width of the view a bubble may take. */
const MOST_SPEECH_SHARE = 0.9;
/** The field of view of the camera, from top to bottom, in degrees. */
const CAMERA_FIELD_OF_VIEW = 40;
/**
 * The farthest a player walks to either side of Nancy to bring her to an
 * edge of the view, the camera brought near enough for that, in meters.
 */
const SPEECH_SIDE_REACH = 3.5;
/**
 * The position along the Z axis a player steps south to, at least, to walk
 * along the open stretch there to either side of Nancy, in meters.
 */
const SPEECH_SIDE_Z = -5.6;
/**
 * The position along the Z axis a player steps back north to, at most,
 * before stepping level with Nancy, in meters.
 */
const SPEECH_RETURN_Z = -6.2;
/**
 * How far short of where it brings Nancy to the edge of the view a player
 * lets go of the key that walks it there, in meters, which is farther than
 * it walks on before the key is let go of.
 */
const SPEECH_STOP_SHORT = 0.4;
/** The most taps of a key a player then steps the rest of the way with. */
const SPEECH_MOST_NUDGES = 8;

/**
 * Checks that a page keeps the bubble of Nancy wholly on the screen, its
 * tail pointing at her, with her near the left edge of the view and near
 * the right, on a phone held upright and on its side and at its own size,
 * and that the bubble takes no more than {@link MOST_SPEECH_SHARE} of the
 * width of the view.  Its player talks to her, steps south of her, and
 * walks off to one side until she stands near the edge, with the camera
 * brought nearer first where the view is too wide for her to get there
 * otherwise, and then goes back to talk to her again.  The camera is put
 * back after.  Each bubble is saved, if the environment names a directory
 * to.
 *
 * The player is to stand by Nancy, level with her and facing her from the
 * west, where it is left after.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not do so.
 */
export async function checkSpeechEdges(
  session: BidiSession,
  context: string,
  id: number,
): Promise<void> {
  const look = (): Promise<TalkLook> => readTalkLook(session, context, id);
  const readScreen = async (): Promise<SpeechScreen> => {
    const seen: TalkLook = await look();
    if (seen.speech?.screen == null) {
      throw new Error(
        `With the bubble of Nancy to be shown, ${describeTalkLook(seen)}, ` +
          `on the screen at ${JSON.stringify(seen.speech?.screen)}.`,
      );
    }
    return seen.speech.screen;
  };
  const readDistance = async (): Promise<number> =>
    Number(
      await evaluateInPage(
        session,
        context,
        'String(window.clovervale.describeCameraDistance())',
      ),
    );
  // Zooms the camera to a distance from what it looks at.
  const zoomTo = async (distance: number): Promise<void> => {
    const turns: number =
      Math.log(distance / (await readDistance())) /
      Math.log(ZOOM_STEP_FACTOR);
    if (Math.abs(turns) >= 0.1) {
      await zoomCamera(session, context, Math.round(-turns * ZOOM_DELTA));
    }
  };
  // Holds a key down until the page shows what is awaited.
  const walkUntil = async (
    key: string,
    isAwaited: (seen: TalkLook) => boolean,
    timeout: number,
    where: string,
  ): Promise<void> => {
    await sendKey(session, context, 'keyDown', key);
    try {
      await waitFor(
        look,
        isAwaited,
        timeout,
        (seen: TalkLook) =>
          `With the key ${key} held down ${where}, the page tells ` +
          `${describeTalkLook(seen)}.`,
      );
    } finally {
      await sendKey(session, context, 'keyUp', key);
    }
  };
  const problems: string[] = [];
  const distance: number = await readDistance();
  try {
    for (const [name, viewport, pixelRatio] of [
      ['portrait', PORTRAIT_VIEWPORT, PHONE_PIXEL_RATIO],
      ['landscape', LANDSCAPE_VIEWPORT, PHONE_PIXEL_RATIO],
      ['desktop', null, null],
    ] as const) {
      await session.send('browsingContext.setViewport', {
        context,
        viewport,
        devicePixelRatio: pixelRatio,
      });
      await sleep(VIEW_SETTLE_DURATION);
      const { width, height } = await readPageState(session, context);
      // How many CSS pixels a meter across, a meter from the camera, takes.
      const scale: number =
        height / (2 * Math.tan((CAMERA_FIELD_OF_VIEW * Math.PI) / 360));
      await zoomTo(
        Math.min(
          distance,
          (SPEECH_SIDE_REACH * scale) / (width / 2 - SPEECH_EDGE_INSET),
        ),
      );
      // Nancy is brought near the left edge from the east of her, and near
      // the right from the west, where the player is left after.
      for (const side of ['left', 'right'] as const) {
        const target: number =
          side === 'left' ? SPEECH_EDGE_INSET : width - SPEECH_EDGE_INSET;
        const where = `with Nancy to be near the ${side} edge of a view ${name}`;
        await tapKey(session, context, ' ');
        await waitFor(
          look,
          (seen: TalkLook) =>
            seen.speech?.name === 'Nancy' && seen.speech.screen !== null,
          ACTION_TIMEOUT,
          (seen: TalkLook) =>
            `With the space bar pressed by Nancy ${where}, the page tells ` +
            `${describeTalkLook(seen)}.`,
        );
        await walkUntil(
          's',
          (seen: TalkLook) => (seen.own?.z ?? -Infinity) >= SPEECH_SIDE_Z,
          ACTION_TIMEOUT,
          `${where} to step south of her`,
        );
        // Walking west brings her right across the view, and east, left.
        // The player stops short of where she is to be, as it walks on
        // until the key is let go of, and steps the rest of the way.
        const isRight: boolean = (await readScreen()).footX < target;
        const short: number =
          (SPEECH_STOP_SHORT * scale) / (await readDistance());
        await walkUntil(
          isRight ? 'a' : 'd',
          (seen: TalkLook) => {
            const x: number | undefined = seen.speech?.screen?.footX;
            // The walk ends too once the bubble has gone, which fails
            // where the bubble is read next.
            return (
              x === undefined ||
              (isRight ? x >= target - short : x <= target + short)
            );
          },
          ACTION_TIMEOUT,
          where,
        );
        const isIdle = (seen: TalkLook): boolean =>
          seen.own?.action === 'Idle';
        const describeProblem = (seen: TalkLook): string =>
          `Stepping its player ${where}, the page tells ` +
          `${describeTalkLook(seen)}.`;
        await sleep(POLL_INTERVAL * 2);
        let stopped: TalkLook = await waitFor(
          look,
          isIdle,
          ACTION_TIMEOUT,
          describeProblem,
        );
        let screen: SpeechScreen = await readScreen();
        for (
          let nudges = 0;
          Math.abs(screen.footX - target) > SPEECH_EDGE_NEARNESS &&
          nudges < SPEECH_MOST_NUDGES;
          nudges++
        ) {
          const key: string = screen.footX < target ? 'a' : 'd';
          const x: number | undefined = stopped.own?.x;
          await sendKey(session, context, 'keyDown', key);
          try {
            await sleep(TAP_DURATION);
          } finally {
            await sendKey(session, context, 'keyUp', key);
          }
          stopped = await waitFor(
            look,
            (seen: TalkLook) => isIdle(seen) && seen.own?.x !== x,
            ACTION_TIMEOUT,
            describeProblem,
          );
          await sleep(POLL_INTERVAL * 2);
          screen = await readScreen();
        }
        await saveView(session, context, `speech-${name}-${side}.png`);
        const shown =
          `On a view ${name}, ${String(width)} by ${String(height)}, ` +
          `with the foot of the bubble of Nancy at ` +
          `${screen.footX.toFixed(1)} across, the page shows her bubble ` +
          `at ${JSON.stringify(screen)}`;
        if (Math.abs(screen.footX - target) > SPEECH_EDGE_NEARNESS) {
          problems.push(`${shown}, her too far from the edge`);
        }
        if (
          screen.left < LEAST_SPEECH_MARGIN ||
          screen.top < LEAST_SPEECH_MARGIN ||
          screen.right > width - LEAST_SPEECH_MARGIN ||
          screen.tipY > height - LEAST_SPEECH_MARGIN
        ) {
          problems.push(`${shown}, beyond the edges of the view`);
        }
        if (screen.right - screen.left > width * MOST_SPEECH_SHARE) {
          problems.push(`${shown}, wider than most of the view`);
        }
        if (
          screen.tipX <= screen.left ||
          screen.tipX >= screen.right ||
          Math.abs(screen.tipX - screen.footX) > FARTHEST_TIP_OFFSET
        ) {
          problems.push(`${shown}, its tail pointing away from her`);
        }
        await walkUntil(
          'w',
          (seen: TalkLook) => (seen.own?.z ?? Infinity) <= SPEECH_RETURN_Z,
          ACTION_TIMEOUT,
          'to step back north to Nancy',
        );
        await stepWithin(
          session,
          context,
          id,
          TALK_LEAST_Z,
          TALK_MOST_Z,
          'level with Nancy',
        );
        const own: TalkLook['own'] = (await look()).own;
        await walkUntil(
          (own?.x ?? 0) < NANCY_X ? 'd' : 'a',
          (seen: TalkLook) => seen.spaceKey === TALK_KEY,
          LEG_TIMEOUT,
          'to walk back to Nancy',
        );
      }
    }
  } finally {
    await session.send('browsingContext.setViewport', {
      context,
      viewport: null,
      devicePixelRatio: null,
    });
    await sleep(VIEW_SETTLE_DURATION);
    await zoomTo(distance);
  }
  await waitFor(
    look,
    (seen: TalkLook) => seen.speech === null,
    SPEECH_TIMEOUT,
    (seen: TalkLook) =>
      `Long after its player last talked to Nancy, the page tells ` +
      `${describeTalkLook(seen)}.`,
  );
  if (problems.length > 0) {
    throw new Error(`${problems.join('.\n')}.`);
  }
}
