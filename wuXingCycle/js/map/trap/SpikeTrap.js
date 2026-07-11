// SpikeTrap：尖刺陷阱 + 周期性伤害陷阱（含 electricGrid）。
// variant 子形态：thorn / lava / boulder / icegate / dragon / firewall / flytrap / thorn_vine / pillar
// electricGrid 也使用本类的周期性 on/off 逻辑，但独立绘制形态
class SpikeTrap extends TrapBase {
  constructor(cfg) {
    super(cfg);
    this.intervalMs = cfg.intervalMs || 1600;  // 一个完整周期
    this.activeMs = cfg.activeMs || 500;        // 伸出/激活持续时长
    this.extended = false;
    this.cycleTimer = 0;
    this.variant = cfg.variant || (this.type === "electricGrid" ? null : "thorn");
  }

  update(dt) {
    this.cycleTimer += dt;
    const m = this.cycleTimer % this.intervalMs;
    this.extended = m < this.activeMs;          // 周期前段为伸出窗口
  }

  // 仅在尖刺伸出 / 电击激活时才检测玩家
  check(player, dt) {
    if (!this.extended) return null;
    return super.check(player, dt);
  }

  // ==================== 形态绘制（v5：spike 子形态 + electricGrid） ====================
  draw(ctx) {
    ctx.save();
    if (this.type === "electricGrid") {
      this._drawElectricGrid(ctx);
    } else {
      // spike 系列：按 variant 分发
      switch (this.variant) {
        case "lava":        this._drawLavaEruption(ctx); break;
        case "boulder":     this._drawBoulder(ctx); break;
        case "icegate":     this._drawIceGate(ctx); break;
        case "dragon":      this._drawDragonHead(ctx); break;
        case "firewall":    this._drawFireWall(ctx); break;
        case "flytrap":     this._drawFlytrap(ctx); break;
        case "thorn_vine":  this._drawThornVine(ctx); break;
        case "pillar":      this._drawPillar(ctx); break;
        default:            this._drawThorn(ctx); break;
      }
    }
    ctx.restore();
  }

  // ———— 默认 variant：荆棘尖刺（三角刺从地面伸出）————
  _drawThorn(ctx) {
    const baseY = this.y + this.h;
    if (this.extended) {
      ctx.fillStyle = "#8b6b4a";
      const n = Math.max(1, Math.floor(this.w / 12));
      const sw = this.w / n;
      for (let i = 0; i < n; i++) {
        const sx = this.x + i * sw;
        const tipY = this.y + 2;
        ctx.beginPath();
        ctx.moveTo(sx, baseY);
        ctx.lineTo(sx + sw / 2, tipY);
        ctx.lineTo(sx + sw, baseY);
        ctx.closePath();
        ctx.fill();
      }
      // 刺尖高光
      ctx.fillStyle = "#a08870";
      for (let i = 0; i < n; i++) {
        const sx = this.x + i * sw + sw * 0.25;
        const tipY = this.y + 4;
        ctx.beginPath();
        ctx.moveTo(sx, baseY - 2);
        ctx.lineTo(sx + sw * 0.5, tipY);
        ctx.lineTo(sx + sw * 0.5, baseY - 2);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(79,66,52,0.75)";
      ctx.fillRect(this.x, baseY - 6, this.w, 6);
    }
  }

  // ———— lava：熔岩喷柱（橙红 + 纵向粒子向上溅射）————
  _drawLavaEruption(ctx) {
    const now = performance.now() / 1000;
    const baseY = this.y + this.h;
    if (this.extended) {
      // 喷柱主体
      const gradient = ctx.createLinearGradient(this.x, this.y, this.x, baseY);
      gradient.addColorStop(0, "#ff4400");
      gradient.addColorStop(0.5, "#ff8800");
      gradient.addColorStop(1, "#cc2200");
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x + 4, this.y, this.w - 8, this.h);
      // 粒子喷溅
      for (let i = 0; i < 6; i++) {
        const py = this.y + ((now * 80 + i * 17) % this.h);
        const px = this.x + 6 + (i * this.w) / 7;
        ctx.fillStyle = "rgba(255, 200, 50, 0.9)";
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(80, 30, 10, 0.7)";
      ctx.fillRect(this.x, baseY - 8, this.w, 8);
      // 余烬光点
      ctx.fillStyle = "rgba(255, 100, 20, 0.5)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(this.x + 3 + i * (this.w / 3), baseY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ———— boulder：圆形滚石（圆角大石 + 滚动效果）————
  _drawBoulder(ctx) {
    const now = performance.now() / 1000;
    const cy = this.y + this.h / 2;
    const r = Math.min(this.w, this.h) * 0.45;
    const cx = this.x + this.w / 2 + (this.extended ? Math.sin(now * 3) * 4 : 0);

    // 石头主体
    const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, "#b0a090");
    gradient.addColorStop(0.7, "#706050");
    gradient.addColorStop(1, "#4a3a2a");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 转动纹理标记
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a = now * 1.5 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.65, a, a + 0.5);
      ctx.stroke();
    }

    if (!this.extended) {
      // 静止状态：石台基座
      ctx.fillStyle = "rgba(60,40,20,0.6)";
      ctx.fillRect(this.x, this.y + this.h - 6, this.w, 6);
    }
  }

  // ———— icegate：冰闸之门（蓝冰矩形块 + 霜纹）————
  _drawIceGate(ctx) {
    const baseY = this.y + this.h;
    if (this.extended) {
      // 冰柱主体
      const gradient = ctx.createLinearGradient(this.x, this.y, this.x, baseY);
      gradient.addColorStop(0, "#99ccff");
      gradient.addColorStop(0.5, "#66aadd");
      gradient.addColorStop(1, "#3388bb");
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x, this.y, this.w, this.h);

      // 冰霜纹路
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const lx = this.x + 4 + (i * this.w) / 4;
        ctx.beginPath();
        ctx.moveTo(lx, this.y + 2);
        ctx.lineTo(lx - 5, this.y + this.h * 0.5);
        ctx.lineTo(lx + 3, baseY - 2);
        ctx.stroke();
      }

      // 顶部冰刺
      ctx.fillStyle = "#ddeeff";
      ctx.beginPath();
      ctx.moveTo(this.x + this.w * 0.2, this.y);
      ctx.lineTo(this.x + this.w * 0.35, this.y - 8);
      ctx.lineTo(this.x + this.w * 0.5, this.y);
      ctx.lineTo(this.x + this.w * 0.65, this.y - 6);
      ctx.lineTo(this.x + this.w * 0.8, this.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(80, 140, 180, 0.5)";
      ctx.fillRect(this.x, baseY - 6, this.w, 6);
    }
  }

  // ———— dragon：龙首喷火（兽首 + 火焰喷射口）————
  _drawDragonHead(ctx) {
    const baseY = this.y + this.h;
    // 底座/龙首
    ctx.fillStyle = "#4a3030";
    ctx.fillRect(this.x + 2, baseY - 14, this.w - 4, 14);

    // 龙首轮廓（简化鼻吻）
    ctx.fillStyle = "#5a2828";
    ctx.beginPath();
    ctx.moveTo(this.x + 4, baseY - 14);
    ctx.lineTo(this.x + this.w - 4, baseY - 14);
    ctx.lineTo(this.x + this.w + 4, baseY - 22);
    ctx.lineTo(this.x + this.w / 2 + 3, baseY - 26);
    ctx.lineTo(this.x - 4, baseY - 22);
    ctx.closePath();
    ctx.fill();

    // 眼睛（红光）
    ctx.fillStyle = "#ff2200";
    ctx.beginPath();
    ctx.arc(this.x + this.w * 0.3, baseY - 20, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + this.w * 0.7, baseY - 20, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (this.extended) {
      // 火焰喷出
      const now = performance.now() / 1000;
      const flameLength = this.h * 0.7;
      for (let fl = 0; fl < 5; fl++) {
        const fy = baseY - 26 - fl * (flameLength / 5) + Math.sin(now * 10 + fl) * 3;
        const alpha = 1 - fl * 0.18;
        ctx.fillStyle = `rgba(255, ${100 + fl * 30}, 10, ${alpha})`;
        ctx.beginPath();
        const fw = this.w * 0.3 * (1 - fl * 0.15);
        ctx.moveTo(this.x + this.w / 2 - fw, fy);
        ctx.lineTo(this.x + this.w / 2, fy - 8 - fl * 3);
        ctx.lineTo(this.x + this.w / 2 + fw, fy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // ———— firewall：追击火墙（全幅红墙 + 粒子滚动）————
  _drawFireWall(ctx) {
    const now = performance.now() / 1000;
    if (this.extended) {
      // 火墙主体
      const gradient = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
      gradient.addColorStop(0, "#ff6600");
      gradient.addColorStop(0.4, "#ff3300");
      gradient.addColorStop(0.7, "#cc1100");
      gradient.addColorStop(1, "#880000");
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x, this.y, this.w, this.h);

      // 火焰波浪纹
      for (let row = 0; row < 6; row++) {
        const ry = this.y + 8 + row * (this.h / 6);
        ctx.strokeStyle = `rgba(255, 220, 50, ${0.4 - row * 0.05})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, ry + Math.sin(now * 4 + row) * 3);
        for (let sx = 0; sx < this.w; sx += 8) {
          ctx.lineTo(this.x + sx, ry + Math.sin(now * 5 + sx * 0.3 + row) * 4);
        }
        ctx.stroke();
      }

      // 火星粒子
      for (let i = 0; i < 10; i++) {
        const px = this.x + ((i * 17 + now * 50) % this.w);
        const py = this.y + ((i * 23 + now * 60) % this.h);
        ctx.fillStyle = "rgba(255, 255, 100, 0.8)";
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(60, 25, 10, 0.6)";
      ctx.fillRect(this.x, this.y + this.h - 8, this.w, 8);
    }
  }

  // ———— flytrap：捕蝇草（V 形夹 + 绿色尖牙）————
  _drawFlytrap(ctx) {
    const now = performance.now() / 1000;
    const baseY = this.y + this.h;
    const cx = this.x + this.w / 2;
    const stemH = this.h * 0.3;

    if (this.extended) {
      // 双瓣张开
      const openAngle = 0.4 + Math.sin(now * 2) * 0.2;
      // 左瓣
      ctx.fillStyle = "#3d8b3d";
      ctx.beginPath();
      ctx.moveTo(cx - 4, baseY - stemH);
      ctx.quadraticCurveTo(cx - this.w * 0.3, this.y + this.h * 0.1, cx - this.w * 0.5, this.y + this.h * 0.05);
      ctx.lineTo(cx - this.w * 0.35, this.y + this.h * 0.15);
      ctx.quadraticCurveTo(cx, this.y + this.h * 0.3, cx - 2, baseY - stemH);
      ctx.closePath();
      ctx.fill();
      // 右瓣
      ctx.beginPath();
      ctx.moveTo(cx + 4, baseY - stemH);
      ctx.quadraticCurveTo(cx + this.w * 0.3, this.y + this.h * 0.1, cx + this.w * 0.5, this.y + this.h * 0.05);
      ctx.lineTo(cx + this.w * 0.35, this.y + this.h * 0.15);
      ctx.quadraticCurveTo(cx, this.y + this.h * 0.3, cx + 2, baseY - stemH);
      ctx.closePath();
      ctx.fill();
      // 尖牙
      ctx.fillStyle = "#ffffff";
      for (let t = 0; t < 5; t++) {
        const ty = this.y + this.h * 0.12 + t * (this.h * 0.12);
        ctx.beginPath();
        ctx.moveTo(cx - 6 - t, ty);
        ctx.lineTo(cx - 2, ty - 4);
        ctx.lineTo(cx + 6 + t, ty);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // 闭合状态
      ctx.fillStyle = "#2d6b2d";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - this.h * 0.3, this.w * 0.35, this.h * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4a9a4a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ———— thorn_vine：荆棘藤蔓（盘旋藤蔓 + 尖刺）————
  _drawThornVine(ctx) {
    const now = performance.now() / 1000;
    const baseY = this.y + this.h;
    if (this.extended) {
      // 藤蔓主茎
      ctx.strokeStyle = "#4a6030";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.x + this.w / 2, baseY);
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const px = this.x + this.w / 2 + Math.sin(t * 3 + now) * this.w * 0.35;
        const py = baseY - t * this.h;
        ctx.lineTo(px, py);
      }
      ctx.stroke();

      // 侧刺
      ctx.fillStyle = "#2a4010";
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const px = this.x + this.w / 2 + Math.sin(t * 3 + now) * this.w * 0.35;
        const py = baseY - t * this.h;
        const side = (i % 2 === 0) ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + side * 8, py - 5);
        ctx.lineTo(px, py + 3);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(50, 70, 30, 0.6)";
      ctx.fillRect(this.x, baseY - 4, this.w, 4);
    }
  }

  // ———— pillar：崩塌柱（矩形石柱 + 裂缝）————
  _drawPillar(ctx) {
    const baseY = this.y + this.h;
    // 柱体
    ctx.fillStyle = "#8a7a60";
    ctx.fillRect(this.x + 2, this.y, this.w - 4, this.h);
    ctx.strokeStyle = "#6a5a40";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x + 2, this.y, this.w - 4, this.h);

    // 纵向裂缝
    ctx.strokeStyle = "#3a2a10";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(this.x + this.w * 0.4, this.y);
    ctx.lineTo(this.x + this.w * 0.55, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.extended) {
      // 碎石下落粒子
      const now = performance.now() / 1000;
      for (let i = 0; i < 5; i++) {
        const px = this.x + 4 + (i * this.w) / 5;
        const py = this.y + ((now * 60 + i * 13) % this.h);
        ctx.fillStyle = "rgba(100, 80, 50, 0.7)";
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
