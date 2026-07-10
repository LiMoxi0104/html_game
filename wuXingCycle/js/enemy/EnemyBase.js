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
  }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  takeDamage(d) {
    if (!this.alive) return;
    this.hp -= d;
    this.flash = 120;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  update(dt) {
    if (this.flash > 0) this.flash -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.flash > 0 ? "#ffffff" : "#5a2a2a";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    // 血条
    const bw = this.w, bx = this.x, by = this.y - 8;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), 4);
    ctx.restore();
  }
}
