// EnemyBase：怪物父类（阶段1 仅占位骨架 + 受击/死亡逻辑，供攻击判定盒对接验证）。
// 阶段2 将扩展巡逻/追击 AI、精英/Boss 多阶段等。统一提供 getRect / takeDamage / update / draw。
class EnemyBase {
  constructor(cfg) {
    this.id = cfg.id;
    this.type = cfg.type || "dummy";
    this.x = cfg.x;
    this.y = cfg.y;
    this.w = cfg.w || 40;
    this.h = cfg.h || 62;
    this.hp = cfg.hp || 50;
    this.maxHp = this.hp;
    this.alive = true;
    this.flash = 0;        // 受击闪白计时 ms

    // ★ 荆棘牢笼禁锢状态
    this._imprisoned = false;
    this._imprisonTimer = 0;
  }

  /** ★ 施加禁锢效果（荆棘牢笼专用，仅对敌人有效） */
  imprison(ms) {
    // ★ 敌我判定守卫：仅 EnemyBase 子类实例可被禁锢
    if (!(this instanceof EnemyBase)) return;
    this._imprisoned = true;
    this._imprisonTimer = ms || 0;
    this.vx = 0;
    this.vy = 0;
  }

  /** ★ 解除禁锢 */
  releaseImprison() {
    this._imprisoned = false;
    this._imprisonTimer = 0;
  }

  /** ★ 是否处于禁锢状态 */
  isImprisoned() { return this._imprisoned; }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  takeDamage(d) {
    if (!this.alive) return;
    this.hp -= d;
    this.flash = 120;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  update(dt) {
    if (this.flash > 0) this.flash -= dt;
    // ★ 禁锢计时器倒计时
    if (this._imprisonTimer > 0) {
      this._imprisonTimer -= dt;
      if (this._imprisonTimer <= 0) {
        this._imprisoned = false;
        this._imprisonTimer = 0;
      }
    }
    // ★ 被禁锢时强制静止
    if (this._imprisoned) {
      this.vx = 0;
      this.vy = 0;
    }
  }

  draw(ctx) {
    // —— 程序化绘制（无精灵图时回退）——
    ctx.save();
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#5a2a2a";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.restore();

    // —— 血条：始终在世界空间绘制，不继承任何变换矩阵 ——
    this._drawWorldBar(ctx, this.w);
  }

  /**
   * ★ 世界空间血条：绘制于 ctx.save/restore 之外，
   *    确保始终正立（不随精灵旋转），无延迟跟随位置。
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} bw - 血条宽度(px)
   */
  _drawWorldBar(ctx, bw) {
    const bx = this.x;
    const by = this.y - 8;
    // 底板
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx, by, bw, 4);
    // 血量填充
    const ratio = Math.max(0, this.hp / this.maxHp);
    const k = ratio > 0.5 ? 0 : (ratio > 0.25 ? 1 : 2);
    const hpColors = ["#caa64a", "#d98a20", "#c0392b"];
    ctx.fillStyle = hpColors[k];
    ctx.fillRect(bx, by, bw * ratio, 4);
  }
}
