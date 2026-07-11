// 水之域关卡数据
// 坐标系：左上角原点，x向右，y向下。所有数值单位为像素。
const levelShui = {
  platforms: [
    // 光滑冰面 (0-280)
    { x: 0, y: 500, w: 280, h: 15, type: 'ice_floor', slippery: true },
    // 浮动碎冰块 (300-600) 7块
    { x: 300, y: 490, w: 30, h: 15, type: 'ice_floe' },
    { x: 340, y: 480, w: 25, h: 15, type: 'ice_floe' },
    { x: 375, y: 495, w: 35, h: 15, type: 'ice_floe' },
    { x: 420, y: 485, w: 30, h: 15, type: 'ice_floe' },
    { x: 460, y: 490, w: 25, h: 15, type: 'ice_floe' },
    { x: 495, y: 480, w: 35, h: 15, type: 'ice_floe' },
    { x: 540, y: 495, w: 30, h: 15, type: 'ice_floe' },
    // 冰面恢复段 (580-700)
    { x: 580, y: 500, w: 120, h: 15, type: 'ice_floor', slippery: true },
    // 冻结喷泉冰柱台阶 (720-900)
    { x: 720, y: 480, w: 30, h: 20, type: 'ice_pillar' },
    { x: 760, y: 440, w: 30, h: 20, type: 'ice_pillar' },
    { x: 800, y: 400, w: 30, h: 20, type: 'ice_pillar' },
    { x: 840, y: 440, w: 30, h: 20, type: 'ice_pillar' },
    { x: 880, y: 480, w: 30, h: 20, type: 'ice_pillar' },
    // 水下管道1 (920-1080)
    { x: 920, y: 460, w: 160, h: 20, type: 'pipe_floor' },
    // 开阔水面浮冰 (1100-1250)
    { x: 1100, y: 490, w: 40, h: 15, type: 'ice_floe' },
    { x: 1150, y: 495, w: 40, h: 15, type: 'ice_floe' },
    { x: 1200, y: 490, w: 40, h: 15, type: 'ice_floe' },
    // 石笋柱平台 (1270-1430)
    { x: 1270, y: 480, w: 30, h: 20, type: 'stalagmite' },
    { x: 1320, y: 450, w: 25, h: 20, type: 'stalagmite' },
    { x: 1360, y: 470, w: 30, h: 20, type: 'stalagmite' },
    { x: 1410, y: 440, w: 25, h: 20, type: 'stalagmite' },
    // 冰面窄道 (1450-1580)
    { x: 1450, y: 500, w: 130, h: 15, type: 'ice_floor', slippery: true },
    // 水下管道2 (1600-1780)
    { x: 1600, y: 460, w: 180, h: 20, type: 'pipe_floor' },
    // 最后冰面平地 (1800-2000)
    { x: 1800, y: 500, w: 200, h: 15, type: 'ice_floor', slippery: true }
  ],
  hazards: [
    { x: 200, y: 480, w: 40, h: 30, type: 'water_jet', damage: 1, description: '高压水柱1' },
    { x: 380, y: 470, w: 20, h: 20, type: 'electric_orb', damage: 1, description: '带电水球1' },
    { x: 480, y: 470, w: 20, h: 20, type: 'electric_orb', damage: 1, description: '带电水球2' },
    { x: 620, y: 470, w: 80, h: 30, type: 'falling_icicle', damage: 2, description: '落冰锥区域' },
    { x: 710, y: 480, w: 40, h: 30, type: 'ice_gate', damage: 2, description: '冰闸门1' },
    { x: 960, y: 440, w: 40, h: 40, type: 'underwater_blade', damage: 2, description: '水下桨叶1' },
    { x: 1180, y: 475, w: 20, h: 20, type: 'electric_orb', damage: 1, description: '带电水球3' },
    { x: 1440, y: 480, w: 40, h: 30, type: 'ice_gate', damage: 2, description: '冰闸门2' },
    { x: 1680, y: 440, w: 40, h: 40, type: 'underwater_blade', damage: 2, description: '水下桨叶2' },
    { x: 1920, y: 480, w: 50, h: 20, type: 'ice_crack', damage: 1, description: '冰面碎裂区' }
  ],
  length: 2000,
  spawn: { x: 150, y: 436 },
  groundY: 520,
  portals: [
    { x: 10, y: 438, w: 50, h: 60, targetMap: 'muDomain', targetX: 1800, targetY: 438, label: '返回·木之域' },
    { x: 1940, y: 438, w: 50, h: 60, targetMap: 'huoDomain', targetX: 150, targetY: 438, label: '火之域' }
  ],
  background: '冰锥、水幕、深蓝湖底'
};
