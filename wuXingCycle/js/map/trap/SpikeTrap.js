// SpikeTrap：尖刺陷阱（扩展示例）。周期性伸出尖刺，仅在“伸出”阶段造成伤害，
// 收回阶段即使玩家站在触发区也不受击，体现时序陷阱的节奏性。
class SpikeTrap extends TrapBase {
  constructor(cfg) {
    super(cfg);
    this.intervalMs = cfg.intervalMs || 1600;  // 一个完整周期
    this.activeMs = cfg.activeMs || 500;        // 伸出持续时长
    this.extended = false;
    this.cycleTimer = 0;
  }

  update(dt) {
    this.cycleTimer += dt;
    const m = this.cycleTimer % this.intervalMs;
    this.extended = m < this.activeMs;          // 周期前段为伸出窗口
  }

  // 仅在尖刺伸出时才检测玩家
  check(player, dt) {
    if (!this.extended) return null;
    return super.check(player, dt);
  }

  draw(ctx) {
    ctx.save();
    const baseY = this.y + this.h;
    if (this.extended) {
      // 伸出：画三角尖刺
      ctx.fillStyle = "#8b0000";
      const n = Math.max(1, Math.floor(this.w / 12));
      const sw = this.w / n;
      for (let i = 0; i < n; i++) {
        const sx = this.x + i * sw;
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx + sw / 2, this.y);
        ctx.lineTo(sx + sw, baseY);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // 收回：画地面基座
      ctx.fillStyle = "rgba(79,66,52,0.9)";
      ctx.fillRect(this.x, baseY - 6, this.w, 6);
    }
    ctx.restore();
  }
}
