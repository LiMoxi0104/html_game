// CeilingSawTrap：天花板锯片陷阱（圆形碰撞体）。
// 继承 TrapBase 的伤害/击退/特殊行为，将矩形 AABB 碰撞替换为与视觉锯片边缘精确对齐的圆形判定。
// 锯片位置与 _drawCeilingSaw 保持严格一致：圆心(cx, bladeY)，半径 bladeR + 5（含锯齿尖）。
class CeilingSawTrap extends TrapBase {
  constructor(cfg) {
    super(cfg);

    // 与 _drawCeilingSaw 完全一致的视觉参数
    this.bladeR = Math.min(this.w, this.h) * 0.4;   // 锯片主体半径
    this.sawCx = this.x + this.w / 2;                // 锯片圆心 X
    this.sawCy = this.y + this.bladeR + 2;           // 锯片圆心 Y（悬挂偏移）
    this.collisionR = this.bladeR + 5;               // 碰撞半径 = 主体 + 锯齿尖
  }

  // 返回圆形碰撞体描述，供调试可视化使用
  getCircle() {
    return { cx: this.sawCx, cy: this.sawCy, r: this.collisionR };
  }

  // 圆形 vs 玩家矩形碰撞检测
  check(player, dt) {
    if (!this.active) return null;
    if (Collision.circleRect(this.sawCx, this.sawCy, this.collisionR, player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 完美闪避检测：圆形 vs 残留矩形
  checkAtPosition(rect) {
    if (!this.active) return null;
    if (Collision.circleRect(this.sawCx, this.sawCy, this.collisionR, rect)) {
      return { type: this.type, damage: this.damage, trap: this };
    }
    return null;
  }
}
