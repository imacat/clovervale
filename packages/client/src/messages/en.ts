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
 * @module client/messages/en The text of the page in English, which names
 *   every message the page has.
 */

/**
 * The text of the page in English, by message.  A name in braces, as in
 * `{name}`, stands for a value the message takes.  What a villager says is
 * a list of lines, numbered from one, as in `villager.nancy.line.1`, and a
 * line can name the villager as `{name}`.
 */
export const EN_MESSAGES = {
  title: 'Clovervale',

  'server.connecting': 'connecting',
  'server.connected': 'connected (protocol {version})',
  'server.incompatible': 'incompatible (protocol {version})',
  'server.misbehaving': 'misbehaving',
  'server.disconnected': 'disconnected',

  'models.loading': 'loading',
  'models.shown': '{shown} shown',
  'models.shownWithProblem': '{shown} shown, {problems} problem',
  'models.shownWithProblems': '{shown} shown, {problems} problems',
  'model.missing': 'missing',
  'model.failed': 'failed to load',
  'model.failedWithDetail': 'failed to load: {detail}',

  'panel.server': 'Server',
  'panel.models': 'Models',
  'panel.timeOfDay': 'Time of day',
  'panel.camera': 'Camera on',
  'panel.predict': 'Predict',
  'panel.smooth': 'Smooth corrections',
  'panel.foreseePushes': 'Foresee pushes',
  'panel.netDelay': 'Net delay (ms)',
  'panel.interpolate': 'Interpolate',
  'panel.delay': 'Delay (ms)',
  'panel.compensate': 'Compensate lag',
  'panel.obstacles': 'Show obstacles',
  'panel.previewTime': 'Time preview',
  'panel.previewHour': 'Time',
  'panel.music': 'Music',
  'panel.volume': 'Music volume',
  'panel.language': 'Language',
  'panel.snapshot': 'Latest snapshot',
  'panel.player': 'Player',
  'panel.players': 'Players',
  'panel.position': 'Position',
  'panel.yaw': 'Yaw',
  'panel.action': 'Action',
  'panel.health': 'Health',
  'panel.monster': 'Monster',
  'panel.monsterMode': 'Monster',
  'panel.monsterAction': 'Monster action',
  'panel.monsterHealth': 'Monster health',
  'panel.monsterAt': 'Monster at',
  'panel.prediction': 'Prediction',
  'panel.predicted': 'Predicted',
  'panel.corrections': 'Corrections',
  'panel.spaceKey': 'Space key',
  'panel.displayed': 'Displayed',
  'panel.drawnAt': 'Drawn at',
  'panel.behind': 'Behind',
  'panel.lastSlash': 'Last slash',
  'panel.result': 'Result',
  'panel.judgedBack': 'Judged back',
  'panel.modelProblems': 'Model problems',

  'camera.own': 'Own player',
  'camera.ownWithId': 'Own player ({id})',

  'readout.player': '{id}, appearance {appearance}',
  'readout.dead': '{health}, dead',
  'readout.corrections': '{count}, last {size} m',
  'readout.timeOfDay': '{time}, {phase}',
  'action.Idle': 'Idle',
  'action.Walk': 'Walk',
  'action.Slash': 'Slash',
  'action.Drink': 'Drink',
  'action.Talk': 'Talk',
  'action.Die': 'Die',
  'monsterAction.Idle': 'Idle',
  'monsterAction.Walk': 'Walk',
  'monsterAction.Attack': 'Attack',
  'monsterAction.Die': 'Die',
  'monsterMode.idle': 'idle',
  'monsterMode.wander': 'wander',
  'monsterMode.chase': 'chase',
  'monsterMode.return': 'return',
  'monsterMode.dead': 'dead',
  'monster.gone': 'gone',
  'slash.hit': 'hit',
  'slash.missed': 'missed',
  'dayPhase.dawn': 'dawn',
  'dayPhase.day': 'day',
  'dayPhase.dusk': 'dusk',
  'dayPhase.night': 'night',

  'prompt.drink': 'Press Space to drink from the fountain',
  'prompt.talk': 'Press Space to talk to {name}',
  'spaceKey.slash': 'slash',
  'spaceKey.drink': 'drink from the fountain',
  'spaceKey.talk': 'talk to {name}',
  'spaceKey.nothing': 'nothing',

  'villager.nancy.name': 'Nancy',
  // The lines of the villagers are written whole, each in one string, so
  // that the values they take are known.
  'villager.nancy.line.1':
    'Wild dogs prowl outside the village, and no one dares to go out any more. What are we to do?',
  'villager.martha.name': 'Martha',
  'villager.martha.line.1':
    "Welcome to Clovervale. I'm {name}, the village chief. If there's anything I can help you with, just come and find me.",
  'villager.martha.line.2':
    'That well ran dry long ago. I boarded it up so that none of the children would fall in.',
  'villager.toby.name': 'Toby',
  'villager.toby.line.1':
    "Mummy says I mustn't go outside. There are wild dogs out there.",
  'villager.toby.line.2':
    'If you want something, go and see the village chief. She lives in the biggest house!',
  'villager.toby.line.3':
    "I'm looking for a four-leaf one! If you find one, you'll have good luck.",
} as const;

/** A message of the page. */
export type MessageId = keyof typeof EN_MESSAGES;

/**
 * The text of the page in a language, by message, with every message and
 * no other.
 */
export type MessageTable = Readonly<Record<MessageId, string>>;

/**
 * The names of the values a message takes.
 *
 * @template T - The message.
 */
export type PlaceholderOf<T extends string> =
  T extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholderOf<Rest>
    : never;

/**
 * The values a message takes, by their names, as the rest of the
 * arguments to word it: nothing for a message without a value.
 *
 * @template Id - The message.
 */
export type MessageValues<Id extends MessageId> = [
  PlaceholderOf<(typeof EN_MESSAGES)[Id]>,
] extends [never]
  ? []
  : [values: Readonly<Record<PlaceholderOf<(typeof EN_MESSAGES)[Id]>, string>>];

/** A message that takes no value. */
export type PlainMessageId = {
  [Id in MessageId]: MessageValues<Id> extends [] ? Id : never;
}[MessageId];
