// 土之域关卡数据
// 坐标系：左上角原点，x向右，y向下。所有数值单位为像素。
const levelTu = {
  platforms: [
    // 开局沙地 (0-300)
    { x: 0, y: 500, w: 300, h: 20, type: 'sand_floor' },
    // 风蚀岩柱群1 (320-520) 5根
    { x: 320, y: 480, w: 30, h: 40, type: 'sandstone_pillar' },
    { x: 370, y: 450, w: 30, h: 70, type: 'sandstone_pillar' },
    { x: 420, y: 420, w: 30, h: 100, type: 'sandstone_pillar_break', id: 1 },
    { x: 470, y: 460, w: 30, h: 60, type: 'sandstone_pillar' },
    { x: 520, y: 490, w: 30, h: 30, type: 'sandstone_pillar' },
    // 废墟石阶 (540-700)
    { x: 540, y: 480, w: 40, h: 20, type: 'ruin_step' },
    { x: 585, y: 450, w: 40, h: 20, type: 'ruin_step' },
    { x: 630, y: 420, w: 40, h: 20, type: 'ruin_step' },
    { x: 675, y: 390, w: 40, h: 20, type: 'ruin_step' },
    // 黏土安全平地 (720-850)
    { x: 720, y: 390, w: 130, h: 20, type: 'clay_floor' },
    // 半埋遗迹通道 (870-1000)
    { x: 870, y: 400, w: 130, h: 15, type: 'buried_floor' },
    // 干燥大地裂块 (1020-1180) 4段
    { x: 1020, y: 400, w: 30, h: 15, type: 'crack_platform' },
    { x: 1070, y: 400, w: 30, h: 15, type: 'crack_platform' },
    { x: 1120, y: 400, w: 30, h: 15, type: 'crack_platform_break', id: 3 },
    { x: 1170, y: 400, w: 30, h: 15, type: 'crack_platform' },
    // 倾斜砂岩坡 (1200-1320)
    { x: 1200, y: 380, w: 120, h: 15, type: 'sandstone_slope' },
    // 风蚀岩柱群2 (1340-1500) 3根高柱
    { x: 1340, y: 420, w: 25, h: 100, type: 'sandstone_pillar' },
    { x: 1400, y: 380, w: 25, h: 140, type: 'sandstone_pillar_break', id: 2 },
    { x: 1460, y: 430, w: 25, h: 90, type: 'sandstone_pillar' },
    // 巨大石板跳跃段 (1520-1680)
    { x: 1520, y: 420, w: 50, h: 15, type: 'stone_slab' },
    { x: 1580, y: 390, w: 50, h: 15, type: 'stone_slab' },
    { x: 1640, y: 420, w: 50, h: 15, type: 'stone_slab' },
    // 最后土石平台 (1700-2000)
    { x: 1700, y: 450, w: 300, h: 20, type: 'earth_platform' }
  ],
  hazards: [
    { x: 120, y: 480, w: 80, h: 20, type: 'quicksand', damage: 1, description: '流沙坑1' },
    { x: 420, y: 420, w: 30, h: 100, type: 'pillar_collapse', damage: 2, description: '崩塌岩柱1' },
    { x: 630, y: 420, w: 40, h: 20, type: 'rolling_boulder', damage: 3, description: '滚落巨石1触发点' },
    { x: 780, y: 370, w: 40, h: 20, type: 'earthquake_crack', damage: 1, description: '地震裂缝1' },
    { x: 920, y: 380, w: 90, h: 15, type: 'quicksand', damage: 1, description: '流沙坑2' },
    { x: 1120, y: 400, w: 30, h: 15, type: 'platform_break', damage: 1, description: '松散裂块' },
    { x: 1220, y: 380, w: 80, h: 15, type: 'rolling_boulder', damage: 3, description: '滚落巨石2触发点' },
    { x: 1400, y: 380, w: 25, h: 140, type: 'pillar_collapse', damage: 2, description: '崩塌岩柱2' },
    { x: 1600, y: 390, w: 40, h: 30, type: 'sand_tornado', damage: 1, slow: true, description: '移动沙尘龙卷' },
    { x: 1880, y: 430, w: 80, h: 20, type: 'earthquake_crack', damage: 1, description: '地震裂缝2' },
    { x: 1950, y: 450, w: 50, h: 20, type: 'platform_break', damage: 1, description: '终点前平台崩塌' }
  ],
  length: 2000,
  spawn: { x: 200, y: 436 },
  groundY: 520,
  portals: [
    { x: 10, y: 438, w: 50, h: 60, targetMap: 'huoDomain', targetX: 1800, targetY: 438, label: '返回·火之域' },
    { x: 1940, y: 388, w: 50, h: 60, targetMap: 'woodValley', targetX: 400, targetY: 410, label: '轮回·木幽谷' }
  ],
  background: '沙漠峡谷、风蚀蘑菇岩、沙尘暴'
};
