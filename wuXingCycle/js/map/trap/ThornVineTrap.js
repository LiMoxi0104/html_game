// ThornVineTrap：荆棘藤蔓陷阱（3帧精灵动画，1→2→3→2 循环伸缩）
// 使用 xianjingUI/thorn_vine_thorn_XX.png 序列帧
//   frame_01 = 藤蔓收起/休眠
//   frame_02 = 藤蔓半伸/半收
//   frame_03 = 藤蔓全伸/激活
//
// === 行为循环 ===
//   Phase 0 (frame_01, 1000ms): 收起，无伤害
//   Phase 1 (frame_02, 200ms):  半伸，50% 伤害
//   Phase 2 (frame_03, 500ms):  ★ 全伸，100% 伤害
//   Phase 3 (frame_02, 200ms):  半收，50% 伤害
//   循环回到 Phase 0
//
// === 碰撞体 ===
//   碰撞矩形为 width × height，位置不变
//   Phase 1~3 均有伤害判定，Phase 1/3 伤害减半
//   支持完美闪避系统（checkAtPosition 返回 damageMultiplier）

class ThornVineTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 帧阶段时长（毫秒）
    // Phase 0: frame_01 收起 1000ms
    // Phase 1: frame_02 半伸 200ms
    // Phase 2: frame_03 全伸 500ms ★
    // Phase 3: frame_02 半收 200ms
    this._phaseDurations = [1000, 200, 500, 200];

    // 渲染缩放
    this.renderScaleX = cfg.renderScaleX ?? 1.0;
    this.renderScaleY = cfg.renderScaleY ?? 4.0;

    // ===== 状态机 =====
    this.phase      = 0;          // 当前阶段 0~3
    this.phaseTimer = 0;          // 当前阶段已用时间 ms

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像
  // 帧序：phase0→01, phase1→02, phase2→03, phase3→02
  _ensureImages() {
    if (!ThornVineTrap._images) {
      ThornVineTrap._images = [];
      const base = "xianjingUI/thorn_vine_thorn_";
      const frameIds = [1, 2, 3, 2];
      for (const fi of frameIds) {
        const img = new Image();
        img.src = base + String(fi).padStart(2, "0") + ".png";
        ThornVineTrap._images.push(img);
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

  _getDamageMultiplier() {
    if (this.phase === 0) return 0;
    if (this.phase === 1 || this.phase === 3) return 0.5;
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
        type: "thorn_vine",
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
    return { type: "thorn_vine", damage: currentDamage, phase: this.phase };
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    const img = ThornVineTrap._images[this.phase];

    if (img && img.complete && img.naturalWidth > 0) {
      const drawW = this.w * this.renderScaleX;
      const drawH = this.h * this.renderScaleY;
      const drawX = this.x - (drawW - this.w) / 2;
      const drawY = this.y - (drawH - this.h) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      const alpha = this.phase === 0 ? 0.3 : (this.phase === 2 ? 0.9 : 0.6);
      ctx.fillStyle = `rgba(74,96,48,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
