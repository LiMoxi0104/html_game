// EnemyRockArmor：土行・岩甲蛰 — 继承自 EnemyBase 的巡逻/探测/飞扑型敌人
//
// 精灵图来源：assets/img/xiaoguai/5/（121 帧序列帧，原始角色面朝左）
// 绘制规则：方向 < 0（向左）用原始帧；方向 > 0（向右）X 缩放 -1 水平翻转（仅视觉，不改变计算）
//
// 状态机（3 核心态）:
//   patrol   → 沿平台水平移动，边缘检测防掉落，触边界即反向；
//              每帧计算与玩家欧氏距离，≤ detectRadius 时零延迟切 attack
//   attack   → 锁定起始位+玩家位作落点，抛物线投射自身飞扑；
//              飞行中绕中心连续旋转；圆形碰撞体命中玩家或脚触地即进 cooldown
//   cooldown → 落地停顿 cooldownMs，旋转归零，计时结束重测距离：
//              玩家在探测内→续扑 attack；否则→回 patrol
//
// 关键约束：
//   - 抛物线顶点 ≥ 10px（预留上边界），超标则 clamp vy0 压低轨迹
//   - 圆形碰撞体贴合模型，攻击命中用 circleRect 精确判定
//   - 首次注入 world 时自动 snapToGround，确保紧贴地面不悬浮
//   - 状态切换零延迟，变换矩阵无残留
//   - 所有参数均可通过 cfg 配置

class EnemyRockArmor extends EnemyBase {

  // ════════════════════ 构造函数 ════════════════════

  constructor(cfg) {
    super(cfg);

    // —— 状态 ——
    this._state = "patrol";                         // "patrol" | "attack" | "cooldown"

    // —— 巡逻参数（均可外部配置）——
    this.patrolSpeed = cfg.patrolSpeed || 1.0;      // 巡逻速度(px/frame@60fps)
    this.direction = -1;                            // ★ 初始方向必须为 -1（向左）
    this._edgeCheckOffset = cfg.edgeCheckOffset || 12; // 边缘前探距离(px)

    // —— 探测参数 ——
    this.detectRadius = cfg.detectRadius || 280;     // 探测半径(px)

    // —— 攻击/投射物参数 ——
    this.attackSpeedX = cfg.attackSpeedX || 2.8;     // 水平飞行速度(px/frame@60fps)
    this.gravity = cfg.gravity || 0.62;              // 重力加速度(px/frame²)
    this.jumpHeightFactor = cfg.jumpHeightFactor || 0.5; // ★ 弹跳高度缩放(0~1)，越低弧顶越矮
    this.damage = cfg.damage || 18;                  // 接触伤害
    this.rotationSpeed = cfg.rotationSpeed || 6.5;   // 飞行旋转速度(°/frame@60fps)
    this._rotation = 0;                              // 当前旋转角(弧度)，落地归零
    this._apexMargin = cfg.apexMargin || 10;         // 抛物线顶点距上边界最小距离
    this._effGravity = this.gravity;                 // 攻击中实际使用重力（= gravity * jumpHeightFactor）

    // —— 冷却参数 ——
    this.cooldownMs = cfg.cooldownMs || 1000;          // 落地停顿 ms
    this._cooldownTimer = 0;

    // —— 死亡尸体 ——
    this._corpseDuration = cfg.corpseMs || 2000;         // 尸体存留总时长(ms)
    this._corpseTimer = 0;                              // 尸体剩余存留(ms)，>0 表示尸体可见

    // —— 攻击状态内部数据 ——
    this._flyVx = 0;
    this._flyVy = 0;
    this._hasHitPlayer = false;                      // 当次攻击已命中（防重复伤害）

    // —— 世界引用（由 GameMain 每帧注入）——
    this._player = null;
    this._map = null;
    this._mapInjected = false;                       // 首次注入标记（触发 snapToGround）

    // —— 精灵序列帧 ——
    this._frames = [];
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._frameInterval = cfg.frameInterval || 80;   // 每帧持续时间(ms)

    // —— 渲染尺寸 ——
    this._renderW = cfg.renderW || this.w;
    this._renderH = cfg.renderH || this.h;

    // —— 圆形碰撞体：半径取模型短边一半的 90%，贴合视觉 ——
    this._collisionRadius = cfg.collisionRadius ||
      (Math.min(this._renderW, this._renderH) / 2) * 0.9;

    console.log(`[RockArmor] ${this.id} 初始化 pos(${this.x.toFixed(0)},${this.y.toFixed(0)}) `
      + `碰撞半径:${this._collisionRadius.toFixed(0)} 探测:${this.detectRadius}`);
  }

  // ════════════════════ 世界注入 ════════════════════

  /** 每帧由 GameMain 调用：注入 player + map 引用 */
  injectWorld(player, map) {
    this._player = player;
    if (map) {
      // 首次拿到 map → 执行地面吸附（修正配置 Y 偏差，防悬浮/穿模）
      if (!this._mapInjected) {
        this._map = map;
        this._snapToGround();
        this._mapInjected = true;
      } else {
        this._map = map;                            // 地图切换时更新引用
      }
    }
  }

  /** 注入精灵序列帧（GameMain 预加载完成后调用一次） */
  setFrames(frames) {
    if (frames && frames.length > 0) {
      this._frames = frames;
      console.log(`[RockArmor] ${this.id} 精灵帧注入: ${frames.length} 帧`);
    }
  }

  // ════════════════════ 受击与死亡 ════════════════════

  /**
   * 覆写父类 takeDamage：死亡时生成静态尸体，存留 2 秒后销毁。
   * @param {number} d - 伤害值
   */
  takeDamage(d) {
    if (!this.alive) return;
    const wasAlive = this.alive;
    super.takeDamage(d);
    if (wasAlive && !this.alive) {
      this._corpseTimer = this._corpseDuration;
      this._state = "dead";
      this._flyVx = 0;
      this._flyVy = 0;
      this._rotation = 0;                      // 尸体无旋转
      console.log(`[RockArmor] ${this.id} 死亡，尸体存留 ${this._corpseDuration}ms`);
    }
  }

  // ════════════════════ 圆形碰撞体接口 ════════════════════

  /**
   * 覆写父类 getRect()：返回圆形碰撞体的 AABB 包围盒（边长 = 2*radius）。
   * 用于：玩家技能命中判定 / 调试可视化 / 陷阱碰撞
   */
  getRect() {
    const r = this._collisionRadius;
    const cx = this._cx();
    const cy = this._cy();
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }

  /**
   * 返回圆形碰撞体数据，供 callers 直接做 circle-vs-rect/circle-vs-circle 判定
   * @returns {{ cx: number, cy: number, r: number }}
   */
  getCircle() {
    return {
      cx: this._cx(),
      cy: this._cy(),
      r: this._collisionRadius
    };
  }

  // ════════════════════ 几何工具 ════════════════════

  _feetCx()   { return this.x + this.w / 2; }
  _feetY()    { return this.y + this.h; }
  _cx()       { return this.x + this.w / 2; }
  _cy()       { return this.y + this.h / 2; }

  /** 当前脚底中心正下方最高支撑面 Y（平台优先 > groundY） */
  _getStandSurfaceY() {
    if (!this._map) return this._feetY();
    const fx = this._feetCx();
    let surfaceY = this._map.groundY;
    if (this._map.platforms) {
      for (const p of this._map.platforms) {
        if (fx >= p.x && fx <= p.x + p.w && p.y < surfaceY) {
          surfaceY = p.y;
        }
      }
    }
    return surfaceY;
  }

  /** 检测指定脚底 X 是否有支撑（平台或 groundY 永久兜底） */
  _hasSupportAt(feetCx) {
    if (!this._map) return true;
    if (this._map.platforms) {
      for (const p of this._map.platforms) {
        if (feetCx >= p.x && feetCx <= p.x + p.w) return true;
      }
    }
    return true;  // groundY 全图宽度均有支撑
  }

  /**
   * ★ 地面吸附：以当前脚底中心为参考，将 y 修正为紧贴支撑面。
   *    首次 injectWorld 时调用一次，防御配置 y 偏差、反向纠正悬浮/穿模。
   */
  _snapToGround() {
    const surfaceY = this._getStandSurfaceY();
    const correctedY = surfaceY - this.h;
    if (Math.abs(this.y - correctedY) > 1) {
      console.log(`[RockArmor] ${this.id} 地面吸附: y ${this.y.toFixed(1)} → ${correctedY.toFixed(1)} `
        + `(surfaceY=${surfaceY})`);
      this.y = correctedY;
    }
  }

  // ════════════════════ 主更新入口 ════════════════════

  /** @param {number} dt - 帧间隔(ms)，固定步长约 16.67ms */
  update(dt) {
    // —— 尸体存留：仅递减计时器，跳过一切逻辑，精灵帧冻结 ——
    if (!this.alive) {
      if (this._corpseTimer > 0) {
        this._corpseTimer -= dt;
      }
      return;
    }
    super.update(dt);

    switch (this._state) {
      case "patrol":   this._updatePatrol(dt);   break;
      case "attack":   this._updateAttack(dt);   break;
      case "cooldown": this._updateCooldown(dt); break;
    }

    // 水平边界钳制
    if (this._map) {
      const pad = 4;
      if (this.x < pad) this.x = pad;
      if (this.x > this._map.width - this.w - pad) this.x = this._map.width - this.w - pad;
    }
  }

  // ════════════════════ 状态：巡逻 ════════════════════

  _updatePatrol(dt) {
    // —— 探测玩家：每帧计算欧氏距离，≤ detectRadius 则零延迟切 attack ——
    // ★ 修复：Player 无 .alive 属性，改用 state !== "dead" 判定存活
    if (this._player && this._player.state !== "dead") {
      const dist = MathTool.dist(this._cx(), this._cy(),
        this._player.x + this._player.w / 2, this._player.y + this._player.h / 2);
      if (dist <= this.detectRadius) {
        this._enterAttack();
        return;
      }
    }

    // —— 水平移动 ——
    this.x += this.direction * this.patrolSpeed;

    // —— 地图边界反转 ——
    const fx = this._feetCx();
    if (this._map) {
      if (fx <= 0 || fx >= this._map.width) {
        this.direction *= -1;
        this.x += this.direction * this.patrolSpeed * 2;
      }
    }

    // —— 边缘防掉落：前探无支撑则反向 ——
    const probeX = fx + this.direction * this._edgeCheckOffset;
    if (!this._hasSupportAt(probeX)) {
      this.direction *= -1;
    }

    this._advanceFrame(dt);
  }

  // ════════════════════ 状态：攻击（飞扑）════════════════

  /** 进入攻击：锁起始位 & 玩家位，求解抛物线初速度，约束顶点 */
  _enterAttack() {
    // ★ 修复：Player 无 .alive 属性
    if (!this._player || this._player.state === "dead") {
      this._enterCooldown();
      return;
    }

    this._state = "attack";
    this._hasHitPlayer = false;

    const startX = this._cx();
    const startY = this._cy();
    const targetX = this._player.x + this._player.w / 2;
    const targetY = this._player.y + this._player.h / 2;

    // 水平朝向与速度
    const dx = targetX - startX;
    this.direction = dx >= 0 ? 1 : -1;
    this._flyVx = this.direction * this.attackSpeedX;

    // 抛物线垂直初速度求解
    // t = |dx| / vx
    // vy0 = (dy - 0.5*g*t²) / t
    const absDx = Math.abs(dx);
    const dy = targetY - startY;
    const g = this.gravity;
    const tFlight = (absDx > 0.01) ? (absDx / this.attackSpeedX) : 20;

    let vy0 = (dy - 0.5 * g * tFlight * tFlight) / tFlight;

    // ★ 压低弹跳高度：vy0 和 g 同时缩放 jumpHeightFactor，
    //    弧顶降低但飞行时间与水平距离保持不变（vy0/g 比值恒定）
    vy0 *= this.jumpHeightFactor;
    this._effGravity = g * this.jumpHeightFactor;

    // 顶点边界约束：y_apex = startY - vy0²/(2*_effGravity)，必须 ≥ apexMargin
    const maxUpSpeed = Math.sqrt(2 * this._effGravity * Math.max(1, startY - this._apexMargin));
    if (vy0 < -maxUpSpeed) {
      console.log(`[RockArmor] ${this.id} 顶点超标 ` +
        `(${(startY - (vy0*vy0) / (2*this._effGravity)).toFixed(0)}px → clamp 至 ≥${this._apexMargin}px)`);
      vy0 = -maxUpSpeed;
    }

    this._flyVy = vy0;
    this._rotation = 0;

    const apexY = startY - (vy0 * vy0) / (2 * this._effGravity);
    console.log(`[RockArmor] ${this.id} ▶ 飞扑! 起点(${startX.toFixed(0)},${startY.toFixed(0)}) `
      + `→目标(${targetX.toFixed(0)},${targetY.toFixed(0)}) 弧顶${apexY.toFixed(0)} `
      + `vx:${this._flyVx.toFixed(2)} vy0:${vy0.toFixed(2)} g':${this._effGravity.toFixed(3)} 约${tFlight.toFixed(0)}帧`);
  }

  /** 攻击帧：运动积分 + 旋转 + 圆形碰撞检测 */
  _updateAttack(dt) {
    // 运动积分（px/frame 体系），使用缩放后重力维持弧形与水平距离
    this.x += this._flyVx;
    this.y += this._flyVy;
    this._flyVy += this._effGravity;

    // 旋转累加
    this._rotation += this.rotationSpeed * (Math.PI / 180);

    // 水平边界钳制
    if (this._map) {
      if (this.x < 0) this.x = 0;
      if (this.x > this._map.width - this.w) this.x = this._map.width - this.w;
    }

    // —— ★ 圆形碰撞：命中玩家 ——
    // ★ 修复：Player 无 .alive 属性
    if (this._player && this._player.state !== "dead" && !this._hasHitPlayer) {
      const circle = this.getCircle();
      if (Collision.circleRect(circle.cx, circle.cy, circle.r, this._player.getRect())) {
        this._player.takeDamage(this.damage, this);
        this._hasHitPlayer = true;
        console.log(`[RockArmor] ${this.id} 命中玩家！伤害:${this.damage}`);
        this._enterCooldown();
        return;
      }
    }

    // —— 脚部触地 / 坠出边界 → 冷却 ——
    if (this._map) {
      const feetY = this._feetY();
      const surfaceY = this._getStandSurfaceY();
      if (feetY >= surfaceY) {
        this.y = surfaceY - this.h;
        this._enterCooldown();
        return;
      }
      if (this.y > this._map.height + 100 || this.y < -200) {
        this._enterCooldown();
        return;
      }
    }

    this._advanceFrame(dt);
  }

  // ════════════════════ 状态：冷却 ════════════════════

  /** 进入冷却：旋转归零、速度清零、停顿计时 */
  _enterCooldown() {
    this._state = "cooldown";
    this._cooldownTimer = this.cooldownMs;
    this._flyVx = 0;
    this._flyVy = 0;
    this._rotation = 0;
    console.log(`[RockArmor] ${this.id} 冷却 ${this.cooldownMs}ms`);
  }

  /** 冷却帧：计时递减，到期重测距离决定下个状态 */
  _updateCooldown(dt) {
    this._cooldownTimer -= dt;
    this._advanceFrame(dt);

    if (this._cooldownTimer <= 0) {
      // ★ 修复：Player 无 .alive 属性
      if (this._player && this._player.state !== "dead") {
        const dist = MathTool.dist(this._cx(), this._cy(),
          this._player.x + this._player.w / 2, this._player.y + this._player.h / 2);
        if (dist <= this.detectRadius) {
          this._enterAttack();                   // 续扑
          return;
        }
      }
      this._state = "patrol";                    // 回巡逻
      console.log(`[RockArmor] ${this.id} 冷却结束 → patrol`);
    }
  }

  // ════════════════════ 精灵帧动画 ════════════════════

  _advanceFrame(dt) {
    if (!this._frames || this._frames.length === 0) return;
    this._frameTimer += dt;
    while (this._frameTimer >= this._frameInterval) {
      this._frameTimer -= this._frameInterval;
      this._frameIndex = (this._frameIndex + 1) % this._frames.length;
    }
  }

  // ════════════════════ 绘制 ════════════════════

  draw(ctx) {
    // 尸体过期 → 不再绘制，直接从场景移除
    if (!this.alive && this._corpseTimer <= 0) return;

    // —— 尸体渲染：静态定格，无透明度变化、无血条、无闪白 ——
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
        ctx.fillStyle = "#5a3a2a";
        ctx.fillRect(this.x, this.y, this.w, this.h);
      }
      ctx.restore();
      return;
    }

    // —— 活体正常绘制 ——
    ctx.save();

    if (this._frames && this._frames.length > 0) {
      this._drawSprite(ctx, this._getCurrentFrame());
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
      ctx.fillRect(this.x, this.y, this._renderW, this._renderH);
      ctx.restore();
    }
    ctx.restore();

    // ★ 血条在 save/restore 之外绘制：攻击旋转不影响血条朝向，始终正立
    if (this.alive) this._drawWorldBar(ctx, this.w);
  }

  _getCurrentFrame() {
    return this._frames[this._frameIndex % this._frames.length] || null;
  }

  _drawSprite(ctx, img) {
    if (!img) { this._drawFallback(ctx); return; }

    const needFlip = this.direction > 0;
    const isAttacking = this._state === "attack";

    if (isAttacking) {
      const cx = this._cx();
      const cy = this._cy();
      ctx.translate(cx, cy);
      ctx.rotate(this._rotation);
      if (needFlip) ctx.scale(-1, 1);
      ctx.drawImage(img, -this._renderW / 2, -this._renderH / 2, this._renderW, this._renderH);
    } else {
      if (needFlip) {
        ctx.translate(this.x + this._renderW, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, this._renderW, this._renderH);
      } else {
        ctx.drawImage(img, this.x, this.y, this._renderW, this._renderH);
      }
    }
  }

  _drawFallback(ctx) {
    const isAttacking = this._state === "attack";
    const col = this.flash > 0 ? "#ffffff" : "#8a6d3b";

    if (isAttacking) {
      ctx.translate(this._cx(), this._cy());
      ctx.rotate(this._rotation);
      ctx.fillStyle = col;
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.fillStyle = "#e8dcc0";
      const eX = this.direction > 0 ? 4 : -8;
      ctx.fillRect(eX, -this.h / 4, 4, 4);
    } else {
      ctx.fillStyle = col;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#e8dcc0";
      const eX = this.direction > 0 ? this.x + this.w - 8 : this.x + 4;
      ctx.fillRect(eX, this.y + this.h / 4, 4, 4);
    }
  }

  _drawWorldBar(ctx, bw) {
    const bx = this.x, by = this.y - 8;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx, by, bw, 4);
    const ratio = Math.max(0, this.hp / this.maxHp);
    const hpColor = ratio > 0.5 ? "#caa64a" : (ratio > 0.25 ? "#d98a20" : "#c0392b");
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, bw * ratio, 4);
  }
}
