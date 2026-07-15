// EnemyEmberSpirit：火行·烬火游灵。
//   状态机：float（悬浮追踪）→ explode（正向爆炸）→ corpse（等待复活）
//         → revive（逆向重现）→ float（循环）
//         累计爆炸2次 → dead（彻底销毁）
//
//   精灵帧：xiaoguai/4/move/（默认朝左）+ xiaoguai/4/hit/

class EnemyEmberSpirit extends EnemyBase {
  constructor(cfg) {
    super(cfg);
    this.type = cfg.type || "emberSpirit";
    this._state = "float";        // float | explode | corpse | revive | dead

    // —— 移动与追踪 ——
    this._direction  = -1;        // 默认朝左
    this._chaseSpeed = cfg.chaseSpeed    || 2.2;
    this._detectRadius = cfg.detectRadius || 280;

    // —— 爆炸参数 ——
    this._proximityRadius = cfg.proximityRadius || 55;  // 触发爆炸距离
    this._explodeRadius   = cfg.explodeRadius   || 38;  // 圆形 AoE，与活跃帧图片尺寸相近（renderW/2≈36+padding）
    this._explodeDamage   = cfg.damage          || 20;
    this._explosionCount  = 0;
    this._maxExplosions   = 2;
    this._hurtEntities    = new Set();   // 本次爆炸已伤害实体去重

    // —— 伤害帧窗口：仅帧号 91-101 触发伤害（hit 序列最后 11 帧）——
    this._damageStartIdx  = 0;
    this._damageEndIdx    = 0;

    // —— 复活 ——
    this._reviveRange = cfg.reviveRange || 380;  // 触发复活距离

    // —— 精灵帧 ——
    this._moveFrames = [];            // HTMLImageElement[]，move/ 序列（36帧）
    this._hitFrames  = [];            // HTMLImageElement[]，hit/ 序列（~88帧）
    this._frameIdx   = 0;             // 浮点帧索引
    this._MOVE_FRAME_MS = 72;         // ~14fps（36帧 ≈ 2.6s 循环）
    this._HIT_FRAME_MS  = 18;         // ~55fps（88帧 ≈ 1.6s 单次）

    // —— 悬浮动画 ——
    this._floatBaseY     = this.y;
    this._floatPhase     = Math.random() * Math.PI * 2;
    this._floatAmplitude = 24 + Math.random() * 24;  // 24-48px 正弦波动
    this._floatFreq      = 0.8 + Math.random() * 1.4;

    // —— 渲染尺寸 ——
    this._renderW = cfg.renderW || 80;
    this._renderH = cfg.renderH || 80;

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
  setHitFrames(frames) {
    this._hitFrames = frames || [];
    // 伤害帧窗口：对应 hit 文件夹中 frame_000091 ~ frame_000101（末尾 11 帧）
    this._damageStartIdx = Math.max(0, this._hitFrames.length - 11);
    this._damageEndIdx   = Math.max(0, this._hitFrames.length - 1);
  }

  get hasFrames() { return this._moveFrames.length > 0; }

  // ═══════════════ 碰撞 — 仅 float/revive 状态可被碰撞 ═══════════════

  getRect() {
    if (this._state === "corpse" || this._state === "dead") return null;
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // 爆炸圆形碰撞区（供外界检测）
  getExplodeCircle() {
    if (this._state !== "explode") return null;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    return { cx, cy, r: this._explodeRadius };
  }

  /** 获取同地图所有敌人（用于爆炸溅射） */
  _getEnemies() {
    return this._map ? (this._map.enemies || []) : [];
  }

  // ═══════════════ 受击 — 仅爆炸可杀死，普通伤害最低留1血 ═══════════════

  takeDamage(d) {
    if (!this.alive || this._state === "dead" || this._state === "corpse") return;
    this.hp -= d;
    this.flash = 120;
    // 不会被普通攻击杀死，最低保留 1 血
    if (this.hp <= 0) this.hp = 1;
  }

  // ═══════════════ 主更新 ═══════════════

  update(dt) {
    super.update(dt);
    if (this.flash > 0) this.flash -= dt;
    if (!this.alive || this._state === "dead") return;
    if (this._imprisoned) return;      // ★ 禁锢中跳过行为逻辑

    switch (this._state) {
      case "float":  this._updateFloat(dt);  break;
      case "explode": this._updateExplode(dt); break;
      case "corpse": this._updateCorpse(dt); break;
      case "revive": this._updateRevive(dt); break;
    }
  }

  // ─── float：悬浮追踪 ───

  _updateFloat(dt) {
    if (!this._player || this._player.state === "dead") return;

    const pcx = this._player.x + this._player.w / 2;
    const ecx = this.x + this.w / 2;
    const dx   = pcx - ecx;

    // 朝向玩家
    this._direction = dx >= 0 ? 1 : -1;

    const dist = Math.abs(dx);

    // ★ 碰撞箱重合 → 立即爆炸
    const myRect = this.getRect();
    const playerRect = this._player.getRect();
    if (myRect && playerRect && Collision.rectOverlap(myRect, playerRect)) {
      this._enterExplode();
      return;
    }

    // ★ 追踪移动：玩家进入检测范围后持续追击
    if (dist <= this._detectRadius) {
      const step = this._chaseSpeed * (dt / 1000) * 60;  // 60fps 归一化
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
    }

    // ★ 悬浮浮动（y = baseY + sin(phase) * amplitude）
    this._floatPhase += this._floatFreq * (dt / 1000);
    this.y = this._floatBaseY + Math.sin(this._floatPhase) * this._floatAmplitude;

    // 帧推进（循环）
    this._frameIdx += dt / this._MOVE_FRAME_MS;
    if (this._frameIdx >= this._moveFrames.length) {
      this._frameIdx -= this._moveFrames.length;
    }
  }

  // ─── explode：正向播放 hit 帧，AOE 伤害 ───

  _enterExplode() {
    this._state    = "explode";
    this._frameIdx = 0;
    this._hurtEntities.clear();
    // 保险：若帧尚未注入则延迟计算伤害窗口
    if (!this._damageStartIdx && this._hitFrames.length > 11) {
      this._damageStartIdx = this._hitFrames.length - 11;
      this._damageEndIdx   = this._hitFrames.length - 1;
    }
  }

  _updateExplode(dt) {
    this._frameIdx += dt / this._HIT_FRAME_MS;

    // ★ 仅帧号 91-101（_damageStartIdx ~ _damageEndIdx）触发伤害判定
    const idx = Math.floor(this._frameIdx);
    if (idx >= this._damageStartIdx && idx <= this._damageEndIdx) {
      this._applyExplodeDamage();
    }

    // 动画播放完毕 → 进入 corpse
    const total = this._hitFrames.length;
    if (this._frameIdx >= total) {
      this._frameIdx = total - 1;  // 定格末帧
      this._onExplodeFinished();
    }
  }

  _applyExplodeDamage() {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const r  = this._explodeRadius;

    // 伤害玩家
    if (this._player && this._player.state !== "dead") {
      const pr = this._player.getRect();
      if (pr && Collision.circleRect(cx, cy, r, pr)) {
        const key = "player";
        if (!this._hurtEntities.has(key)) {
          this._hurtEntities.add(key);
          this._player.takeDamage(this._explodeDamage);
        }
      }
    }

    // 溅射伤害其他敌人
    for (const other of this._getEnemies()) {
      if (other === this || !other.alive) continue;
      const or = other.getRect && other.getRect();
      if (!or) continue;
      if (Collision.circleRect(cx, cy, r, or)) {
        const key = other.id || other;
        if (!this._hurtEntities.has(key)) {
          this._hurtEntities.add(key);
          if (typeof other.takeDamage === "function") {
            other.takeDamage(Math.floor(this._explodeDamage * 0.6));
          }
        }
      }
    }
  }

  _onExplodeFinished() {
    this._explosionCount++;
    if (this._explosionCount >= this._maxExplosions) {
      // ★ 彻底销毁
      this.hp    = 0;
      this.alive = false;
      this._state = "dead";
      return;
    }
    // 进入尸体状态（生命减半）
    this.hp    = Math.ceil(this.hp / 2);
    this._state = "corpse";
    this._hurtEntities.clear();
  }

  // ─── corpse：等待玩家靠近 → 复活 ───

  _updateCorpse(dt) {
    if (!this._player || this._player.state === "dead") return;

    const pcx = this._player.x + this._player.w / 2;
    const ecx = this.x + this.w / 2;
    const pcy = this._player.y + this._player.h / 2;
    const ecy = this.y + this.h / 2;
    const dx = pcx - ecx;
    const dy = pcy - ecy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= this._reviveRange) {
      this._state    = "revive";
      this._frameIdx = this._hitFrames.length - 1;  // 从未帧开始倒放
    }
  }

  // ─── revive：逆向播放 hit 帧，重现 ───

  _updateRevive(dt) {
    this._frameIdx -= dt / this._HIT_FRAME_MS;

    // 重现场景的浮动效果
    this._floatPhase += this._floatFreq * 0.6 * (dt / 1000);
    this.y = this._floatBaseY + Math.sin(this._floatPhase) * this._floatAmplitude * 0.5;

    if (this._frameIdx <= 0) {
      this._frameIdx = 0;
      this._state    = "float";  // 复活完成，恢复追踪
      this.y         = this._floatBaseY;
    }
  }

  // ═══════════════ 渲染 ═══════════════

  draw(ctx) {
    // corpse 状态完全不可见
    if (this._state === "corpse" || this._state === "dead") return;

    ctx.save();

    // —— 精灵渲染 ——
    const currentFrame = this._getCurrentFrame();
    if (currentFrame) {
      // 默认朝左；右朝向时镜像翻转
      if (this._direction > 0) {
        ctx.translate(this.x + this._renderW, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(currentFrame, 0, 0, this._renderW, this._renderH);
      } else {
        ctx.drawImage(currentFrame, this.x, this.y, this._renderW, this._renderH);
      }
    } else {
      // 回退：程序化火焰精灵
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

    // —— 血条（始终在世界空间，不受变换影响）——
    if (this.alive && this._state !== "corpse") {
      this._drawWorldBar(ctx, this.w);
    }
  }

  _getCurrentFrame() {
    const idx = Math.floor(this._frameIdx);

    if (this._state === "float") {
      if (this._moveFrames.length === 0) return null;
      return this._moveFrames[idx % this._moveFrames.length];
    }

    // explode / revive 共用 hit 帧
    if ((this._state === "explode" || this._state === "revive") && this._hitFrames.length > 0) {
      const clamped = Math.max(0, Math.min(idx, this._hitFrames.length - 1));
      return this._hitFrames[clamped];
    }

    return null;
  }

  _drawFallback(ctx) {
    // 火焰色程序化精灵
    const pulse = 0.8 + Math.sin(performance.now() / 200) * 0.2;
    const grad = ctx.createRadialGradient(
      this.x + this.w / 2, this.y + this.h / 2, this.w * 0.1,
      this.x + this.w / 2, this.y + this.h / 2, this.w * 0.7
    );
    grad.addColorStop(0, `rgba(255,180,30,${0.9 * pulse})`);
    grad.addColorStop(0.5, `rgba(220,80,10,${0.6 * pulse})`);
    grad.addColorStop(1, `rgba(180,30,5,0)`);

    ctx.fillStyle = grad;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 核心光点
    ctx.fillStyle = `rgba(255,255,200,${0.8 * pulse})`;
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, this.w * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

}
