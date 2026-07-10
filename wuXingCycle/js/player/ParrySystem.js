// ParrySystem：匕首弹反系统。
// 判定逻辑：
//   - 按下 L 键触发，开启 200ms 判定窗口，进入 "parry" 状态（锁定动作）
//   - 若窗口内受到攻击 → 完美弹反：时停 + 击退 + 银白火花 + "弹反"文字 + 1s 无敌 + canExecute 标记
//   - 窗口内无受击 → 失败，恢复状态
//   - 弹反成功后延长无敌时间
//
// v4 修复：
//   - 打通伤害→弹反检测链路：Player.takeDamage 首先询问 ParrySystem
//   - 无敌帧正确传递到 Player.invuln
//   - 弹反期间锁定玩家状态为 "parry"，屏蔽移动/跳跃/攻击/闪避
//   - 与闪避、二段跳完全兼容（互斥）
class ParrySystem {
  constructor(player, consts) {
    this.player = player;
    this.consts = consts;
    this.active = false;          // 弹反窗口是否开启
    this.success = false;         // 是否完美弹反
    this.timer = 0;               // 窗口剩余 ms
    this.windowMs = 200;          // 完美弹反判定窗口
    this.invuln = 0;              // 弹反无敌帧剩余 ms（内部记录）
    this.cooldown = 0;            // 冷却剩余 ms
    this.parryDuration = 280;     // 弹反动作总持续时间 ms（含窗口+收招硬直）

    // 视觉反馈状态
    this.flashAlpha = 0;          // 屏幕闪白透明度
    this.sparks = [];             // 碰撞火花粒子 [{x, y, vx, vy, life}]

    // —— v3 增强：弹反成功后通知 GameMain 显示浮动文字 ——
    this._showParryText = false;  // 标记：本帧需显示"弹反"文字
  }

  // 由 GameMain 在检测到 parry 槽位触发时调用
  trigger() {
    if (this.cooldown > 0) return;
    if (!this.player || this.player.state === "dead"
        || this.player.state === "attack"
        || this.player.state === "hurt"
        || this.player.state === "dodge") return;

    this.active = true;
    this.success = false;
    this.timer = this.windowMs;
    this.cooldown = 300;           // 固定冷却 300ms（与 parry_dagger 的 cooldownMs 一致）

    // ★ v4 锁定状态为 "parry"（屏蔽移动/跳跃/攻击/闪避）
    this.player.state = "parry";
    AudioManager.play && AudioManager.play("parry");   // 弹反音效（如有）

    console.log("[ParrySystem] 弹反触发！窗口 200ms");
  }

  // ★ v4 核心修复：结束弹反状态（无论成功或超时）
  // 由 Player.takeDamage（成功时）或 ParrySystem.update（超时时）调用
  _endParryState() {
    if (this.player.state === "parry") {
      // 恢复为 idle 或 jump（根据当前地面状态）
      this.player.state = this.player.onGround ? "idle" : "jump";
      this.player.vx = 0;
    }
    this.active = false;
  }

  // 由外部（Player.takeDamage / 碰撞检测）在判定窗口内受击时调用
  // 返回 true 表示弹反成功并拦截了伤害
  checkParryHit(attacker) {
    if (!this.active) return false;

    // 完美弹反！
    this.success = true;

    // ★ v4 修复：同时设置 Player.invuln（之前仅设内部 this.invuln，导致无效）
    this.invuln = 1000;
    this.player.invuln = 1000;        // ← 关键修复！无敌帧归属 Player

    // 时停效果（通过全局 freezeTimer）
    if (window.__WX_SAVE__) {
      window.__WX_SAVE__.freezeTimer = this.consts.freeze.parryMs || 67;
      window.__WX_SAVE__.timeScale = this.consts.timeScale.parryFreeze || 0.2;
    }

    // 击退攻击者（仅对有 alive 属性的敌人生效，陷阱不击退）
    const dir = this.player.facing === "right" ? 1 : -1;
    if (attacker && typeof attacker.alive !== "undefined") {
      attacker.x += dir * 28;
      if (attacker.takeDamage) attacker.takeDamage(10);  // 弹反反伤
    }

    // 设置处决标记
    this.player.canExecute = true;
    this.player.canCounter = false;   // 弹反优先于完美闪避标记

    // 视觉：屏幕闪白 + 碰撞火花
    this.flashAlpha = 0.7;
    this._spawnSparks(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);

    // 触发浮动文字显示（由 GameMain.update 中消费）
    this._showParryText = true;

    // ★ v4 结束 parry 锁定状态（恢复控制权）
    this._endParryState();

    console.log("[ParrySystem] 完美弹反！canExecute=true, player.invuln=1000ms");
    return true;
  }

  update(dt) {
    // 冷却递减
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    // 无敌帧递减
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    // 判定窗口计时
    if (this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        // 窗口关闭且未触发 → 失败，恢复状态
        if (!this.success) {
          this._endParryState();       // ★ v4 超时也要恢复状态
          console.log("[ParrySystem] 弹反窗口关闭（未命中）");
        }
        this.active = false;
      }
    }

    // 闪光衰减
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.003);

    // 粒子更新
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;       // 微重力
      p.life -= dt;
      if (p.life <= 0) this.sparks.splice(i, 1);
    }
  }

  draw(ctx) {
    if (!this.active && !this.success && this.sparks.length === 0 && this.flashAlpha <= 0) return;

    ctx.save();

    // 屏幕闪白（弹反成功时）
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(245,240,230,${this.flashAlpha})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // 弹反动作绘制（匕首横格挡动画）
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
      // 匕首柄
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 20 * dir, cy + 2);
      ctx.lineTo(cx + 30 * dir, cy + 8);
      ctx.stroke();

      // 判定窗口进度条提示
      const progress = this.timer / this.windowMs;
      ctx.fillStyle = "rgba(192,192,192,0.4)";
      ctx.fillRect(p.x - 4, p.y - 12, p.w + 8 * (dir === 1 ? progress : (1 - progress)), 3);
    }

    // 碰撞银白火花粒子
    for (const p of this.sparks) {
      ctx.globalAlpha = Math.min(1, p.life / 200);
      ctx.fillStyle = "#e8e8f0";
      const size = 2 + (p.life / 200) * 3;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }

    ctx.restore();
  }

  _spawnSparks(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      this.sparks.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 200 + Math.random() * 250
      });
    }
  }
}
