// JianrenAnimState：金行·天剑坠 蓄力/旋转动画状态机（v2 多剑刃外旋转）
//
// 阶段划分：
//   IDLE            → 初始空闲
//   CHARGE          → 蓄力中：jinren.png 原始比例 → Y轴拉伸至 2x
//   SPIN_PHASE1     → 第一段 180° 旋转：朝右时顺时针，朝左时逆时针
//   SPIN_PHASE2     → 第二段 180° 旋转：与第一段反向
//   DONE            → 动画完成
//
// ★ 外旋转机制：
//   - 释放后生成 N 把剑刃，均匀分布在角色周围
//   - 所有剑刃以角色中心为轴心，沿向外扩散的环绕轨迹旋转
//   - 旋转半径在全程动画中持续扩大（0 → maxRadius）
//   - 每把剑刃独立渲染并拥有独立碰撞体
//
// 伤害判定：
//   - 第一段旋转期间 → _hitSetPhase1（每敌人最多 1 次）
//   - 第二段旋转期间 → _hitSetPhase2（每敌人最多 1 次）
//   - 全程共两次伤害判定窗口
//
// Canvas 坐标说明（Y 轴向下）：
//   ctx.rotate(theta)：顺时针旋转 theta 弧度

class JianrenAnimState {
  static IDLE            = 'IDLE';
  static CHARGE          = 'CHARGE';
  static SPIN_PHASE1     = 'SPIN_PHASE1';
  static SPIN_PHASE2     = 'SPIN_PHASE2';
  static DONE            = 'DONE';

  static CHARGE_MAX_MS         = 2000;   // 蓄力最大时长
  static SPIN_PHASE_MS         = 220;    // 单段 180° 旋转时长
  static CHARGE_SCALE_MAX      = 2.0;    // Y 轴最大拉伸倍数
  static BLADE_WIDTH_RATIO     = 0.5;    // 剑宽上限 = 角色宽 × 50%
  static BLADE_COUNT           = 6;      // 旋转阶段剑刃数量
  static MAX_ORBIT_RADIUS_RATIO = 1.5;   // 最大轨道半径 = 角色宽 × 此值

  constructor(assetManager, player, onHit) {
    this.asset = assetManager;
    this.player = player;
    this.onHit = onHit || (() => {});

    this._blade = null;
    this._loaded = false;

    this._state = JianrenAnimState.IDLE;
    this._timer = 0;
    this._chargeRatio   = 0;
    this._releasedRatio = 0;
    this._globalAngle   = 0;          // 当前全局旋转角度（弧度）
    this._spinDirection = 1;          // 1=CW优先, -1=CCW优先（由角色朝向决定）
    this._hitSetPhase1  = new Set();  // 第一段命中敌人
    this._hitSetPhase2  = new Set();  // 第二段命中敌人

    // ★ 多剑刃数组（SPIN 阶段使用）
    this._blades = [];

    // ★ 初始基准尺寸
    this._baseW = 0;
    this._baseH = 0;
  }

  // ====================== 加载 ======================

  load() {
    this._blade = this.asset.getImage('sword_blade');
    this._loaded = !!this._blade;
    if (this._loaded) {
      console.log(`[JianrenAnim] 加载完成 blade=${this._blade.width}x${this._blade.height}`);
      this._computeBaseDimensions();
    } else {
      console.warn('[JianrenAnim] sword_blade 资源缺失');
    }
    return this;
  }

  _computeBaseDimensions() {
    if (!this._blade || !this.player) {
      this._baseW = 20;
      this._baseH = 40;
      return;
    }
    const maxWidth = this.player.w * JianrenAnimState.BLADE_WIDTH_RATIO;
    const rawW = this._blade.width;
    const rawH = this._blade.height;
    const baseScale = Math.min(1.0, maxWidth / rawW);
    this._baseW = rawW * baseScale;
    this._baseH = rawH * baseScale;
    console.log(
      `[JianrenAnim] 基准尺寸: ${this._baseW.toFixed(1)}x${this._baseH.toFixed(1)} ` +
      `(原图${rawW}x${rawH}, 缩放${baseScale.toFixed(3)}, 宽度上限${maxWidth})`
    );
  }

  // ====================== 属性访问 ======================

  get isLoaded()     { return this._loaded; }
  get isActive()     { return this._state !== JianrenAnimState.IDLE && this._state !== JianrenAnimState.DONE; }
  get state()        { return this._state; }
  get blade()        { return this._blade; }
  get isDone()       { return this._state === JianrenAnimState.DONE; }
  get chargeRatio()  { return this._chargeRatio; }

  // ====================== 尺寸计算 ======================

  /**
   * 获取当前生效的剑身尺寸。
   * CHARGE 阶段 → 基于 _chargeRatio（实时变化）
   * SPIN 阶段   → 基于 _releasedRatio（锁定不变）
   */
  _getSwordDimensions() {
    if (!this._blade || this._baseW <= 0) {
      const fallbackW = this.player ? this.player.w * 0.3 : 24;
      const fallbackH = fallbackW * 2;
      return { drawW: fallbackW, drawH: fallbackH, halfLen: fallbackH / 2, hitHalfW: fallbackW * 0.5 };
    }
    const effectiveRatio = (this._state === JianrenAnimState.CHARGE)
      ? this._chargeRatio
      : this._releasedRatio;
    const drawW = this._baseW;
    const scaleY = 1 + effectiveRatio * (JianrenAnimState.CHARGE_SCALE_MAX - 1);
    const drawH = this._baseH * scaleY;
    const halfLen = drawH / 2;
    const hitHalfW = this._baseW * 0.5;
    return { drawW, drawH, halfLen, hitHalfW };
  }

  // ====================== 缓动函数 ======================

  _easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

  // ====================== 阶段切换 ======================

  /** CHARGE 阶段启动 */
  startCharge() {
    if (!this._loaded) return false;
    this._state = JianrenAnimState.CHARGE;
    this._timer = 0;
    this._chargeRatio = 0;
    this._releasedRatio = 0;
    this._globalAngle = 0;
    this._spinDirection = 1;
    this._hitSetPhase1.clear();
    this._hitSetPhase2.clear();
    this._blades = [];
    console.log(`[JianrenAnim] → CHARGE (基准尺寸=${this._baseW.toFixed(1)}x${this._baseH.toFixed(1)})`);
    return true;
  }

  /**
   * ★ 第一段 180° 旋转启动。
   *    朝右 → 顺时针（SPIN_PHASE1 angle: 0→+π）
   *    朝左 → 逆时针（SPIN_PHASE1 angle: 0→-π）
   */
  startSpinPhase1() {
    this._releasedRatio = this._chargeRatio;
    this._state = JianrenAnimState.SPIN_PHASE1;
    this._timer = 0;
    this._globalAngle = 0;
    this._spinDirection = (this.player && this.player.facing === 'left') ? -1 : 1;
    this._hitSetPhase1.clear();
    this._hitSetPhase2.clear();

    // ★ 初始化 N 把剑刃，均匀分布在角色周围
    this._blades = [];
    for (let i = 0; i < JianrenAnimState.BLADE_COUNT; i++) {
      this._blades.push({
        baseAngle: (i / JianrenAnimState.BLADE_COUNT) * Math.PI * 2,
        radius: 0
      });
    }

    console.log(`[JianrenAnim] → SPIN_PHASE1 (direction=${this._spinDirection > 0 ? 'CW' : 'CCW'}, blades=${this._blades.length})`);
  }

  /**
   * ★ 第二段 180° 旋转启动（与第一段反向）。
   *    朝右 → 逆时针（SPIN_PHASE2 angle: +π→0）
   *    朝左 → 顺时针（SPIN_PHASE2 angle: -π→0）
   */
  startSpinPhase2() {
    this._state = JianrenAnimState.SPIN_PHASE2;
    this._timer = 0;
    // 全局角度不重置，从上一段结束位置继续（保证视觉连续）
    console.log(`[JianrenAnim] → SPIN_PHASE2 (reverse, angle=${this._globalAngle.toFixed(3)})`);
  }

  /** 强制重置 */
  reset() {
    this._state = JianrenAnimState.IDLE;
    this._timer = 0;
    this._chargeRatio = 0;
    this._releasedRatio = 0;
    this._globalAngle = 0;
    this._spinDirection = 1;
    this._hitSetPhase1.clear();
    this._hitSetPhase2.clear();
    this._blades = [];
  }

  /** 设置蓄力比例 (0~1) */
  setChargeProgress(ratio) {
    this._chargeRatio = Math.min(1, Math.max(0, ratio));
  }

  // ====================== 每帧驱动 ======================

  update(dt, enemies) {
    if (!this._loaded || !this.isActive) return;

    switch (this._state) {
      case JianrenAnimState.CHARGE: {
        // 蓄力期间由 setChargeProgress 驱动
        break;
      }
      case JianrenAnimState.SPIN_PHASE1: {
        this._timer += dt;
        const p = Math.min(1, this._timer / JianrenAnimState.SPIN_PHASE_MS);

        // 角度：0 → dir * π
        this._globalAngle = this._spinDirection * p * Math.PI;

        // ★ 半径：第一段从 0 扩展到 maxRadius * 0.6（为第二段留扩展空间）
        const maxRadius = this._getMaxRadius();
        const radius = maxRadius * 0.6 * this._easeOutQuad(p);

        this._updateBladePositions(radius);
        this._checkPhaseHits(enemies, this._hitSetPhase1);

        if (this._timer >= JianrenAnimState.SPIN_PHASE_MS) {
          this.startSpinPhase2();
        }
        break;
      }
      case JianrenAnimState.SPIN_PHASE2: {
        this._timer += dt;
        const p = Math.min(1, this._timer / JianrenAnimState.SPIN_PHASE_MS);

        // 角度：dir*π → 0（反向旋转回起点）
        this._globalAngle = this._spinDirection * (1 - p) * Math.PI;

        // ★ 半径：第二段从 maxRadius*0.6 扩展到 maxRadius
        const maxRadius = this._getMaxRadius();
        const radius = maxRadius * (0.6 + 0.4 * this._easeOutQuad(p));

        this._updateBladePositions(radius);
        this._checkPhaseHits(enemies, this._hitSetPhase2);

        if (this._timer >= JianrenAnimState.SPIN_PHASE_MS) {
          this._state = JianrenAnimState.DONE;
          console.log('[JianrenAnim] → DONE');
        }
        break;
      }
    }
  }

  /** 获取最大轨道半径 */
  _getMaxRadius() {
    if (!this.player) return 100;
    return this.player.w * JianrenAnimState.MAX_ORBIT_RADIUS_RATIO;
  }

  /** 更新所有剑刃的世界坐标位置 */
  _updateBladePositions(radius) {
    for (const blade of this._blades) {
      blade.radius = radius;
      blade.angle  = this._globalAngle + blade.baseAngle;
      blade.cosA   = Math.cos(blade.angle);
      blade.sinA   = Math.sin(blade.angle);
    }
  }

  // ====================== ★ 碰撞检测（多剑刃） ======================

  /**
   * 对指定阶段的命中集合进行多剑刃碰撞检测。
   * @param {Array} enemies 当前存活敌人列表
   * @param {Set} hitSet 当前阶段的已命中敌人集合
   */
  _checkPhaseHits(enemies, hitSet) {
    if (!enemies || enemies.length === 0) return;
    if (!this.player || !this._blade) return;

    const pivotX = this.player.x + this.player.w / 2;
    const pivotY = this.player.y + this.player.h / 2;
    const { halfLen, hitHalfW } = this._getSwordDimensions();

    // 遍历每把剑刃
    for (const blade of this._blades) {
      if (blade.radius <= 0 && this._state === JianrenAnimState.SPIN_PHASE1) continue; // 半径为零时不检测

      const cosA = blade.cosA;
      const sinA = blade.sinA;

      // 剑刃线段：从 (radius - halfLen) 延伸到 (radius + halfLen)
      // handle 靠近角色中心，tip 远离角色中心
      const handleX = pivotX + cosA * (blade.radius - halfLen);
      const handleY = pivotY + sinA * (blade.radius - halfLen);
      const tipX    = pivotX + cosA * (blade.radius + halfLen);
      const tipY    = pivotY + sinA * (blade.radius + halfLen);

      for (const e of enemies) {
        if (!e.alive) continue;
        if (hitSet.has(e)) continue;

        const ecx = e.x + e.w / 2;
        const ecy = e.y + e.h / 2;
        const eRadius = Math.max(e.w, e.h) / 2;

        const dist = this._pointToSegmentDist(ecx, ecy, handleX, handleY, tipX, tipY);
        if (dist <= hitHalfW + eRadius) {
          hitSet.add(e);
          this.onHit(e);
        }
      }
    }
  }

  /** 点到线段最短距离 */
  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // ====================== ★ 渲染 ======================

  /**
   * ★ 渲染剑身到画布。
   *
   * CHARGE：     单剑刃，底边对齐碰撞体顶边，中垂线对齐，剑身正上方延伸
   * SPIN_PHASE1：多剑刃，以角色中心为轴心，沿向外扩散的环绕轨迹旋转
   * SPIN_PHASE2：多剑刃，反向旋转，半径继续扩大
   */
  drawBlade(ctx, player) {
    if (!this._blade ||
        this._state === JianrenAnimState.IDLE ||
        this._state === JianrenAnimState.DONE) return;

    const dims = this._getSwordDimensions();
    const pivotX = player.x + player.w / 2;
    const pivotY = player.y + player.h / 2;

    ctx.save();

    if (this._state === JianrenAnimState.CHARGE) {
      // ── 蓄力阶段：单剑刃在碰撞体正上方 ──
      ctx.translate(pivotX, player.y);
      ctx.drawImage(this._blade, -dims.drawW / 2, -dims.drawH, dims.drawW, dims.drawH);

    } else {
      // ── 旋转阶段：多剑刃外旋转 ──
      const alpha = 0.85;  // 统一透明度
      ctx.globalAlpha = alpha;

      for (const blade of this._blades) {
        if (!blade.cosA && !blade.sinA) continue;

        const bx = pivotX + blade.cosA * blade.radius;
        const by = pivotY + blade.sinA * blade.radius;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(blade.angle + Math.PI / 2);  // 剑尖径向朝外（从角色中心向外）
        ctx.drawImage(this._blade, -dims.drawW / 2, -dims.drawH / 2, dims.drawW, dims.drawH);
        ctx.restore();
      }
    }

    ctx.restore();
  }
}

window.JianrenAnimState = JianrenAnimState;
