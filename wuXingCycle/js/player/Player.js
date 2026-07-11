// Player：五行传人。v6 轻功重构 —— 以单帧精灵 + 代码动画驱动三种核心状态：
//   idle:       待机微动呼吸（idle.png 单帧 + 正弦 y 偏移模拟呼吸）
//   lightstep:  轻功腾空移动（lightstep.png 单帧 + 悬空浮动 + 足下粒子轨迹）
//   facing:     面向右时水平翻转左侧精灵图，实现对称动作
//
// 状态优先级：dead > hurt > parry > dodge > attack > jump > lightstep > idle
//
// 攻击/受伤/闪避/弹反/跳跃/碰撞系统完整保留。

class Player {
  constructor(x, y, consts) {
    this.consts = consts;
    this.x = x;
    this.y = y;
    this.w = consts.player.width;
    this.h = consts.player.height;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = "right";     // right / left
    this.facingLock = false;   // 攻击期间锁定朝向
    this.state = "idle";       // idle | lightstep | jump | attack | hurt | dodge | parry | dead
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 50;
    this.maxMp = 50;
    this.invuln = 0;           // 受击无敌剩余 ms
    this.skill = null;         // SkillSystem，由外部注入
    this.asset = null;         // AssetManager，由外部注入

    // ═══════ 代码动画驱动（全局累积时间）═══════
    this.animTime = 0;                     // 累计动画时间 ms

    // —— 待机呼吸参数 ——
    this.idleBreathAmp  = 2.0;             // 呼吸微动幅值 px
    this.idleBreathFreq = 0.002;           // 频率（≈4.2s 一呼一吸完整周期）

    // —— 轻功系统参数 ——
    this.lightSpeed         = 5.4;         // 轻功水平移速 px/frame
    this.lightHoverBase    = 10;           // 悬空基准高度 px（高于地面）
    this.lightFloatAmp     = 5.0;          // 垂直浮动幅值 px
    this.lightFloatFreq    = 0.010;        // 浮动频率（≈1s 完整上下周期）
    this.lightTransition    = 0;            // 过渡因子 0(贴地) → 1(完全悬空)
    this.lightTransitionRate = 0.08;        // 每帧过渡速率

    // —— 轻功粒子轨迹 ——
    this.trailParticles = [];               // [{x, y, life, maxLife, size, alpha}]

    // —— 多段跳系统 ——
    this.jumpCount     = 0;
    this.maxJumps      = 2;
    this.isJumpHolding = false;
    this.minJumpTime   = 120;              // 矮跳判定阈值 ms
    this.jumpHoldTimer = 0;
    this.jumpCutSpeed  = 0.5;

    // —— 闪避系统 ——
    this.dodgeTimer        = 0;
    this.dodgeCooldown     = 0;
    this.dodgeDistance     = 70;
    this.dodgeDuration     = 150;
    this.dodgeCooldownMax  = 800;
    this.ghostRect         = null;
    this.ghostTimer        = 0;

    // —— 战斗标记 ——
    this.canCounter = false;
    this.canExecute = false;

    // —— 弹反系统引用（由 GameMain 注入）——
    this.parrySystem = null;
  }

  // ═══════ 依赖注入 ═══════

  setSkillSystem(ss) { this.skill = ss; }

  setParrySystem(ps) { this.parrySystem = ps; }

  setAssetManager(asset) { this.asset = asset; }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  getGhostRect() {
    if (!this.ghostRect || this.ghostTimer <= 0) return null;
    return this.ghostRect;
  }

  clearCombatMarks() {
    this.canCounter = false;
    this.canExecute = false;
  }

  // ═══════ 代码动画：Y 偏移计算 ═══════

  // 根据当前状态返回正弦驱动的 y 偏移量
  _computeYOffset() {
    switch (this.state) {
      case "idle":
        // 待机呼吸：缓慢的正弦微动
        return Math.sin(this.animTime * this.idleBreathFreq) * this.idleBreathAmp;

      case "lightstep": {
        // 轻功悬空：过渡悬空高度 + 正弦浮动
        const hover = MathTool.lerp(0, this.lightHoverBase, this.lightTransition);
        const wave  = Math.sin(this.animTime * this.lightFloatFreq) * this.lightFloatAmp;
        return hover + wave;
      }

      default:
        return 0;
    }
  }

  // 根据当前状态返回应使用的精灵素材 key
  _spriteKeyForState() {
    switch (this.state) {
      case "idle":      return "player_idle";
      case "lightstep": return "player_lightstep";
      default:          return null;   // 攻击/受伤/闪避等用回退矩形
    }
  }

  // ═══════ 轻功粒子轨迹 ═══════

  _spawnTrailParticle() {
    const cx = this.x + this.w / 2;
    const baseY = this.y + this.h + 2;
    this.trailParticles.push({
      x: cx + (Math.random() - 0.5) * this.w * 0.6,
      y: baseY,
      life: 350 + Math.random() * 250,
      maxLife: 350 + Math.random() * 250,
      size: 2 + Math.random() * 5,
      alpha: 0.4 + Math.random() * 0.4
    });
    if (this.trailParticles.length > 24) this.trailParticles.shift();
  }

  _updateTrail(dt) {
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= dt;
      p.y    -= 0.35;                    // 粒子缓缓上升飘散
      p.size += 0.012;                   // 粒子膨胀消散
      if (p.life <= 0) this.trailParticles.splice(i, 1);
    }
  }

  // ═══════ 跳跃系统 ═══════

  startJump() {
    if (this.state === "dead" || this.state === "hurt" || this.state === "attack") return false;
    if (this.jumpCount >= this.maxJumps) return false;

    this.jumpCount++;
    this.vy = -this.consts.player.jumpForce;
    this.onGround = false;
    this.isJumpHolding = true;
    this.jumpHoldTimer = 0;

    if (this.state !== "dodge") {
      this.state = "jump";
    }

    AudioManager.play && AudioManager.play("jump");
    console.log(`[Player] ${this.jumpCount === 1 ? "一段跳" : "二段跳"}！`);
    return true;
  }

  // ═══════ 闪避系统 ═══════

  startDodge() {
    if (this.state === "dead" || this.state === "hurt" || this.state === "attack" || this.state === "parry") return false;
    if (this.dodgeCooldown > 0) return false;

    this.ghostRect  = { x: this.x, y: this.y, w: this.w, h: this.h };
    this.ghostTimer = this.dodgeDuration;

    const dir = this.facing === "right" ? -1 : 1;
    let newX = this.x + dir * this.dodgeDistance;
    const pad = this.consts.world.boundaryPadding || 24;
    newX = Math.max(pad, Math.min(newX, 2000 - this.w - pad));

    this.x  = newX;
    this.vx = 0;
    this.vy = 0;

    this.state          = "dodge";
    this.dodgeTimer     = this.dodgeDuration;
    this.invuln         = this.dodgeDuration;
    this.dodgeCooldown  = this.dodgeCooldownMax;

    console.log(`[Player] 闪避！方向:${dir > 0 ? "右" : "左"}`);
    return true;
  }

  // ═══════ 主更新循环 ═══════

  update(dt, input, map) {
    const c = this.consts;
    if (this.state === "dead") return;

    // —— 全局动画计时累积 ——
    this.animTime += dt;

    // —— 计时器递减 ——
    if (this.invuln > 0)        this.invuln -= dt;
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.ghostTimer > 0)    this.ghostTimer -= dt;
    else this.ghostRect = null;

    // —— 受伤恢复 ——
    if (this.state === "hurt" && this.invuln <= 0) {
      this.state = this.onGround ? "idle" : "jump";
      this.vx = 0;
    }

    // —— 弹反恢复 ——
    if (this.state === "parry") {
      if (!this.parrySystem || !this.parrySystem.active) {
        this.state = this.onGround ? "idle" : "jump";
        this.vx = 0;
      }
    }

    // —— 闪避恢复 ——
    if (this.state === "dodge") {
      this.dodgeTimer -= dt;
      if (this.dodgeTimer <= 0) {
        this.state = this.onGround ? "idle" : "jump";
        this.vx = 0;
      }
    }

    const casting  = this.skill && this.skill.isCasting();
    const hurt     = this.state === "hurt";
    const dodging  = this.state === "dodge";
    const parrying = this.state === "parry";

    // ═══════ 水平移动（轻功替代行走）═══════
    let mx = 0;
    if (!casting && !hurt && !dodging && !parrying) {
      if (input.moveLeft())  mx -= 1;
      if (input.moveRight()) mx += 1;
      if (mx > 0)      this.facing = "right";
      else if (mx < 0) this.facing = "left";
    }
    this.vx = (casting || hurt || dodging || parrying) ? 0 : mx * this.lightSpeed;

    // ═══════ 轻功过渡：平滑进入/退出悬空 ═══════
    if (mx !== 0 && this.onGround && !casting && !hurt && !dodging && !parrying) {
      // 移动中 → 逐渐升空
      this.lightTransition = Math.min(1, this.lightTransition + this.lightTransitionRate);
    } else {
      // 停止移动 → 逐渐回落
      this.lightTransition = Math.max(0, this.lightTransition - this.lightTransitionRate);
    }

    // —— 跳跃触发 ——
    if (input.jumpPressed()) {
      if (this.jumpCount < this.maxJumps && !casting && !hurt && !dodging && !parrying) {
        this.startJump();
      }
    }

    // —— 蓄力跳 / 矮跳 ——
    if (this.isJumpHolding) {
      this.jumpHoldTimer += dt;
      if (!input.jumpDown() || input.jumpReleased()) {
        if (this.jumpHoldTimer < this.minJumpTime && this.vy < 0) {
          this.vy *= this.jumpCutSpeed;
        }
        this.isJumpHolding = false;
      }
    }

    // —— 重力与位移积分 ——
    if (!dodging) {
      this.vy += c.player.gravity;
      if (this.vy > c.player.maxFallSpeed) this.vy = c.player.maxFallSpeed;
      this.x += this.vx;
      this.y += this.vy;
    } else {
      this.y += this.vy;
      this.vy *= 0.85;
    }

    // —— 地面与边界 ——
    const groundY = map.groundY - this.h;
    if (this.y >= groundY) {
      this.y = groundY;
      this.vy = 0;
      if (!this.onGround) {
        this.jumpCount = 0;
        this.isJumpHolding = false;
        this.jumpHoldTimer = 0;
      }
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.y < 0) { this.y = 0; this.vy = 0; }

    const pad = c.world.boundaryPadding;
    if (this.x < pad) this.x = pad;
    if (this.x > map.width - this.w - pad) this.x = map.width - this.w - pad;

    // ═══════ 状态机（非动作锁定时的默认状态）═══════
    if (!casting && this.state !== "hurt" && this.state !== "dodge" && this.state !== "parry") {
      if (!this.onGround) {
        this.state = "jump";
      } else if (mx !== 0) {
        this.state = "lightstep";
      } else {
        this.state = "idle";
      }
    }

    // ═══════ 轻功粒子轨迹生成 ═══════
    if (this.state === "lightstep" && this.lightTransition > 0.3) {
      if (Math.random() < 0.45) this._spawnTrailParticle();
    }
    this._updateTrail(dt);

    // ═══════ 攻击推进 + 命中判定 ═══════
    if (this.skill) {
      this.skill.update(dt);
      const hb = this.skill.getActiveHitbox();
      if (hb) {
        this.applyHit(hb, map.enemies);
        this.clearCombatMarks();
      }
    }
  }

  // 将攻击判定盒与敌人矩形对接，命中结算伤害与击退
  applyHit(hb, enemies) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Collision.rectOverlap(hb, e.getRect())) {
        e.takeDamage(hb.damage);
        const dir = this.facing === "right" ? 1 : -1;
        e.x += dir * (hb.knockback || 0);
        AudioManager.play && AudioManager.play("hit");
      }
    }
  }

  takeDamage(d, attacker) {
    if (this.invuln > 0 || this.state === "dead") return true;

    if (this.parrySystem && this.parrySystem.active) {
      const parried = this.parrySystem.checkParryHit(attacker);
      if (parried) {
        console.log("[Player] 伤害被弹反拦截！");
        return false;
      }
    }

    this.hp -= d;
    this.invuln = this.consts.player.invulnMs;
    this.state = "hurt";
    this.clearCombatMarks();
    this.ghostRect = null;
    this.ghostTimer = 0;
    if (this.hp <= 0) { this.hp = 0; this.state = "dead"; }
    return true;
  }

  // ═══════ 渲染 ═══════

  draw(ctx) {
    const c = this.consts;
    ctx.save();

    let alpha = 1;

    // —— 状态透明度 ——
    if (this.state === "dodge") {
      alpha = 0.35 + Math.abs(Math.sin(performance.now() / 40)) * 0.35;
    } else if (this.state === "parry") {
      alpha = 0.7 + Math.abs(Math.sin(performance.now() / 50)) * 0.25;
    }

    ctx.globalAlpha = alpha;

    // —— 代码动画 y 偏移 ——
    const yOffset = this._computeYOffset();
    const drawX = this.x;
    const drawY = this.y + yOffset;

    // —— 轻功粒子轨迹（先绘，在角色脚下）——
    if (this.state === "lightstep" && this.trailParticles.length > 0) {
      this._drawTrail(ctx);
    }

    // —— 获取精灵图 ——
    const key    = this._spriteKeyForState();
    const sprite = key && this.asset ? this.asset.getImage(key) : null;

    if (sprite) {
      this._drawSprite(ctx, sprite, drawX, drawY);
    } else {
      this._drawFallback(ctx, c, drawX, drawY, yOffset);
    }

    // —— 受伤红色叠加 ——
    if (this.state === "hurt" && Math.floor(performance.now() / 80) % 2 === 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#a83232";
      ctx.fillRect(drawX, drawY, this.w, this.h);
    }

    // —— 残留碰撞箱绘制 ——
    if (this.ghostRect && this.ghostTimer > 0) {
      ctx.globalAlpha = 0.12 + Math.sin(performance.now() / 60) * 0.08;
      ctx.fillStyle = "#caa64a";
      ctx.fillRect(this.ghostRect.x, this.ghostRect.y, this.ghostRect.w, this.ghostRect.h);
      ctx.strokeStyle = "#caa64a";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.ghostRect.x, this.ghostRect.y, this.ghostRect.w, this.ghostRect.h);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ═══════ 绘制辅助 ═══════

  // 绘制精灵图，处理朝向翻转
  _drawSprite(ctx, img, dx, dy) {
    // lightstep.png 和 idle.png 均为面向左的参考帧
    // 朝右时水平翻转以保持对称动作
    const needFlip = this.facing === "right";

    if (needFlip) {
      ctx.translate(dx + this.w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(img, dx, dy, this.w, this.h);
    }
  }

  // 绘制轻功粒子轨迹（水墨风微尘）
  _drawTrail(ctx) {
    for (const p of this.trailParticles) {
      const progress = p.life / p.maxLife;
      const alpha = progress * p.alpha;
      const size  = p.size * (0.8 + progress * 0.2);

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
      grad.addColorStop(0,   `rgba(210,200,170,${(alpha * 0.8).toFixed(2)})`);
      grad.addColorStop(0.5, `rgba(170,160,130,${(alpha * 0.4).toFixed(2)})`);
      grad.addColorStop(1,    "rgba(140,130,100,0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 回退：无精灵图时用程序化矩形绘制
  _drawFallback(ctx, c, dx, dy, yOffset) {
    let body = c.colors.player;

    if (this.state === "hurt" && Math.floor(performance.now() / 80) % 2 === 0) {
      body = "#a83232";
    } else if (this.state === "parry") {
      body = "#c8d4e8";
    } else if (this.state === "lightstep") {
      body = "#4a5a6a";
    }

    ctx.fillStyle = body;
    ctx.fillRect(dx, dy, this.w, this.h);

    // 轻功状态：绘制悬空标线
    if (this.state === "lightstep" && yOffset > 3) {
      ctx.strokeStyle = "rgba(200,180,150,0.35)";
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(dx + 6, dy + this.h);
      ctx.lineTo(dx + this.w - 6, dy + this.h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 面部朝向标识
    ctx.fillStyle = c.colors.playerFace;
    const eyeX = this.facing === "right" ? dx + this.w - 10 : dx + 4;
    ctx.fillRect(eyeX, dy + 12, 6, 6);
  }
}
