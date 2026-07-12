// FireWallTrap：火墙陷阱（2帧精灵动画，ping-pong 往复 + 水平往复移动）
// 使用 xianjingUI/firewall_trap_frame_XX.png 序列帧（01~02）
//
// === 行为循环（0→1→0→1→...）===
//   Step 0 → frame_01, 2000ms: 熄灭/静止，无伤害
//   Step 1 → frame_02, 1200ms: ★ 燃烧，100% 伤害
//   往复循环
//
// === 水平往复移动 ===
//   从 baseX 到 baseX + travelDistance 来回滑动
//   travelDistance 默认为 120（玩家碰撞体宽度 40 × 3）
//
// === 碰撞体 ===
//   碰撞矩形宽度取 75%、高度取 85%（视觉中心区域），边缘不判定
//   frame 1（燃烧）有伤害判定

class FireWallTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;
  static _frameSequence = [0, 1];  // 0→1→0→1...

  constructor(cfg) {
    super(cfg);

    // 每步时长（frame_01 熄灭 2s，frame_02 燃烧 1.2s）
    this._phaseDurations = [2000, 1200];

    // 渲染缩放
    this.renderScaleX = cfg.renderScaleX ?? 1.0;
    this.renderScaleY = cfg.renderScaleY ?? 1.0;

    // ===== 水平往复移动 =====
    this.baseX          = this.x;                          // 初始X（锚点）
    this.travelDistance = cfg.travelDistance || 120;       // 单方向移动距离（玩家碰撞体宽度×3）
    this.travelTime     = cfg.travelTime     || 1500;      // 单方向移动耗时 ms
    this.moveDirection  = 1;                               // 1=右移, -1=左移
    this.moveSpeed      = this.travelDistance / this.travelTime;  // px/ms

    // ===== 精灵帧状态机 =====
    this.step       = 0;          // 当前步进 0~1
    this.phaseTimer = 0;          // 当前步进已用时间 ms

    // 预加载帧图像
    this._ensureImages();
    this.active = true;
  }

  // 当前要显示的帧索引
  get _frame() {
    return FireWallTrap._frameSequence[this.step];
  }

  // 静态方法：仅首次创建实例时加载帧图像（01~02）
  _ensureImages() {
    if (!FireWallTrap._images) {
      FireWallTrap._images = [];
      const base = "xianjingUI/firewall_trap_frame_";
      for (let i = 1; i <= 2; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        FireWallTrap._images.push(img);
      }
    }
  }

  // ==================== 每帧更新 ====================
  update(dt) {
    // 精灵帧切换（on/off 独立周期）
    this.phaseTimer += dt;
    if (this.phaseTimer >= this._phaseDurations[this.step]) {
      this.step = (this.step + 1) % 2;
      this.phaseTimer = 0;
    }

    // 水平往复移动
    this.x += this.moveDirection * this.moveSpeed * dt;
    if (this.x >= this.baseX + this.travelDistance) {
      this.x = this.baseX + this.travelDistance;
      this.moveDirection = -1;
    } else if (this.x <= this.baseX) {
      this.x = this.baseX;
      this.moveDirection = 1;
    }
  }

  // ==================== 碰撞检测 ====================
  // 碰撞体取视觉中心区域（宽度75%，高度85%），边缘不触发伤害
  getRect() {
    const colW = this.w * 0.75;
    const colH = this.h * 0.85;
    const colX = this.x + (this.w - colW) / 2;
    const colY = this.y + (this.h - colH) / 2;
    return { x: colX, y: colY, w: colW, h: colH };
  }

  _getCurrentDamage() {
    return this._frame === 0 ? 0 : this.damage;
  }

  _getDamageMultiplier() {
    return this._frame === 0 ? 0 : 1.0;
  }

  check(player, dt) {
    if (this._frame === 0) return null;
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
        type: "firewall",
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
    return { type: "firewall", damage: currentDamage, frame: this._frame };
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();
    const img = FireWallTrap._images[this._frame];

    if (img && img.complete && img.naturalWidth > 0) {
      const drawW = this.w * this.renderScaleX;
      const drawH = this.h * this.renderScaleY;
      const drawX = this.x - (drawW - this.w) / 2;
      const drawY = this.y - (drawH - this.h) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      const f = this._frame;
      const alpha = f === 0 ? 0.3 : 0.9;
      ctx.fillStyle = `rgba(255,100,20,${alpha})`;
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();
  }
}
