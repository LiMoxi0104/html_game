// EnemyTideSpirit：水行·凝汐灵。
//   状态机：float（悬浮游走）→ attack（远程水流弹）→ float（循环）
//
//   精灵帧：xiaoguai/3/move/（默认朝左，28帧）+ xiaoguai/3/hit/（44帧）

class EnemyTideSpirit extends EnemyBase {
  constructor(cfg) {
    super(cfg);
    this.type  = cfg.type || "tideSpirit";
    this._state = "float";         // float | attack | dead

    // —— 移动 ——
    this._direction   = -1;        // 默认朝左
    this._moveSpeed   = cfg.moveSpeed   || 1.0;
    this._detectRadius = cfg.detectRadius || 350;

    // —— 远程攻击 ——
    this._attackRange    = cfg.attackRange    || 280;  // 进入此范围触发攻击
    this._attackCooldown = 0;                            // 冷却剩余 ms
    this._attackCooldownMax = cfg.attackCooldownMs || 1800;
    this._attackDamage   = cfg.damage || 12;

    // —— 精灵帧 ——
    this._moveFrames = [];           // move/ 序列（28帧）
    this._hitFrames  = [];           // hit/ 序列（44帧）
    this._frameIdx   = 0;
    this._MOVE_FRAME_MS = 72;        // ~14fps
    this._HIT_FRAME_MS  = 18;        // ~55fps

    // —— 悬浮动画 ——
    this._floatBaseY     = this.y;
    this._floatPhase     = Math.random() * Math.PI * 2;
    this._floatAmplitude = 16 + Math.random() * 20;  // 16-36px
    this._floatFreq      = 0.6 + Math.random() * 1.2;

    // —— 水流弹投射物 ——
    this._projectiles    = [];        // [{x, y, vx, vy, life, maxLife, damage}]
    this._projSpawned    = false;     // 本次攻击是否已发射水流弹
    this._projectileImage = null;    // 水球精灵图（由 GameMain 注入）

    // —— 渲染 ——
    this._renderW = cfg.renderW || 72;
    this._renderH = cfg.renderH || 72;

    // —— 世界引用 ——
    this._player = null;
    this._map    = null;
  }

  // ═══════════════ 外部注入 ═══════════════

  injectWorld(player, map) {
    this._player = player;
    this._map    = map;
  }

  setMoveFrames(frames) { this._moveFrames = frames || []; }
  setHitFrames(frames)  { this._hitFrames  = frames || []; }
  setProjectileImage(img) { this._projectileImage = img || null; }
  get hasFrames() { return this._moveFrames.length > 0; }

  // ═══════════════ 碰撞 ═══════════════

  getRect() {
    if (this._state === "dead") return null;
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // ═══════════════ 受击 ═══════════════

  takeDamage(d) {
    if (!this.alive || this._state === "dead") return;
    this.hp -= d;
    this.flash = 120;
    if (this.hp <= 0) {
      this.hp    = 0;
      this.alive = false;
      this._state = "dead";
    }
  }

  // ═══════════════ 主更新 ═══════════════

  update(dt) {
    super.update(dt);
    if (this.flash > 0) this.flash -= dt;
    if (!this.alive || this._state === "dead") return;
    if (this._imprisoned) return;      // ★ 禁锢中跳过行为逻辑

    // 攻击冷却递减
    if (this._attackCooldown > 0) this._attackCooldown -= dt;

    switch (this._state) {
      case "float":  this._updateFloat(dt);  break;
      case "attack": this._updateAttack(dt); break;
    }

    // 水流弹更新
    this._updateProjectiles(dt);
  }

  // ─── float：悬浮游走 ───

  _updateFloat(dt) {
    if (!this._player || this._player.state === "dead") {
      // 无目标时原地悬浮
      this._applyFloat(dt);
      this._advanceMoveFrame(dt);
      return;
    }

    const pcx = this._player.x + this._player.w / 2;
    const ecx = this.x + this.w / 2;
    const pcy = this._player.y + this._player.h / 2;
    const ecy = this.y + this.h / 2;
    const dx   = pcx - ecx;
    const dy   = pcy - ecy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 朝向玩家
    this._direction = dx >= 0 ? 1 : -1;

    // ★ 进入攻击范围 + 冷却就绪 → 触发远程攻击
    if (dist <= this._attackRange && this._attackCooldown <= 0) {
      this._enterAttack();
      return;
    }

    // ★ 进入检测范围 → 向玩家游动
    if (dist <= this._detectRadius) {
      const step = this._moveSpeed * (dt / 1000) * 60;
      if (dist > 0) {
        this.x += (dx / dist) * Math.min(dist, step);
      }
    }

    // 悬浮浮动
    this._applyFloat(dt);
    this._advanceMoveFrame(dt);
  }

  _applyFloat(dt) {
    this._floatPhase += this._floatFreq * (dt / 1000);
    this.y = this._floatBaseY + Math.sin(this._floatPhase) * this._floatAmplitude;
  }

  _advanceMoveFrame(dt) {
    if (this._moveFrames.length === 0) return;
    this._frameIdx += dt / this._MOVE_FRAME_MS;
    if (this._frameIdx >= this._moveFrames.length) {
      this._frameIdx -= this._moveFrames.length;
    }
  }

  // ─── attack：播放 hit 帧 + 发射水流弹 ───

  _enterAttack() {
    this._state      = "attack";
    this._frameIdx   = 0;
    this._projSpawned = false;
  }

  _updateAttack(dt) {
    this._frameIdx += dt / this._HIT_FRAME_MS;

    // ★ 动画播放至约 40% 进度时发射水流弹（只发射一次）
    const total = this._hitFrames.length;
    const ratio = this._frameIdx / total;
    if (!this._projSpawned && ratio >= 0.35) {
      this._spawnProjectile();
      this._projSpawned = true;
    }

    // 动画播放完毕 → 回到 float
    if (this._frameIdx >= total) {
      this._frameIdx = 0;
      this._state    = "float";
      this._attackCooldown = this._attackCooldownMax;
    }
  }

  // ─── 水流弹投射物 ───

  _spawnProjectile() {
    if (!this._player) return;

    // 发射位置：敌人前方
    const dir = this._direction;
    const cx  = this.x + this.w / 2 + dir * 20;
    const cy  = this.y + this.h / 2;

    // 目标方向（发射时玩家的位置）
    const tx = this._player.x + this._player.w / 2;
    const ty = this._player.y + this._player.h / 2;
    const ddx = tx - cx;
    const ddy = ty - cy;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;

    const speed = 3.2;
    this._projectiles.push({
      x: cx, y: cy,
      vx: (ddx / dist) * speed,
      vy: (ddy / dist) * speed,
      life: 2000,        // 生命周期 2s（飞足够远后自毁）
      maxLife: 2000,
      damage: this._attackDamage,
      radius: 8
    });
  }

  _updateProjectiles(dt) {
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;

      // ★ 水球命中玩家：圆形碰撞检测 + 伤害判定
      if (this._player && this._player.state !== "dead") {
        const pr = this._player.getRect();
        if (pr && Collision.circleRect(p.x, p.y, p.radius, pr)) {
          this._player.takeDamage(p.damage);
          this._projectiles.splice(i, 1);
          continue;
        }
      }

      // 生命周期结束或飞出边界
      if (p.life <= 0 || p.x < -100 || p.x > (this._map ? this._map.width + 100 : 3000)) {
        this._projectiles.splice(i, 1);
      }
    }
  }

  // ═══════════════ 渲染 ═══════════════

  draw(ctx) {
    if (!this.alive || this._state === "dead") return;

    // —— 水流弹渲染（在精灵下方）——
    this._drawProjectiles(ctx);

    ctx.save();

    // —— 精灵渲染 ——
    const currentFrame = this._getCurrentFrame();
    if (currentFrame) {
      if (this._direction > 0) {
        ctx.translate(this.x + this._renderW, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(currentFrame, 0, 0, this._renderW, this._renderH);
      } else {
        ctx.drawImage(currentFrame, this.x, this.y, this._renderW, this._renderH);
      }
    } else {
      this._drawFallback(ctx);
    }

    // —— 闪白（精灵之后叠加，确保 source-atop 有效）——
    if (this.flash > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = Math.min(0.6, this.flash / 120);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.restore();
    }

    ctx.restore();

    // —— 血条 ——
    if (this.alive) this._drawWorldBar(ctx, this.w);
  }

  _getCurrentFrame() {
    const idx = Math.floor(this._frameIdx);

    if (this._state === "float") {
      if (this._moveFrames.length === 0) return null;
      return this._moveFrames[idx % this._moveFrames.length];
    }

    if (this._state === "attack" && this._hitFrames.length > 0) {
      return this._hitFrames[Math.min(idx, this._hitFrames.length - 1)];
    }

    return null;
  }

  _drawProjectiles(ctx) {
    for (const p of this._projectiles) {
      const alpha = Math.min(1, p.life / (p.maxLife * 0.3));
      ctx.save();
      ctx.globalAlpha = alpha;

      if (this._projectileImage) {
        // ★ 使用注入的水球精灵图（居中渲染）
        const size = p.radius * 2;  // 渲染尺寸（直径），原 50%
        ctx.drawImage(
          this._projectileImage,
          p.x - size / 2, p.y - size / 2,
          size, size
        );
      } else {
        // 回退：程序化绘制
        // 外层辉光
        ctx.globalAlpha = alpha * 0.3;
        const glow = ctx.createRadialGradient(p.x, p.y, p.radius * 0.3, p.x, p.y, p.radius * 2.5);
        glow.addColorStop(0, "rgba(120,200,255,0.6)");
        glow.addColorStop(1, "rgba(58,140,220,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 核心水滴
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = `rgba(100,180,240,0.85)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  _drawFallback(ctx) {
    // 水元素程序化精灵
    const pulse = 0.7 + Math.sin(performance.now() / 250) * 0.3;
    const grad = ctx.createRadialGradient(
      this.x + this.w / 2, this.y + this.h / 2, this.w * 0.1,
      this.x + this.w / 2, this.y + this.h / 2, this.w * 0.65
    );
    grad.addColorStop(0, `rgba(160,220,255,${0.85 * pulse})`);
    grad.addColorStop(0.5, `rgba(60,140,220,${0.5 * pulse})`);
    grad.addColorStop(1, "rgba(20,60,120,0)");

    ctx.fillStyle = grad;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 核心水滴形
    ctx.fillStyle = `rgba(200,240,255,${0.7 * pulse})`;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h * 0.4, this.w * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}
