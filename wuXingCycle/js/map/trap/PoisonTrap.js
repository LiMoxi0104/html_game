// PoisonTrap：持续伤害区域陷阱（DoT）。
// variant 子形态：mist / spore / jet / updraft / quicksand / earthquake / tornado / grate
class PoisonTrap extends TrapBase {
  constructor(cfg) {
    super(cfg);
    this.tickMs = cfg.tickMs || 500;   // 每 tick 触发一次伤害
    this.tickTimer = 0;
    this.inside = false;
    this.variant = cfg.variant || "mist";
  }

  update(dt, player) {
    // 离开区域时重置计时，避免"蹭一下"也持续掉血
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
      // 走父类 onTrigger，自动继承 knockback 击退逻辑
      return super.onTrigger(player);
    }
    return null;
  }

  // ==================== 形态绘制（v5：poison 子形态） ====================
  draw(ctx) {
    ctx.save();
    switch (this.variant) {
      case "spore":     this._drawSpore(ctx); break;
      case "jet":       this._drawJet(ctx); break;
      case "updraft":   this._drawUpdraft(ctx); break;
      case "quicksand": this._drawQuicksand(ctx); break;
      case "earthquake":this._drawEarthquake(ctx); break;
      case "tornado":   this._drawTornado(ctx); break;
      case "grate":     this._drawGrate(ctx); break;
      default:          this._drawMist(ctx); break;
    }
    ctx.restore();
  }

  // ———— 默认 variant：毒雾（翻涌雾团 + 向上飘泡）————
  _drawMist(ctx) {
    ctx.fillStyle = "rgba(46, 139, 87, 0.30)";
    ctx.fillRect(this.x, this.y, this.w, this.h);

    const t = performance.now() / 400;
    ctx.fillStyle = "rgba(42, 230, 123, 0.6)";
    for (let i = 0; i < 4; i++) {
      const bx = this.x + 12 + i * (this.w / 4);
      const by = this.y + this.h - ((t + i * 0.5) % 1) * this.h;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 毒雾纹理（层叠半透明圆）
    ctx.fillStyle = "rgba(108, 191, 63, 0.2)";
    for (let i = 0; i < 5; i++) {
      const mx = this.x + 8 + (i * this.w) / 5 + Math.sin(t + i) * 8;
      const my = this.y + this.h / 2 + Math.cos(t * 0.7 + i) * this.h * 0.3;
      ctx.beginPath();
      ctx.arc(mx, my, this.w * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ———— spore：蘑菇喷孢子（蘑菇 + 孢子云雾向上扩散）————
  _drawSpore(ctx) {
    const now = performance.now() / 1000;
    // 蘑菇菌柄
    ctx.fillStyle = "#c8d4a0";
    ctx.fillRect(this.x + this.w * 0.35, this.y + this.h * 0.4, this.w * 0.3, this.h * 0.6);

    // 菌盖
    ctx.fillStyle = "#8b5e3c";
    ctx.beginPath();
    ctx.ellipse(this.x + this.w / 2, this.y + this.h * 0.4, this.w * 0.4, this.h * 0.25, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "#6b3f1f";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 菌盖斑点
    ctx.fillStyle = "rgba(255, 255, 200, 0.4)";
    for (let i = 0; i < 5; i++) {
      const sx = this.x + this.w * 0.25 + (i * this.w * 0.12);
      ctx.beginPath();
      ctx.arc(sx, this.y + this.h * 0.22, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 孢子云（向上飘散）
    for (let i = 0; i < 8; i++) {
      const phase = (now * 0.8 + i * 0.35) % 2;
      const sy = this.y - phase * this.h * 0.8;
      const sx = this.x + this.w * 0.15 + ((i * 0.7 + now * 0.3) % 1) * this.w * 0.7;
      const alpha = 1 - phase;
      ctx.fillStyle = `rgba(108, 191, 63, ${0.5 * alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + phase * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ———— jet：水柱（纵向高压喷流 + 水花）————
  _drawJet(ctx) {
    const now = performance.now() / 1000;
    const cx = this.x + this.w / 2;

    // 喷口
    ctx.fillStyle = "#334455";
    ctx.fillRect(this.x, this.y + this.h - 6, this.w, 6);
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y + this.h - 6, this.w, 6);

    // 喷流主体（向上）
    ctx.fillStyle = "rgba(40, 160, 220, 0.6)";
    ctx.fillRect(cx - this.w * 0.15, this.y, this.w * 0.3, this.h - 6);

    // 喷流水花（快速上升流体）
    for (let i = 0; i < 6; i++) {
      const jy = this.y + this.h - 6 - ((now * 120 + i * 23) % (this.h - 6));
      const jx = cx - 3 + Math.sin(now * 8 + i) * this.w * 0.12;
      ctx.fillStyle = "rgba(100, 200, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(jx, jy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 顶部水花溅射
    ctx.fillStyle = "rgba(180, 220, 255, 0.5)";
    for (let i = 0; i < 4; i++) {
      const sx = cx + Math.cos(now * 3 + i) * this.w * 0.25;
      ctx.beginPath();
      ctx.arc(sx, this.y + 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ———— updraft：上升气流（向上箭头 + 涡旋纹理）————
  _drawUpdraft(ctx) {
    const now = performance.now() / 1000;
    // 底色场
    ctx.fillStyle = "rgba(180, 210, 240, 0.15)";
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 上升气旋线
    ctx.strokeStyle = "rgba(200, 230, 255, 0.6)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const lx = this.x + this.w * 0.15 + (i * this.w * 0.22);
      ctx.beginPath();
      ctx.moveTo(lx, this.y + this.h);
      ctx.quadraticCurveTo(lx + Math.sin(now * 2 + i) * 8, this.y + this.h / 2, lx - 4, this.y);
      ctx.stroke();
    }

    // 向上箭头粒子
    for (let i = 0; i < 6; i++) {
      const phase = (now * 1.5 + i * 0.5) % 2;
      const py = this.y + this.h - phase * this.h;
      const px = this.x + 6 + (i * this.w) / 7 + Math.sin(now * 3 + i) * 5;
      ctx.fillStyle = `rgba(220, 240, 255, ${0.6 - phase * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 4, py + 6);
      ctx.lineTo(px + 4, py + 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ———— quicksand：流沙（棕黄涟漪 + 沉陷效果）————
  _drawQuicksand(ctx) {
    const now = performance.now() / 1000;
    // 沙面底色
    ctx.fillStyle = "rgba(180, 150, 90, 0.45)";
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 流沙同心涟漪
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    for (let r = 0; r < 3; r++) {
      const phase = (now * 1.0 + r * 1.2) % 3;
      const rr = Math.min(this.w, this.h) * 0.2 * phase;
      ctx.strokeStyle = `rgba(140, 110, 60, ${0.5 - phase * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 下沉粒子（棕色粒子向内螺旋）
    ctx.fillStyle = "rgba(120, 90, 40, 0.7)";
    for (let i = 0; i < 6; i++) {
      const dist = (now * 40 + i * 30) % Math.min(this.w, this.h) * 0.4;
      const ang = now * 1.2 + i * 1.05;
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ———— earthquake：地震裂（地面晃动纹 + 裂缝）————
  _drawEarthquake(ctx) {
    const now = performance.now() / 1000;
    const shake = Math.sin(now * 12) * 2;
    ctx.translate(shake, 0);

    // 裂土底色
    ctx.fillStyle = "rgba(100, 70, 40, 0.5)";
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 锯齿状裂缝
    ctx.strokeStyle = "#2a1000";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const cy = this.y + this.h / 2;
    ctx.moveTo(this.x, cy);
    for (let sx = this.x; sx < this.x + this.w; sx += 8) {
      ctx.lineTo(sx + 4, cy + (sx % 16 < 8 ? -4 : 4));
    }
    ctx.stroke();

    // 次级裂纹
    ctx.strokeStyle = "rgba(80, 40, 10, 0.7)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const fx = this.x + 15 + i * (this.w / 4);
      ctx.beginPath();
      ctx.moveTo(fx, cy);
      ctx.lineTo(fx + (i % 2 === 0 ? -8 : 8), cy - 10);
      ctx.stroke();
    }

    // 碎石
    ctx.fillStyle = "rgba(70, 40, 20, 0.8)";
    for (let i = 0; i < 5; i++) {
      const px = this.x + 8 + ((i * 17 + now * 30) % this.w);
      const py = this.y + 5 + ((i * 13 + now * 25) % this.h);
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ———— tornado：沙尘旋风（螺旋柱 + 棕黄粒子）————
  _drawTornado(ctx) {
    const now = performance.now() / 1000;
    const cx = this.x + this.w / 2;

    // 旋风柱（螺旋线）
    ctx.strokeStyle = "rgba(190, 150, 100, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const radius = this.w * 0.35 * (1 - t * 0.7);
      const px = cx + Math.cos(t * 8 + now * 3) * radius;
      const py = this.y + this.h - t * this.h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 旋转沙尘粒子
    for (let i = 0; i < 12; i++) {
      const t = (now * 0.4 + i * 0.25) % 1;
      const radius = this.w * 0.35 * (1 - t * 0.6);
      const px = cx + Math.cos(t * 6 + now * 3) * radius;
      const py = this.y + this.h - t * this.h;
      ctx.fillStyle = "rgba(180, 140, 80, 0.8)";
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ———— grate：过热格栅（金属格栅 + 红光 + 热浪上升）————
  _drawGrate(ctx) {
    const now = performance.now() / 1000;
    // 金属格栅面
    ctx.fillStyle = "#3a3030";
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 格栅横条
    ctx.strokeStyle = "#5a4a4a";
    ctx.lineWidth = 2;
    for (let gy = this.y + 3; gy < this.y + this.h; gy += 5) {
      ctx.beginPath();
      ctx.moveTo(this.x, gy);
      ctx.lineTo(this.x + this.w, gy);
      ctx.stroke();
    }

    // 格栅纵条
    for (let gx = this.x + 6; gx < this.x + this.w; gx += 8) {
      ctx.beginPath();
      ctx.moveTo(gx, this.y);
      ctx.lineTo(gx, this.y + this.h);
      ctx.stroke();
    }

    // 热浪光晕（向上）
    const heatAlpha = 0.15 + Math.sin(now * 2) * 0.1;
    for (let i = 0; i < 5; i++) {
      const hx = this.x + 4 + (i * this.w) / 5;
      const hy = this.y + this.h - ((now * 40 + i * 15) % this.h);
      ctx.fillStyle = `rgba(255, 80, 20, ${heatAlpha})`;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - 5, hy - 10);
      ctx.lineTo(hx + 5, hy - 10);
      ctx.closePath();
      ctx.fill();
    }

    // 红光闪烁
    const glowPulse = Math.sin(now * 6) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255, 100, 30, ${0.15 * glowPulse})`;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }
}
