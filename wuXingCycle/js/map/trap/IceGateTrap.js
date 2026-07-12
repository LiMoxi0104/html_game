// IceGateTrap：冰闸陷阱（3帧精灵动画，ping-pong 往复）
// 使用 xianjingUI/icegate_trap_frame_XX.png 序列帧（02~04，不用05）
//
// === 行为循环（0→1→2→1→0→...）===
//   Step 0 → frame_02, 1000ms: 关闭/静止，无伤害
//   Step 1 → frame_03, 200ms:  冰闸开启，50% 伤害
//   Step 2 → frame_04, 1000ms: ★ 全开，100% 伤害
//   Step 3 → frame_03, 200ms:  冰闸收回，50% 伤害
//   往复循环
//
// === 碰撞体 ===
//   碰撞矩形为 width × height，位置不变
//   frame 1/2 均有伤害判定

class IceGateTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  // 步进→帧索引映射（0→1→2→1 往复）
  static _frameSequence = [0, 1, 2, 1];

  constructor(cfg) {
    super(cfg);

    // 每步时长（对应 _frameSequence 的4个步进）
    this._phaseDurations = [1000, 100, 1000, 100];

    // 渲染缩放（宽度 1.0，高度 4.5）
    this.renderScaleX = cfg.renderScaleX ?? 1.0;
    this.renderScaleY = cfg.renderScaleY ?? 4.5;

    // ===== 状态机 =====
    this.step       = 0;          // 当前步进 0~3
    this.phaseTimer = 0;          // 当前步进已用时间 ms

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 当前要显示的帧索引
  get _frame() {
    return IceGateTrap._frameSequence[this.step];
  }

  // 静态方法：仅首次创建实例时加载帧图像（02~04）
  _ensureImages() {
    if (!IceGateTrap._images) {
      IceGateTrap._images = [];
      const base = "xianjingUI/icegate_trap_frame_";
      for (let i = 2; i <= 4; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        IceGateTrap._images.push(img);
      }
    }
  }

  // ==================== 每帧更新 ====================
  update(dt) {
    this.phaseTimer += dt;
    if (this.phaseTimer >= this._phaseDurations[this.step]) {
      this.step = (this.step + 1) % 4;
      this.phaseTimer = 0;
    }
  }

  // ==================== 碰撞检测 ====================
  getRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // frame 0 无伤害，frame 1 半伤，frame 2 满伤
  _getCurrentDamage() {
    const f = this._frame;
    if (f === 0) return 0;
    if (f === 1) return Math.ceil(this.damage / 2);
    return this.damage;
  }

  // 获取当前伤害系数（用于 perfect dodge 等外部判断）
  _getDamageMultiplier() {
    const f = this._frame;
    if (f === 0) return 0;
    if (f === 1) return 0.5;
    return 1.0;
  }

  check(player, dt) {
    if (this._frame === 0) return null;  // 关闭阶段不检测
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 完美闪避检测
  checkAtPosition(rect) {
    if (this._frame === 0) return null;
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return {
        type: "icegate",
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

    super.onTrigger(player);

    this.damage = originalDamage;
    return { type: "icegate", damage: currentDamage, frame: this._frame };
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    const img = IceGateTrap._images[this._frame];

    if (img && img.complete && img.naturalWidth > 0) {
      const drawW = this.w * this.renderScaleX;
      const drawH = this.h * this.renderScaleY;
      const drawX = this.x - (drawW - this.w) / 2;
      const drawY = this.y - (drawH - this.h) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      const f = this._frame;
      const alpha = f === 0 ? 0.3 : (f === 2 ? 0.9 : 0.6);
      ctx.fillStyle = `rgba(100,180,220,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
