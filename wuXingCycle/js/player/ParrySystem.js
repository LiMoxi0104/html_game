// ParrySystem：匕首弹反系统。
//
// 判定流程：
//   L 键按下  →  trigger()    开启 200ms 判定窗口，播放 parry 格挡音效
//   窗口内受击 →  checkParryHit()  完美弹反，播放 parry_success 音效
//   窗口超时  →  _endParryState()  失败恢复
//
// 弹反成功效果：
//   - 时停（67ms / 0.2x 时间缩放）
//   - 击退攻击者 + 反伤 10 点
//   - 玩家 1s 无敌 + canExecute 标记
//   - 屏幕闪白 + 银白火花 + "弹反"浮动文字
//   - 播放 parry_success 音效（判定瞬间）

class ParrySystem {
  constructor(player, consts) {
    this.player = player;
    this.consts = consts;

    // 状态
    this.active  = false;        // 弹反窗口是否开启
    this.success = false;        // 是否触发完美弹反
    this.timer   = 0;            // 窗口剩余（ms）
    this.windowMs = 200;         // 判定窗口时长（ms）
    this.invuln  = 0;            // 无敌帧（ms，内部记录）
    this.cooldown = 0;           // 冷却剩余（ms）
    this.cooldownMs = 300;       // 冷却时长（ms）

    // 视觉反馈
    this.flashAlpha = 0;         // 屏幕闪白透明度
    this.sparks     = [];        // 火花粒子 [{x, y, vx, vy, life}]

    // 浮动文字标记
    this._showParryText = false;
  }

  // ==================== 触发 ====================

  trigger() {
    // 冷却中 / 非法状态则忽略
    if (this.cooldown > 0) return;
    if (!this.player
        || this.player.state === "dead"
        || this.player.state === "attack"
        || this.player.state === "hurt"
        || this.player.state === "dodge") return;

    this.active  = true;
    this.success = false;
    this.timer   = this.windowMs;
    this.cooldown = this.cooldownMs;

    this.player.state = "parry";                       // 锁定动作
    AudioManager.play("parry");                         // ★ 格挡音效
  }

  // ==================== 结束弹反状态 ====================

  _endParryState() {
    if (this.player.state === "parry") {
      this.player.state = this.player.onGround ? "idle" : "jump";
      this.player.vx = 0;
    }
    this.active = false;
  }

  // ==================== 弹反成功判定 ====================

  checkParryHit(attacker) {
    if (!this.active) return false;

    // ---------- 完美弹反 ----------
    this.success = true;
    AudioManager.play("parry_success");                 // ★ 成功音效（同帧触发，零延迟）

    // 无敌帧
    this.invuln = 1000;
    this.player.invuln = 1000;

    // 全局时停
    if (window.__WX_SAVE__) {
      window.__WX_SAVE__.freezeTimer = this.consts.freeze.parryMs || 67;
      window.__WX_SAVE__.timeScale   = this.consts.timeScale.parryFreeze || 0.2;
    }

    // 击退 + 反伤
    const dir = this.player.facing === "right" ? 1 : -1;
    if (attacker && typeof attacker.alive !== "undefined") {
      attacker.x += dir * 28;
      if (attacker.takeDamage) attacker.takeDamage(10);
    }

    // 处决标记
    this.player.canExecute = true;
    this.player.canCounter = false;

    // 视觉反馈
    this.flashAlpha = 0.7;
    this._spawnSparks(
      this.player.x + this.player.w / 2,
      this.player.y + this.player.h / 2
    );
    this._showParryText = true;

    // 恢复控制
    this._endParryState();

    return true;
  }

  // ==================== 每帧更新 ====================

  update(dt) {
    // 冷却
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    // 无敌帧
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    // 判定窗口
    if (this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (!this.success) this._endParryState();
        this.active = false;
      }
    }

    // 闪光衰减
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.003);

    // 粒子
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= dt;
      if (p.life <= 0) this.sparks.splice(i, 1);
    }
  }

  // ==================== 渲染 ====================

  draw(ctx) {
    if (!this.active && !this.success && this.sparks.length === 0 && this.flashAlpha <= 0) return;
    ctx.save();

    // 屏幕闪白
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(245,240,230,${this.flashAlpha})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // 匕首格挡动画
    if (this.active) {
      const p = this.player;
      ctx.strokeStyle = "#c0c0c0";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      const dir = p.facing === "right" ? 1 : -1;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h * 0.38;
      ctx.beginPath();
      ctx.moveTo(cx - 22 * dir, cy - 6);
      ctx.lineTo(cx + 26 * dir, cy + 4);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 20 * dir, cy + 2);
      ctx.lineTo(cx + 30 * dir, cy + 8);
      ctx.stroke();
      // 进度条
      const progress = this.timer / this.windowMs;
      ctx.fillStyle = "rgba(192,192,192,0.4)";
      ctx.fillRect(p.x - 4, p.y - 12, p.w + 8 * (dir === 1 ? progress : (1 - progress)), 3);
    }

    // 银白火花
    for (const p of this.sparks) {
      ctx.globalAlpha = Math.min(1, p.life / 200);
      ctx.fillStyle = "#e8e8f0";
      const size = 2 + (p.life / 200) * 3;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }

    ctx.restore();
  }

  // ==================== 内部：生成火花 ====================

  _spawnSparks(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      this.sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 200 + Math.random() * 250
      });
    }
  }
}
