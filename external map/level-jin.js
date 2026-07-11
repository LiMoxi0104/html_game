// 金之域关卡数据
// 坐标系：左上角原点，x向右，y向下。所有数值单位为像素。
const levelJin = {
  // 平台数据：所有可站立的地面、浮台、吊桥等
  platforms: [
    // 开局平坦金属地板 (0-300)
    { x: 0, y: 500, w: 300, h: 20, type: 'metal_floor' },
    // 铁链吊桥五节板 (坑宽160, x:340-500)
    { x: 340, y: 500, w: 30, h: 10, type: 'bridge' },
    { x: 372, y: 500, w: 30, h: 10, type: 'bridge_break', id: 1 }, // 碎裂
    { x: 404, y: 500, w: 30, h: 10, type: 'bridge_break', id: 2 },
    { x: 436, y: 500, w: 30, h: 10, type: 'bridge' },
    { x: 468, y: 500, w: 30, h: 10, type: 'bridge' },
    // 过桥后地面 (510-700)
    { x: 510, y: 500, w: 190, h: 20, type: 'metal_floor' },
    // 铆钉钢板台阶（逐级升高）(700-900)
    { x: 700, y: 480, w: 60, h: 20, type: 'metal_step' },
    { x: 770, y: 450, w: 60, h: 20, type: 'metal_step' },
    { x: 840, y: 420, w: 60, h: 20, type: 'metal_step' },
    // 巨大齿轮地面 (900-1100) 用三个齿轮表示
    { x: 900, y: 420, w: 66, h: 20, type: 'gear_floor' },
    { x: 967, y: 415, w: 66, h: 20, type: 'gear_floor' },
    { x: 1034, y: 420, w: 66, h: 20, type: 'gear_floor' },
    // 低矮通道后地面 (1100-1200)
    { x: 1130, y: 440, w: 70, h: 20, type: 'metal_floor' },
    // 第二个宽坑上的三个浮台 (1200-1350)
    { x: 1200, y: 440, w: 30, h: 15, type: 'floating_platform' },
    { x: 1260, y: 420, w: 30, h: 15, type: 'floating_platform_break', id: 3 },
    { x: 1320, y: 440, w: 30, h: 15, type: 'floating_platform' },
    // 透明玻璃地面 (1380-1500)
    { x: 1380, y: 440, w: 120, h: 10, type: 'glass_floor' },
    // 细小金属方块连续跳跃段 (1500-1700)
    { x: 1520, y: 460, w: 20, h: 20, type: 'small_block' },
    { x: 1550, y: 440, w: 20, h: 20, type: 'small_block' },
    { x: 1580, y: 420, w: 20, h: 20, type: 'small_block' },
    { x: 1610, y: 400, w: 20, h: 20, type: 'small_block' },
    { x: 1640, y: 420, w: 20, h: 20, type: 'small_block' },
    { x: 1670, y: 440, w: 20, h: 20, type: 'small_block' },
    // 金属管道内部地面 (1700-1850)
    { x: 1700, y: 440, w: 150, h: 20, type: 'pipe_floor' },
    // 最后一段平地 (1850-2000)
    { x: 1850, y: 500, w: 150, h: 20, type: 'metal_floor' }
  ],
  // 陷阱数据：伤害区域或触发式陷阱
  hazards: [
    { x: 80, y: 480, w: 80, h: 20, type: 'electric_grid', damage: 1, description: '地面电击网' },
    { x: 404, y: 500, w: 30, h: 10, type: 'bridge_break', damage: 1, description: '碎裂桥板1' },
    { x: 436, y: 500, w: 30, h: 10, type: 'bridge_break', damage: 1, description: '碎裂桥板2' },
    { x: 680, y: 470, w: 40, h: 30, type: 'dart_emitter', damage: 1, description: '右侧墙壁飞镖口1' },
    { x: 1110, y: 410, w: 30, h: 30, type: 'saw_blade', damage: 2, description: '低矮通道入口锯片' },
    { x: 1120, y: 410, w: 30, h: 30, type: 'saw_blade', damage: 2, description: '低矮通道出口锯片' },
    { x: 1260, y: 420, w: 30, h: 15, type: 'platform_break', damage: 1, description: '碎裂浮台' },
    { x: 1430, y: 440, w: 40, h: 10, type: 'glass_break', damage: 1, description: '玻璃碎裂区' },
    { x: 1850, y: 480, w: 60, h: 20, type: 'magnetic_field', damage: 0, slow: true, description: '磁力吸引区' },
    { x: 1780, y: 440, w: 60, h: 20, type: 'electric_grid', damage: 1, description: '管道内电网' },
    { x: 830, y: 480, w: 30, h: 30, type: 'dart_emitter', damage: 1, description: '右侧墙壁飞镖口2' }
  ],
  // 关卡总长
  length: 2000,
  // 背景风格提示
  background: '金属立柱、齿轮、蒸汽管道'
};
