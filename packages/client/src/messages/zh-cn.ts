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
 * @module client/messages/zh-cn The text of the page in Simplified
 *   Chinese, as written in mainland China.
 */

import type { MessageTable } from './en.ts';

/** The text of the page in Simplified Chinese, by message. */
export const ZH_CN_MESSAGES: MessageTable = {
  title: '四叶谷',

  'server.connecting': '连接中',
  'server.connected': '已连接（协议 {version}）',
  'server.incompatible': '不兼容（协议 {version}）',
  'server.misbehaving': '响应异常',
  'server.disconnected': '已断开',

  'models.loading': '加载中',
  'models.shown': '已显示 {shown} 个',
  'models.shownWithProblem': '已显示 {shown} 个，{problems} 个问题',
  'models.shownWithProblems': '已显示 {shown} 个，{problems} 个问题',
  'model.missing': '文件缺失',
  'model.failed': '加载失败',
  'model.failedWithDetail': '加载失败：{detail}',

  'panel.server': '服务器',
  'panel.models': '模型',
  'panel.timeOfDay': '时间',
  'panel.camera': '镜头跟随',
  'panel.trailingCamera': '镜头尾随',
  'panel.turnRate': '转向速率（°/s）',
  'panel.deadZone': '死区（°）',
  'panel.easeTime': '缓动时间（s）',
  'panel.angleLimit': '角度上限（°）',
  'panel.recenterDelay': '回正延迟（s）',
  'panel.predict': '预测',
  'panel.smooth': '平滑校正',
  'panel.foreseePushes': '预判推开',
  'panel.netDelay': '网络延迟（ms）',
  'panel.interpolate': '插值',
  'panel.delay': '插值延迟（ms）',
  'panel.compensate': '延迟补偿',
  'panel.obstacles': '显示障碍物',
  'panel.previewTime': '时间预览',
  'panel.previewHour': '时间',
  'panel.music': '音乐',
  'panel.volume': '音乐音量',
  'panel.language': '语言',
  'panel.snapshot': '最新快照',
  'panel.player': '玩家',
  'panel.players': '玩家数',
  'panel.position': '位置',
  'panel.yaw': '偏航角',
  'panel.action': '动作',
  'panel.health': '生命值',
  'panel.monster': '怪物',
  'panel.monsterMode': '怪物状态',
  'panel.monsterAction': '怪物动作',
  'panel.monsterHealth': '怪物生命值',
  'panel.monsterAt': '怪物位置',
  'panel.prediction': '预测',
  'panel.predicted': '预测位置',
  'panel.corrections': '校正次数',
  'panel.spaceKey': '空格键',
  'panel.displayed': '画面显示',
  'panel.drawnAt': '绘制位置',
  'panel.behind': '落后',
  'panel.lastSlash': '上次挥砍',
  'panel.result': '结果',
  'panel.judgedBack': '回溯判定',
  'panel.modelProblems': '模型问题',

  'camera.own': '自己的角色',
  'camera.ownWithId': '自己的角色（{id}）',

  'readout.player': '{id}，外观 {appearance}',
  'readout.dead': '{health}，已死亡',
  'readout.corrections': '{count} 次，上次 {size} m',
  'readout.timeOfDay': '{time}，{phase}',
  'action.Idle': '待机',
  'action.Walk': '行走',
  'action.Slash': '挥砍',
  'action.Drink': '喝水',
  'action.Talk': '交谈',
  'action.Die': '死亡',
  'monsterAction.Idle': '待机',
  'monsterAction.Walk': '行走',
  'monsterAction.Attack': '攻击',
  'monsterAction.Die': '死亡',
  'monsterAction.Sit': '坐下',
  'monsterMode.idle': '待机',
  'monsterMode.wander': '游荡',
  'monsterMode.chase': '追击',
  'monsterMode.return': '返回',
  'monsterMode.dead': '死亡',
  'monsterMode.approach': '接近',
  'monsterMode.talk': '交谈',
  'monsterMode.sit': '坐地',
  'monster.gone': '不在',
  'slash.hit': '命中',
  'slash.missed': '未命中',
  'dayPhase.dawn': '黎明',
  'dayPhase.day': '白天',
  'dayPhase.dusk': '黄昏',
  'dayPhase.night': '夜晚',

  'prompt.drink': '按空格键喝喷泉的水',
  'prompt.talk': '按空格键与{name}交谈',
  'prompt.pick': '按空格键拾取{item}',
  'prompt.full': '物品栏已满，无法拾取{item}',
  'prompt.enter': '按空格键钻进巢穴',
  'prompt.climb': '按空格键顺着绳子爬上去',
  'prompt.open': '按空格键打开{container}',
  'prompt.fullContainer': '物品栏已满，无法从{container}拿取物品',
  'prompt.empty': '{container}是空的',
  'spaceKey.slash': '挥砍',
  'spaceKey.drink': '喝喷泉的水',
  'spaceKey.talk': '与{name}交谈',
  'spaceKey.nothing': '无',
  'spaceKey.pick': '拾取{item}',
  'spaceKey.full': '无（物品栏已满）',
  'spaceKey.enter': '钻进巢穴',
  'spaceKey.climb': '顺着绳子爬上去',
  'spaceKey.open': '打开{container}',
  'spaceKey.empty': '无（{container}是空的）',

  'inventory.title': '物品栏',
  'inventory.icon': '物品栏 (I)',
  'inventory.hint': '方向键选择，Enter 使用，Esc 或 I 关闭',
  'dialogue.hint': '方向键选择，Enter 回答',
  'dialogue.hintEnd': 'Enter 结束',
  'itemNotice.gained': '取得{item}',
  'itemAction.use': '使用',
  'itemAction.drop': '丢弃',
  'item.clover': '四叶幸运草',
  'item.sword': '短剑',
  'item.leatherArmour': '皮甲',
  'item.healingPotion': '治疗药水',
  'item.clovervaleMessage': '四叶谷的情报',
  'item.spyToken': '四叶谷间谍的信物',
  'container.chest': '宝箱',
  'container.barrel': '木桶',

  'villager.nancy.name': '南茜',
  'villager.nancy.line.1': '村口有野狗出没，村里的人都没法出门了，这可怎么办？',
  'villager.emma.name': '铁匠艾玛',
  'villager.emma.line.1': '稍等一下，我打完这把刀。',
  'villager.emma.line.2': '别站太近，火星会喷到你。',
  'villager.martha.name': '村长玛莎',
  'villager.martha.line.1':
    '欢迎来到四叶谷，我是村长玛莎，有什么事都可以来找我帮忙。',
  'villager.martha.line.2': '那口井早就干了，我封起来，免得小孩掉下去。',
  'villager.toby.name': '托比',
  'villager.toby.line.1': '妈妈说不可以出去，外面有野狗。',
  'villager.toby.line.2': '有事要找村长哦，她住在最大的那间房子。',
  'villager.toby.line.3': '我在找四叶的！找到就会有好运哦。',
  'villager.edwin.name': '囚犯',
  'villager.edwin.knownName': '使者艾德温',
  'villager.edwin.call': '救命啊！有人吗？',
  'dialogue.edwin.plea': '救命啊！快来帮帮我！',
  'dialogue.edwin.askWho': '你是谁？怎么会在这儿？',
  'dialogue.edwin.identity':
    '我是王国的使者艾德温，奉命来打探敌国的情报，结果一不小心被抓了，关在了这儿。',
  'dialogue.edwin.offerKey': '你等着，我去找钥匙把你救出来。',
  'dialogue.edwin.errand':
    '不用了，来不及了。我这儿有重要的情报，得马上交给国王。我写在这块布上了，你赶紧拿去给国王。这事十万火急，快去！',
  'dialogue.edwin.reminder': '你见到国王了吗？快去啊！',
  'dialogue.edwin.wonder': '你见到国王了吗？怎么还在这儿？',
  'dialogue.edwin.tellLost': '我把情报弄丢了。',
  'dialogue.edwin.rewrite':
    '没事，我再写一份。你赶紧拿去给国王。这事十万火急，快去！',
  'dialogue.martha.ask': '你是谁？怎么会从井里出来？',
  'dialogue.martha.tellEnvoy': '村长！井里关着王国的使者，快去救他！',
  'dialogue.martha.tellPrisoner': '村长！井里关着人，快去救他！',
  'dialogue.martha.confession':
    '原来如此，让你发现了！我是敌国的间谍。王国的使者带着情报想偷偷溜走，被我逮了个正着，我就把他关起来了。现在你也知道了，那就留下来陪他吧！',
};
