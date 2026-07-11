// 火之域关卡数据
// 坐标系：左上角原点，x向右，y向下。所有数值单位为像素。
const levelHuo = {
  platforms: [
    // 开局玄武岩平地 (0-250)
    { x: 0, y: 500, w: 250, h: 20, type: 'basalt_floor' },
    // 第一条熔岩河浮台 (280-480)
    { x: 280, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 330, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 380, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 430, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 480, y: 480, w: 25, h: 15, type: 'firebrick' },
    // 黑曜石窄脊 (500-650)
    { x: 500, y: 500, w: 150, h: 10, type: 'obsidian_ridge' },
    // 烧焦古木残桥 (670-850)
    { x: 670, y: 500, w: 40, h: 12, type: 'charred_wood' },
    { x: 720, y: 500, w: 40, h: 12, type: 'charred_wood_break', id: 1 },
    { x: 770, y: 500, w: 40, h: 12, type: 'charred_wood' },
    { x: 820, y: 500, w: 40, h: 12, type: 'charred_wood_break', id: 2 },
    // 火山碎屑下坡 (880-1000)
    { x: 880, y: 480, w: 120, h: 15, type: 'sliding_slope' },
    // 第二条熔岩河浮台 (1020-1240)
    { x: 1020, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 1060, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 1100, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 1140, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 1180, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 1220, y: 480, w: 25, h: 15, type: 'firebrick' },
    { x: 1260, y: 480, w: 25, h: 15, type: 'firebrick' },
    // 半包围石脊路 (1280-1400)
    { x: 1280, y: 500, w: 120, h: 15, type: 'basalt_floor' },
    // 金属格栅地面 (1420-1550)
    { x: 1420, y: 500, w: 130, h: 10, type: 'metal_grate' },
    // 火山岩台阶 (1570-1700)
    { x: 1570, y: 480, w: 40, h: 20, type: 'volcanic_step' },
    { x: 1620, y: 450, w: 40, h: 20, type: 'volcanic_step' },
    { x: 1670, y: 420, w: 40, h: 20, type: 'volcanic_step' },
    // 最后平地及追击火墙路段 (1720-2000)
    { x: 1720, y: 500, w: 280, h: 20, type: 'basalt_floor' }
  ],
  hazards: [
    { x: 180, y: 480, w: 60, h: 20, type: 'cracked_floor', damage: 1, description: '热裂平台区1' },
    { x: 350, y: 460, w: 30, h: 30, type: 'lava_eruption', damage: 2, description: '熔岩喷发柱1' },
    { x: 570, y: 480, w: 40, h: 30, type: 'updraft', damage: 0, blow: true, description: '上升气流1(撞顶刺)' },
    { x: 720, y: 500, w: 40, h: 12, type: 'wood_break', damage: 1, description: '残桥崩塌1' },
    { x: 820, y: 500, w: 40, h: 12, type: 'wood_break', damage: 1, description: '残桥崩塌2' },
    { x: 920, y: 470, w: 40, h: 30, type: 'fire_dragon_head', damage: 2, description: '喷火龙首1' },
    { x: 1060, y: 460, w: 25, h: 30, type: 'lava_eruption', damage: 2, description: '熔岩喷发柱2' },
    { x: 1140, y: 460, w: 25, h: 30, type: 'lava_eruption', damage: 2, description: '熔岩喷发柱3' },
    { x: 1340, y: 480, w: 40, h: 30, type: 'updraft', damage: 0, blow: true, description: '上升气流2(撞顶密刺)' },
    { x: 1480, y: 500, w: 30, h: 10, type: 'grate_overheat', damage: 1, description: '金属格栅过热区' },
    { x: 1640, y: 480, w: 40, h: 30, type: 'fire_dragon_head', damage: 2, description: '喷火龙首2' },
    { x: 1800, y: 500, w: 80, h: 400, type: 'fire_wall', damage: 3, description: '追击火墙(动态)' }
  ],
  length: 2000,
  spawn: { x: 150, y: 436 },
  groundY: 520,
  portals: [
    { x: 10, y: 438, w: 50, h: 60, targetMap: 'shuiDomain', targetX: 1800, targetY: 438, label: '返回·水之域' },
    { x: 1940, y: 438, w: 50, h: 60, targetMap: 'tuDomain', targetX: 200, targetY: 436, label: '土之域' }
  ],
  background: '熔岩河、火山口、灰烬'
};
