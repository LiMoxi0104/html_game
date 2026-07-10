// SkillSystem：五行招式管理器，核心实现“逐帧序列图(PNG)三阶段攻击”。
//
// 攻击动作拆分为三个阶段，按 order 顺序切换独立帧播放动画：
//   1) windup  「起手」 —— 无判定盒，仅播放前摇帧
//   2) active  「挥击命中」 —— 此阶段的指定关键帧(hitFrames)上才挂载攻击判定盒
//   3) recovery「收招」 —— 无判定盒，播放收招帧
//
// 关键设计：攻击判定盒(hitbox)绑定在“挥击命中”阶段的关键帧上触发，
// 通过 getActiveHitbox() 仅在 active 阶段且当前帧 ∈ hitFrames 时返回矩形，
// 由 Player.applyHit() 调用 Collision.rectOverlap 与敌人对接，完成命中结算。
class SkillSystem {
  constructor(player, assetManager) {
    this.player = player;
    this.asset = assetManager;
    this.skills = {};                 // id -> 招式配置
    this.active = null;               // 当前施放 {id, phaseIndex, phaseTimer, frameIndex, hasHit}
    this.cooldowns = {};              // id -> 剩余冷却 ms
  }

  // 注册招式配置（来自 config/skillConfig.json）
  registerSkills(config) {
    const list = (config && config.skills) || {};
    for (const id in list) this.skills[id] = list[id];
  }

  isCasting() { return !!this.active; }

  canCast(id) {
    const s = this.skills[id];
    if (!s) return false;
    if (this.active) return false;                              // 正在出招不可打断
    if (this.player.state === "hurt" || this.player.state === "dead") return false;
    if ((this.cooldowns[id] || 0) > 0) return false;            // 冷却锁帧，防连击
    if (s.mpCost && this.player.mp < s.mpCost) return false;     // 灵气不足
    return true;
  }

  startCast(id) {
    const s = this.skills[id];
    if (!s || !this.canCast(id)) return false;
    this.active = {
      id,
      phaseIndex: 0,
      phaseTimer: 0,
      frameIndex: s.phases[0].frameStart,
      hasHit: false
    };
    this.player.state = "attack";
    this.player.facingLock = true;     // 出招期间锁定朝向
    AudioManager.play("skill_" + s.element);
    GameData.save(window.__WX_SAVE__); // 触发存档（如有）
    return true;
  }

  update(dtMs) {
    // 冷却递减
    for (const k in this.cooldowns) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dtMs);
    }
    if (!this.active) return;

    const cast = this.active;
    const skill = this.skills[cast.id];
    const phase = skill.phases[cast.phaseIndex];

    cast.phaseTimer += dtMs;

    // 计算当前阶段内的局部帧索引（按 durationMs / frameCount 平摊）
    const frameDur = phase.durationMs / phase.frameCount;
    let local = Math.floor(cast.phaseTimer / frameDur);
    if (local >= phase.frameCount) local = phase.frameCount - 1;
    cast.frameIndex = phase.frameStart + local;

    // 仅“挥击命中”阶段且位于指定关键帧时，标记已处于可命中窗口
    if (phase.hit && phase.hitFrames && phase.hitFrames.includes(cast.frameIndex)) {
      cast.hasHit = true;
    }

    // 阶段计时结束 → 进入下一阶段或结束施放
    if (cast.phaseTimer >= phase.durationMs) {
      cast.phaseIndex++;
      cast.phaseTimer = 0;
      if (cast.phaseIndex >= skill.phases.length) {
        // 收招完成：进入冷却、扣除灵气、复位状态
        this.cooldowns[cast.id] = skill.cooldownMs || 0;
        if (skill.mpCost) this.player.mp = Math.max(0, this.player.mp - skill.mpCost);
        this.active = null;
        this.player.state = "idle";
        this.player.facingLock = false;
      }
    }
  }

  // 返回当前帧的攻击判定盒（仅“挥击命中”关键帧非空），供 Player 与 Collision 对接
  getActiveHitbox() {
    if (!this.active) return null;
    const cast = this.active;
    const skill = this.skills[cast.id];
    const phase = skill.phases[cast.phaseIndex];
    if (!phase.hit) return null;                                  // 仅 active 阶段有判定盒
    if (!phase.hitFrames || !phase.hitFrames.includes(cast.frameIndex)) return null; // 仅关键帧触发

    const hb = phase.hitbox;
    const dir = this.player.facing === "right" ? 1 : -1;
    const px = this.player.x;
    const py = this.player.y;
    const ox = hb.offsetX * dir;
    const x = dir === 1 ? px + ox : px - ox - hb.width;
    const y = py + hb.offsetY;
    return {
      x, y, w: hb.width, h: hb.height,
      damage: phase.damage,
      knockback: phase.knockback || 0,
      element: skill.element
    };
  }

  draw(ctx) {
    if (!this.active) return;
    const cast = this.active;
    const skill = this.skills[cast.id];
    const phase = skill.phases[cast.phaseIndex];
    const p = this.player;
    const sheet = this.asset.getImage(phase.sheet);

    if (sheet) {
      // 真实逐帧 PNG：从 spritesheet 按 frameStart + 局部帧截取
      const fw = sheet.width / phase.frameCount;
      const fh = sheet.height;
      const local = cast.frameIndex - phase.frameStart;
      ctx.save();
      if (p.facing === "left") {
        ctx.translate(p.x + p.w, 0); ctx.scale(-1, 1);
        ctx.drawImage(sheet, local * fw, 0, fw, fh, 0, p.y, p.w, p.h);
      } else {
        ctx.drawImage(sheet, local * fw, 0, fw, fh, p.x, p.y, p.w, p.h);
      }
      ctx.restore();
    } else {
      // 占位绘制：起手/收招画淡色前摇条，命中阶段画元素色判定盒
      this.drawPlaceholder(ctx, phase);
    }
  }

  drawPlaceholder(ctx, phase) {
    const p = this.player;
    const colorMap = { water: "#3a7bd5", wood: "#2e8b57", metal: "#b0b0b0", fire: "#d9480f", earth: "#8a6d3b" };
    const col = colorMap[this.skills[this.active.id].element] || "#8b0000";
    ctx.save();
    if (phase.hit) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = col;
      const hb = phase.hitbox;
      const dir = p.facing === "right" ? 1 : -1;
      const x = dir === 1 ? p.x + hb.offsetX : p.x - hb.offsetX - hb.width;
      ctx.fillRect(x, p.y + hb.offsetY, hb.width, hb.height);
    } else {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = col;
      const sx = p.facing === "right" ? p.x + p.w : p.x - 6;
      ctx.fillRect(sx, p.y + 10, 6, p.h - 20);
    }
    ctx.restore();
  }
}
