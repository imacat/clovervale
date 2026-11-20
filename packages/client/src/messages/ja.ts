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
 * @module client/messages/ja The text of the page in Japanese.
 */

import type { MessageTable } from './en.ts';

/** The text of the page in Japanese, by message. */
export const JA_MESSAGES: MessageTable = {
  title: 'クローバーヴェイル',

  'server.connecting': '接続中',
  'server.connected': '接続済み（プロトコル {version}）',
  'server.incompatible': '非互換（プロトコル {version}）',
  'server.misbehaving': '不正な応答',
  'server.disconnected': '切断',

  'models.loading': '読み込み中',
  'models.shown': '{shown} 個表示',
  'models.shownWithProblem': '{shown} 個表示、問題 {problems} 件',
  'models.shownWithProblems': '{shown} 個表示、問題 {problems} 件',
  'model.missing': 'ファイルなし',
  'model.failed': '読み込み失敗',
  'model.failedWithDetail': '読み込み失敗：{detail}',

  'panel.server': 'サーバー',
  'panel.models': 'モデル',
  'panel.timeOfDay': '時刻',
  'panel.camera': 'カメラ対象',
  'panel.trailingCamera': '追従カメラ',
  'panel.turnRate': '旋回速度（°/s）',
  'panel.deadZone': '不感帯（°）',
  'panel.easeTime': '加減速時間（s）',
  'panel.angleLimit': '角度上限（°）',
  'panel.recenterDelay': '復帰待ち時間（s）',
  'panel.predict': '予測',
  'panel.smooth': '補正の平滑化',
  'panel.foreseePushes': '押しのけの先読み',
  'panel.netDelay': '通信遅延（ms）',
  'panel.interpolate': '補間',
  'panel.delay': '補間遅延（ms）',
  'panel.compensate': 'ラグ補償',
  'panel.obstacles': '障害物を表示',
  'panel.previewTime': '時刻プレビュー',
  'panel.previewHour': 'プレビュー時刻',
  'panel.music': '音楽',
  'panel.volume': '音楽の音量',
  'panel.language': '言語',
  'panel.snapshot': '最新スナップショット',
  'panel.player': 'プレイヤー',
  'panel.players': 'プレイヤー数',
  'panel.position': '位置',
  'panel.yaw': 'ヨー角',
  'panel.action': 'アクション',
  'panel.health': '体力',
  'panel.monster': 'モンスター',
  'panel.monsterMode': 'モンスター状態',
  'panel.monsterAction': 'モンスターのアクション',
  'panel.monsterHealth': 'モンスターの体力',
  'panel.monsterAt': 'モンスターの位置',
  'panel.prediction': '予測',
  'panel.predicted': '予測位置',
  'panel.corrections': '補正回数',
  'panel.spaceKey': 'スペースキー',
  'panel.displayed': '表示',
  'panel.drawnAt': '描画位置',
  'panel.behind': '遅れ',
  'panel.lastSlash': '直前の斬撃',
  'panel.result': '結果',
  'panel.judgedBack': '巻き戻し判定',
  'panel.modelProblems': 'モデルの問題',

  'camera.own': '自キャラ',
  'camera.ownWithId': '自キャラ（{id}）',

  'readout.player': '{id}、外見 {appearance}',
  'readout.dead': '{health}、死亡',
  'readout.corrections': '{count} 回、直近 {size} m',
  'readout.timeOfDay': '{time}、{phase}',
  'action.Idle': '待機',
  'action.Walk': '歩行',
  'action.Slash': '斬撃',
  'action.Drink': '水飲み',
  'action.Talk': '会話',
  'action.Die': '死亡',
  'monsterAction.Idle': '待機',
  'monsterAction.Walk': '歩行',
  'monsterAction.Attack': '攻撃',
  'monsterAction.Die': '死亡',
  'monsterMode.idle': '待機',
  'monsterMode.wander': '徘徊',
  'monsterMode.chase': '追跡',
  'monsterMode.return': '帰還',
  'monsterMode.dead': '死亡',
  'monster.gone': '不在',
  'slash.hit': '命中',
  'slash.missed': 'ミス',
  'dayPhase.dawn': '夜明け',
  'dayPhase.day': '昼',
  'dayPhase.dusk': '夕暮れ',
  'dayPhase.night': '夜',

  'prompt.drink': 'スペースキーで噴水の水を飲む',
  'prompt.talk': 'スペースキーで{name}と話す',
  'prompt.pick': 'スペースキーで{item}を拾う',
  'prompt.full': '持ち物がいっぱいで{item}を拾えない',
  'prompt.enter': 'スペースキーで巣穴に潜る',
  'prompt.climb': 'スペースキーでロープを登る',
  'prompt.open': 'スペースキーで{container}を開ける',
  'prompt.fullContainer': '持ち物がいっぱいで{container}から何も取り出せない',
  'prompt.empty': '{container}は空っぽだ',
  'spaceKey.slash': '斬る',
  'spaceKey.drink': '噴水の水を飲む',
  'spaceKey.talk': '{name}と話す',
  'spaceKey.nothing': 'なし',
  'spaceKey.pick': '{item}を拾う',
  'spaceKey.full': 'なし（持ち物がいっぱい）',
  'spaceKey.enter': '巣穴に潜る',
  'spaceKey.climb': 'ロープを登る',
  'spaceKey.open': '{container}を開ける',
  'spaceKey.empty': 'なし（{container}は空っぽ）',

  'inventory.title': '持ち物',
  'inventory.icon': '持ち物 (I)',
  'inventory.hint': '矢印キーで選択、Enter で使う、Esc か I で閉じる',
  'itemNotice.gained': '{item}を手に入れた',
  'itemAction.use': '使う',
  'itemAction.drop': '捨てる',
  'item.clover': '四つ葉のクローバー',
  'item.sword': '短剣',
  'item.leatherArmour': '革の鎧',
  'item.healingPotion': '回復薬',
  'container.chest': '宝箱',
  'container.barrel': '樽',

  'villager.nancy.name': 'ナンシー',
  'villager.nancy.line.1':
    '村の入り口に野犬が出るようになって、村のみんな外に出られなく' +
    'なっちゃったの。どうしよう……',
  'villager.emma.name': '鍛冶屋のエマ',
  'villager.emma.line.1': 'ちょっと待ってて。この刀を打ち終えちゃうから。',
  'villager.emma.line.2': 'あんまり近づかないでね。火花が飛ぶよ。',
  'villager.martha.name': '村長マーサ',
  'villager.martha.line.1':
    'クローバーヴェイルへようこそ。私は村長のマーサ。困ったことが' +
    'あったら、いつでも相談にいらっしゃい。',
  'villager.martha.line.2':
    'あの井戸はとっくに涸れてしまってね。子どもが落ちないように、' +
    '私が板でふさいでおいたのよ。',
  'villager.toby.name': 'トビー',
  'villager.toby.line.1':
    'ママがね、おそとに出ちゃダメだって。野良犬がいるんだって。',
  'villager.toby.line.2':
    '用があるなら、村長さんのところに行ってね。いちばん大きい' +
    'おうちに住んでるよ。',
  'villager.toby.line.3':
    '四つ葉のをさがしてるんだ！見つけたら、いいことがあるんだよ。',
  'villager.edwin.name': '囚人',
  'villager.edwin.line.1': '誰かいるのか？助けてくれ！',
};
