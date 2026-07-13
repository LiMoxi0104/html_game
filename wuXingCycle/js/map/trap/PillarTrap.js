// PillarTrap：崩塌石柱陷阱（3帧精灵动画，周期性伸缩）
// 使用 xianjingUI/pillar_trap_frame_XX.png 序列帧（01~03）
//
// === 行为循环 ===
//   Phase 0 (frame_01, dormantMs): 柱体稳定/收起，无伤害
//   Phase 1 (frame_02, 300ms):      柱体开裂/蓄力，50% 伤害
//   Phase 2 (frame_03, activeMs):  ★ 柱体崩塌/全伸，100% 伤害
//   循环回到 Phase 0
//
// === 碰撞体 ===
//   碰撞矩形为 width × height，位置不变
//   Phase 1/2 均有伤害判定

class PillarTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 周期参数（从配置读取，兼容旧 SpikeTrap 字段名）
    this.intervalMs = cfg.intervalMs || 2800;
    this.activeMs  = cfg.activeMs  || 1000;
    this.dormantMs = this.intervalMs - this.activeMs - 300; // 扣除蓄力300ms

    // 渲染缩放（宽度1.0，高度保持竖向比例）
    this.renderScaleX = cfg.renderScaleX ?? 1.0;
    this.renderScaleY = cfg.renderScaleY ?? 4.5;

    // ===== 状态机 =====
    this.phase      = 0;          // 0=休眠, 1=蓄力, 2=崩塌
    this.phaseTimer = 0;

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像（01~03）
  _ensureImages() {
    if (!PillarTrap._images) {
      PillarTrap._images = [];
      const base = "xianjingUI/pillar_trap_frame_";
      for (let i = 1; i <= 3; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        PillarTrap._images.push(img);
      }
    }
  }

  // ==================== 每帧更新 ====================
  update(dt) {
    this.phaseTimer += dt;
    if (this.phase === 0 && this.phaseTimer >= this.dormantMs) {
      this.phase = 1;
      this.phaseTimer = 0;
    } else if (this.phase === 1 && this.phaseTimer >= 300) {
      this.phase = 2;
      this.phaseTimer = 0;
    } else if (this.phase === 2 && this.phaseTimer >= this.activeMs) {
      this.phase = 0;
      this.phaseTimer = 0;
    }
  }

  // ==================== 碰撞检测 ====================
  getRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // Phase 0 无伤害，Phase 1 半伤，Phase 2 满伤
  _getCurrentDamage() {
    if (this.phase === 0) return 0;
    if (this.phase === 1) return Math.ceil(this.damage / 2);
    return this.damage;
  }

  _getDamageMultiplier() {
    if (this.phase === 0) return 0;
    if (this.phase === 1) return 0.5;
    return 1.0;
  }

  check(player, dt) {
    if (this.phase === 0) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  checkAtPosition(rect) {
    if (this.phase === 0) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return {
        type: "pillar",
        damage: this._getCurrentDamage(),
        damageMultiplier: this._getDamageMultiplier(),
        trap: this
      };
    }
    return null;
  }

  onTrigger(player) {
    const currentDamage = this._getCurrentDamage();
    const originalDamage = this.damage;
    this.damage = currentDamage;

    super.onTrigger(player);

    this.damage = originalDamage;
    return { type: "pillar", damage: currentDamage, phase: this.phase };
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    const img = PillarTrap._images[this.phase];

    if (img && img.complete && img.naturalWidth > 0) {
      const drawW = this.w * this.renderScaleX;
      const drawH = this.h * this.renderScaleY;
      const drawX = this.x - (drawW - this.w) / 2;
      const drawY = this.y - (drawH - this.h) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      // 图像未加载完成时的回退绘制
      const alpha = this.phase === 0 ? 0.3 : (this.phase === 2 ? 0.9 : 0.6);
      ctx.fillStyle = `rgba(140,120,100,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
