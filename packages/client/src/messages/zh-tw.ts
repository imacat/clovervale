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
 * @module client/messages/zh-tw The text of the page in Traditional
 *   Chinese, as written in Taiwan.
 */

import type { MessageTable } from './en.ts';

/** The text of the page in Traditional Chinese, by message. */
export const ZH_TW_MESSAGES: MessageTable = {
  title: '四葉谷',

  'server.connecting': '連線中',
  'server.connected': '已連線（協定 {version}）',
  'server.incompatible': '不相容（協定 {version}）',
  'server.misbehaving': '回應異常',
  'server.disconnected': '已斷線',

  'models.loading': '載入中',
  'models.shown': '已顯示 {shown} 個',
  'models.shownWithProblem': '已顯示 {shown} 個，{problems} 個問題',
  'models.shownWithProblems': '已顯示 {shown} 個，{problems} 個問題',
  'model.missing': '缺少檔案',
  'model.failed': '載入失敗',
  'model.failedWithDetail': '載入失敗：{detail}',

  'panel.server': '伺服器',
  'panel.models': '模型',
  'panel.timeOfDay': '時間',
  'panel.camera': '鏡頭跟隨',
  'panel.predict': '預測',
  'panel.smooth': '平滑修正',
  'panel.foreseePushes': '預判推開',
  'panel.netDelay': '網路延遲（ms）',
  'panel.interpolate': '內插',
  'panel.delay': '內插延遲（ms）',
  'panel.compensate': '延遲補償',
  'panel.obstacles': '顯示障礙物',
  'panel.previewTime': '時間預覽',
  'panel.previewHour': '時間',
  'panel.music': '音樂',
  'panel.volume': '音樂音量',
  'panel.language': '語言',
  'panel.snapshot': '最新快照',
  'panel.player': '玩家',
  'panel.players': '玩家數',
  'panel.position': '位置',
  'panel.yaw': '偏航角',
  'panel.action': '動作',
  'panel.health': '生命值',
  'panel.monster': '怪物',
  'panel.monsterMode': '怪物狀態',
  'panel.monsterAction': '怪物動作',
  'panel.monsterHealth': '怪物生命值',
  'panel.monsterAt': '怪物位置',
  'panel.prediction': '預測',
  'panel.predicted': '預測位置',
  'panel.corrections': '修正次數',
  'panel.spaceKey': '空白鍵',
  'panel.displayed': '畫面顯示',
  'panel.drawnAt': '繪製位置',
  'panel.behind': '落後',
  'panel.lastSlash': '上次揮砍',
  'panel.result': '結果',
  'panel.judgedBack': '回溯判定',
  'panel.modelProblems': '模型問題',

  'camera.own': '自己的角色',
  'camera.ownWithId': '自己的角色（{id}）',

  'readout.player': '{id}，外觀 {appearance}',
  'readout.dead': '{health}，已死亡',
  'readout.corrections': '{count} 次，上次 {size} m',
  'readout.timeOfDay': '{time}，{phase}',
  'action.Idle': '待機',
  'action.Walk': '行走',
  'action.Slash': '揮砍',
  'action.Drink': '喝水',
  'action.Talk': '交談',
  'action.Die': '死亡',
  'monsterAction.Idle': '待機',
  'monsterAction.Walk': '行走',
  'monsterAction.Attack': '攻擊',
  'monsterAction.Die': '死亡',
  'monsterMode.idle': '待機',
  'monsterMode.wander': '遊蕩',
  'monsterMode.chase': '追擊',
  'monsterMode.return': '返回',
  'monsterMode.dead': '死亡',
  'monster.gone': '不在',
  'slash.hit': '命中',
  'slash.missed': '未命中',
  'dayPhase.dawn': '黎明',
  'dayPhase.day': '白天',
  'dayPhase.dusk': '黃昏',
  'dayPhase.night': '夜晚',

  'prompt.drink': '按空白鍵喝噴泉的水',
  'prompt.talk': '按空白鍵與{name}交談',
  'spaceKey.slash': '揮砍',
  'spaceKey.drink': '喝噴泉的水',
  'spaceKey.talk': '與{name}交談',
  'spaceKey.nothing': '無',

  'villager.nancy.name': '南茜',
  'villager.nancy.line.1': '村口有野狗出沒，村裏的人都無法外出了，怎麼辦？',
  'villager.martha.name': '瑪莎',
  'villager.martha.line.1':
    '歡迎來到四葉谷，我是村長{name}，有什麼事都可以來找我幫忙。',
  'villager.martha.line.2': '那口井早就乾了，我封起來，免得小孩掉下去。',
  'villager.toby.name': '托比',
  'villager.toby.line.1': '媽媽說不可以出去，外面有野狗。',
  'villager.toby.line.2': '有事要找村長喔，她住在最大的那間房子。',
  'villager.toby.line.3': '我在找四葉的！找到就會有好運喔。',
};
