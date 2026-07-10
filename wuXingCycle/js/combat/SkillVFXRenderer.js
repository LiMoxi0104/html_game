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
  constructor(hitboxSystem) {
    this.hb = hitboxSystem;           // HitboxSystem 引用（共享帧数据）

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

  // ==================== 水 Water：三层弧形水浪 ====================
  // 视觉描述：
  //   三层叠加的弧形水浪，每层使用径向渐变从浅蓝过渡到完全透明
  //   错位排列形成波浪感，向远处推进时边缘阴影模糊模拟水墨晕染

  _renderWater(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 10);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";   // 叠加混合增强发光感

    const norm = this._phaseNorm(cast.phaseTimer,
      (skill.phases[cast.phaseIndex] || {}).durationMs);

    // ★ 三层水浪 —— 错位相位、不同尺寸
    for (let layer = 0; layer < 3; layer++) {
      const phaseOff = layer * 0.35;            // 层间相位偏移
      const t = (norm + phaseOff) % 1;

      // 波浪展开动画：从玩家前方收缩到远处扩散
      const expand = this._easeOutQuad(t);
      const waveW = area ? area.w : 60;
      const waveH = area ? area.h : 50;

      const w = waveW * (0.4 + expand * 0.8) * (1 - layer * 0.15);
      const h = waveH * (0.5 + expand * 0.6) * (1 - layer * 0.12);
      const ox = pc.cx + dir * (20 + expand * 35) + layer * dir * 12;
      const oy = pc.cy - h * 0.3 + layer * 6 + Math.sin(t * Math.PI * 3 + layer) * 4;

      // 弧形路径
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

      // 径向渐变填充：浅蓝中心 → 完全透明边缘
      const grad = ctx.createRadialGradient(ox, oy - h * 0.1, 2, ox, oy, w * 0.7);
      grad.addColorStop(0, `rgba(100,180,240,${this.INK_ALPHA_BASE * (0.9 - layer * 0.25)})`);
      grad.addColorStop(0.45, `rgba(58,123,213,${this.INK_ALPHA_BASE * (0.55 - layer * 0.18)})`);
      grad.addColorStop(0.8, `rgba(58,123,213,${this.INK_ALPHA_BASE * (0.18 - layer * 0.06)})`);
      grad.addColorStop(1, "rgba(58,123,213,0)");

      ctx.fillStyle = grad;
      // 阴影模糊模拟水墨晕染
      ctx.shadowColor = "rgba(58,123,213,0.35)";
      ctx.shadowBlur = 6 + layer * 3;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // 水花飞溅粒子（命中帧触发）
    if (frameData && frameData.isHitFrame && Math.random() > 0.5) {
      this._spawnWaterDroplets(pc.cx + dir * 30, pc.cy - 10);
    }
  }

  // 水滴粒子
  _spawnWaterDroplets(x, y) {
    const key = "water_drops";
    if (!this._particles[key]) this._particles[key] = [];
    for (let i = 0; i < 4; i++) {
      this._particles[key].push({
        x, y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 4 - 1,
        life: 300 + Math.random() * 200,
        maxLife: 500,
        size: 2 + Math.random() * 3,
        type: "water_drop"
      });
    }
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
  // 视觉描述：
  //   多段椭圆与曲线串联构成龙身
  //   前端配以龙角三角，尾部分散为随机墨点模拟火焰拖尾
  //   整体向前突进时尾部粒子逐渐消散

  _renderFire(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 12);
    const phase = skill.phases[cast.phaseIndex];
    const norm = this._phaseNorm(cast.phaseTimer, phase.durationMs);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // 冲刺位移量
    const dashDist = phase.dashDistance || 120;
    const dashT = this._easeOutCubic(norm);
    const dashX = pc.baseX + dir * dashDist * dashT;

    // ★ 多段椭圆龙身
    const segCount = 8;
    const dragonLen = area ? area.w : 90;
    const segLen = dragonLen / segCount;

    for (let s = 0; s < segCount; s++) {
      const st = s / segCount;
      // 龙身各节位置：从头到尾依次排布
      const headX = dashX + player.w * 0.5 + dir * 20;
      const segX = headX - dir * st * segLen;
      const segY = pc.cy + Math.sin(st * Math.PI * 3 + this._globalTime * 0.005) * (6 + s * 1.5);

      // 椭圆大小：头部大 → 尾部小
      const ew = (18 - s * 1.4) * (1 - st * 0.4);
      const eh = (12 - s * 0.8) * (1 - st * 0.3);

      // 身体透明度递减
      const bodyAlpha = 0.82 - st * 0.5;

      ctx.beginPath();
      ctx.ellipse(segX, segY, ew, eh, 0, 0, Math.PI * 2);

      // 火焰色渐变（橙红→暗红）
      const fireGrad = ctx.createRadialGradient(segX, segY, 0, segX, segY, ew);
      fireGrad.addColorStop(0, `rgba(255,200,80,${bodyAlpha})`);
      fireGrad.addColorStop(0.4, `rgba(240,100,30,${bodyAlpha * 0.75})`);
      fireGrad.addColorStop(0.8, `rgba(180,40,20,${bodyAlpha * 0.35})`);
      fireGrad.addColorStop(1, "rgba(180,40,20,0)");

      ctx.fillStyle = fireGrad;
      ctx.shadowColor = "rgba(255,120,30,0.4)";
      ctx.shadowBlur = 8 - s * 0.8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ★ 龙头：三角龙角
    const headX = dashX + player.w * 0.5 + dir * 20;
    const headY = pc.cy + Math.sin(this._globalTime * 0.006) * 5;
    const hornSize = 14;

    // 左角
    ctx.beginPath();
    ctx.moveTo(headX + dir * 8, headY - hornSize * 0.4);
    ctx.lineTo(headX + dir * (8 + hornSize * 0.8), headY - hornSize * 1.1);
    ctx.lineTo(headX + dir * 4, headY - hornSize * 0.2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,180,60,0.85)";
    ctx.fill();

    // 右角
    ctx.beginPath();
    ctx.moveTo(headX + dir * 8, headY - hornSize * 0.4);
    ctx.lineTo(headX + dir * (8 + hornSize * 0.6), headY - hornSize * 0.1);
    ctx.lineTo(headX + dir * 12, headY - hornSize * 0.3);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,160,40,0.75)";
    ctx.fill();

    // 龙眼
    ctx.beginPath();
    ctx.arc(headX + dir * 10, headY - 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,200,0.95)";
    ctx.fill();

    // ★ 尾部火焰拖尾墨点粒子
    const tailX = headX - dir * dragonLen;
    if (norm > 0.2) {
      this._spawnFireTrails(tailX, pc.cy, dir);
    }

    ctx.restore();
  }

  // 火焰拖尾粒子
  _spawnFireTrails(x, y, dir) {
    const key = "fire_trails";
    if (!this._particles[key]) this._particles[key] = [];
    if (this._particles[key].length > 40) return;   // 上限控制
    for (let i = 0; i < 3; i++) {
      this._particles[key].push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 20,
        vx: -dir * (Math.random() * 2 + 0.5),
        vy: (Math.random() - 0.5) * 2,
        life: 200 + Math.random() * 300,
        maxLife: 500,
        size: 2 + Math.random() * 4,
        type: "fire_spark"
      });
    }
  }

  // ==================== 土 Earth：陨星坠 ====================
  // 视觉描述：
  //   不规则陨石通过叠加多层径向渐变表现质感
  //   表面散布暗色墨点模拟坑洼
  //   落地时生成从中心向外扩散的巨大冲击波
  //   配合同心震荡圆环和数条地裂墨线构成完整撞击反馈

  _renderEarth(ctx, skill, cast, player, frameData, progress) {
    const pc = this._getPlayerCenter(player);
    const dir = pc.facing === "right" ? 1 : -1;
    const area = this._getHitboxArea(player, frameData, 15);
    const phase = skill.phases[cast.phaseIndex];
    const norm = this._phaseNorm(cast.phaseTimer, phase.durationMs);

    ctx.save();

    // 陨石下落轨迹
    const meteorStartY = pc.baseY - 180;
    const targetY = area ? area.y : (pc.baseY + 20);
    let currentY;
    let impactScale = 0;

    if (!phase.hit) {
      // windup：陨石从高空缓缓出现
      currentY = meteorStartY + (targetY - meteorStartY) * this._easeInQuad(norm * 0.5);
    } else {
      // active：快速坠落 + 命中
      const fallNorm = Math.min(1, norm * 1.6);
      currentY = meteorStartY + (targetY - meteorStartY) * this._easeInExpo(fallNorm);

      // 命中后开始显示撞击效果
      if (fallNorm > 0.85) {
        impactScale = (fallNorm - 0.85) / 0.15;
      }
    }

    // 陨石 X 位置（在目标区域上方）
    const mx = pc.cx + dir * ((area ? area.w : 110) * 0.25);
    const mw = area ? Math.min(area.w, 70) : 56;
    const mh = area ? Math.min(area.h, 52) : 44;

    // ★ 不规则陨石本体（多层径向渐变叠加）
    // 外层：暗赭石
    ctx.beginPath();
    ctx.ellipse(mx, currentY, mw * 0.55, mh * 0.5, 0.15, 0, Math.PI * 2);
    const outerGrad = ctx.createRadialGradient(mx, currentY - 5, 3, mx, currentY, mw * 0.55);
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
    ctx.ellipse(mx - mw * 0.08, currentY - mh * 0.08, mw * 0.38, mh * 0.34, -0.1, 0, Math.PI * 2);
    const innerGrad = ctx.createRadialGradient(mx - mw * 0.1, currentY - mh * 0.12, 2, mx, currentY, mw * 0.38);
    innerGrad.addColorStop(0, "rgba(200,160,90,0.72)");
    innerGrad.addColorStop(0.6, "rgba(170,130,70,0.52)");
    innerGrad.addColorStop(1, "rgba(140,100,50,0.25)");
    ctx.fillStyle = innerGrad;
    ctx.fill();

    // ★ 表面坑洼墨点（随机固定位置）
    const craterSeed = skill.id.charCodeAt(0) * 31;   // 固定随机种
    for (let c = 0; c < 8; c++) {
      const angle = (craterSeed + c * 47) % 360 * Math.PI / 180;
      const dist = (0.15 + ((craterSeed + c * 73) % 100) / 100 * 0.35) * mw * 0.5;
      const cx = mx + Math.cos(angle) * dist;
      const cy = currentY + Math.sin(angle) * dist * 0.85;
      const cr = 1.5 + ((craterSeed + c * 29) % 100) / 100 * 3;

      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(70,45,25,${0.35 + Math.random() * 0.25})`;
      ctx.fill();
    }

    // ★ 撞击反馈（impactScale > 0 时）
    if (impactScale > 0) {
      const impY = targetY + mh * 0.4;   // 地面撞击点

      // 1) 径向扩散圆形冲击波
      const swRadius = impactScale * 80 + 20;
      const swAlpha = Math.max(0, 1 - impactScale);
      ctx.beginPath();
      ctx.arc(mx, impY, swRadius, 0, Math.PI * 2);
      const shockGrad = ctx.createRadialGradient(mx, impY, 0, mx, impY, swRadius);
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
        ctx.arc(mx, impY, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(138,109,59,${ringAlpha})`;
        ctx.lineWidth = 2 - r * 0.4;
        ctx.stroke();
      }

      // 3) 地裂墨线（从撞击点向外辐射的裂纹）
      const crackCount = 6;
      for (let ck = 0; ck < crackCount; ck++) {
        const cAngle = (ck / crackCount) * Math.PI * 2 + Math.PI * 0.1;   // 向下半圆为主
        const cLen = (20 + Math.random() * 35) * impactScale;
        const jitter = () => (Math.random() - 0.5) * 6 * impactScale;

        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(cAngle) * 10, impY + Math.abs(Math.sin(cAngle)) * 10);
        // 折线路径模拟裂纹
        ctx.lineTo(
          mx + Math.cos(cAngle) * cLen * 0.33 + jitter(),
          impY + Math.abs(Math.sin(cAngle)) * cLen * 0.33 + jitter()
        );
        ctx.lineTo(
          mx + Math.cos(cAngle) * cLen * 0.66 + jitter(),
          impy + Math.abs(Math.sin(cAngle)) * cLen * 0.66 + jitter()
        );  // 注意：impY 变量名保持一致
        ctx.lineTo(
          mx + Math.cos(cAngle) * cLen + jitter(),
          impY + Math.abs(Math.sin(cAngle)) * cLen + jitter()
        );

        ctx.strokeStyle = `rgba(90,60,35,${(1 - impactScale) * 0.55})`;
        ctx.lineWidth = 1.5 + Math.random() * 1.5;
        ctx.stroke();
      }

      // 撞击时产生碎石粒子
      if (impactScale < 0.3) {
        this._spawnDebris(mx, impY);
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
        ctx.globalAlpha = alpha * 0.8;

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
            const sparkGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            sparkGrad.addColorStop(0, `rgba(255,200,80,${alpha})`);
            sparkGrad.addColorStop(0.5, `rgba(240,100,30,${alpha * 0.6})`);
            sparkGrad.addColorStop(1, "rgba(180,40,20,0)");
            ctx.fillStyle = sparkGrad;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
            break;

          case "debris":
            ctx.translate(p.x, p.y); ctx.rotate(p.rotation || 0);
            ctx.fillStyle = `rgba(138,109,59,${alpha * 0.75})`;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
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
