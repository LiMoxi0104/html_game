// Player：五行传人。负责自由上下左右移动、跳跃、边界限制与状态机（idle/walk/jump/attack/hurt/dead）。
// 攻击逻辑委托给 SkillSystem：当攻击施放时，状态锁定为 attack，并由 SkillSystem 在“挥击命中”关键帧输出判定盒，
// Player.applyHit 使用 Collision 对接敌人矩形，完成命中结算。
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
    this.state = "idle";       // idle | walk | jump | attack | hurt | dead
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 50;
    this.maxMp = 50;
    this.invuln = 0;           // 受击无敌剩余 ms
    this.skill = null;         // SkillSystem，由外部注入
    this.animTimer = 0;        // 行走动画计时
  }

  setSkillSystem(ss) { this.skill = ss; }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt, input, map) {
    const c = this.consts;
    if (this.state === "dead") return;

    if (this.invuln > 0) this.invuln -= dt;
    if (this.animTimer > 0) this.animTimer -= dt;

    const casting = this.skill && this.skill.isCasting();
    const hurt = this.state === "hurt";

    // —— 水平移动（攻击/受击期间锁定）——
    let mx = 0;
    if (!casting && !hurt) {
      if (input.moveLeft()) mx -= 1;
      if (input.moveRight()) mx += 1;
      if (mx > 0) this.facing = "right";
      else if (mx < 0) this.facing = "left";
    }
    this.vx = (casting || hurt) ? 0 : mx * c.player.moveSpeed;

    // —— 垂直移动（上下自由，仅限空中/平台，阶段1以地面为主）——
    // 阶段1 仅地面自由移动 + 跳跃；up/down 用于后续高台攀爬预留，此处不强制位移。

    // —— 跳跃 ——
    if (input.jumpPressed() && this.onGround && !casting && !hurt) {
      this.vy = -c.player.jumpForce;
      this.onGround = false;
      AudioManager.play("jump");
    }

    // —— 重力与积分 ——
    this.vy += c.player.gravity;
    if (this.vy > c.player.maxFallSpeed) this.vy = c.player.maxFallSpeed;
    this.x += this.vx;
    this.y += this.vy;

    // —— 地面与边界 ——
    const groundY = map.groundY - this.h;
    if (this.y >= groundY) { this.y = groundY; this.vy = 0; this.onGround = true; }
    else this.onGround = false;
    if (this.y < 0) { this.y = 0; this.vy = 0; }

    const pad = c.world.boundaryPadding;
    if (this.x < pad) this.x = pad;
    if (this.x > map.width - this.w - pad) this.x = map.width - this.w - pad;

    // —— 状态机 ——
    if (!casting && this.state !== "hurt") {
      if (!this.onGround) this.state = "jump";
      else if (mx !== 0) { this.state = "walk"; this.animTimer = 0; }
      else this.state = "idle";
    }

    // —— 攻击推进 + 命中判定 ——
    if (this.skill) {
      this.skill.update(dt);
      const hb = this.skill.getActiveHitbox();  // 仅在“挥击命中”关键帧返回非空
      if (hb) this.applyHit(hb, map.enemies);
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

  takeDamage(d) {
    if (this.invuln > 0 || this.state === "dead") return;
    this.hp -= d;
    this.invuln = this.consts.player.invulnMs;
    this.state = "hurt";
    if (this.hp <= 0) { this.hp = 0; this.state = "dead"; }
  }

  draw(ctx) {
    const c = this.consts;
    ctx.save();
    // 受击闪红
    let body = c.colors.player;
    if (this.state === "hurt" && Math.floor(performance.now() / 80) % 2 === 0) body = "#a83232";
    ctx.fillStyle = body;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 面部朝向标识
    ctx.fillStyle = c.colors.playerFace;
    const eyeX = this.facing === "right" ? this.x + this.w - 10 : this.x + 4;
    ctx.fillRect(eyeX, this.y + 12, 6, 6);
    // 武器/攻击提示由 SkillSystem 绘制
    ctx.restore();
  }
}
