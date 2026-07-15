// EnemyIronSoldier：金行・玄铁卒 — 继承自 EnemyBase 的重甲追踪型敌人
//
// 精灵图来源：assets/img/xiaoguai/1/
//   move/ → frame_000000~000071（72帧向左行走动画）
//   hit/  → frame_000072~000120（49帧攻击动画，frame_103~120 为伤害帧）
//
// 核心机制：
//   碰撞体纵向左半侧可命中，伤害降至 10%；模型等比放大 1.5×；
//   实时追踪玩家坐标（始终朝向移动）；攻击仅在 frame_103~120 产生伤害。
//
// 状态机:
//   chase    → 实时追踪玩家坐标移动，距玩家 ≤ detectRadius 切 attack
//   attack   → 播放 hit 帧动画（0→48），仅帧 31~48(原始103~120)有伤害
//   cooldown → 短暂停顿，到期重测距离决定回 chase 或再攻
//   dead     → 静态尸体存留 2 秒后从场景移除

class EnemyIronSoldier extends EnemyBase {

  constructor(cfg) {
    super(cfg);

    // —— 体型缩放 ——
    this.modelScale = cfg.modelScale || 3.0;             // ★ 等比放大倍数

    // —— 状态 ——
    this._state = "chase";                               // chase | attack | cooldown | dead

    // —— 追踪（原巡逻，现改为实时追踪玩家）——
    this.chaseSpeed = cfg.chaseSpeed || cfg.patrolSpeed || 0.35;   // 追踪速度
    this.direction = -1;                                 // 初始向左
    this._edgeCheckOffset = cfg.edgeCheckOffset || 12;

    // —— 探测 ——
    this.detectRadius = cfg.detectRadius || 60;          // 攻击触发距(极小)

    // —— 攻击 ——
    this.damage = cfg.damage || 12;
    this._hasHitPlayer = false;

    // —— 弱点击伤倍率 ——
    this.damageMultiplier = cfg.damageMultiplier || 0.1;

    // —— 冷却 ——
    this.cooldownMs = cfg.cooldownMs || 400;
    this._cooldownTimer = 0;

    // —— 尸体 ——
    this._corpseDuration = cfg.corpseMs || 2000;
    this._corpseTimer = 0;

    // —— 世界引用 ——
    this._player = null;
    this._map = null;
    this._mapInjected = false;

    // ★ v4 地面吸附粘滞状态
    this._currentSurfaceY = null;   // null=站在 groundY，否则为当前站立平台的 y

    // —— 序列帧 ——
    this._moveFrames = [];
    this._hitFrames = [];
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._moveFrameInterval = cfg.moveFrameInterval || 80;
    this._hitFrameInterval  = cfg.hitFrameInterval  || 50;

    // ★ 伤害帧区间（hitFrames[] 下标）：对应原始 frame_000103~000120
    this._damageFrameStart = cfg.damageFrameStart || 31;  // hitFrames[31] = frame_103
    this._damageFrameEnd   = cfg.damageFrameEnd   || 48;  // hitFrames[48] = frame_120

    // —— 外观（等比缩放）——
    this._renderW = cfg.renderW || this.w * this.modelScale;
    this._renderH = cfg.renderH || this.h * this.modelScale;

    console.log(`[IronSoldier] ${this.id} pos(${this.x.toFixed(0)},${this.y.toFixed(0)}) `
      + `scale:${this.modelScale}× 探测:${this.detectRadius} `
      + `伤害帧:${this._damageFrameStart}-${this._damageFrameEnd}`);
  }

  // ════════════════════ 注入 ════════════════════

  injectWorld(player, map) {
    this._player = player;
    if (map) {
      if (!this._mapInjected) {
        this._map = map;
        this._snapToGround();
        this._mapInjected = true;
      } else { this._map = map; }
    }
  }
  setMoveFrames(f) { this._moveFrames = f || []; console.log(`[IronSoldier] ${this.id} move:${this._moveFrames.length}`); }
  setHitFrames(f)  { this._hitFrames  = f || []; console.log(`[IronSoldier] ${this.id} hit:${this._hitFrames.length}`); }

  // ════════════════════ 分裂碰撞体（缩放后尺寸）════════════════

  /** 缩放后完整宽度 */
  _scaledW() { return this.w * this.modelScale; }
  _scaledH() { return this.h * this.modelScale; }

  /**
   * ★ 碰撞箱跟随移动方向动态翻转：
   *    direction=-1(左) → 左半侧可命中
   *    direction= 1(右) → 右半侧可命中
   *    每帧由 _updateChase/_enterAttack 实时写入 direction，确保无判定延迟。
   */
  getRect() {
    const hw = this._scaledW() / 2;
    if (this.direction > 0) {
      // 朝右→弱点击在右半侧
      return { x: this.x + hw, y: this.y, w: hw, h: this._scaledH() };
    }
    // 朝左（含静止）→弱点击在左半侧
    return { x: this.x, y: this.y, w: hw, h: this._scaledH() };
  }

  /** 缩放后全宽矩形（自身攻击判定用） */
  getFullRect() {
    return { x: this.x, y: this.y, w: this._scaledW(), h: this._scaledH() };
  }

  // ════════════════════ 弱点击伤 ════════════════════

  takeDamage(d) {
    if (!this.alive) return;
    const wasAlive = this.alive;
    super.takeDamage(Math.max(1, Math.floor(d * this.damageMultiplier)));
    if (wasAlive && !this.alive) {
      this._corpseTimer = this._corpseDuration;
      this._state = "dead";
      console.log(`[IronSoldier] ${this.id} death, corpse ${this._corpseDuration}ms`);
    }
  }

  // ════════════════════ 地面吸附 ════════════════════

  /** 脚底中心 X（缩放后） */
  _feetCx()   { return this.x + this._scaledW() / 2; }

  /**
   * ★ 查找脚底所站立面的 Y 坐标。
   * 引入 _currentSurfaceY 粘滞：当敌人已在平台上时，短暂离开平台边缘
   * 不会被误判为落到 groundY，避免因平台间隙造成的 y 跳变。
   */
  _getStandSurfaceY() {
    if (!this._map) return this.y + this._scaledH();
    const fx = this._feetCx();
    let sy = this._map.groundY;

    if (this._map.platforms) {
      for (const p of this._map.platforms) {
        if (fx >= p.x && fx <= p.x + p.w && p.y < sy) sy = p.y;
      }
    }

    // ★ 粘滞：若当前站在平台上而脚底所在位置无任何平台覆盖，
    //   则保持上一个表面的 Y（防止因空隙瞬间掉到 groundY）
    if (sy === this._map.groundY
        && this._currentSurfaceY !== null
        && this._currentSurfaceY < this._map.groundY) {
      return this._currentSurfaceY;
    }

    this._currentSurfaceY = sy;
    return sy;
  }

  /**
   * ★ 前探点是否有地面/平台支撑。
   * 敌人站在 groundY 上时 → 全图有支撑。
   * 敌人站在平台上时 → 仅当探点落在任意平台上时才有支撑，防止走出平台边缘。
   */
  _hasSupportAt(fx) {
    if (!this._map) return true;
    if (this._map.platforms) {
      for (const p of this._map.platforms) {
        if (fx >= p.x && fx <= p.x + p.w) return true;
      }
    }
    // 只在站在 groundY（非平台）上时，groundY 才提供支撑
    return (this._currentSurfaceY === null || this._currentSurfaceY >= this._map.groundY);
  }

  /**
   * ★ 平滑地面吸附：使用渐进逼近代替硬赋值 this.y = cy，
   *   消除因平台间隙导致 surfaceY 突变时的视觉瞬移。
   *   仅在 chase/cooldown 状态下吸附（攻击时保持原地）。
   */
  _snapToGround() {
    const sy = this._getStandSurfaceY();
    const targetY = sy - this._scaledH();
    const diff = targetY - this.y;

    if (Math.abs(diff) < 0.3) {
      this.y = targetY;
      return;
    }

    // 平滑逼近：速度与距离成正比（距离越大逼近越快），最低 2px/帧。
    const speed = Math.max(2, Math.abs(diff) * 0.25);
    this.y += Math.sign(diff) * Math.min(speed, Math.abs(diff));
  }

  // ════════════════════ 主更新 ════════════════════

  update(dt) {
    if (!this.alive) {
      if (this._corpseTimer > 0) this._corpseTimer -= dt;
      return;
    }
    super.update(dt);
    if (this._imprisoned) return;      // ★ 禁锢中跳过行为逻辑

    switch (this._state) {
      case "chase":    this._updateChase(dt);    break;
      case "attack":   this._updateAttack(dt);   break;
      case "cooldown": this._updateCooldown(dt); break;
    }

    // 水平边界
    if (this._map) {
      const pad = 4;
      if (this.x < pad) this.x = pad;
      if (this.x > this._map.width - this._scaledW() - pad)
        this.x = this._map.width - this._scaledW() - pad;
      // ★ 吸附仅限 chase/cooldown 状态，避免攻击瞬间跳位
      if (this._state === "chase" || this._state === "cooldown") {
        this._snapToGround();
      }
    }
  }

  // ════════════════════ 追踪 ════════════════════

  /**
   * ★ 实时动态追踪玩家：每帧检测玩家中心 X，决定移动方向并朝玩家位移。
   *    边缘处不反向，改为原地等待（避免坠落）。
   *    距玩家 ≤ detectRadius 时零延迟切攻击。
   */
  _updateChase(dt) {
    if (this._player && this._player.state !== "dead") {
      const playerCx = this._player.x + this._player.w / 2;
      const selfCx = this._feetCx();

      // 实时追踪：玩家在左→向左，在右→向右
      this.direction = playerCx >= selfCx ? 1 : -1;

      // 位移
      const prevX = this.x;
      this.x += this.direction * this.chaseSpeed;

      // 边缘检测：前探无支撑则撤销位移（避免掉落）
      const probeX = this._feetCx() + this.direction * this._edgeCheckOffset;
      if (!this._hasSupportAt(probeX)) {
        this.x = prevX;
      }

      // ★ 距离检测 → 攻击
      const dist = MathTool.dist(selfCx, this.y + this._scaledH() / 2,
        playerCx, this._player.y + this._player.h / 2);
      if (dist <= this.detectRadius) {
        this._enterAttack();
        return;
      }
    }
    this._advanceFrame(dt, this._moveFrames, this._moveFrameInterval);
  }

  // ════════════════════ 攻击 ════════════════════

  /**
   * 进入攻击：锁定朝向，hit 帧从头播放（不循环）。
   * 伤害仅在 hitFrames[31]~[48]（原始 frame_103~120）生效。
   */
  _enterAttack() {
    if (!this._player || this._player.state === "dead") {
      this._enterCooldown(); return;
    }
    this._state = "attack";
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._hasHitPlayer = false;
    this.direction = (this._player.x + this._player.w / 2) >= this._feetCx() ? 1 : -1;
    console.log(`[IronSoldier] ${this.id} ▶ atk dir:${this.direction > 0 ? "R" : "L"}`);
  }

  _updateAttack(dt) {
    // 帧推进（攻击动画不循环，到末尾自动结束）
    this._frameTimer += dt;
    let animEnded = false;
    while (this._frameTimer >= this._hitFrameInterval) {
      this._frameTimer -= this._hitFrameInterval;
      if (this._frameIndex < this._hitFrames.length - 1) {
        this._frameIndex++;
      } else {
        animEnded = true;
        break;
      }
    }
    if (animEnded) { this._enterCooldown(); return; }

    // ★ 伤害窗口：仅在 frame_103~120（hitFrames[31]~[48]）生效
    const idx = this._frameIndex;
    if (idx >= this._damageFrameStart && idx <= this._damageFrameEnd &&
        !this._hasHitPlayer && this._player && this._player.state !== "dead") {
      const atkRange = 24;
      const dir = this.direction;
      const atkRect = {
        x: dir === 1 ? this.x : this.x - atkRange,
        y: this.y,
        w: this._scaledW() + atkRange,
        h: this._scaledH()
      };
      if (Collision.rectOverlap(atkRect, this._player.getRect())) {
        this._player.takeDamage(this.damage, this);
        this._hasHitPlayer = true;
        console.log(`[IronSoldier] ${this.id} hit! dmg:${this.damage} frame:${idx}`);
      }
    }
  }

  // ════════════════════ 冷却 ════════════════════

  _enterCooldown() {
    this._state = "cooldown";
    this._cooldownTimer = this.cooldownMs;
    this._frameIndex = 0;
    this._frameTimer = 0;
  }

  _updateCooldown(dt) {
    this._cooldownTimer -= dt;
    this._advanceFrame(dt, this._moveFrames, this._moveFrameInterval);
    if (this._cooldownTimer <= 0) {
      if (this._player && this._player.state !== "dead") {
        const dist = MathTool.dist(this._feetCx(), this.y + this._scaledH() / 2,
          this._player.x + this._player.w / 2, this._player.y + this._player.h / 2);
        if (dist <= this.detectRadius) { this._enterAttack(); return; }
      }
      this._state = "chase";
      console.log(`[IronSoldier] ${this.id} cooldown→chase`);
    }
  }

  // ════════════════════ 帧动画 ════════════════════

  _advanceFrame(dt, frames, interval) {
    if (!frames || frames.length === 0) return;
    this._frameTimer += dt;
    while (this._frameTimer >= interval) {
      this._frameTimer -= interval;
      this._frameIndex = (this._frameIndex + 1) % frames.length;
    }
  }

  _getCurrentFrame() {
    const frames = this._state === "attack" ? this._hitFrames : this._moveFrames;
    const arr = (frames && frames.length > 0) ? frames : (this._moveFrames.length > 0 ? this._moveFrames : null);
    if (!arr || arr.length === 0) return null;
    return arr[this._frameIndex % arr.length];
  }

  // ════════════════════ 绘制 ════════════════════

  draw(ctx) {
    if (!this.alive && this._corpseTimer <= 0) return;

    // —— 尸体 ——
    if (!this.alive) {
      ctx.save();
      const img = this._getCurrentFrame();
      if (img) {
        if (this.direction > 0) {
          ctx.translate(this.x + this._renderW, this.y);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, this._renderW, this._renderH);
        } else {
          ctx.drawImage(img, this.x, this.y, this._renderW, this._renderH);
        }
      } else {
        ctx.fillStyle = "#7a7a88";
        ctx.fillRect(this.x, this.y, this._scaledW(), this._scaledH());
      }
      ctx.restore();
      return;
    }

    // —— 活体 ——
    ctx.save();
    if (this._moveFrames.length > 0 || this._hitFrames.length > 0) {
      const img = this._getCurrentFrame();
      if (img) this._drawSprite(ctx, img);
      else this._drawFallback(ctx);
    } else {
      this._drawFallback(ctx);
    }

    // 受击闪白（source-atop 仅染精灵非透明像素；重置变换确保坐标正确）
    if (this.flash > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.min(0.6, this.flash / 120);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(this.x, this.y, this._scaledW(), this._scaledH());
      ctx.restore();
    }
    ctx.restore();

    // ★ 血条在 save/restore 之外，始终正立、跟随世界坐标
    if (this.alive) this._drawWorldBar(ctx, this._scaledW());
  }

  _drawSprite(ctx, img) {
    const needFlip = this.direction > 0;
    if (needFlip) {
      ctx.translate(this.x + this._renderW, this.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, this._renderW, this._renderH);
    } else {
      ctx.drawImage(img, this.x, this.y, this._renderW, this._renderH);
    }
  }

  _drawFallback(ctx) {
    const col = this.flash > 0 ? "#ffffff" : "#9ca3af";
    ctx.fillStyle = col;
    ctx.fillRect(this.x, this.y, this._scaledW(), this._scaledH());
    ctx.fillStyle = "#e8dcc0";
    const eX = this.direction > 0 ? this.x + this._scaledW() - 10 : this.x + 5;
    ctx.fillRect(eX, this.y + this._scaledH() / 4, 5, 5);
  }

  _drawWorldBar(ctx, bw) {
    const bx = this.x, by = this.y - 8;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx, by, bw, 4);
    const ratio = Math.max(0, this.hp / this.maxHp);
    const hpCol = ratio > 0.5 ? "#caa64a" : (ratio > 0.25 ? "#d98a20" : "#c0392b");
    ctx.fillStyle = hpCol;
    ctx.fillRect(bx, by, bw * ratio, 4);
  }
}
