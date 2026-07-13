// SpikeTrap：电击网陷阱 + 通用尖刺陷阱（周期性 on/off）
// 仅处理 electricGrid 类型；其他 spike 子形态已迁移到独立 xianjingUI 精灵类
// 不再加载任何外部图片，绘制通过 Canvas 原生完成

class SpikeTrap extends TrapBase {

  constructor(cfg) {
    super(cfg);
    this.cycleTimer = 0;
    this.extended = false;
    this.intervalMs = cfg.intervalMs || 1800;
    this.activeMs  = cfg.activeMs  || 500;
  }

  update(dt) {
    this.cycleTimer += dt;
    const m = this.cycleTimer % this.intervalMs;
    this.extended = m < this.activeMs;
  }

  // 仅在伤害窗口（extended）触发
  check(player, dt) {
    if (!this.extended) return null;
    return super.check(player, dt);
  }

  // 完美闪避检测：仅在 extended 状态下检测
  checkAtPosition(rect) {
    if (!this.extended) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return { type: this.type, damage: this.damage, trap: this };
    }
    return null;
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    if (this.type === "electricGrid") {
      this._drawElectricGrid(ctx);
    } else {
      // 默认回退：红色半透明矩形
      ctx.fillStyle = this.extended
        ? "rgba(180,40,20,0.7)"
        : "rgba(80,30,20,0.4)";
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
    ctx.restore();
  }

  // ———— electricGrid：青蓝电网（地面平铺 + 电弧闪烁）————
  _drawElectricGrid(ctx) {
    const baseY = this.y + this.h;
    if (this.extended) {
      const now = performance.now() / 1000;
      // 电网底色
      ctx.fillStyle = "rgba(10, 180, 220, 0.3)";
      ctx.fillRect(this.x, this.y, this.w, this.h);

      // 电网横格线
      ctx.strokeStyle = "#3fd0ff";
      ctx.lineWidth = 1.5;
      for (let gy = this.y + 4; gy < baseY; gy += 6) {
        ctx.beginPath();
        ctx.moveTo(this.x, gy);
        ctx.lineTo(this.x + this.w, gy);
        ctx.stroke();
      }

      // 电网竖格线
      for (let gx = this.x + 4; gx < this.x + this.w; gx += 10) {
        ctx.beginPath();
        ctx.moveTo(gx, this.y);
        ctx.lineTo(gx, baseY);
        ctx.stroke();
      }

      // 电弧闪烁
      const arcCount = 2 + Math.floor(Math.sin(now * 5) * 1.5);
      for (let a = 0; a < arcCount; a++) {
        const ax1 = this.x + ((a * 30 + now * 40) % this.w);
        const ax2 = ax1 + 15 + Math.sin(now * 7 + a) * 10;
        const ay = this.y + 4 + (a % 3) * 8;
        ctx.strokeStyle = "rgba(100, 240, 255, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax1, ay);
        ctx.lineTo(ax1 + 6, ay - 6);
        ctx.quadraticCurveTo((ax1 + ax2) / 2, ay + 4, ax2, ay + 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(200, 255, 255, 0.6)";
        ctx.stroke();
      }

      // 电极触点
      ctx.fillStyle = "#00ffff";
      for (let i = 0; i < 3; i++) {
        const ex = this.x + 5 + i * (this.w / 3);
        ctx.beginPath();
        ctx.arc(ex, this.y + 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, baseY - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 未激活：暗色基座
      ctx.fillStyle = "rgba(30, 60, 80, 0.5)";
      ctx.fillRect(this.x, baseY - 5, this.w, 5);
      // 微光电极
      ctx.fillStyle = "rgba(0, 100, 140, 0.5)";
      for (let i = 0; i < 3; i++) {
        const ex = this.x + 5 + i * (this.w / 3);
        ctx.beginPath();
        ctx.arc(ex, baseY - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
