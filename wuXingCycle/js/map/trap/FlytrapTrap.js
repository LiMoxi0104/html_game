// FlytrapTrap：捕蝇草陷阱（4帧精灵动画，顺序循环）
// 使用 xianjingUI/flytrap_trap_frame_XX.png 序列帧（01~04）
// 默认 3 倍放大 + 水平镜像翻转（捕蝇草面向左侧）
//
// === 行为循环（0→1→2→3→0→...）===
//   Phase 0 → frame_01, 1500ms: 闭合休眠，无伤害
//   Phase 1 → frame_02,  300ms: 半张蓄力，50% 伤害
//   Phase 2 → frame_03,  800ms: ★ 全开咬合，100% 伤害
//   Phase 3 → frame_04,  300ms: 半闭收回，50% 伤害
//   顺序循环
//
// === 碰撞体 ===
//   碰撞矩形随 renderScale 等比放大，与图像对齐
//   Phase 1~3 均有伤害判定，Phase 1/3 伤害减半

class FlytrapTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 帧阶段时长（毫秒）
    this._phaseDurations = [1500, 300, 800, 300];

    // 渲染缩放（默认3倍）
    this.renderScaleX = cfg.renderScaleX ?? 3.0;
    this.renderScaleY = cfg.renderScaleY ?? 3.0;

    // 是否水平镜像（默认 true，面向左侧）
    this.flipH = cfg.flipH ?? true;

    // ===== 状态机 =====
    this.phase      = 0;          // 当前帧索引 0~3
    this.phaseTimer = 0;          // 当前阶段已用时间 ms

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像（01~04）
  _ensureImages() {
    if (!FlytrapTrap._images) {
      FlytrapTrap._images = [];
      const base = "xianjingUI/flytrap_trap_frame_";
      for (let i = 1; i <= 4; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        FlytrapTrap._images.push(img);
      }
    }
  }

  // ==================== 每帧更新 ====================
  update(dt) {
    this.phaseTimer += dt;
    if (this.phaseTimer >= this._phaseDurations[this.phase]) {
      this.phase = (this.phase + 1) % 4;
      this.phaseTimer = 0;
    }
  }

  // ==================== 碰撞检测 ====================
  // 碰撞体等比放大，居中于原始锚点，与绘制图像对齐
  getRect() {
    const scaledW = this.w * this.renderScaleX;
    const scaledH = this.h * this.renderScaleY;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    return {
      x: cx - scaledW / 2,
      y: cy - scaledH / 2,
      w: scaledW,
      h: scaledH
    };
  }

  // Phase 0 无伤害，Phase 1/3 半伤，Phase 2 满伤
  _getCurrentDamage() {
    if (this.phase === 0) return 0;
    if (this.phase === 1 || this.phase === 3) return Math.ceil(this.damage / 2);
    return this.damage;
  }

  _getDamageMultiplier() {
    if (this.phase === 0) return 0;
    if (this.phase === 1 || this.phase === 3) return 0.5;
    return 1.0;
  }

  check(player, dt) {
    if (this.phase === 0) return null;  // 闭合阶段不检测
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 完美闪避检测
  checkAtPosition(rect) {
    if (this.phase === 0) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return {
        type: "flytrap",
        damage: this._getCurrentDamage(),
        damageMultiplier: this._getDamageMultiplier(),
        trap: this
      };
    }
    return null;
  }

  // 重写 onTrigger：使用当前阶段对应的伤害值
  onTrigger(player) {
    const currentDamage = this._getCurrentDamage();
    const originalDamage = this.damage;
    this.damage = currentDamage;

    const result = super.onTrigger(player);

    this.damage = originalDamage;
    return { type: "flytrap", damage: currentDamage, phase: this.phase, ...result };
  }

  // ==================== 绘制（默认水平镜像翻转） ====================
  draw(ctx) {
    ctx.save();
    const img = FlytrapTrap._images[this.phase];

    if (img && img.complete && img.naturalWidth > 0) {
      const drawW = this.w * this.renderScaleX;
      const drawH = this.h * this.renderScaleY;
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      const drawX = cx - drawW / 2;
      const drawY = cy - drawH / 2;

      if (this.flipH) {
        // 水平镜像：translate 到绘制区域右边缘，scale(-1,1)
        ctx.translate(drawX + drawW, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
    } else {
      // 图像未加载完成时的回退绘制
      const alpha = this.phase === 0 ? 0.3 : (this.phase === 2 ? 0.9 : 0.6);
      ctx.fillStyle = `rgba(60,140,50,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
