// ParrySystem：匕首弹反系统（阶段1骨架，逻辑预留）。
// 设计要点（供阶段2实现）：
//   - 判定窗口：敌方攻击命中前 0.2s 内按下 L 为完美弹反，触发卡肉 timeScale=0.2/freezeTimer=67ms
//   - 失败时无格挡动画，角色直接受击后退
//   - 弹反动画期间存在短暂无敌帧，规避连续伤害
//   - 仅对敌方攻击生效，陷阱/持续毒素不可弹反
class ParrySystem {
  constructor(player, consts) {
    this.player = player;
    this.consts = consts;
    this.active = false;     // 弹反窗口是否开启
    this.invuln = 0;        // 弹反无敌帧剩余 ms
    this.windowMs = 200;    // 完美弹反判定窗口（敌方攻击前 0.2s）
  }
  trigger() { /* 阶段2 实现 */ }
  update(dt) { /* 阶段2 实现 */ }
  draw(ctx) { /* 阶段2 实现 */ }
}
