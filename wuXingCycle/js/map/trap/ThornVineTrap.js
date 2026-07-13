// ThornVineTrap：荆棘藤蔓陷阱（2帧精灵动画，周期性伸缩）
// 使用 xianjingUI/thorn_vine_trap_frame_XX.png 序列帧
//   frame_03 = 藤蔓收起/休眠
//   frame_05 = 藤蔓伸出/激活
//
// === 行为循环 ===
//   Phase 0 (dormantMs): 藤蔓收起，无伤害
//   Phase 1 (activeMs):  ★ 藤蔓伸出，100% 伤害
//   循环
//
// === 碰撞体 ===
//   碰撞矩形为 width × height，位置不变
//   仅在 Phase 1 产生伤害判定

class ThornVineTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 周期参数
    this.intervalMs = cfg.intervalMs || 1800;
    this.activeMs  = cfg.activeMs  || 500;
    this.dormantMs = this.intervalMs - this.activeMs;

    // 渲染缩放
    this.renderScaleX = cfg.renderScaleX ?? 1.0;
    this.renderScaleY = cfg.renderScaleY ?? 3.0;

    // ===== 状态机 =====
    this.phase      = 0;          // 0=休眠, 1=激活
    this.phaseTimer = 0;

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像
  // 注意：xianjingUI 中仅有 frame_03 和 frame_05
  _ensureImages() {
    if (!ThornVineTrap._images) {
      ThornVineTrap._images = [];
      // frame_03 = 休眠帧, frame_05 = 激活帧
      const frames = [3, 5];
      const base = "xianjingUI/thorn_vine_trap_frame_";
      for (const fi of frames) {
        const img = new Image();
        img.src = base + String(fi).padStart(2, "0") + ".png";
        ThornVineTrap._images.push(img);
      }
    }
  }

  // ==================== 每帧更新 ====================
  update(dt) {
    this.phaseTimer += dt;
    if (this.phase === 0 && this.phaseTimer >= this.dormantMs) {
      this.phase = 1;
      this.phaseTimer = 0;
    } else if (this.phase === 1 && this.phaseTimer >= this.activeMs) {
      this.phase = 0;
      this.phaseTimer = 0;
    }
  }

  // ==================== 碰撞检测 ====================
  getRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
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
      return { type: "thorn_vine", damage: this.damage, trap: this };
    }
    return null;
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
      const alpha = this.phase === 0 ? 0.3 : 0.9;
      ctx.fillStyle = `rgba(74,96,48,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
