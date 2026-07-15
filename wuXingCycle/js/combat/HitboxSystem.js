// HitboxSystem：逐帧动态碰撞箱引擎（v1）。
//
// 核心设计：

class HitboxSystem {
  constructor() {
    this.frameCache = {};            // 技能ID → 解析后的逐帧配置缓存
  }

  // ==================== 核心解析 ====================

  // 解析招式的逐帧碰撞箱配置（带缓存）
  // 返回结构：
  //   {
  //     totalFrames: number,
  //     frames: [
  //       { frameIndex, phaseId, offsetX, offsetY, width, height, damage, knockback, isHitFrame }
  //     ],
  //     hasPerFrame: boolean    // 是否使用了逐帧配置（vs 全帧统一）
  //   }
  resolveSkillConfig(skill) {
    if (!skill || !skill.phases) return null;

    if (this.frameCache[skill.id]) return this.frameCache[skill.id];

    const config = this._buildFrameConfig(skill);
    this.frameCache[skill.id] = config;
    return config;
  }

  // 内部构建：遍历所有阶段的所有帧，生成统一帧表
  _buildFrameConfig(skill) {
    const phases = skill.phases;
    const allFrames = [];
    let totalFrames = 0;

    for (let pi = 0; pi < phases.length; pi++) {
      const phase = phases[pi];
      const fc = phase.frameCount || 1;
      const start = phase.frameStart || 0;

      for (let fi = 0; fi < fc; fi++) {
        const globalIdx = start + fi;

        // ★ 向后兼容：优先使用逐帧配置 perFrameHitboxes，否则使用全帧统一的 phase.hitbox
        let hbData;
        if (phase.perFrameHitboxes && phase.perFrameHitboxes.length > 0) {
          // 逐帧模式：按索引取值（超出范围时用最后一项或默认）
          const pfi = Math.min(fi, phase.perFrameHitboxes.length - 1);
          hbData = phase.perFrameHitboxes[pfi] || this._defaultHB(phase);
        } else {
          // 单一全帧模式：所有 active 帧共用一个 hitbox 配置
          hbData = this._defaultHB(phase);
        }

        // 双重过滤：hitFrames 指定哪些帧是伤害帧
        const isHitFrame = phase.hit &&
          (phase.hitFrames || []).includes(globalIdx);

        allFrames.push({
          frameIndex: globalIdx,
          phaseIndex: pi,
          phaseId: phase.id || `phase_${pi}`,
          localFrame: fi,
          ...hbData,
          isHitFrame: isHitFrame,
          baseDamage: isHitFrame ? (phase.damage || skill.baseDamage || 0) : 0,
          knockback: isHitFrame ? (phase.knockback || 0) : 0,
          element: skill.element || "none"
        });
      }
      totalFrames += fc;
    }

    return {
      totalFrames: totalFrames,
      frames: allFrames,
      hasPerFrame: phases.some(p => p.perFrameHitboxes && p.perFrameHitboxes.length > 0)
    };
  }

  // 默认碰撞箱（从旧版 phase.hitbox 兼容）
  _defaultHB(phase) {
    if (phase.hitbox) {
      return {
        offsetX: phase.hitbox.offsetX || 0,
        offsetY: phase.hitbox.offsetY || 0,
        width: phase.hitbox.width || 40,
        height: phase.hitbox.height || 40
      };
    }
    return { offsetX: 40, offsetY: 0, width: 80, height: 80 };
  }

  // ==================== 实时帧查询 ====================

  // 根据当前施放状态获取当前帧的碰撞盒世界坐标
  // 参数：
  //   skill    - 招式完整配置对象
  //   cast     - 当前施放状态 { id, phaseIndex, frameIndex, phaseTimer }
  //   player   - 玩家引用（用于位置/朝向）
  // 返回：
  //   { x, y, w, h, damage, knockback, element, skillId, isHitFrame, frameIndex }
  //   或 null（非命中帧 / 无配置）
  getCurrentHitbox(skill, cast, player) {
    if (!skill || !cast || !player) return null;

    const config = this.resolveSkillConfig(skill);
    if (!config) return null;

    // 在帧表中查找当前全局帧索引
    const frameData = config.frames.find(f => f.frameIndex === cast.frameIndex);
    if (!frameData) return null;

    // 非命中帧返回 null（但保留帧信息供 VFX 使用）
    if (!frameData.isHitFrame) return null;

    // 计算世界坐标（考虑朝向镜像）
    const dir = player.facing === "right" ? 1 : -1;
    const ox = frameData.offsetX * dir;
    const px = player.x;
    const py = player.y;

    let hx;
    if (dir === 1) {
      hx = px + ox;
    } else {
      hx = px - ox - frameData.width;
    }
    const hy = py + frameData.offsetY;

    return {
      x: hx,
      y: hy,
      w: frameData.width,
      h: frameData.height,
      damage: frameData.baseDamage,
      knockback: frameData.knockback,
      element: frameData.element,
      skillId: skill.id,
      isHitFrame: true,
      frameIndex: cast.frameIndex,
      // 原始偏移数据（供 VFX 同步读取）
      _raw: frameData
    };
  }

  // 获取当前帧的原始帧数据（含非命中帧），供 VFX 渲染器使用
  // 即使不在命中窗口也返回帧配置（用于蓄力动画等）
  getCurrentFrameData(skill, cast) {
    if (!skill || !cast) return null;
    const config = this.resolveSkillConfig(skill);
    if (!config) return null;
    return config.frames.find(f => f.frameIndex === cast.frameIndex) || null;
  }

  // 清除缓存（技能配置变更后调用）
  invalidateCache() {
    this.frameCache = {};
  }
}

// 全局单例导出
window.HitboxSystem = window.HitboxSystem || new HitboxSystem();
