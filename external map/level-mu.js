// 木之域关卡数据
// 坐标系：左上角原点，x向右，y向下。所有数值单位为像素。
const levelMu = {
  platforms: [
    // 开局木头平地 (0-350)
    { x: 0, y: 500, w: 350, h: 20, type: 'wood_floor' },
    // 粗树干桥 (坑宽180, x:380-560)
    { x: 380, y: 500, w: 180, h: 25, type: 'log_bridge' },
    // 叶片路面 (580-830)
    { x: 580, y: 480, w: 40, h: 15, type: 'leaf_platform', bounce: true },
    { x: 630, y: 480, w: 40, h: 15, type: 'leaf_platform', bounce: true },
    { x: 680, y: 480, w: 40, h: 15, type: 'leaf_platform', bounce: true },
    { x: 730, y: 480, w: 40, h: 15, type: 'leaf_platform', bounce: true },
    { x: 780, y: 480, w: 40, h: 15, type: 'leaf_platform', bounce: true },
    // 藤蔓网桥 (850-1050)
    { x: 850, y: 500, w: 30, h: 8, type: 'vine_bridge' },
    { x: 890, y: 500, w: 30, h: 8, type: 'vine_bridge_break', id: 1 },
    { x: 930, y: 500, w: 30, h: 8, type: 'vine_bridge_break', id: 2 },
    { x: 970, y: 500, w: 30, h: 8, type: 'vine_bridge' },
    { x: 1010, y: 500, w: 30, h: 8, type: 'vine_bridge' },
    { x: 1050, y: 500, w: 30, h: 8, type: 'vine_bridge' },
    // 气生根低矮通道地面 (1080-1200)
    { x: 1080, y: 460, w: 120, h: 20, type: 'root_floor' },
    // 中空树干内部 (1220-1400)
    { x: 1220, y: 460, w: 180, h: 20, type: 'hollow_log_floor' },
    // 蘑菇平台跳跃段 (1420-1620)
    { x: 1420, y: 480, w: 50, h: 20, type: 'mushroom_platform' },
    { x: 1480, y: 440, w: 40, h: 20, type: 'mushroom_platform' },
    { x: 1530, y: 400, w: 60, h: 20, type: 'mushroom_platform' },
    { x: 1590, y: 440, w: 40, h: 20, type: 'mushroom_platform' },
    // 倾斜气生根台阶 (1640-1800)
    { x: 1640, y: 460, w: 50, h: 20, type: 'root_step' },
    { x: 1695, y: 440, w: 50, h: 20, type: 'root_step' },
    { x: 1750, y: 420, w: 50, h: 20, type: 'root_step' },
    // 第二根树干桥 (1820-1950)
    { x: 1820, y: 500, w: 130, h: 15, type: 'thin_log_bridge' },
    // 终点平地 (1970-2000)
    { x: 1970, y: 500, w: 30, h: 20, type: 'wood_floor' }
  ],
  hazards: [
    { x: 120, y: 480, w: 60, h: 20, type: 'thorn_spike', damage: 1, description: '地面荆棘刺1' },
    { x: 220, y: 480, w: 60, h: 20, type: 'thorn_spike', damage: 1, description: '地面荆棘刺2' },
    { x: 320, y: 480, w: 60, h: 20, type: 'thorn_spike', damage: 1, description: '地面荆棘刺3' },
    { x: 420, y: 460, w: 30, h: 30, type: 'spike_ball', damage: 2, description: '刺木摆锤1' },
    { x: 500, y: 460, w: 30, h: 30, type: 'spike_ball', damage: 2, description: '刺木摆锤2' },
    { x: 770, y: 460, w: 40, h: 30, type: 'flytrap', damage: 2, description: '捕蝇夹1' },
    { x: 890, y: 500, w: 30, h: 8, type: 'bridge_break', damage: 1, description: '藤桥断裂1' },
    { x: 930, y: 500, w: 30, h: 8, type: 'bridge_break', damage: 1, description: '藤桥断裂2' },
    { x: 1120, y: 440, w: 60, h: 20, type: 'spore_mushroom', damage: 0, slow: true, description: '麻痹蘑菇' },
    { x: 1580, y: 400, w: 60, h: 20, type: 'spore_mushroom', damage: 0, blind: true, description: '视野遮挡孢子' },
    { x: 1670, y: 450, w: 50, h: 20, type: 'thorn_spike', damage: 1, description: '气生根台阶荆棘' },
    { x: 1900, y: 500, w: 40, h: 15, type: 'log_break', damage: 1, description: '腐朽树干断裂' },
    { x: 1980, y: 480, w: 20, h: 20, type: 'thorn_vine', damage: 1, description: '终点前伸缩藤蔓' }
  ],
  length: 2000,
  spawn: { x: 150, y: 436 },
  groundY: 520,
  portals: [
    { x: 10, y: 438, w: 50, h: 60, targetMap: 'jinDomain',   targetX: 1800, targetY: 438,  label: '返回·金之域' },
    { x: 1940, y: 438, w: 50, h: 60, targetMap: 'shuiDomain', targetX: 150,  targetY: 438,  label: '水之域' }
  ],
  background: '巨树、发光蘑菇、垂藤'
};
