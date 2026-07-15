// EnemyThornSeed：木行·棘藤种。
//   固定位置，无移动能力。状态机：shake（循环摆动）→ hit（碰撞触发攻击）→ shake
//
//   精灵帧：xiaoguai/2/shake/（48帧，默认朝左）+ xiaoguai/2/hit/（60帧）

class EnemyThornSeed extends EnemyBase {
  constructor(cfg) {
    super(cfg);
    this.type  = cfg.type || "thornSeed";
    this._state = "shake";        // shake | hit | dead

    // —— 攻击参数 ——
    this._attackDamage    = cfg.damage          || 18;
    this._attackCooldown  = 0;
    this._attackCooldownMax = cfg.attackCooldownMs || 1200;

    // —— 前一帧是否与玩家碰撞（用于去重触发）——
    this._wasColliding = false;

    // —— 精灵帧 ——
    this._shakeFrames = [];        // shake/ 序列（48帧）
    this._hitFrames   = [];        // hit/ 序列（60帧）
    this._frameIdx    = 0;
    this._SHAKE_FRAME_MS = 62;     // ~16fps（48帧 ≈ 3s 循环）
    this._HIT_FRAME_MS   = 24;     // ~42fps（60帧 ≈ 1.4s 单次）

    // —— 伤害帧窗口：仅 hit 帧号 97-107（对应数组末尾 11 帧）——
    this._damageStartIdx = 0;
    this._damageEndIdx   = 0;
    this._damageApplied  = false;  // 本次攻击是否已造成伤害

    // —— 渲染 ——
    this._renderW = cfg.renderW || 72;
    this._renderH = cfg.renderH || 72;

    // —— 世界引用 ——
    this._player = null;
  }

  // ═══════════════ 外部注入 ═══════════════

  injectWorld(player, map) {
    this._player = player;
    this._map    = map;
  }

  setShakeFrames(frames) { this._shakeFrames = frames || []; }
  setHitFrames(frames) {
    this._hitFrames = frames || [];
    // 伤害帧窗口：对应 hit 文件夹中 frame_000097 ~ frame_000107（末尾 11 帧）
    this._damageStartIdx = Math.max(0, this._hitFrames.length - 11);
    this._damageEndIdx   = Math.max(0, this._hitFrames.length - 1);
  }
  get hasFrames() { return this._shakeFrames.length > 0; }

  // ═══════════════ 地面吸附 ═══════════════

  /** 持续吸附至地面：防止受击击退导致浮空（荆棘藤种为固定位置敌人） */
  _snapToGround() {
    if (!this._map) return;
    const groundY = this._map.groundY;
    const correctY = groundY - this.h;
    if (Math.abs(this.y - correctY) > 1) {
      this.y += (correctY - this.y) * 0.6;  // 渐进快速吸附
    }
  }

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
      case "shake": this._updateShake(dt); break;
      case "hit":   this._updateHit(dt);   break;
    }

    // ★ 持续地面吸附：防止受击击退导致浮空
    this._snapToGround();
  }

  // ─── shake：循环摆动，检测碰撞触发攻击 ───

  _updateShake(dt) {
    // —— 碰撞检测 ——
    if (this._player && this._player.state !== "dead" && this._attackCooldown <= 0) {
      const myRect = this.getRect();
      const pr = this._player.getRect();
      const colliding = myRect && pr && Collision.rectOverlap(myRect, pr);

      if (colliding) {
        // 只在首次接触时触发（避免每帧重复触发）
        if (!this._wasColliding) {
          this._enterHit();
          return;
        }
      }
      this._wasColliding = colliding;
    } else {
      this._wasColliding = false;
    }

    // —— 循环播放 shake 帧 ——
    if (this._shakeFrames.length > 0) {
      this._frameIdx += dt / this._SHAKE_FRAME_MS;
      if (this._frameIdx >= this._shakeFrames.length) {
        this._frameIdx -= this._shakeFrames.length;
      }
    }
  }

  // ─── hit：播放 hit 帧一次，特定帧范围伤害 ───

  _enterHit() {
    this._state         = "hit";
    this._frameIdx      = 0;
    this._damageApplied = false;
  }

  _updateHit(dt) {
    this._frameIdx += dt / this._HIT_FRAME_MS;

    // ★ 仅在帧 97-107 期间，且玩家仍在碰撞中 → 造成伤害（仅一次）
    const idx = Math.floor(this._frameIdx);
    if (!this._damageApplied &&
        idx >= this._damageStartIdx &&
        idx <= this._damageEndIdx) {
      this._tryApplyDamage();
    }

    // 动画播放完毕 → 回到 shake
    if (this._frameIdx >= this._hitFrames.length) {
      this._frameIdx = 0;
      this._state    = "shake";
      this._attackCooldown = this._attackCooldownMax;
      this._wasColliding   = false;
    }
  }

  _tryApplyDamage() {
    if (!this._player || this._player.state === "dead") return;

    const myRect = this.getRect();
    const pr = this._player.getRect();
    if (myRect && pr && Collision.rectOverlap(myRect, pr)) {
      this._player.takeDamage(this._attackDamage);
      this._damageApplied = true;
    }
  }

  // ═══════════════ 渲染 ═══════════════

  draw(ctx) {
    if (!this.alive || this._state === "dead") return;

    ctx.save();

    // —— 精灵渲染（默认朝左）——
    const currentFrame = this._getCurrentFrame();
    if (currentFrame) {
      ctx.drawImage(currentFrame, this.x, this.y, this._renderW, this._renderH);
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

    if (this._state === "shake") {
      if (this._shakeFrames.length === 0) return null;
      return this._shakeFrames[idx % this._shakeFrames.length];
    }

    if (this._state === "hit" && this._hitFrames.length > 0) {
      return this._hitFrames[Math.min(idx, this._hitFrames.length - 1)];
    }

    return null;
  }

  _drawFallback(ctx) {
    // 木元素程序化精灵
    const pulse = 0.7 + Math.sin(performance.now() / 300) * 0.3;
    ctx.fillStyle = `rgba(46,139,87,${0.7 * pulse})`;
    ctx.fillRect(this.x + this.w * 0.15, this.y, this.w * 0.7, this.h);

    // 棘刺纹理
    ctx.fillStyle = `rgba(34,100,60,${0.6 * pulse})`;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const sx = cx + Math.cos(a) * this.w * 0.25;
      const sy = cy + Math.sin(a) * this.h * 0.25;
      const ex = cx + Math.cos(a) * this.w * 0.45;
      const ey = cy + Math.sin(a) * this.h * 0.45;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(34,100,60,${0.4 * pulse})`;
      ctx.stroke();
    }

    // 核心
    ctx.fillStyle = `rgba(80,180,80,${0.5 * pulse})`;
    ctx.beginPath();
    ctx.arc(cx, cy, this.w * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}
