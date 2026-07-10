// Player：五行传人。负责自由上下左右移动、跳跃、边界限制与状态机（idle/walk/jump/attack/hurt/dodge/parry/dead）。
// 状态优先级：dead > hurt > parry > dodge > attack > 移动(idle/walk/jump)
//
// 攻击逻辑委托给 SkillSystem：当攻击施放时，状态锁定为 attack，并由 SkillSystem 在"挥击命中"关键帧输出判定盒，
// Player.applyHit 使用 Collision 对接敌人矩形，完成命中结算。
//
// v2 增强：
//   - dodge 闪避状态：Shift 触发，向面朝反方向瞬移 + 无敌 + 原位置残留碰撞箱（完美闪避判定）
//   - canCounter 标记：完美闪避成功后设置，预留反击接口
//   - canExecute 标记：弹反成功后设置，预留处决接口
//
// v3 跳跃增强：
//   - 多段跳系统：支持二段跳（maxJumps=2），空中可再按空格触发二段跳
//   - 蓄力跳机制：按住空格持续上升至最大高度，提前松开则快速下落（矮跳）
//
// v4 弹反增强：
//   - 弹反状态锁定："parry" 状态屏蔽移动/跳跃/攻击/闪避
//   - takeDamage 内置弹反检测：伤害生效前先询问 ParrySystem
//   - 无敌帧正确归属 Player.invuln
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
    this.state = "idle";       // idle | walk | jump | attack | hurt | dodge | dead
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 50;
    this.maxMp = 50;
    this.invuln = 0;           // 受击无敌剩余 ms
    this.skill = null;         // SkillSystem，由外部注入
    this.animTimer = 0;        // 行走动画计时

    // —— 多段跳系统 ——
    this.jumpCount = 0;               // 已使用跳跃次数（0=未跳，1=一段跳中，2=二段跳已用）
    this.maxJumps = 2;                // 最大跳跃次数（支持二段跳）
    this.isJumpHolding = false;       // 当前是否正在按住空格（用于蓄力判定）
    this.minJumpTime = 120;           // 最小跳跃持续时间 ms（低于此时间松开算矮跳）
    this.jumpHoldTimer = 0;           // 本次跳跃按键已持续时长 ms
    this.jumpCutSpeed = 0.5;          // 矮跳时速度削减倍率（vy 乘以此值加速下落）

    // —— 闪避系统 ——
    this.dodgeTimer = 0;               // 闪避持续 ms（默认 150ms）
    this.dodgeCooldown = 0;            // 闪避冷却 ms（默认 800ms）
    this.dodgeDistance = 70;           // 闪避瞬移距离 px
    this.dodgeDuration = 150;          // 闪避持续时间 ms
    this.dodgeCooldownMax = 800;       // 冷却上限 ms
    this.ghostRect = null;             // 残留碰撞箱 {x, y, w, h}，闪避开始时记录原位置，用于完美闪避检测
    this.ghostTimer = 0;              // 残留箱存活 ms（与 dodgeDuration 一致）

    // —— 战斗标记（由外部系统设置）——
    this.canCounter = false;           // 完美闪避成功标记（预留反击接口）
    this.canExecute = false;           // 弹反成功标记（预留处决接口）

    // —— 弹反系统引用（由 GameMain 注入）——
    this.parrySystem = null;           // ParrySystem 实例，用于 takeDamage 中弹反检测
  }

  setSkillSystem(ss) { this.skill = ss; }

  setParrySystem(ps) { this.parrySystem = ps; }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  // 获取残留碰撞箱（供完美闪避/弹反检测用），过期返回 null
  getGhostRect() {
    if (!this.ghostRect || this.ghostTimer <= 0) return null;
    return this.ghostRect;
  }

  // 清除战斗标记（攻击/受伤/超时时自动清除）
  clearCombatMarks() {
    this.canCounter = false;
    this.canExecute = false;
  }

  // ==================== 跳跃系统 ====================

  // 执行跳跃（支持一段跳和二段跳）
  // 由 GameMain 在检测到空格按下且条件满足时调用
  startJump() {
    if (this.state === "dead" || this.state === "hurt" || this.state === "attack") return false;
    if (this.jumpCount >= this.maxJumps) return false;

    this.jumpCount++;
    this.vy = -this.consts.player.jumpForce;
    this.onGround = false;
    this.isJumpHolding = true;
    this.jumpHoldTimer = 0;           // 重置蓄力计时

    // 进入跳跃状态（如果不在闪避状态）
    if (this.state !== "dodge") {
      this.state = "jump";
    }

    AudioManager.play("jump");
    console.log(`[Player] ${this.jumpCount === 1 ? "一段跳" : "二段跳"}！jumpCount=${this.jumpCount}/${this.maxJumps}`);
    return true;
  }

  // ==================== 闪避 ====================

  // 由 GameMain 在检测到 Shift 按下且条件满足时调用
  startDodge() {
    if (this.state === "dead" || this.state === "hurt" || this.state === "attack" || this.state === "parry") return false;   // ★ v4 加 !parry
    if (this.dodgeCooldown > 0) return false;

    // 记录当前位置作为残留碰撞箱
    this.ghostRect = { x: this.x, y: this.y, w: this.w, h: this.h };
    this.ghostTimer = this.dodgeDuration;

    // 计算位移方向：面朝的反方向
    const dir = this.facing === "right" ? -1 : 1;
    let newX = this.x + dir * this.dodgeDistance;

    // 边界钳制（防止出界，需在调用时传入 mapWidth，此处先做基本限制）
    const pad = this.consts.world.boundaryPadding || 24;
    newX = Math.max(pad, Math.min(newX, 2000 - this.w - pad));  // 宽度在 update 中钳制

    this.x = newX;
    this.vx = 0;         // 清除水平速度，避免惯性干扰
    this.vy = 0;         // 清除垂直速度

    // 进入闪避状态
    this.state = "dodge";
    this.dodgeTimer = this.dodgeDuration;
    this.invuln = this.dodgeDuration;   // 闪避期间无敌
    this.dodgeCooldown = this.dodgeCooldownMax;

    console.log(`[Player] 闪避！方向:${dir > 0 ? "右" : "左"} 距离:${this.dodgeDistance}px`);
    return true;
  }

  // ==================== 主更新循环 ====================

  update(dt, input, map) {
    const c = this.consts;
    if (this.state === "dead") return;

    // 无敌递减
    if (this.invuln > 0) this.invuln -= dt;
    if (this.animTimer > 0) this.animTimer -= dt;

    // 闪避冷却递减
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;

    // 残留箱计时
    if (this.ghostTimer > 0) this.ghostTimer -= dt;
    else this.ghostRect = null;

    // —— 受伤状态恢复：无敌时间结束后自动退出 hurt，归还控制权 ——
    if (this.state === "hurt" && this.invuln <= 0) {
      this.state = this.onGround ? "idle" : "jump";
      this.vx = 0;
    }

    // —— 弹反状态恢复（由 ParrySystem._endParryState 或超时触发，此处做安全兜底）——
    if (this.state === "parry") {
      // parry 状态下不自动恢复，完全由 ParrySystem 控制
      // 但若 ParrySystem 异常未清理，此处做超时兜底
      if (!this.parrySystem || !this.parrySystem.active) {
        this.state = this.onGround ? "idle" : "jump";
        this.vx = 0;
      }
    }

    // —— 闪避状态恢复 ——
    if (this.state === "dodge") {
      this.dodgeTimer -= dt;
      if (this.dodgeTimer <= 0) {
        // 闪避结束，根据当前状态恢复
        this.state = this.onGround ? "idle" : "jump";
        this.vx = 0;
        // 注意：invuln 可能还有剩余（如被完美闪避延长），不强制清零
      }
    }

    const casting = this.skill && this.skill.isCasting();
    const hurt = this.state === "hurt";
    const dodging = this.state === "dodge";
    const parrying = this.state === "parry";     // ★ v4 新增

    // —— 水平移动（攻击/受击/闪避/弹反期间锁定）——
    let mx = 0;
    if (!casting && !hurt && !dodging && !parrying) {       // ★ v4 加 !parrying
      if (input.moveLeft()) mx -= 1;
      if (input.moveRight()) mx += 1;
      if (mx > 0) this.facing = "right";
      else if (mx < 0) this.facing = "left";
    }
    this.vx = (casting || hurt || dodging || parrying) ? 0 : mx * c.player.moveSpeed;   // ★ v4 加 parrying

    // —— 跳跃（多段跳 + 蓄力跳；弹反/闪避/攻击/受伤期间禁止）——
    if (input.jumpPressed()) {
      // 尝试触发一段跳或二段跳
      if (this.jumpCount < this.maxJumps && !casting && !hurt && !dodging && !parrying) {   // ★ v4 加 !parrying
        this.startJump();
      }
    }

    // —— 蓄力跳 / 矮跳处理 ——
    if (this.isJumpHolding) {
      this.jumpHoldTimer += dt;
      if (!input.jumpDown() || input.jumpReleased()) {
        // 松开空格：检查是否为矮跳（提前松开）
        if (this.jumpHoldTimer < this.minJumpTime && this.vy < 0) {
          // 短按：快速削减向上速度，实现矮跳效果
          this.vy *= this.jumpCutSpeed;
        }
        this.isJumpHolding = false;
      }
    }

    // —— 重力与积分（闪避时不施加重力，保持瞬移后的位置稳定）——
    if (!dodging) {
      this.vy += c.player.gravity;
      if (this.vy > c.player.maxFallSpeed) this.vy = c.player.maxFallSpeed;
      this.x += this.vx;
      this.y += this.vy;
    } else {
      // 闪避中仅允许极微的重力影响，避免浮空感
      this.y += this.vy;
      this.vy *= 0.85;  // 阻尼衰减
    }

    // —— 地面与边界 ——
    const groundY = map.groundY - this.h;
    if (this.y >= groundY) {
      this.y = groundY;
      this.vy = 0;
      // 落地：重置跳跃次数和蓄力状态
      if (!this.onGround) {
        this.jumpCount = 0;
        this.isJumpHolding = false;
        this.jumpHoldTimer = 0;
      }
      this.onGround = true;
    } else this.onGround = false;
    if (this.y < 0) { this.y = 0; this.vy = 0; }

    const pad = c.world.boundaryPadding;
    if (this.x < pad) this.x = pad;
    if (this.x > map.width - this.w - pad) this.x = map.width - this.w - pad;

    // —— 状态机（优先级：dead > hurt > parry > dodge > attack > move）——
    if (!casting && this.state !== "hurt" && this.state !== "dodge" && this.state !== "parry") {   // ★ v4 加 !parry
      if (!this.onGround) this.state = "jump";
      else if (mx !== 0) { this.state = "walk"; this.animTimer = 0; }
      else this.state = "idle";
    }

    // —— 攻击推进 + 命中判定 ——
    if (this.skill) {
      this.skill.update(dt);
      const hb = this.skill.getActiveHitbox();
      if (hb) {
        this.applyHit(hb, map.enemies);
        this.clearCombatMarks();     // 攻击时清除标记
      }
    }
  }

  // 将攻击判定盒与敌人矩形做 Collision 对接，命中则结算伤害与击退
  applyHit(hb, enemies) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Collision.rectOverlap(hb, e.getRect())) {
        e.takeDamage(hb.damage);
        const dir = this.facing === "right" ? 1 : -1;
        e.x += dir * (hb.knockback || 0);
        AudioManager.play("hit");
      }
    }
  }

  // ★ v4 修复：受伤入口增加弹反检测
  // 弹反窗口内受击 → 由 ParrySystem 拦截，不执行扣血
  // 返回 true 表示伤害被正常执行，false 表示被弹反拦截
  takeDamage(d, attacker) {
    if (this.invuln > 0 || this.state === "dead") return true;     // 无效/已死 → 跳过（返回true避免外部误判为拦截）

    // ★ v4 核心：先询问弹反系统是否在判定窗口内
    if (this.parrySystem && this.parrySystem.active) {
      const parried = this.parrySystem.checkParryHit(attacker);
      if (parried) {
        console.log("[Player] 伤害被弹反拦截！来源:", attacker ? (attacker.id || "entity") : "trap");
        return false;   // 告诉调用方：弹反成功，跳过后续效果（击退等）
      }
    }

    // 正常扣血流程
    this.hp -= d;
    this.invuln = this.consts.player.invulnMs;
    this.state = "hurt";
    this.clearCombatMarks();           // 受伤清除战斗标记
    this.ghostRect = null;             // 受伤清除残留箱
    this.ghostTimer = 0;
    if (this.hp <= 0) { this.hp = 0; this.state = "dead"; }
    return true;
  }

  draw(ctx) {
    const c = this.consts;
    ctx.save();

    let body = c.colors.player;
    let alpha = 1;

    if (this.state === "hurt" && Math.floor(performance.now() / 80) % 2 === 0) {
      body = "#a83232";                // 受击闪红
    } else if (this.state === "dodge") {
      // 闪避半透明闪烁效果
      alpha = 0.35 + Math.abs(Math.sin(performance.now() / 40)) * 0.35;
    } else if (this.state === "parry") {
      // ★ v4 弹反状态：银白色微闪烁，表示正在格挡
      body = "#c8d4e8";
      alpha = 0.7 + Math.abs(Math.sin(performance.now() / 50)) * 0.25;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = body;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 残留碰撞箱绘制（调试可视化，可后续移除或改为配置开关）
    if (this.ghostRect && this.ghostTimer > 0) {
      ctx.globalAlpha = 0.12 + Math.sin(performance.now() / 60) * 0.08;
      ctx.fillStyle = "#caa64a";
      ctx.fillRect(this.ghostRect.x, this.ghostRect.y, this.ghostRect.w, this.ghostRect.h);
      ctx.strokeStyle = "#caa64a";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.ghostRect.x, this.ghostRect.y, this.ghostRect.w, this.ghostRect.h);
    }

    ctx.globalAlpha = 1;

    // 面部朝向标识
    ctx.fillStyle = c.colors.playerFace;
    const eyeX = this.facing === "right" ? this.x + this.w - 10 : this.x + 4;
    ctx.fillRect(eyeX, this.y + 12, 6, 6);
    // 武器/攻击提示由 SkillSystem 绘制

    ctx.restore();
  }
}
