// ShockWave：重击卡肉波纹 / 弹反火花骨架（阶段1 预留）。
// 设计要点：重击命中触发 timeScale=0.1/freezeTimer=100ms 全局时停 + 水墨放射波纹；
// 弹反成功触发 timeScale=0.2/freezeTimer=67ms + 金属火花，震动幅度减半。
class ShockWave {
  constructor(x, y, color) {
    this.x = x; this.y = y; this.color = color || "#1a1a1a";
    this.radius = 4; this.life = 1; this.done = false;
  }
  update(dt) { /* 阶段2 实现半径扩散与淡出 */ }
  draw(ctx) { /* 阶段2 实现 */ }
}
