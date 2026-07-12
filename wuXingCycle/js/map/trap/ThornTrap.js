// ThornTrap：荆棘尖刺陷阱（4帧精灵动画）
// 使用 xianjingUI/thorn_trap_frame_XX.png 序列帧
//
// === 行为循环 ===
//   Phase 0 (frame_01, 1000ms): 收起/静止，无伤害
//   Phase 1 (frame_02, 500ms):  刺尖冒出，50% 伤害
//   Phase 2 (frame_03, 500ms):  ★ 全伸，100% 伤害
//   Phase 3 (frame_04, 500ms):  收回，50% 伤害
//   循环回到 Phase 0
//
// === 碰撞体 ===
//   碰撞矩形为 width × height，位置不变
//   Phase 1~3 均有伤害判定，Phase 1/3 伤害减半

class ThornTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 帧阶段时长（毫秒）
    // 0: 收起 1000ms, 1: 冒出 200ms, 2: 全伸 600ms, 3: 收回 200ms
    this._phaseDurations = [1000, 200, 600, 200];

    // 整体渲染缩放（宽度 1.0，高度 3.0 保持竖向比例）
    this.renderScaleX = cfg.renderScaleX ?? 1.0;
    this.renderScaleY = cfg.renderScaleY ?? 4.5;

    // ===== 状态机 =====
    this.phase      = 0;          // 当前帧索引 0~3
    this.phaseTimer = 0;          // 当前阶段已用时间 ms

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像
  _ensureImages() {
    if (!ThornTrap._images) {
      ThornTrap._images = [];
      const base = "xianjingUI/thorn_trap_frame_";
      for (let i = 1; i <= 4; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        ThornTrap._images.push(img);
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
  getRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // Phase 0 无伤害，Phase 1/3 半伤，Phase 2 满伤
  _getCurrentDamage() {
    if (this.phase === 0) return 0;
    if (this.phase === 1 || this.phase === 3) return Math.ceil(this.damage / 2);
    return this.damage;
  }

  // 获取当前伤害系数（用于 perfect dodge 等外部判断）
  _getDamageMultiplier() {
    if (this.phase === 0) return 0;
    if (this.phase === 1 || this.phase === 3) return 0.5;
    return 1.0;
  }

  check(player, dt) {
    if (this.phase === 0) return null;  // 收起阶段不检测
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 完美闪避检测：Phase 1~3 期间有效
  checkAtPosition(rect) {
    if (this.phase === 0) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return {
        type: "thorn",
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

    // 暂时修改 damage 为当前阶段的伤害，执行基类逻辑后再恢复
    const originalDamage = this.damage;
    this.damage = currentDamage;

    const result = super.onTrigger(player);

    this.damage = originalDamage;
    return { type: "thorn", damage: currentDamage, phase: this.phase };
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    const img = ThornTrap._images[this.phase];

    if (img && img.complete && img.naturalWidth > 0) {
      const s = this.renderScale;
      const drawW = this.w * this.renderScaleX;
      const drawH = this.h * this.renderScaleY;
      // 居中绘制（精灵图以陷阱坐标为中心放大）
      const drawX = this.x - (drawW - this.w) / 2;
      const drawY = this.y - (drawH - this.h) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      // 图像未加载完成时的回退绘制
      const alpha = this.phase === 0 ? 0.3 : (this.phase === 2 ? 0.9 : 0.6);
      ctx.fillStyle = `rgba(120,180,80,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);

      // 简易尖刺形状
      if (this.phase >= 1) {
        ctx.fillStyle = `rgba(140,200,60,${alpha + 0.2})`;
        const spikeW = this.w / 4;
        const spikeH = -this.h * (this.phase === 2 ? 1.5 : 0.8);
        for (let i = 0; i < 4; i++) {
          const sx = this.x + i * spikeW;
          ctx.beginPath();
          ctx.moveTo(sx, this.y);
          ctx.lineTo(sx + spikeW / 2, this.y + spikeH);
          ctx.lineTo(sx + spikeW, this.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}
