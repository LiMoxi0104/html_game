// SkillVFXRenderer：Canvas 程序化水墨招式特效渲染器（v1）。
//
// 架构设计：
//   - 底层逻辑（碰撞箱）与视觉渲染完全解耦
//   - 所有特效坐标/尺寸参数直接读取自 HitboxSystem 的逐帧数据
//   - 视觉呈现与判定区域严格同步
//   - 未来可平滑替换为手绘序列帧，只需替换 draw 方法内部实现
//
// 五行特效：
//   水 water → 三层叠加弧形水浪，径向渐变浅蓝→透明，错位排列波浪感
//   木 wood → 贝塞尔曲线藤蔓从地面生长，线宽粗→细，碎叶墨点飘浮
//   金 metal → 纵向渐变矩形剑身(亮金→暗金)，剑尖三角收束+平行墨线剑气+冲击波
//   火 fire → 多段椭圆+曲线龙身，龙角三角头，尾部分散墨点火焰拖尾
//   土 earth → 不规则陨石多层径向渐变，表面暗色坑洼墨点，落地冲击波+震荡圆环+地裂线

class SkillVFXRenderer {
  constructor(hitboxSystem, assetManager) {
    this.hb = hitboxSystem;           // HitboxSystem 引用（共享帧数据）
    this.asset = assetManager || null; // AssetManager 引用（精灵图加载）

    // 全局时间基准（用于粒子动画）
    this._globalTime = 0;

    // 活跃粒子系统 { skillId: [particles] }
    this._particles = {};

    // 特效参数常量
    this.INK_ALPHA_BASE = 0.55;      // 墨迹基础透明度
    this.GLOW_BLUR = "2px";          // 阴影模糊半径（模拟晕染）
  }

  update(dt) {
    this._globalTime += dt;
    this._updateParticles(dt);
  }

  // ==================== 主入口 ====================

  // 渲染当前施放中的技能特效
  // 由 SkillManager.draw() 调用，传入当前施放状态和玩家引用
  render(ctx, skill, cast, player, phaseProgress) {
    if (!skill || !cast || !player || !skill.element) return;

    const element = skill.element;
    const frameData = this.hb.getCurrentFrameData(skill, cast);

    // 根据元素类型分发到对应绘制方法
    switch (element) {
      case "water":  this._renderWater(ctx, skill, cast, player, frameData, phaseProgress); break;
      case "wood":   this._renderWood(ctx, skill, cast, player, frameData, phaseProgress); break;
      case "metal":  this._renderMetal(ctx, skill, cast, player, frameData, phaseProgress); break;
      case "fire":   this._renderFire(ctx, skill, cast, player, frameData, phaseProgress); break;
      case "earth":  this._renderEarth(ctx, skill, cast, player, frameData, phaseProgress); break;
      default:       this._renderGeneric(ctx, skill, cast, player, frameData); break;
    }
  }

  // ==================== 辅助：世界坐标计算 ====================

  // 计算碰撞箱的世界坐标区域（供 VFX 定位参考）
  _getHitboxArea(player, frameData, padding) {
    if (!frameData || !player) return null;
    const pad = padding || 0;
    const dir = player.facing === "right" ? 1 : -1;
    const ox = (frameData.offsetX || 0) * dir;

    let hx;
    if (dir === 1) {
      hx = player.x + ox - pad;
    } else {
      hx = player.x - ox - (frameData.width || 40) - pad;
    }
    const hy = player.y + (frameData.offsetY || 0) - pad;
    const hw = (frameData.width || 40) + pad * 2;
    const hh = (frameData.height || 40) + pad * 2;

    return { x: hx, y: hy, w: hw, h: hh };
  }

  // 获取玩家中心位置
  _getPlayerCenter(player) {
    return {
      cx: player.x + player.w / 2,
      cy: player.y + player.h / 2,
      facing: player.facing,
      baseX: player.x,
      baseY: player.y
    };
  }

  // 阶段进度归一化 (0~1)
  _phaseNorm(phaseTimer, durationMs) {
    if (!durationMs) return 0;
    return Math.min(1, Math.max(0, (phaseTimer || 0) / durationMs));
  }

  // ==================== 水 Water：水墨漩涡精灵图 ====================
  // 使用 water_flow_effect.png 替换程序化弧形水浪
  // 保留原有碰撞箱逻辑、伤害数值及触发帧

  _renderWater(ctx, skill, cast, player, frameData, progress) {
    const img = this.asset && this.asset.getImage("water_flow_effect");
    if (img) {
      this._renderWaterSprite(ctx, skill, cast, player, frameData, progress, img);
    } else {
      // 图片缺失时回退到程序化绘制
      this._renderWaterLegacy(ctx, skill, cast, player, frameData, progress);
    }
  }

  // ★ 新实现：精灵图渲染（单帧水墨漩涡 + 动态缩放/旋转/淡入淡出）
  _renderWaterSprite(ctx, skill, cast, player, frameData, progress, img) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 10);
    const phase = skill.phases[cast.phaseIndex];
    const norm = this._phaseNorm(cast.phaseTimer, phase.durationMs);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";   // 叠加混合增强发光感

    // 计算中心位置（对齐碰撞箱中心）
    const cx = area ? (area.x + area.w / 2) : (pc.cx + dir * 40);
    const cy = area ? (area.y + area.h / 2) : pc.cy;

    // ★ 阶段动画参数（与原始时长严格匹配：windup 150ms / active 190ms / recovery 150ms）
    let scale = 0.15, alpha = 0.2, rot = 0;

    if (phase.id === "windup") {
      // 起手：微小水波从角色前方凝聚
      scale = 0.05 + norm * 0.15;
      alpha = norm * 0.4;
      rot = dir * norm * 0.3;
    } else if (phase.id === "active") {
      // 挥击命中：190ms 核心动画，三阶段节奏
      if (norm < 0.15) {
        // 0-15%（0-28ms）：快速淡入 + 展开
        const t = norm / 0.15;
        scale = 0.15 + this._easeOutQuad(t) * 0.25;   // 0.15→0.40
        alpha = t * 0.85;                                // 0→0.85
        rot = dir * t * 0.5;                             // 0→0.5rad
      } else if (norm < 0.75) {
        // 15-75%（28-142ms）：持续显示 + 旋转增长
        const t = (norm - 0.15) / 0.60;
        scale = 0.40 + t * 0.35;                        // 0.40→0.75
        alpha = 0.85;
        rot = dir * (0.5 + t * 1.2);                    // 0.5→1.7rad
      } else {
        // 75-100%（142-190ms）：淡出消散
        const t = (norm - 0.75) / 0.25;
        scale = 0.75 + t * 0.25;                        // 0.75→1.00
        alpha = 0.85 * (1 - t);                          // 0.85→0
        rot = dir * (1.7 + t * 0.5);                    // 1.7→2.2rad
      }
    } else if (phase.id === "recovery") {
      // 收招：残留水波消散
      scale = 0.70 + norm * 0.30;
      alpha = (1 - norm) * 0.3;
      rot = dir * (2.2 + norm * 0.3);
    }

    // 图片尺寸基于碰撞箱动态缩放，保持宽高比
    const baseSize = area ? Math.max(area.w, area.h) : 120;
    const drawW = baseSize * scale;
    const drawH = drawW * (img.height / img.width);

    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();

    // ★ 水花飞溅粒子：命中帧必定触发，围绕碰撞体矩形表面分布
    if (frameData && frameData.isHitFrame) {
      this._spawnWaterDroplets(area, 28);
    }
  }

  // ★ 旧实现：程序化弧形水浪（图片缺失时回退）
  _renderWaterLegacy(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 10);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const norm = this._phaseNorm(cast.phaseTimer,
      (skill.phases[cast.phaseIndex] || {}).durationMs);

    // 三层水浪 —— 错位相位、不同尺寸
    for (let layer = 0; layer < 3; layer++) {
      const phaseOff = layer * 0.35;
      const t = (norm + phaseOff) % 1;
      const expand = this._easeOutQuad(t);
      const waveW = area ? area.w : 60;
      const waveH = area ? area.h : 50;
      const w = waveW * (0.4 + expand * 0.8) * (1 - layer * 0.15);
      const h = waveH * (0.5 + expand * 0.6) * (1 - layer * 0.12);
      const ox = pc.cx + dir * (20 + expand * 35) + layer * dir * 12;
      const oy = pc.cy - h * 0.3 + layer * 6 + Math.sin(t * Math.PI * 3 + layer) * 4;

      ctx.beginPath();
      ctx.moveTo(ox - w * 0.5, oy + h);
      ctx.quadraticCurveTo(
        ox - w * 0.25, oy - h * 0.15 + Math.sin(this._globalTime * 0.004 + layer * 1.5) * 5,
        ox, oy - h * 0.25 + Math.sin(this._globalTime * 0.005 + layer) * 6
      );
      ctx.quadraticCurveTo(
        ox + w * 0.25, oy - h * 0.15 + Math.sin(this._globalTime * 0.004 + layer * 2) * 5,
        ox + w * 0.5, oy + h
      );
      ctx.closePath();

      const grad = ctx.createRadialGradient(ox, oy - h * 0.1, 2, ox, oy, w * 0.7);
      grad.addColorStop(0, `rgba(100,180,240,${this.INK_ALPHA_BASE * (0.9 - layer * 0.25)})`);
      grad.addColorStop(0.45, `rgba(58,123,213,${this.INK_ALPHA_BASE * (0.55 - layer * 0.18)})`);
      grad.addColorStop(0.8, `rgba(58,123,213,${this.INK_ALPHA_BASE * (0.18 - layer * 0.06)})`);
      grad.addColorStop(1, "rgba(58,123,213,0)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(58,123,213,0.35)";
      ctx.shadowBlur = 6 + layer * 3;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // ★ 水花飞溅粒子：命中帧必定触发，围绕碰撞体矩形表面分布
    if (frameData && frameData.isHitFrame) {
      this._spawnWaterDroplets(area, 28);
    }
  }

  /**
   * ★ 水滴粒子生成：围绕碰撞体矩形表面环状分布，
   *    粒子从碰撞体边缘向外飞溅，避免穿模或漂移过远。
   * @param {Object} area - {x, y, w, h} 碰撞体世界坐标区域（已含 padding）
   * @param {number} count - 本次生成数量（默认 16）
   */
  _spawnWaterDroplets(area, count = 28) {  // ★ 增加密度
    const key = "water_drops";
    if (!this._particles[key]) this._particles[key] = [];
    if (!area) return;

    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;

    for (let i = 0; i < count; i++) {
      // ★ 在碰撞体矩形表面上均匀采样生成位置
      const pos = this._sampleRectEdge(
        area.x, area.y, area.w, area.h,
        (i * 1.61803398875) % 1  // 黄金角度分散，避免扎堆
      );

      // 从碰撞体中心指向生成位置的径向速度（向外飞溅）
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const baseSpeed = 0.6 + Math.random() * 1.8;  // 飞溅速度

      this._particles[key].push({
        x: pos.x, y: pos.y,
        vx: (dx / dist) * baseSpeed + (Math.random() - 0.5) * 1.2,
        vy: (dy / dist) * baseSpeed - Math.random() * 2.0 - 0.3,  // 略向上偏
        life: 280 + Math.random() * 220,   // 生命周期 280-500ms
        maxLife: 500,
        size: 0.8 + Math.random() * 2.0,   // 0.8-2.8px（缩小）
        type: "water_drop"
      });
    }
  }

  /**
   * 在矩形边缘均匀采样一个随机位置。
   * 四条边等概率，边长越长权重越大，避免角点过度集中。
   * @param {number} t - [0,1) 归一化采样参数
   * @returns {{x:number, y:number}}
   */
  _sampleRectEdge(rx, ry, rw, rh, t) {
    // 四条边按周长加权
    const topLen    = rw;            // 顶边
    const bottomLen = rw;            // 底边
    const leftLen   = rh;            // 左边
    const rightLen  = rh;            // 右边
    const total     = topLen + bottomLen + leftLen + rightLen;

    let d = t * total;

    // 顶边：从左到右
    if (d < topLen) return { x: rx + d, y: ry };
    d -= topLen;

    // 右边：从上到下
    if (d < rightLen) return { x: rx + rw, y: ry + d };
    d -= rightLen;

    // 底边：从右到左
    if (d < bottomLen) return { x: rx + rw - d, y: ry + rh };
    d -= bottomLen;

    // 左边：从下到上
    return { x: rx, y: ry + rh - d };
  }

  // ==================== 木 Wood：藤蔓破土而出 ====================
  // 视觉描述：
  //   从地面生长出数条贝塞尔曲线藤蔓，线宽由粗渐细
  //   周围散布随机向上飘浮的碎叶墨点，形成破土而出的动态感

  _renderWood(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 5);

    const norm = this._phaseNorm(cast.phaseTimer,
      (skill.phases[cast.phaseIndex] || {}).durationMs);

    ctx.save();

    // ★ 多条贝塞尔曲线藤蔓（3~5 条随机但固定种子）
    const vineCount = 4;
    const baseX = pc.cx + dir * 16;

    for (let v = 0; v < vineCount; v++) {
      const seed = v * 137.5;              // 固定角度分布
      const spread = (v - (vineCount - 1) / 2) * 14;   // 左右分散
      const startX = baseX + spread;
      const startY = pc.baseY + player.h + 4;   // 从脚下开始

      // 生长动画：norm=0 刚开始(norm小) → norm=1 完全伸展
      const growT = this._easeOutBack(norm * 1.1);
      const maxHeight = area ? area.h + 20 : 70;

      // 控制点（模拟自然弯曲）
      const cp1x = startX + dir * (15 + v * 8) + Math.sin(seed) * 10;
      const cp1y = startY - maxHeight * 0.3 * growT;
      const cp2x = startX + dir * (-5 + v * 12) + Math.cos(seed) * 12;
      const cp2y = startY - maxHeight * 0.65 * growT;
      const endX = startX + dir * (20 + v * 6);
      const endY = startY - maxHeight * growT + Math.sin(v * 2.1) * 8;

      // 线宽由根部粗→顶部细
      const startLW = 5 - v * 0.7;
      const endLW = 1 + v * 0.3;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);

      // 渐变描边（深绿→浅绿）
      const lineGrad = ctx.createLinearGradient(startX, startY, endX, endY);
      lineGrad.addColorStop(0, "#1a5c32");
      lineGrad.addColorStop(0.5, "#2e8b57");
      lineGrad.addColorStop(1, "#5cae7a");

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = startLW + (endLW - startLW) * growT;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(46,139,87,0.3)";
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 藤蔓上的刺/叶节点
      if (growT > 0.4) {
        const nodeCount = Math.floor(3 + v * 1.5);
        for (let n = 1; n <= nodeCount; n++) {
          const nt = n / (nodeCount + 1);
          // 在曲线上采样点
          const tSample = nt;
          const nx = this._bezierPoint(startX, cp1x, cp2x, endX, tSample);
          const ny = this._bezierPoint(startY, cp1y, cp2y, endY, tSample);
          const leafDir = n % 2 === 0 ? 1 : -1;

          // 小叶片
          ctx.beginPath();
          ctx.ellipse(nx + leafDir * (5 + v), ny, 4, 2, leafDir * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(46,139,87,${0.6 + Math.sin(n) * 0.2})`;
          ctx.fill();
        }
      }
    }

    // ★ 碎叶墨点飘浮效果
    if (frameData && frameData.isHitFrame) {
      this._spawnLeafParticles(pc.cx, pc.baseY + player.h, dir);
    }

    ctx.restore();
  }

  // 贝塞尔曲线一维采样
  _bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  }

  // 碎叶粒子
  _spawnLeafParticles(x, y, dir) {
    const key = "wood_leaves";
    if (!this._particles[key]) this._particles[key] = [];
    for (let i = 0; i < 6; i++) {
      this._particles[key].push({
        x: x + (Math.random() - 0.5) * 60,
        y: y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 3 - 1.5,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.08,
        life: 600 + Math.random() * 400,
        maxLife: 1000,
        size: 3 + Math.random() * 4,
        type: "leaf"
      });
    }
  }

  // ==================== 金 Metal：天剑坠 ====================
  // 视觉描述：
  //   纵向渐变矩形剑身（亮金→暗金），剑尖三角形收束
  //   周围平行墨线模拟剑气
  //   剑体随帧从高处落下，命中瞬间剑尖径向扩散圆形冲击波

  _renderMetal(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 8);
    const phase = skill.phases[cast.phaseIndex];
    const norm = this._phaseNorm(cast.phaseTimer, phase.durationMs);

    ctx.save();

    // 剑体尺寸
    const swordW = area ? area.w * 0.65 : 36;
    const swordH = area ? area.h : 90;
    const sx = pc.cx + dir * (area ? (area.w * 0.18) : 10) - swordW / 2;

    // 下落动画：从高处落下到命中位置
    let fallOffset = 0;
    if (phase.hit) {
      // active 阶段：剑从天降下
      fallOffset = -swordH * 1.2 * this._easeOutBounce(Math.min(1, norm * 1.8));
    }

    const sy = (area ? area.y : (pc.baseY - 30)) + fallOffset;

    // ★ 剑体主体：纵向渐变（顶亮金 → 底暗金）
    const swordGrad = ctx.createLinearGradient(sx, sy, sx, sy + swordH);
    swordGrad.addColorStop(0, "rgba(255,230,140,0.92)");
    swordGrad.addColorStop(0.25, "rgba(245,200,80,0.88)");
    swordGrad.addColorStop(0.65, "rgba(190,150,50,0.82)");
    swordGrad.addColorStop(1, "rgba(120,90,30,0.75)");

    // 圆角矩形剑身
    this._roundRect(ctx, sx, sy, swordW, swordH, 3);
    ctx.fillStyle = swordGrad;
    ctx.shadowColor = "rgba(255,215,0,0.5)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 剑身高光条纹
    ctx.strokeStyle = "rgba(255,250,210,0.35)";
    ctx.lineWidth = 1.5;
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.moveTo(sx + 4 + s * 3, sy + 8);
      ctx.lineTo(sx + 4 + s * 3, sy + swordH - 12);
      ctx.stroke();
    }

    // ★ 剑尖：三角形收束
    const tipX = sx + swordW / 2;
    const tipY = sy + swordH;
    const tipH = 18;
    ctx.beginPath();
    ctx.moveTo(sx + swordW * 0.2, tipY);
    ctx.lineTo(tipX, tipY + tipH);
    ctx.lineTo(sx + swordW * 0.8, tipY);
    ctx.closePath();
    const tipGrad = ctx.createLinearGradient(tipX, tipY, tipX, tipY + tipH);
    tipGrad.addColorStop(0, "rgba(255,235,160,0.9)");
    tipGrad.addColorStop(1, "rgba(255,220,100,0.3)");
    ctx.fillStyle = tipGrad;
    ctx.fill();

    // ★ 平行墨线剑气（围绕剑身的能量线条）
    const qiCount = 6;
    for (let q = 0; q < qiCount; q++) {
      const qx = sx - 6 - q * 4;
      const offsetWave = Math.sin(this._globalTime * 0.006 + q * 1.2) * 3;
      ctx.beginPath();
      ctx.moveTo(qx + offsetWave, sy + 6);
      ctx.lineTo(qx + offsetWave * 0.7, sy + swordH * 0.85);
      ctx.strokeStyle = `rgba(200,175,90,${0.28 - q * 0.04})`;
      ctx.lineWidth = 1.2 - q * 0.12;
      ctx.stroke();

      // 右侧对称
      if (q < 3) {
        const rx = sx + swordW + 6 + q * 4;
        const roffset = Math.sin(this._globalTime * 0.006 + q * 1.2 + Math.PI) * 3;
        ctx.beginPath();
        ctx.moveTo(rx + roffset, sy + 6);
        ctx.lineTo(rx + roffset * 0.7, sy + swordH * 0.85);
        ctx.strokeStyle = `rgba(200,175,90,${0.22 - q * 0.05})`;
        ctx.stroke();
      }
    }

    // ★ 冲击波（仅在命中帧且 norm>0.7 时显示）
    if (frameData && frameData.isHitFrame && norm > 0.7) {
      const shockR = (norm - 0.7) / 0.3 * 50 + 15;
      const shockAlpha = 1 - (norm - 0.7) / 0.3;
      ctx.beginPath();
      ctx.arc(tipX, tipY + tipH, shockR, 0, Math.PI * 2);
      const shockGrad = ctx.createRadialGradient(tipX, tipY + tipH, 0, tipX, tipY + tipH, shockR);
      shockGrad.addColorStop(0, `rgba(255,230,140,${shockAlpha * 0.6})`);
      shockGrad.addColorStop(0.5, `rgba(245,200,80,${shockAlpha * 0.3})`);
      shockGrad.addColorStop(1, "rgba(245,200,80,0)");
      ctx.fillStyle = shockGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // ==================== 火 Fire：墨龙冲 ====================
  // ★ 重写版 v2：解耦 perFrameHitboxes，使用固定视觉尺寸
  //   龙身长度固定 110px，跟随角色位置同步移动。
  //   windup 淡入 → active 全显+粒子拖尾 → recovery 淡出。
  //   碰撞判定由 attachToPlayer（角色 rect）独立负责，VFX 仅呈现。

  _renderFire(ctx, skill, cast, player, frameData, progress) {
    if (!player) return;
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const phase = skill.phases[cast.phaseIndex];
    const norm = this._phaseNorm(cast.phaseTimer, phase.durationMs);

    // ── 阶段透明度 ──
    let visAlpha = 1;
    if (phase.id === "windup") {
      visAlpha = norm * 0.8;                       // 0 → 0.8 淡入
    } else if (phase.id === "recovery") {
      visAlpha = Math.max(0, 1 - norm * 1.3);      // 1 → 0 快速淡出
    }

    if (visAlpha <= 0) return;  // 完全透明则跳过绘制

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const DRAGON_LEN = 110;           // 火龙固定全长 (px)
    const dragonCx = pc.cx + dir * 12;
    const dragonCy = pc.cy;

    // ── 一、多段椭圆龙身（8段，头部大→尾部小）──
    const segCount = 8;
    for (let s = 0; s < segCount; s++) {
      const st = s / segCount;
      const headX = dragonCx + dir * (DRAGON_LEN * 0.3);
      const segX = headX - dir * st * (DRAGON_LEN / segCount);
      const segY = dragonCy + Math.sin(st * Math.PI * 3 + this._globalTime * 0.0045) * (5 + s * 1.3);
      const ew = (17 - s * 1.3) * (1 - st * 0.35);
      const eh = (11 - s * 0.7) * (1 - st * 0.25);
      const bodyAlpha = (0.85 - st * 0.5) * visAlpha;

      ctx.beginPath();
      ctx.ellipse(segX, segY, ew, eh, 0, 0, Math.PI * 2);

      const fireGrad = ctx.createRadialGradient(segX, segY, 0, segX, segY, ew);
      fireGrad.addColorStop(0,   `rgba(255,200,80,${bodyAlpha})`);
      fireGrad.addColorStop(0.4, `rgba(240,100,30,${bodyAlpha * 0.75})`);
      fireGrad.addColorStop(0.8, `rgba(180,40,20,${bodyAlpha * 0.35})`);
      fireGrad.addColorStop(1,   "rgba(180,40,20,0)");

      ctx.fillStyle = fireGrad;
      ctx.shadowColor = "rgba(255,120,30,0.35)";
      ctx.shadowBlur = 7 - s * 0.7;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ── 二、龙头：三角龙角 + 龙眼 ──
    const headX = dragonCx + dir * (DRAGON_LEN * 0.3 + 8);
    const headY = dragonCy + Math.sin(this._globalTime * 0.005) * 4;
    const hornSize = 13;

    ctx.beginPath();
    ctx.moveTo(headX + dir * 7,  headY - hornSize * 0.35);
    ctx.lineTo(headX + dir * (7 + hornSize * 0.75), headY - hornSize * 1.05);
    ctx.lineTo(headX + dir * 3,  headY - hornSize * 0.15);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,180,60,${0.88 * visAlpha})`;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(headX + dir * 7,  headY - hornSize * 0.35);
    ctx.lineTo(headX + dir * (7 + hornSize * 0.55), headY - hornSize * 0.05);
    ctx.lineTo(headX + dir * 11, headY - hornSize * 0.25);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,160,40,${0.78 * visAlpha})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(headX + dir * 9, headY - 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,200,${0.95 * visAlpha})`;
    ctx.fill();

    // ── 三、火焰拖尾火星粒子（仅 active 阶段）──
    const tailX = headX - dir * DRAGON_LEN;
    if (phase.hit && norm > 0.05) {
      this._spawnFireTrails(tailX, dragonCy, dir);
      if (Math.random() > 0.3) {
        this._spawnFireTrails(tailX + dir * DRAGON_LEN * 0.3, dragonCy + (Math.random() - 0.5) * 14, dir);
      }
    }

    // ── 四、角色火焰光环（active 前半段）──
    if (phase.hit && norm < 0.85) {
      const auraAlpha = 0.28 * (1 - norm) * visAlpha;
      const auraR = 17 + Math.sin(this._globalTime * 0.009) * 3;
      const auraGrad = ctx.createRadialGradient(pc.cx, pc.cy, auraR * 0.25, pc.cx, pc.cy, auraR);
      auraGrad.addColorStop(0,   "rgba(255,160,40,0)");
      auraGrad.addColorStop(0.5, `rgba(255,100,20,${auraAlpha * 0.5})`);
      auraGrad.addColorStop(1,   "rgba(200,50,10,0)");
      ctx.beginPath();
      ctx.arc(pc.cx, pc.cy, auraR, 0, Math.PI * 2);
      ctx.fillStyle = auraGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // 火焰拖尾粒子（增强版：沿冲刺路径密集生成）
  _spawnFireTrails(x, y, dir) {
    const key = "fire_trails";
    if (!this._particles[key]) this._particles[key] = [];
    if (this._particles[key].length > 60) return;   // 提高上限以适应密集拖尾
    for (let i = 0; i < 5; i++) {
      this._particles[key].push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 28,
        vx: -dir * (Math.random() * 2.5 + 0.5),
        vy: (Math.random() - 0.5) * 3 - 0.5,
        life: 250 + Math.random() * 350,
        maxLife: 600,
        size: 2 + Math.random() * 5,
        type: "fire_spark"
      });
    }
  }

  // ★ 水墨陨石精灵图绘制（_renderEarth 与 _renderChargeEarth 共用）
  // 已替换为 boulder_trap_frame_02.png，基于实际精灵图尺寸保持宽高比缩放
  _drawMeteorSprite(ctx, x, y, scale, alpha, rotation) {
    const img = this.asset && this.asset.getImage("earth_meteor_ink");
    // ★ 安全校验：防止空引用、未加载完成或尺寸异常的精灵图
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      return false;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    // ★ 基于精灵图实际尺寸保持宽高比缩放，避免拉伸变形
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const baseSize = 70;
    const drawW = baseSize * scale;
    const drawH = drawW / imgAspect;
    ctx.translate(x, y);
    if (rotation != null) ctx.rotate(rotation);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    return true;
  }

  // ==================== 土 Earth：陨星坠 ====================
  // 视觉描述：
  //   水墨陨石精灵图从天空坠落到锁定落点
  //   保留冲击波、震荡圆环和地裂墨线作为撞击反馈
  // ★ v2：支持目标锁定，陨石精准坠落至锁定敌人头顶

  _renderEarth(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const phase = skill.phases[cast.phaseIndex];
    const norm = this._phaseNorm(cast.phaseTimer, phase.durationMs);

    // ★ 目标锁定：陨石落点优先使用锁定坐标
    const isTargetLocked = cast._targetLockX != null;
    const impactCx = isTargetLocked ? cast._targetLockX : (pc.cx + dir * 40);
    const impactCy = isTargetLocked ? cast._targetLockY : (pc.baseY + 20);

    // ★ 蓄力视觉缩放系数：与碰撞箱同步 1x→2x
    const chargeRatio = (cast._chargeRatio != null) ? cast._chargeRatio : 0;
    const visScale = 1 + chargeRatio;  // 1x → 2x

    // 碰撞箱区域（用于视觉参考大小，同步缩放）
    let area;
    if (isTargetLocked) {
      const localFrame = Math.max(0, cast.frameIndex - (phase.frameStart || 0));
      const pfh = (phase.perFrameHitboxes && phase.perFrameHitboxes.length > 0)
        ? phase.perFrameHitboxes[Math.min(localFrame, phase.perFrameHitboxes.length - 1)]
        : { width: 160, height: 140 };
      const visR = Math.max(pfh.width, pfh.height) / 2 * visScale;
      area = { x: impactCx - visR, y: impactCy - visR, w: visR * 2, h: visR * 2 };
    } else {
      area = this._getHitboxArea(player, frameData, 15);
    }

    ctx.save();

    // ★ 直线坠落轨迹：从出生点到锁定落点
    const startX = (isTargetLocked && cast._meteorSpawnX != null) ? cast._meteorSpawnX : (impactCx + dir * 30);
    const startY = (isTargetLocked && cast._meteorSpawnY != null) ? cast._meteorSpawnY : (impactCy - 220);
    const endX = impactCx;
    const endY = area ? impactCy - (area.h * 0.25) : impactCy;

    let currentX = startX;
    let currentY = startY;
    let impactScale = 0;

    if (phase.id === "windup") {
      // windup：陨石在出生点静止淡入
      currentX = startX;
      currentY = startY;
    } else if (phase.id === "active") {
      // active：从出生点沿直线加速坠落至落点（easeInExpo 模拟重力加速）
      const fallNorm = Math.min(1, norm * 1.6);
      const t = this._easeInExpo(fallNorm);
      currentX = startX + (endX - startX) * t;
      currentY = startY + (endY - startY) * t;

      // 命中后开始显示撞击效果
      if (fallNorm > 0.85) {
        impactScale = (fallNorm - 0.85) / 0.15;
      }
    } else {
      // recovery：陨石停留在落地位置不动，撞击余波淡出
      // 不再重置到 startX/startY，避免"落地后弹回出生点"的视觉bug
      currentX = endX;
      currentY = endY;
      // 撞击效果随 recovery 进度线性淡出
      impactScale = Math.max(0, 1 - norm);
    }

    // ★ 陨石体尺寸同步缩放（上限随 visScale 增长）
    const mw = area ? Math.min(area.w * 0.55, 70 * visScale) : 56 * visScale;
    const mh = area ? Math.min(area.h * 0.50, 52 * visScale) : 44 * visScale;

    // ★ 陨石透明度：windup 淡入 → active 全显 → recovery 淡出消散
    const meteorAlpha = phase.id === "active" ? 1
                      : phase.id === "windup" ? (norm * 0.85)
                      : Math.max(0, 1 - norm);
    // 计算坠落方向旋转角（斜线轨迹自然朝向）
    const fallAngle = Math.atan2(endY - startY, endX - startX) + Math.PI / 2;
    const drawn = this._drawMeteorSprite(ctx, currentX, currentY, visScale * 0.85, meteorAlpha, fallAngle);

    if (!drawn) {
      // 回退：程序化椭圆绘制（图片缺失时）
      // 外层：暗赭石
      ctx.beginPath();
      ctx.ellipse(currentX, currentY, mw * 0.55, mh * 0.5, 0.15, 0, Math.PI * 2);
      const outerGrad = ctx.createRadialGradient(currentX, currentY - 5, 3, currentX, currentY, mw * 0.55);
      outerGrad.addColorStop(0, "rgba(160,120,70,0.88)");
      outerGrad.addColorStop(0.5, "rgba(130,90,50,0.78)");
      outerGrad.addColorStop(1, "rgba(90,60,35,0.55)");
      ctx.fillStyle = outerGrad;
      ctx.shadowColor = "rgba(138,109,59,0.4)";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 内层：较亮赭黄
      ctx.beginPath();
      ctx.ellipse(currentX - mw * 0.08, currentY - mh * 0.08, mw * 0.38, mh * 0.34, -0.1, 0, Math.PI * 2);
      const innerGrad = ctx.createRadialGradient(currentX - mw * 0.1, currentY - mh * 0.12, 2, currentX, currentY, mw * 0.38);
      innerGrad.addColorStop(0, "rgba(200,160,90,0.72)");
      innerGrad.addColorStop(0.6, "rgba(170,130,70,0.52)");
      innerGrad.addColorStop(1, "rgba(140,100,50,0.25)");
      ctx.fillStyle = innerGrad;
      ctx.fill();

      // 表面坑洼墨点
      const craterSeed = skill.id.charCodeAt(0) * 31;
      for (let c = 0; c < 8; c++) {
        const angle = (craterSeed + c * 47) % 360 * Math.PI / 180;
        const dist = (0.15 + ((craterSeed + c * 73) % 100) / 100 * 0.35) * mw * 0.5;
        const cx = currentX + Math.cos(angle) * dist;
        const cy = currentY + Math.sin(angle) * dist * 0.85;
        const cr = 1.5 + ((craterSeed + c * 29) % 100) / 100 * 3;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(70,45,25,${0.35 + Math.random() * 0.25})`;
        ctx.fill();
      }
    }

    // ★ 目标锁定标识：陨石下落前在落点显示瞄准标记
    if (isTargetLocked && !phase.hit && norm < 0.6) {
      const markerAlpha = (1 - norm / 0.6) * 0.5;
      const markerR = mw * 0.5;
      ctx.strokeStyle = `rgba(200,160,80,${markerAlpha})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(impactCx, impactCy, markerR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // 十字准星
      const crossLen = markerR * 0.35;
      ctx.beginPath();
      ctx.moveTo(impactCx, impactCy - crossLen);
      ctx.lineTo(impactCx, impactCy + crossLen);
      ctx.moveTo(impactCx - crossLen, impactCy);
      ctx.lineTo(impactCx + crossLen, impactCy);
      ctx.stroke();
    }

    // ★ 撞击反馈（impactScale > 0 时）
    if (impactScale > 0) {
      const impY = impactCy;

      // ★ 视觉冲击波与碰撞箱同步：baseScale × (1+chargeRatio)
      const baseVisRadius = 50;
      const visualRadiusScale = baseVisRadius * visScale;

      // 1) 径向扩散圆形冲击波
      const swRadius = impactScale * visualRadiusScale + 10;
      const swAlpha = Math.max(0, 1 - impactScale);
      ctx.beginPath();
      ctx.arc(impactCx, impY, swRadius, 0, Math.PI * 2);
      const shockGrad = ctx.createRadialGradient(impactCx, impY, 0, impactCx, impY, swRadius);
      shockGrad.addColorStop(0, `rgba(200,160,90,${swAlpha * 0.55})`);
      shockGrad.addColorStop(0.4, `rgba(160,120,60,${swAlpha * 0.32})`);
      shockGrad.addColorStop(0.75, `rgba(138,109,59,${swAlpha * 0.12})`);
      shockGrad.addColorStop(1, "rgba(138,109,59,0)");
      ctx.fillStyle = shockGrad;
      ctx.fill();

      // 2) 同心震荡圆环（2~3 层）
      for (let r = 0; r < 3; r++) {
        const ringR = swRadius * (0.4 + r * 0.3);
        const ringAlpha = (1 - impactScale) * (0.5 - r * 0.15);
        ctx.beginPath();
        ctx.arc(impactCx, impY, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(138,109,59,${ringAlpha})`;
        ctx.lineWidth = 2 - r * 0.4;
        ctx.stroke();
      }

      // 3) 地裂墨线（从撞击点向外辐射的裂纹）
      const crackCount = 6;
      for (let ck = 0; ck < crackCount; ck++) {
        const cAngle = (ck / crackCount) * Math.PI * 2 + Math.PI * 0.1;
        const cLen = (20 + Math.random() * 35) * impactScale;
        const jitter = () => (Math.random() - 0.5) * 6 * impactScale;

        ctx.beginPath();
        ctx.moveTo(impactCx + Math.cos(cAngle) * 10, impY + Math.abs(Math.sin(cAngle)) * 10);
        ctx.lineTo(
          impactCx + Math.cos(cAngle) * cLen * 0.33 + jitter(),
          impY + Math.abs(Math.sin(cAngle)) * cLen * 0.33 + jitter()
        );
        ctx.lineTo(
          impactCx + Math.cos(cAngle) * cLen * 0.66 + jitter(),
          impY + Math.abs(Math.sin(cAngle)) * cLen * 0.66 + jitter()
        );
        ctx.lineTo(
          impactCx + Math.cos(cAngle) * cLen + jitter(),
          impY + Math.abs(Math.sin(cAngle)) * cLen + jitter()
        );

        ctx.strokeStyle = `rgba(90,60,35,${(1 - impactScale) * 0.55})`;
        ctx.lineWidth = 1.5 + Math.random() * 1.5;
        ctx.stroke();
      }

      // 撞击时产生碎石粒子
      if (impactScale < 0.3) {
        this._spawnDebris(impactCx, impY);
      }
    }

    ctx.restore();
  }

  // 碎石/尘埃粒子
  _spawnDebris(x, y) {
    const key = "earth_debris";
    if (!this._particles[key]) this._particles[key] = [];
    if (this._particles[key].length > 25) return;
    for (let i = 0; i < 5; i++) {
      this._particles[key].push({
        x: x + (Math.random() - 0.5) * 40,
        y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 5 - 2,
        life: 400 + Math.random() * 300,
        maxLife: 700,
        size: 2 + Math.random() * 3,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        type: "debris"
      });
    }
  }

  // ==================== 默认/通用渲染 ====================

  _renderGeneric(ctx, skill, cast, player, frameData) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 0);

    if (!area) return;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#888";
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.restore();
  }

  // ==================== ★ v6 蓄力特效（按元素分派，禁止混用） ====================

  // 公共分派入口：根据技能元素类型调用对应蓄力特效
  // spawnX/Y: 陨石出生点（earth），null 时自动计算
  renderCharge(ctx, player, element, progress, spawnX, spawnY, targetX, targetY) {
    if (!player || !element) return;
    switch (element) {
      case "fire":  this._renderChargeFire(ctx, player, progress); break;
      case "earth": this._renderChargeEarth(ctx, player, progress, spawnX, spawnY, targetX, targetY); break;
      default: break;
    }
  }

  // ── 火 蓄力：火焰光环 + 龙形虚影 + 火星粒子 ──
  _renderChargeFire(ctx, player, progress) {
    if (!player) return;
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    const dir = player.facing === "right" ? 1 : -1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // ★ 火焰光环层数随蓄力进度增加（1~5层）
    const layers = Math.floor(1 + progress * 4);
    for (let l = 0; l < layers; l++) {
      const lt = l / Math.max(1, layers - 1);
      const baseR = 18 + progress * 30;
      const r = baseR + lt * 12 + Math.sin(this._globalTime * 0.008 + l * 2.1) * 8;
      const alpha = (0.35 + progress * 0.45) * (1 - lt * 0.5);

      const grad = ctx.createRadialGradient(pcx, pcy, r * 0.2, pcx, pcy, r);
      grad.addColorStop(0, `rgba(255,220,80,0)`);
      grad.addColorStop(0.35, `rgba(255,120,30,${alpha * 0.7})`);
      grad.addColorStop(0.7, `rgba(220,50,10,${alpha * 0.35})`);
      grad.addColorStop(1, "rgba(180,20,5,0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pcx, pcy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ★ 蓄力火龙虚影（高蓄力时显现）
    if (progress > 0.4) {
      const dragonAlpha = (progress - 0.4) * 1.5;
      const ghostX = pcx + dir * (15 + progress * 25);
      const ghostLen = 30 + progress * 50;
      const segCount = 6;

      for (let s = 0; s < segCount; s++) {
        const st = s / segCount;
        const sx = ghostX - dir * st * ghostLen;
        const sy = pcy + Math.sin(st * Math.PI * 2.5 + this._globalTime * 0.006) * (4 + s);
        const ew = (9 - s * 1.2) * (progress * 0.9);
        const eh = (6 - s * 0.7) * (progress * 0.8);

        ctx.beginPath();
        ctx.ellipse(sx, sy, ew, eh, 0, 0, Math.PI * 2);
        const segGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, ew);
        segGrad.addColorStop(0, `rgba(255,180,60,${dragonAlpha * (0.6 - st * 0.5)})`);
        segGrad.addColorStop(0.7, `rgba(200,50,15,${dragonAlpha * (0.25 - st * 0.2)})`);
        segGrad.addColorStop(1, "rgba(200,50,15,0)");
        ctx.fillStyle = segGrad;
        ctx.fill();
      }
    }

    // ★ 持续生成火星粒子（随进度加速）
    if (Math.random() < 0.3 + progress * 0.5) {
      this._spawnChargeSparks(pcx, pcy, dir, progress);
    }

    ctx.restore();
  }

  // 蓄力火星粒子（fire 专属）
  _spawnChargeSparks(x, y, dir, progress) {
    const key = "charge_sparks";
    if (!this._particles[key]) this._particles[key] = [];
    if (this._particles[key].length > 25) return;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (15 + progress * 30) * Math.random();
      this._particles[key].push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist * 0.7,
        vx: (Math.random() - 0.5) * 2 - dir * progress,
        vy: -Math.random() * (1 + progress * 3) - 1,
        life: 400 + Math.random() * 400,
        maxLife: 800,
        size: 1.5 + Math.random() * 3 + progress * 2,
        type: "fire_spark"
      });
    }
  }

  // ── 土 蓄力：赭黄岩环 + 天空静止陨石 + 碎岩 + 地面裂隙 + 尘沙 ──
  _renderChargeEarth(ctx, player, progress, spawnX, spawnY, targetX, targetY) {
    if (!player) return;
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    const footY = player.y + player.h;

    // ★ 陨石出生点（由 startCharge 锁定，蓄力期间固定不变）
    const mx = (spawnX != null) ? spawnX : (pcx + (player.facing === "right" ? 60 : -60));
    const my = (spawnY != null) ? spawnY : (pcy - 160);
    const meteorScale = 1 + progress;  // 1x → 2x

    ctx.save();

    // ★ 天空陨石本体（蓄力全程静止在出生点，仅体积增长）
    if (progress > 0.05) {
      // ★ 修正：meteorW / meteorH 声明提前到 if (!drawn) 块外，
      //   防止精灵图加载成功时 drawn=true 导致块跳过，变量未声明 → ReferenceError 崩溃游戏主循环
      const meteorW = 18 * meteorScale;
      const meteorH = 14 * meteorScale;
      const meteorAlpha = Math.min(1, progress * 2.5);
      // 使用水墨陨石精灵图
      const drawn = this._drawMeteorSprite(ctx, mx, my, meteorScale * 0.6, meteorAlpha, null);

      if (!drawn) {
        // 回退：程序化椭圆绘制
        ctx.beginPath();
        ctx.ellipse(mx, my, meteorW * 0.5, meteorH * 0.45, 0.15, 0, Math.PI * 2);
        const outerGrad = ctx.createRadialGradient(mx, my - 2, 2, mx, my, meteorW * 0.5);
        outerGrad.addColorStop(0, `rgba(180,140,70,${meteorAlpha * 0.85})`);
        outerGrad.addColorStop(0.4, `rgba(140,100,50,${meteorAlpha * 0.7})`);
        outerGrad.addColorStop(0.8, `rgba(90,60,35,${meteorAlpha * 0.4})`);
        outerGrad.addColorStop(1, "rgba(60,35,20,0)");
        ctx.fillStyle = outerGrad;
        ctx.shadowColor = `rgba(138,109,59,${meteorAlpha * 0.45})`;
        ctx.shadowBlur = 8 * meteorScale;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.ellipse(mx - meteorW * 0.06, my - meteorH * 0.05, meteorW * 0.32, meteorH * 0.28, -0.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,170,90,${meteorAlpha * 0.55})`;
        ctx.fill();

        const seed = 137;
        for (let c = 0; c < 6; c++) {
          const angle = (seed + c * 61) % 360 * Math.PI / 180;
          const dist = (0.15 + ((seed + c * 41) % 100) / 100 * 0.3) * meteorW * 0.45;
          const cx = mx + Math.cos(angle) * dist;
          const cy = my + Math.sin(angle) * dist * 0.7;
          ctx.beginPath();
          ctx.arc(cx, cy, 1.2 * meteorScale, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(60,40,20,${meteorAlpha * 0.4})`;
          ctx.fill();
        }
      }

      // 下落轨迹线（虚线，从出生点到锁定落点）
      if (targetX != null) {
        ctx.beginPath();
        ctx.setLineDash([3 + progress * 2, 4]);
        ctx.moveTo(mx, my + meteorH * 0.4);
        ctx.lineTo(targetX, targetY || footY);
        ctx.strokeStyle = `rgba(180,140,70,${0.15 + progress * 0.2})`;
        ctx.lineWidth = 1 + progress;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ★ 岩土光环（1~4层，赭黄/棕色调）
    const ringLayers = Math.floor(1 + progress * 3);
    for (let l = 0; l < ringLayers; l++) {
      const lt = l / Math.max(1, ringLayers - 1);
      const baseR = 20 + progress * 28;
      // 岩环旋转（慢速，沉重感）
      const angleOff = this._globalTime * 0.003 + l * 2.1;
      const r = baseR + lt * 14 + Math.sin(angleOff) * 6;

      ctx.beginPath();
      ctx.arc(pcx, pcy, r, 0, Math.PI * 2);
      const ringAlpha = (0.3 + progress * 0.4) * (1 - lt * 0.55);
      ctx.strokeStyle = `rgba(160,120,60,${ringAlpha})`;
      ctx.lineWidth = 2 + progress * 2;
      ctx.setLineDash([8 + progress * 6, 6 - progress * 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 内层实心光晕
      if (l === 0) {
        const innerGrad = ctx.createRadialGradient(pcx, pcy, r * 0.3, pcx, pcy, r * 0.85);
        innerGrad.addColorStop(0, "rgba(180,140,70,0)");
        innerGrad.addColorStop(0.5, `rgba(140,100,50,${ringAlpha * 0.5})`);
        innerGrad.addColorStop(1, "rgba(120,80,40,0)");
        ctx.fillStyle = innerGrad;
        ctx.fill();
      }
    }

    // ★ 地面裂隙（脚底向外辐射）
    if (progress > 0.2) {
      const fissureAlpha = (progress - 0.2) * 0.7;
      const fissureCount = 4 + Math.floor(progress * 4);
      for (let f = 0; f < fissureCount; f++) {
        const fAngle = (f / fissureCount) * Math.PI * 2 + this._globalTime * 0.001;
        const fLen = 15 + progress * 35 + Math.sin(f * 3.7) * 8;
        const endX = pcx + Math.cos(fAngle) * fLen;
        const endY = footY + Math.abs(Math.sin(fAngle)) * fLen * 0.4;

        ctx.beginPath();
        ctx.moveTo(pcx, footY);
        // 折线裂纹
        ctx.lineTo(
          pcx + Math.cos(fAngle) * fLen * 0.5 + (Math.random() - 0.5) * 8,
          footY + Math.abs(Math.sin(fAngle)) * fLen * 0.5 * 0.4 + (Math.random() - 0.5) * 4
        );
        ctx.lineTo(endX, endY);

        ctx.strokeStyle = `rgba(90,60,35,${fissureAlpha * 0.55})`;
        ctx.lineWidth = 1 + progress * 1.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    // ★ 浮游碎岩块（绕角色旋转的多边形碎石）
    if (progress > 0.15) {
      const rockCount = 3 + Math.floor(progress * 6);
      for (let rk = 0; rk < rockCount; rk++) {
        const phase = this._globalTime * (0.002 + rk * 0.0006) + rk * 1.8;
        const orbitR = 22 + progress * 28 + Math.sin(phase * 1.5) * 8;
        const rockAngle = phase;
        const rx = pcx + Math.cos(rockAngle) * orbitR;
        const ry = pcy + Math.sin(rockAngle) * orbitR * 0.6;
        const rockSize = 3 + progress * 5;
        const rockAlpha = 0.45 + progress * 0.35 + Math.sin(phase * 3) * 0.15;

        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(phase * 0.7);
        // 不规则四边形碎石
        ctx.beginPath();
        ctx.moveTo(-rockSize * 0.7, -rockSize * 0.5);
        ctx.lineTo(rockSize * 0.8, -rockSize * 0.3);
        ctx.lineTo(rockSize * 0.5, rockSize * 0.6);
        ctx.lineTo(-rockSize * 0.6, rockSize * 0.4);
        ctx.closePath();
        ctx.fillStyle = `rgba(150,110,60,${rockAlpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(100,70,35,${rockAlpha * 0.5})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }

    // ★ 尘沙粒子（从地面向上飘起，大量棕色微粒）
    if (Math.random() < 0.25 + progress * 0.55) {
      this._spawnChargeDust(pcx, footY, progress);
    }

    ctx.restore();
  }

  // 蓄力尘沙粒子（earth 专属）
  _spawnChargeDust(x, y, progress) {
    const key = "charge_dust";
    if (!this._particles[key]) this._particles[key] = [];
    if (this._particles[key].length > 35) return;
    for (let i = 0; i < 3; i++) {
      const spreadX = (Math.random() - 0.5) * (30 + progress * 40);
      this._particles[key].push({
        x: x + spreadX,
        y: y - Math.random() * 8,
        vx: (Math.random() - 0.5) * (0.8 + progress * 1.2),
        vy: -Math.random() * (0.5 + progress * 2) - 0.3,
        life: 600 + Math.random() * 500,
        maxLife: 1100,
        size: 1 + Math.random() * 2.5 + progress * 1.5,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        type: "earth_dust"
      });
    }
  }

  // ==================== 粒子系统管理 ====================

  _updateParticles(dt) {
    for (const key in this._particles) {
      const arr = this._particles[key];
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;   // 微重力
        p.life -= dt;

        if (p.rotSpeed !== undefined) p.rotation += p.rotSpeed;

        if (p.life <= 0) arr.splice(i, 1);
      }
      if (arr.length === 0) delete this._particles[key];
    }
  }

  // 绘制所有活跃粒子
  renderParticles(ctx) {
    for (const key in this._particles) {
      const arr = this._particles[key];
      for (const p of arr) {
        const alpha = Math.min(1, p.life / (p.maxLife * 0.4));
        ctx.save();
        ctx.globalAlpha = alpha * 0.80;  // ★ Alpha 精确 80%

        switch (p.type) {
          case "water_drop":
            ctx.fillStyle = `rgba(100,180,240,${alpha})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
            break;

          case "leaf":
            ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
            ctx.fillStyle = `rgba(46,139,87,${alpha * 0.7})`;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            break;

          case "fire_spark":
            // 双层辉光火星粒子
            const sparkSize = p.size * alpha;
            const sparkGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sparkSize * 1.5);
            sparkGrad.addColorStop(0, `rgba(255,240,120,${alpha * 0.9})`);
            sparkGrad.addColorStop(0.3, `rgba(255,160,40,${alpha * 0.7})`);
            sparkGrad.addColorStop(0.7, `rgba(220,60,15,${alpha * 0.3})`);
            sparkGrad.addColorStop(1, "rgba(180,20,10,0)");
            ctx.fillStyle = sparkGrad;
            ctx.shadowColor = "rgba(255,100,20,0.5)";
            ctx.shadowBlur = 4;
            ctx.beginPath(); ctx.arc(p.x, p.y, sparkSize * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            break;

          case "debris":
            ctx.translate(p.x, p.y); ctx.rotate(p.rotation || 0);
            ctx.fillStyle = `rgba(138,109,59,${alpha * 0.75})`;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            break;

          case "earth_dust":
            // 尘沙微粒（土蓄力专属）：不规则小矩形 + 微旋转
            ctx.translate(p.x, p.y); ctx.rotate(p.rotation || 0);
            ctx.fillStyle = `rgba(160,120,70,${alpha * 0.65})`;
            ctx.fillRect(-p.size * 0.7, -p.size * 0.5, p.size * 1.4, p.size);
            // 外围微光晕
            ctx.fillStyle = `rgba(200,160,90,${alpha * 0.25})`;
            ctx.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
            break;
        }

        ctx.restore();
      }
    }
  }

  // ==================== 缓动函数 ====================

  _easeOutQuad(t) { return t * (2 - t); }
  _easeInQuad(t) { return t * t; }
  _easeOutCubic(t) { return (--t) * t * t + 1; }
  _easeOutBounce(t) {
    if (t < 1 / 2.75) { return 7.5625 * t * t; }
    else if (t < 2 / 2.75) { return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75; }
    else if (t < 2.5 / 2.75) { return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375; }
    else { return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375; }
  }
  _easeOutBack(t) { const s = 1.70158; return (--t) * t * ((s + 1) * t + s) + 1; }
  _easeInExpo(t) { return t === 0 ? 0 : Math.pow(2, 10 * (t - 1)); }

  // ==================== 几何工具 ====================

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x, y + h - r, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

window.SkillVFXRenderer = window.SkillVFXRenderer || null;
