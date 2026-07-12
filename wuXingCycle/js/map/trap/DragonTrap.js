// DragonTrap：龙首喷火陷阱（4帧精灵动画）
// 使用 xianjingUI/dragon_trap_frame_XX.png 序列帧
//
// === 行为循环 ===
//   Phase 0 (frame_01, 300ms): 龙首休眠
//   Phase 1 (frame_02, 300ms): 龙首张嘴蓄力
//   Phase 2 (frame_03, 2000ms): ★ 喷火！仅此阶段有伤害
//   Phase 3 (frame_04, 300ms): 龙首闭拢恢复
//   循环回到 Phase 0
//
// === 帧3对齐 ===
//   frame_03 的龙头可能与其它帧尺寸/位置不同，
//   通过 frame3Scale / frame3OffsetX / frame3OffsetY 调整对齐
//
// === 碰撞体 ===
//   碰撞矩形为 width × height，位置不变（龙首固定不动）
//   仅 Phase 2（喷火）时产生伤害判定

class DragonTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 帧阶段时长（毫秒）
    // 0: 休眠 300ms, 1: 蓄力 300ms, 2: 喷火 2000ms, 3: 恢复 300ms
    this._phaseDurations = [300, 300, 2000, 300];

    // 整体渲染缩放（所有帧统一放大）
    this.renderScale = cfg.renderScale ?? 3.0;

    // ★ 帧3额外宽度倍率（在 renderScale 基础上再乘）
    this.frame3WidthExtra = cfg.frame3WidthExtra ?? 2.0;

    // ★ 帧3细调偏移（可在 mapConfig 中微调对齐）
    this.frame3OffsetX = cfg.frame3OffsetX ?? 0;
    this.frame3OffsetY = cfg.frame3OffsetY ?? 0;

    // ===== 状态机 =====
    this.phase      = 0;          // 当前帧索引 0~3
    this.phaseTimer = 0;          // 当前阶段已用时间 ms

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像
  _ensureImages() {
    if (!DragonTrap._images) {
      DragonTrap._images = [];
      const base = "xianjingUI/dragon_trap_frame_";
      for (let i = 1; i <= 4; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        DragonTrap._images.push(img);
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

  // ★ 仅 Phase 2（frame_03 喷火）产生伤害
  check(player, dt) {
    if (this.phase !== 2) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 完美闪避检测：同样仅在喷火阶段判定
  checkAtPosition(rect) {
    if (this.phase !== 2) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return { type: "dragon", damage: this.damage, trap: this };
    }
    return null;
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    const img = DragonTrap._images[this.phase];

    if (img && img.complete && img.naturalWidth > 0) {
      const s = this.renderScale;
      if (this.phase === 2) {
        // ★ 帧3：整体3倍 + 宽度额外延长至2倍（共6倍宽），高度维持3倍
        const drawW = this.w * s * this.frame3WidthExtra;
        const drawH = this.h * s;
        const drawX = this.x - (drawW - this.w) / 2 + this.frame3OffsetX;
        const drawY = this.y - (drawH - this.h) / 2 + this.frame3OffsetY;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        // 帧 0,1,3：统一 renderScale 倍
        const drawW = this.w * s;
        const drawH = this.h * s;
        const drawX = this.x - (drawW - this.w) / 2;
        const drawY = this.y - (drawH - this.h) / 2;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
    } else {
      // 图像未加载完成时的回退绘制
      ctx.fillStyle = this.phase === 2
        ? "rgba(255,80,20,0.7)"
        : "rgba(80,30,30,0.5)";
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
