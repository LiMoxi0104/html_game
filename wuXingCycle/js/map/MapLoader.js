// MapLoader：横版卷轴地图加载 + 视差滚动框架。
// v3 升级：支持多平台（platforms）碰撞体，替代单一 groundY。
// 从 config/mapConfig.json 读取地图数据，构建 enemies/platforms，并提供分层绘制方法。
class MapLoader {
  // cfg 为 mapConfig.json 中对应地图节点
  static load(mapId, consts, cfg, asset) {
    const map = {
      id: mapId,
      name: cfg.name,
      width: cfg.width,
      height: cfg.height,
      groundY: cfg.groundY,       // 保留全局最低地面 Y（死亡线/坠落线）
      spawn: cfg.spawn,
      cfg: cfg,
      enemies: [],
      platforms: [],               // ★ v3 多平台碰撞体 [{x,y,w,h,type}]
      portal: null                 // ★ v4 传送门 {x,y,w,h,targetMap,targetX,targetY}
    };

    // 敌人
    (cfg.enemies || []).forEach(e => map.enemies.push(new EnemyBase(e)));

    // ★ v3 平台碰撞体：用于玩家站立检测 + 渲染
    if (cfg.platforms && cfg.platforms.length > 0) {
      map.platforms = cfg.platforms.map(p => ({
        x: p.x, y: p.y, w: p.w, h: p.h, type: p.type || "default"
      }));
      map.hasPlatforms = true;
    }

    // ★ v4 传送门数据
    if (cfg.portal) {
      map.portal = {
        x: cfg.portal.x,
        y: cfg.portal.y,
        w: cfg.portal.w,
        h: cfg.portal.h,
        targetMap: cfg.portal.targetMap,
        targetX: cfg.portal.targetX,
        targetY: cfg.portal.targetY
      };
    }

    map.drawBackground = (ctx, camX) => MapLoader.drawParallax(ctx, consts, camX, map);
    map.drawGround    = (ctx)       => MapLoader.drawGround(ctx, consts, map);
    map.drawPlatforms = (ctx)       => MapLoader.renderPlatforms(ctx, consts, map);
    map.drawPortal    = (ctx, t)    => MapLoader.renderPortal(ctx, map, t);  // ★ v4
    return map;
  }

  // ★ v3 平台碰撞检测：检测玩家矩形是否站在某个平台上。
  // 返回 { onPlatform: bool, platformY: number|null } —— 平台表面 Y（即站上去的 Y 坐标）
  // 规则：玩家水平与平台重叠 → 玩家底部贴平台顶部 → 允许微穿透容差
  static checkPlatformCollision(player, map) {
    if (!map.hasPlatforms) return { onPlatform: false, platformY: null };

    const px = player.x, py = player.y, pw = player.w, ph = player.h;
    const feetY = py + ph;           // 玩家脚底
    const feetCenterX = px + pw / 2;
    const tolerance = 4;             // 允许微穿透容差

    let bestPlatformY = null;
    // 找脚底下方最近的平台表面（从上往下，选最高能站住的）
    for (const p of map.platforms) {
      // 水平重叠检测（脚中心点必须在平台范围内）
      if (feetCenterX >= p.x && feetCenterX <= p.x + p.w) {
        // 玩家脚底在平台表面以下（穿透）但在容差范围内 → 视为站在平台上
        if (feetY >= p.y && feetY <= p.y + tolerance) {
          if (bestPlatformY === null || p.y < bestPlatformY) {
            bestPlatformY = p.y;
          }
        }
      }
    }
    return {
      onPlatform: bestPlatformY !== null,
      platformY: bestPlatformY
    };
  }

  // ★ v3 平台碰撞检测（泛用）：检测任意矩形是否站在任何平台上
  // 返回 true/false
  static isOnAnyPlatform(rect, map) {
    if (!map.hasPlatforms) return false;
    const feetY = rect.y + rect.h;
    const feetCX = rect.x + rect.w / 2;
    const tolerance = 4;
    for (const p of map.platforms) {
      if (feetCX >= p.x && feetCX <= p.x + p.w &&
          feetY >= p.y && feetY <= p.y + tolerance) {
        return true;
      }
    }
    return false;
  }

  // ★ v3 平台碰撞（底部碰撞）：检测玩家跳起时头部是否撞到平台底部
  // 返回当头顶到平台时的修正 Y
  static checkPlatformCeiling(player, map) {
    if (!map.hasPlatforms) return null;
    const headY = player.y;
    const headCX = player.x + player.w / 2;
    const tolerance = 3;
    let ceilingY = null;
    for (const p of map.platforms) {
      if (headCX >= p.x && headCX <= p.x + p.w) {
        if (headY >= p.y + p.h - tolerance && headY <= p.y + p.h) {
          if (ceilingY === null || p.y + p.h < ceilingY) {
            ceilingY = p.y + p.h;
          }
        }
      }
    }
    return ceilingY;
  }

  // —— 渲染 ——

  // 分层视差背景：远景/近景以不同速率随相机平移（程序化贝塞尔山峦）
  static drawParallax(ctx, c, camX, map) {
    const W = c.canvas.width, H = c.canvas.height;
    // ★ 金属要塞背景色
    const isJin = map.id === "jinDomain";
    ctx.fillStyle = isJin ? "#d4cfc4" : c.colors.paper;
    ctx.fillRect(camX, 0, W, H);

    // 远山（慢速视差）
    ctx.fillStyle = isJin ? "#a8a49b" : c.colors.mountainFar;
    const off1 = (camX * 0.2) % W;
    MapLoader.hills(ctx, camX - off1 - W, H, 130, 6);
    MapLoader.hills(ctx, camX - off1, H, 130, 6);

    // 近山（快速视差）
    ctx.fillStyle = isJin ? "#7a7672" : c.colors.mountain;
    const off2 = (camX * 0.45) % W;
    MapLoader.hills(ctx, camX - off2 - W, H, 86, 8);
    MapLoader.hills(ctx, camX - off2, H, 86, 8);

    // ★ 钢铁要塞额外装饰：金属管道纹理
    if (isJin) {
      ctx.fillStyle = "rgba(100,95,88,0.12)";
      for (let bx = 0; bx < map.width; bx += 120) {
        const sx = bx - camX * 0.15;
        ctx.fillRect(sx, H - 160, 8, 160);
      }
    }
  }

  static hills(ctx, x, H, height, count) {
    const span = 960;
    ctx.beginPath();
    ctx.moveTo(x, H);
    const step = span / count;
    for (let i = 0; i <= count; i++) {
      const bx = x + i * step;
      const peak = H - height * (0.6 + 0.4 * Math.sin(i * 1.7));
      ctx.quadraticCurveTo(bx - step / 2, peak, bx, H - height * 0.4 * Math.abs(Math.sin(i)));
    }
    ctx.lineTo(x + span, H);
    ctx.closePath();
    ctx.fill();
  }

  // 单层地面
  static drawGround(ctx, c, map) {
    ctx.fillStyle = "#6b5b4a";
    ctx.fillRect(0, map.groundY, map.width, map.height - map.groundY);
    ctx.fillStyle = "#4f4234";
    ctx.fillRect(0, map.groundY, map.width, 6);
  }

  // ★ v3 多平台渲染（覆盖在地面之上）
  // 各类平台用不同颜色/纹理区分
  static renderPlatforms(ctx, c, map) {
    if (!map.hasPlatforms) return;

    for (const p of map.platforms) {
      let fill, stroke;
      switch (p.type) {
        case "metal_floor":
        case "metal_step":
          fill   = "#6b6b70";
          stroke = "#4a4a4f";
          break;
        case "bridge":
          fill   = "#8b6914";
          stroke = "#5c4510";
          break;
        case "gear_floor":
          fill   = "#8a7d50";
          stroke = "#5c5436";
          break;
        case "glass_floor":
          fill   = "rgba(160,200,220,0.65)";
          stroke = "rgba(120,160,180,0.8)";
          break;
        case "floating_platform":
          fill   = "#7a7664";
          stroke = "#555248";
          break;
        case "small_block":
          fill   = "#8c8c92";
          stroke = "#5e5e64";
          break;
        case "pipe_floor":
          fill   = "#5a5a5e";
          stroke = "#3a3a3e";
          break;
        default:
          fill   = "#6b6b70";
          stroke = "#4a4a4f";
      }

      ctx.fillStyle = fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = stroke;
      ctx.fillRect(p.x, p.y, p.w, 3);                  // 顶部高光线
      ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);        // 底部阴影
    }
  }

  // ★ v4 传送门渲染：脉冲光环 + 文字提示
  static renderPortal(ctx, map, now = performance.now()) {
    if (!map.portal) return;
    const p = map.portal;
    const t = now / 1000;                     // 秒

    ctx.save();
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    // 1. 外圈脉冲光环（多层）
    for (let ring = 0; ring < 3; ring++) {
      const phase  = t * 1.2 + ring * 2.1;
      const radius = 24 + ring * 8 + Math.sin(phase) * 5;
      const alpha  = 0.18 + Math.sin(phase * 1.3) * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(202,166,74,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 2. 漩涡核心弧
    for (let arc = 0; arc < 3; arc++) {
      const a0 = t * 2 + arc * 2.09;
      ctx.beginPath();
      ctx.arc(cx, cy, 13 + arc * 5, a0, a0 + 4.2);
      ctx.strokeStyle = `rgba(255,230,180,${0.5 + arc * 0.1})`;
      ctx.lineWidth = 3 - arc * 0.5;
      ctx.stroke();
    }

    // 3. 中心光球
    const glowGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
    glowGrad.addColorStop(0, "rgba(255,240,200,0.85)");
    glowGrad.addColorStop(0.5, "rgba(202,166,74,0.35)");
    glowGrad.addColorStop(1, "rgba(202,166,74,0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    // 4. 上下浮动的箭头或文字提示
    const labelY = p.y - 12 + Math.sin(t * 2.5) * 3;
    ctx.fillStyle = "#caa64a";
    ctx.font = "bold 11px 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("传送门", cx, labelY);

    ctx.restore();
  }

  // ★ v4 传送门碰撞检测：玩家矩形与传送门区域重叠
  static checkPortalCollision(player, map) {
    if (!map.portal) return false;
    const p = map.portal;
    return (
      player.x < p.x + p.w &&
      player.x + player.w > p.x &&
      player.y < p.y + p.h &&
      player.y + player.h > p.y
    );
  }
}
