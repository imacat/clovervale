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

import { existsSync } from 'node:fs';
import path from 'node:path';

import { checkApothecary } from './test-browser/apothecary.ts';
import { BidiSession } from './test-browser/bidi.ts';
import { checkCamera, checkCameraKeys } from './test-browser/camera.ts';
import { checkCave } from './test-browser/cave.ts';
import { checkChat } from './test-browser/chat.ts';
import { startClientServer } from './test-browser/client-server.ts';
import { checkUnusableServer } from './test-browser/connection.ts';
import {
  ACTION_TIMEOUT,
  HELD_TIME,
  HELP_PAGE_COUNT,
  RUNNING_DAY_MINUTES,
  clientDir,
  rootDir,
  serverFile,
} from './test-browser/constants.ts';
import { checkDayAgreement, checkNight } from './test-browser/day.ts';
import { checkCreditsByTouch } from './test-browser/ending.ts';
import { checkFountain } from './test-browser/fountain.ts';
import { checkGamepad } from './test-browser/gamepad.ts';
import {
  checkHelp,
  describeHelpLook,
  readHelpLook,
} from './test-browser/help.ts';
import type { HelpLook } from './test-browser/help.ts';
import { checkInventory } from './test-browser/inventory.ts';
import { checkLanguage } from './test-browser/language.ts';
import { checkMartha } from './test-browser/martha.ts';
import { checkMonster } from './test-browser/monster.ts';
import {
  checkCompensation,
  checkMotion,
  checkObstacle,
  checkPrediction,
  checkSlash,
  checkWalk,
} from './test-browser/movement.ts';
import {
  findFigure,
  loadClient,
  readPageState,
  setControl,
  waitFor,
} from './test-browser/page.ts';
import type { PageState } from './test-browser/page.ts';
import { checkPanelFolded } from './test-browser/panel.ts';
import {
  cleanUp,
  startFirefox,
  startGameServer,
} from './test-browser/processes.ts';
import { checkSpeechEdges, checkTalk } from './test-browser/talk.ts';
import { checkTobyQuest } from './test-browser/toby-quest.ts';
import {
  checkToby,
  checkTobyExclamation,
  checkTobyFind,
} from './test-browser/toby.ts';
import { checkTouch } from './test-browser/touch.ts';

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
 * sees it in its own slots, that a player plays the quest of Toby, hurt,
 * through, taking Martha's ointment to him, that a player that holds
 * Edwin's message and Martha's token in the village sees the ending and
 * the credits, and that the camera of a page follows the player of the
 * other page when its panel is set to, until that player leaves, and that a
 * page whose address names no server it can connect to tells it is
 * disconnected.  The server holds its clock at noon, which both pages tell,
 * and a page that previews midnight in its panel shows the village clearly
 * darker, yet far from black, while the other goes on showing noon.  On
 * another server, whose day runs, two pages, one joining later than the
 * other, tell the same time of day as it goes on.
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

    await checkPanelFolded(session, first);
    await checkHelp(session, first, second, id);
    await checkChat(session, first, id);
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
    await checkSpeechEdges(session, first, id);
    await checkLanguage(session, first);
    const other: PageState = await readPageState(session, second);
    const otherId = Number(/^#(\d+)/.exec(other.panel.Player ?? '')?.[1]);
    await checkInventory(session, first, second, id, otherId);
    await checkCave(session, first, second, id);
    await checkMartha(session, first, second, id);
    await checkTobyExclamation(session, first, id);
    await checkTobyQuest(session, first, id);
    await checkApothecary(session, first, id);
    await checkCamera(session, first, id, second, otherId);
    await checkCameraKeys(session, first, id);
    await checkGamepad(session, first, id);
    await checkCreditsByTouch(session, first);
    await checkTouch(session, url);
    await checkUnusableServer(session, clientPort);

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
    const reloaded: HelpLook = await readHelpLook(session, first);
    if (reloaded.dotCount !== HELP_PAGE_COUNT) {
      throw new Error(
        'Loaded again, the first page tells ' +
          `${describeHelpLook(reloaded)}, before any ending.`,
      );
    }
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
      'chosen, show the controls, say a line typed in a bubble, pick, ' +
      'carry and put down a clover, go down into a cave of their own, kill ' +
      'its two wild dogs, talk ' +
      'to the prisoner through his bars, loot the store rooms, count ' +
      'the silver coins of a barrel in the bag, use a ' +
      'healing potion, and climb back up, have Martha come over, talk ' +
      'with her and beat her, reach the ending and see the credits, ' +
      'take her ointment to a hurt Toby, buy ' +
      'healing potions from Basil until short of silver, have the ' +
      'camera follow another player, turn the camera with the arrow keys, ' +
      'play with a gamepad, play by touch on a phone held either way, ' +
      'darken at night, preview a time of ' +
      'day on their own, agree on the time of day, and tell they are ' +
      'disconnected from a server they cannot connect to.',
  );
} catch (error: unknown) {
  const reason: string = error instanceof Error ? error.message : String(error);
  console.error(`Browser check failed: ${reason}`);
  process.exitCode = 1;
} finally {
  await cleanUp();
}
