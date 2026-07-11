// TrapBase：陷阱父类（v2 增加击退弹开）。
// 所有地图陷阱继承此类，统一包含：
//   触发区矩形、update 状态推进、check 与玩家 Collision 对接、onTrigger 效果结算、draw 绘制。
//
// 击退系统（v2）：
//   从配置读取 knockback / knockbackX / knockbackY 参数。
//   弹开方向以陷阱中心为参考：玩家在左侧→向右弹，在右侧→向左弹。
//   地面受击时额外叠加垂直初速度（挑飞），确保脱离伤害区。
//   子类无需修改代码，仅在 mapConfig.json 中添加参数即自动获得击退能力。
class TrapBase {
  constructor(cfg) {
    this.id = cfg.id;
    this.type = cfg.type || "unknown";
    this.x = cfg.x;
    this.y = cfg.y;
    this.w = cfg.width;
    this.h = cfg.height;
    this.damage = cfg.damage || 0;
    this.active = true;      // 是否启用
    this.timer = 0;

    // 击退参数（配置层可选）
    this.knockback = cfg.knockback || 0;          // 总击退力度（px），兼容简写模式
    this.knockbackX = cfg.knockbackX || 0;        // 水平击退 px
    this.knockbackY = cfg.knockbackY || 0;        // 垂直弹起 px/s（负值=向上）

    // 特殊行为标记（v3）
    this.slow = cfg.slow || false;                // 触发后减速玩家
    this.blind = cfg.blind || false;              // 触发后致盲玩家

    // 子形态标记（v5）：用于在同类型下区分不同视觉母题
    this.variant = cfg.variant || null;
  }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  // 陷阱中心 X 坐标（用于方向计算）
  getCenterX() { return this.x + this.w / 2; }

  update(dt) { this.timer += dt; }

  // 与玩家矩形做 Collision 对接；重叠则返回效果描述，否则 null
  check(player, dt) {
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 默认效果：造成伤害 + 击退弹开。子类可重写 onTrigger 自定义行为。
  // ★ v4 增强：takeDamage 返回 false 表示被弹反拦截，跳过后续击退
  onTrigger(player) {
    // ★ v4 调用新版 takeDamage（传入 trap 引用供弹反反伤/日志用）
    const damageApplied = player.takeDamage(this.damage, this);

    if (!damageApplied) {
      // 弹反成功！伤害被拦截，跳过击退
      console.log(`[TrapBase] ${this.id} 伤害被弹反拦截！`);
      return { type: this.type, damage: this.damage, _parried: true };
    }

    // —— 特殊行为：减速 / 致盲 ——
    if (this.slow && player.applySlow) {
      player.applySlow(1500);  // 减速持续 1.5 秒
    }
    if (this.blind && player.applyBlind) {
      player.applyBlind(2000); // 致盲持续 2 秒
    }

    // —— 击退逻辑 ——
    const kbTotal = this.knockback;
    if (kbTotal > 0) {
      // 简写模式：未分别指定 X/Y 时自动拆分
      const kbx = this.knockbackX || kbTotal;
      const kby = this.knockbackY || Math.min(-kbTotal * 0.5, -6);  // 默认向上弹起
      this._applyKnockback(player, kbx, kby);
    } else if (this.knockbackX !== 0 || this.knockbackY !== 0) {
      // 独立 X/Y 模式
      this._applyKnockback(player, this.knockbackX, this.knockbackY);
    }

    return { type: this.type, damage: this.damage };
  }

  // 核心击退实现：方向计算 + 施加速度 + 边界钳制
  _applyKnockback(player, forceX, forceY) {
    if (forceX === 0 && forceY === 0) return;

    const trapCx = this.getCenterX();
    const playerCx = player.x + player.w / 2;

    // 水平方向：远离陷阱中心
    const dir = (playerCx >= trapCx) ? 1 : -1;
    player.vx = dir * Math.abs(forceX);

    // 垂直方向：若在地面上则叠加向上速度（挑飞效果）
    if (forceY !== 0 && player.onGround) {
      player.vy = forceY;     // 通常为负值（向上）
      player.onGround = false;
    }

    console.log(`[TrapBase] ${this.id} 击退 → vx:${player.vx.toFixed(1)} vy:${player.vy.toFixed(1)} dir:${dir > 0 ? "右" : "左"}`);
  }

  // ==================== 完美闪避检测接口 ====================

  // 检测指定矩形区域是否与本陷阱的伤害判定区重叠。
  // 用于完美闪避系统：传入玩家闪避前的残留碰撞箱，若重叠则说明"本该命中但被闪避躲掉"。
  // 返回：{ type, damage, trap: this } 表示会命中；null 表示安全。
  checkAtPosition(rect) {
    if (!this.active) return null;
    // 对于尖刺陷阱（SpikeTrap），仅在 extended 状态下检测
    if (this.type === "spike" && !this.extended) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return { type: this.type, damage: this.damage, trap: this };
    }
    return null;
  }

  // ==================== 形态绘制（v5：9种独立视觉，按 type 分发） ====================
  // 注意：spike（含 electricGrid）由 SpikeTrap.draw() 处理
  //       poison 由 PoisonTrap.draw() 处理
  //       以下 6 种类型在本类中绘制
  draw(ctx) {
    ctx.save();
    switch (this.type) {
      case "crackedBridge":   this._drawCrackedBridge(ctx); break;
      case "crackedPlatform": this._drawCrackedPlatform(ctx); break;
      case "crackedGlass":    this._drawCrackedGlass(ctx); break;
      case "dartLauncher":    this._drawDartLauncher(ctx); break;
      case "ceilingSaw":      this._drawCeilingSaw(ctx); break;
      case "magnetField":     this._drawMagnetField(ctx); break;
      default:
        ctx.fillStyle = "rgba(122,31,31,0.35)";
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }
    ctx.restore();
  }

  // ———— crackedBridge：过道缺口，木/铁链桥板 + 深邃裂缝（即死 999）————
  _drawCrackedBridge(ctx) {
    const now = performance.now() / 1000;
    const sway = Math.sin(now * 1.8) * 1.5; // 轻微摇晃
    ctx.translate(this.x, this.y + sway);

    // 深暗缺口背景
    ctx.fillStyle = "#1a0a00";
    ctx.fillRect(0, 2, this.w, this.h - 2);

    // 桥板主体（木棕）
    const plankH = this.h * 0.5;
    ctx.fillStyle = "#8b5e3c";
    ctx.fillRect(0, 0, this.w, plankH);
    ctx.fillStyle = "#6b3f1f";
    ctx.fillRect(0, 0, this.w, 2);

    // 纵向裂纹（粗黑线 + 白色次级纹）
    ctx.strokeStyle = "#1a0000";
    ctx.lineWidth = 2;
    const nCracks = Math.max(2, Math.floor(this.w / 15));
    for (let i = 0; i < nCracks; i++) {
      const cx = 8 + (i * this.w) / nCracks;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx + (i % 2 === 0 ? -4 : 4), plankH);
      ctx.stroke();
    }
    // 锯齿状断痕
    ctx.strokeStyle = "#ff3a3a";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(0, plankH);
    for (let sx = 0; sx < this.w; sx += 6) {
      ctx.lineTo(sx, plankH + (sx % 12 < 6 ? 2 : -2));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ———— crackedPlatform：浮空台（非过道），石/冰台带裂缝 ————
  _drawCrackedPlatform(ctx) {
    // 台面主体（石灰白）
    ctx.fillStyle = "#7a7a6a";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = "#9a9a8a";
    ctx.fillRect(this.x + 1, this.y, this.w - 2, this.h * 0.4);

    // 细密蛛网裂纹
    ctx.strokeStyle = "#4a3a2a";
    ctx.lineWidth = 0.8;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const arms = 5 + Math.floor(this.w / 20);
    for (let i = 0; i < arms; i++) {
      const ang = (i / arms) * Math.PI * 2 + 0.3;
      const len = this.w * 0.35;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.7);
      ctx.stroke();
    }
    // 边缘碎块高光
    ctx.strokeStyle = "#b0b0a0";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
  }

  // ———— crackedGlass：半透明玻璃平铺（常盖坑），蜘蛛网裂痕 ————
  _drawCrackedGlass(ctx) {
    // 半透明玻璃底
    ctx.fillStyle = "rgba(180, 220, 240, 0.55)";
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 反射高光斜条
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + this.h);
    ctx.lineTo(this.x + this.w * 0.4, this.y);
    ctx.lineTo(this.x + this.w * 0.55, this.y);
    ctx.lineTo(this.x + this.w * 0.15, this.y + this.h);
    ctx.closePath();
    ctx.fill();

    // 蜘蛛网裂纹（中心向外放射）
    ctx.strokeStyle = "rgba(200, 240, 255, 0.8)";
    ctx.lineWidth = 1.2;
    const gx = this.x + this.w / 2, gy = this.y + this.h / 2;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = Math.min(this.w, this.h) * 0.45;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + Math.cos(ang) * r, gy + Math.sin(ang) * r);
      ctx.stroke();
    }
    // 击中裂点
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(gx, gy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ———— dartLauncher：墙洞嵌入，周期发射飞镖 ————
  _drawDartLauncher(ctx) {
    const now = performance.now() / 1000;
    // 暗金属外框（墙洞）
    ctx.fillStyle = "#2a2520";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);

    // 发射口（圆形孔洞）
    const holeR = Math.min(this.w, this.h) * 0.3;
    const holeX = this.x + this.w / 2;
    const holeY = this.y + this.h / 2;
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.arc(holeX, holeY, holeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a3a3a";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 蓄力红光（周期闪烁）
    const pulse = Math.abs(Math.sin(now * 3));
    ctx.fillStyle = `rgba(255, 60, 20, ${0.3 + pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(holeX, holeY, holeR * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 飞出的飞镖投影（周期）
    const dartPhase = (now * 5) % 2.5;
    if (dartPhase < 1.5) {
      const dartX = holeX + dartPhase * 40;
      ctx.fillStyle = "#c0c0c0";
      ctx.beginPath();
      ctx.moveTo(dartX, holeY - 4);
      ctx.lineTo(dartX - 8, holeY);
      ctx.lineTo(dartX, holeY + 4);
      ctx.lineTo(dartX + 12, holeY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#808080";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // ———— ceilingSaw：天花板垂下的旋转圆锯/冰锥 ————
  _drawCeilingSaw(ctx) {
    const now = performance.now() / 1000;
    const cx = this.x + this.w / 2;
    const bladeR = Math.min(this.w, this.h) * 0.4;
    const bladeY = this.y + bladeR + 2;

    // 悬索/链条
    ctx.strokeStyle = "#444444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, this.y);
    ctx.lineTo(cx, bladeY);
    ctx.stroke();
    // 链条环节
    ctx.strokeStyle = "#666666";
    ctx.lineWidth = 1;
    for (let ly = this.y; ly < bladeY; ly += 6) {
      ctx.beginPath();
      ctx.arc(cx, ly, 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 旋转锯片
    const angle = now * 8; // 持续旋转
    ctx.translate(cx, bladeY);
    ctx.rotate(angle);

    // 锯片主体
    ctx.fillStyle = "#8899aa";
    ctx.beginPath();
    ctx.arc(0, 0, bladeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#aaaaaa";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 锯齿（8 个三角齿）
    const teeth = 8;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      ctx.fillStyle = "#c0c8d0";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const outerX = Math.cos(a) * (bladeR + 5);
      const outerY = Math.sin(a) * (bladeR + 5);
      const leftX = Math.cos(a - 0.2) * bladeR * 0.85;
      const leftY = Math.sin(a - 0.2) * bladeR * 0.85;
      const rightX = Math.cos(a + 0.2) * bladeR * 0.85;
      const rightY = Math.sin(a + 0.2) * bladeR * 0.85;
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(outerX, outerY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();
    }

    // 轴心
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.arc(cx, bladeY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ———— magnetField：紫蓝磁力场，同心波纹 + 粒子内吸 ————
  _drawMagnetField(ctx) {
    const now = performance.now() / 1000;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const maxR = Math.min(this.w, this.h) * 0.45;

    // 底色场
    ctx.fillStyle = "rgba(90, 50, 180, 0.25)";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = "rgba(155, 107, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.w, this.h);

    // 同心波纹（从中心向外扩散）
    for (let ring = 0; ring < 3; ring++) {
      const phase = (now * 1.5 + ring * 0.8) % 2;
      const r = maxR * phase;
      const alpha = 0.5 * (1 - phase);
      ctx.strokeStyle = `rgba(155, 107, 255, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 内吸粒子
    ctx.fillStyle = "rgba(180, 130, 255, 0.8)";
    for (let i = 0; i < 8; i++) {
      const pPhase = (now * 1.2 + i * 0.4) % 2.5;
      const dist = maxR * (1 - pPhase / 2.5); // 由外向内
      const ang = i * 0.785 + now * 0.6;
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
