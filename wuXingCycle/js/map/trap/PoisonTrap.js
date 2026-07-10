// PoisonTrap：毒沼陷阱（扩展示例）。玩家停留在触发区内时，按 tickMs 周期持续扣血（DoT），
// 离开区域重置计时。体现“持续伤害型”陷阱，区别于瞬时尖刺。
class PoisonTrap extends TrapBase {
  constructor(cfg) {
    super(cfg);
    this.tickMs = cfg.tickMs || 500;   // 每 tick 触发一次伤害
    this.tickTimer = 0;
    this.inside = false;
  }

  update(dt, player) {
    // 离开区域时重置计时，避免“蹭一下”也持续掉血
    if (!this.inside) this.tickTimer = 0;
    this.inside = false;
  }

  check(player, dt) {
    if (!Collision.rectOverlap(this.getRect(), player.getRect())) {
      return null; // update 中已重置 tickTimer
    }
    this.inside = true;
    this.tickTimer += dt; // 按真实帧间隔累加，到 tickMs 触发一次伤害
    if (this.tickTimer >= this.tickMs) {
      this.tickTimer = 0;
      player.takeDamage(this.damage);
      return { type: "poison", damage: this.damage };
    }
    return null;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(46,139,87,0.30)";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 冒泡装饰
    ctx.fillStyle = "rgba(46,139,87,0.6)";
    const t = performance.now() / 400;
    for (let i = 0; i < 4; i++) {
      const bx = this.x + 12 + i * (this.w / 4);
      const by = this.y + this.h - ((t + i * 0.5) % 1) * this.h;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
