// Player：五行传人。
//   idle:       待机静态站立（idle.png 单帧）
//   walk:       地面上用腿奔跑（walk.png 5帧循环，朝右时水平翻转）
//   state:      idle / walk / jump / attack / hurt / dodge / parry / dead
//
// 状态优先级：dead > hurt > parry > dodge > attack > jump > walk > idle
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
    this.state = "idle";       // idle | walk | jump | attack | hurt | dodge | parry | dead
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 50;
    this.maxMp = 50;
    this.invuln = 0;           // 受击无敌剩余 ms
    this.skill = null;         // SkillSystem，由外部注入
    this.asset = null;         // AssetManager，由外部注入

    // —— 5帧奔跑序列帧动画 ——
    this.walkAnim = new FrameAnim(5, 70);  // 5帧，每帧70ms（≈14fps奔跑节奏）

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

  // ==================== 跳跃系统 ====================

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

  // ==================== 闪避 ====================

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

  // ==================== 主更新循环 ====================

  update(dt, input, map) {
    const c = this.consts;
    if (this.state === "dead") return;

    // —— 计时器递减 ——
    if (this.invuln > 0)        this.invuln -= dt;
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.ghostTimer > 0)    this.ghostTimer -= dt;
    else this.ghostRect = null;

    // —— 奔跑动画帧推进 ——
    if (this.state === "walk") this.walkAnim.advance(dt);

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

    // —— 水平移动（地面上用腿奔跑）——
    let mx = 0;
    if (!casting && !hurt && !dodging && !parrying) {
      if (input.moveLeft())  mx -= 1;
      if (input.moveRight()) mx += 1;
      if (mx > 0)      this.facing = "right";
      else if (mx < 0) this.facing = "left";
    }
    this.vx = (casting || hurt || dodging || parrying) ? 0 : mx * c.player.moveSpeed;

    // —— 跳跃 ——
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

    // —— 地面与边界（★ v3 多平台碰撞）——
    const groundY = map.groundY - this.h;  // 底部地面（坠落线）

    // 先检测平台碰撞（优先级高于地面）
    const platformResult = MapLoader.checkPlatformCollision(this, map);

    if (platformResult.onPlatform) {
      // 站在平台上
      this.y = platformResult.platformY - this.h;  // 脚底贴平台表面
      this.vy = 0;
      if (!this.onGround) {
        this.jumpCount = 0;
        this.isJumpHolding = false;
        this.jumpHoldTimer = 0;
      }
      this.onGround = true;
    } else if (this.y >= groundY) {
      // 无平台 → 落到底层地面
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

    // ★ 跳跃时头部碰撞平台底部（穿顶修正）
    if (this.vy < 0) {
      const ceilY = MapLoader.checkPlatformCeiling(this, map);
      if (ceilY !== null) {
        this.y = ceilY;
        this.vy = 0;
      }
    }

    // 顶部边界
    if (this.y < 0) { this.y = 0; this.vy = 0; }

    const pad = c.world.boundaryPadding;
    if (this.x < pad) this.x = pad;
    if (this.x > map.width - this.w - pad) this.x = map.width - this.w - pad;

    // ★ 坠落死亡检测：掉出所有平台 + 超过底部地面
    if (this.y > map.height) {
      this.hp = 0;
      this.state = "dead";
    }

    // —— 状态机 ——
    if (!casting && this.state !== "hurt" && this.state !== "dodge" && this.state !== "parry") {
      if (!this.onGround) {
        this.state = "jump";
      } else if (mx !== 0) {
        this.state = "walk";
      } else {
        this.state = "idle";
      }
    }

    // —— 攻击推进 + 命中判定 ——
    if (this.skill) {
      this.skill.update(dt);
      const hb = this.skill.getActiveHitbox();
      if (hb) {
        this.applyHit(hb, map.enemies);
        this.clearCombatMarks();
      }
    }
  }

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

  // ==================== 渲染 ====================

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

    // —— 精灵图渲染 ——
    const sprite = this._getCurrentSprite();
    if (sprite) {
      this._drawSprite(ctx, sprite);
    } else {
      this._drawFallback(ctx, c);
    }

    // —— 受伤红色叠加 ——
    if (this.state === "hurt" && Math.floor(performance.now() / 80) % 2 === 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#a83232";
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    // —— 残留碰撞箱 ——
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

  // ═══════ 渲染辅助 ═══════

  // 根据当前状态获取精灵图与源裁剪区域
  // 返回 { img, sx, sy, sw, sh } 或 null
  _getCurrentSprite() {
    if (!this.asset) return null;

    switch (this.state) {
      case "idle": {
        const img = this.asset.getImage("player_idle");
        if (!img) return null;
        return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
      }
      case "walk": {
        const img = this.asset.getImage("player_walk");
        if (!img) return null;
        const fw = img.width / 5;   // 5帧水平排列
        const fi = this.walkAnim.current();
        return { img, sx: fi * fw, sy: 0, sw: fw, sh: img.height };
      }
      default:
        return null;
    }
  }

  // 绘制精灵图，朝左时水平翻转（原图面向右）
  _drawSprite(ctx, { img, sx, sy, sw, sh }) {
    const needFlip = this.facing === "left";

    if (needFlip) {
      ctx.translate(this.x + this.w, this.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, this.x, this.y, this.w, this.h);
    }
  }

  // 回退：无精灵图时用程序化矩形绘制
  _drawFallback(ctx, c) {
    let body = c.colors.player;

    if (this.state === "hurt" && Math.floor(performance.now() / 80) % 2 === 0) {
      body = "#a83232";
    } else if (this.state === "parry") {
      body = "#c8d4e8";
    }

    ctx.fillStyle = body;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 面部朝向标识
    ctx.fillStyle = c.colors.playerFace;
    const eyeX = this.facing === "right" ? this.x + this.w - 10 : this.x + 4;
    ctx.fillRect(eyeX, this.y + 12, 6, 6);
  }
}
