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
 * a list of lines, numbered from one, as in `villager.nancy.line.1`.
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
  'panel.trailingCamera': 'Trailing camera',
  'panel.turnRate': 'Turn rate (°/s)',
  'panel.deadZone': 'Dead zone (°)',
  'panel.easeTime': 'Ease time (s)',
  'panel.angleLimit': 'Angle limit (°)',
  'panel.recenterDelay': 'Recenter delay (s)',
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
  'monsterAction.Sit': 'Sit',
  'monsterMode.idle': 'idle',
  'monsterMode.wander': 'wander',
  'monsterMode.chase': 'chase',
  'monsterMode.return': 'return',
  'monsterMode.dead': 'dead',
  'monsterMode.approach': 'approach',
  'monsterMode.talk': 'talk',
  'monsterMode.sit': 'sit',
  'monster.gone': 'gone',
  'slash.hit': 'hit',
  'slash.missed': 'missed',
  'dayPhase.dawn': 'dawn',
  'dayPhase.day': 'day',
  'dayPhase.dusk': 'dusk',
  'dayPhase.night': 'night',

  'prompt.drink': 'Press Space to drink from the fountain',
  'prompt.talk': 'Press Space to talk to {name}',
  'prompt.pick': 'Press Space to pick up the {item}',
  'prompt.full': 'Your inventory is full, so you cannot pick up the {item}',
  'prompt.enter': 'Press Space to go down the burrow',
  'prompt.climb': 'Press Space to climb up the rope',
  'prompt.open': 'Press Space to open the {container}',
  'prompt.fullContainer':
    'Your inventory is full, so you cannot take anything from the {container}',
  'prompt.empty': 'The {container} is empty',
  'spaceKey.slash': 'slash',
  'spaceKey.drink': 'drink from the fountain',
  'spaceKey.talk': 'talk to {name}',
  'spaceKey.nothing': 'nothing',
  'spaceKey.pick': 'pick up the {item}',
  'spaceKey.full': 'nothing, as the inventory is full',
  'spaceKey.enter': 'go down the burrow',
  'spaceKey.climb': 'climb up the rope',
  'spaceKey.open': 'open the {container}',
  'spaceKey.empty': 'nothing, as the {container} is empty',

  'inventory.title': 'Inventory',
  'inventory.icon': 'Inventory (I)',
  'inventory.hint': 'Arrow keys to choose, Enter to use, Esc or I to close',
  'dialogue.hint': 'Arrow keys to choose, Enter to reply',
  'dialogue.hintEnd': 'Enter to close',
  'help.title': 'Controls',
  'help.icon': 'Controls (H)',
  'help.close': 'Close',
  'help.ok': 'OK',
  'help.walk': 'Walk',
  'help.turn': 'Turn the view',
  'help.mouse': 'Drag to turn the view, scroll to zoom',
  'help.interact': 'Interact, talk, attack',
  'help.bag': 'Open the inventory',
  'help.choose': 'Choose and confirm in the inventory and in dialogues',
  'help.escape': 'Close the inventory or this help',
  'help.help': 'Open this help',
  'itemNotice.gained': 'You got the {item}',
  'itemAction.use': 'Use',
  'itemAction.drop': 'Drop',
  'item.clover': 'four-leaved clover',
  'item.sword': 'short sword',
  'item.leatherArmour': 'leather armour',
  'item.healingPotion': 'healing potion',
  'item.clovervaleMessage': 'message from Clovervale',
  'item.spyToken': 'token of the Clovervale spy',
  'container.chest': 'chest',
  'container.barrel': 'barrel',

  'villager.nancy.name': 'Nancy',
  // The lines of the villagers are written whole, each in one string, so
  // that the values they take are known.
  'villager.nancy.line.1':
    'There are wild dogs at the village gate, and no one can go out. What are we going to do?',
  'villager.emma.name': 'Blacksmith Emma',
  'villager.emma.line.1': 'Just a moment, let me finish this blade first.',
  'villager.emma.line.2': "Don't stand too close, the sparks will catch you.",
  'villager.martha.name': 'Chief Martha',
  'villager.martha.line.1':
    "Welcome to Clovervale. I'm Martha, the village chief. If you need anything, just come and see me.",
  'villager.martha.line.2':
    'That well dried up long ago, so I boarded it up to keep the children from falling in.',
  'villager.toby.name': 'Toby',
  'villager.toby.line.1':
    "Mummy says I mustn't go outside. There are wild dogs out there.",
  'villager.toby.line.2':
    'If you want something, go and see the village chief. She lives in the biggest house!',
  'villager.toby.line.3':
    "I'm looking for a four-leaf one! If you find one, you'll have good luck.",
  'villager.toby.found': 'Found one!',
  'villager.toby.gift': "Here, this one's for you! It brings good luck.",
  'villager.edwin.name': 'Prisoner',
  'villager.edwin.knownName': 'Envoy Edwin',
  'villager.edwin.call': 'Help! Is anyone there?',
  'dialogue.edwin.plea': 'Help! Please help me!',
  'dialogue.edwin.askWho': 'Who are you? What are you doing in there?',
  'dialogue.edwin.identity':
    "I'm Edwin, a royal envoy. I came to spy on the enemy, but I got caught, and now I'm locked up in here.",
  'dialogue.edwin.offerKey': "Hang on, I'll find the key and get you out.",
  'dialogue.edwin.errand':
    "No, there's no time. I've got news the king has to hear right away. I've written it on this bit of cloth. Take it to him, quick. It's urgent. Go!",
  'dialogue.edwin.reminder': "Haven't you gone to the king yet? Go on, hurry!",
  'dialogue.edwin.wonder':
    "I thought you'd gone to the king. What are you still doing here?",
  'dialogue.edwin.tellLost': 'I lost the message.',
  'dialogue.edwin.rewrite':
    "Never mind, I'll write another. Take it to the king, quick. It's urgent. Go!",
  'dialogue.martha.ask': 'Who are you? What were you doing down the well?',
  'dialogue.martha.tellEnvoy':
    "Chief! There's a royal envoy locked up down the well. Quick, go and save him!",
  'dialogue.martha.tellPrisoner':
    "Chief! There's someone locked up down the well. Quick, go and save them!",
  'dialogue.martha.confession':
    "Hmph, so you found out! I'm an enemy spy. That royal envoy tried to sneak off with what he'd learnt, so I caught him and locked him up. Now that you know too, you can stay and keep him company!",
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
