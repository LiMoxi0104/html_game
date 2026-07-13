// GameMain：游戏主循环与启动编排。
// v2 升级：接入动态招式系统（SkillManager 槽位驱动 + 弹反 + 熟练度）
// v3 增强：闪避（Shift）、完美闪避检测、浮动战斗提示文字、弹反增强
// v4 增强：HitboxSystem 逐帧碰撞箱 + SkillVFXRenderer 水墨特效 + 调试可视化
class GameMain {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.consts = null;
    this.data = null;
    this.asset = null;
    this.input = null;
    this.map = null;
    this.player = null;
    this.skill = null;          // SkillManager（v2 动态招式管理器）
    this.parry = null;          // ParrySystem
    this.trap = null;
    this.ui = null;
    this.running = false;
    this.paused = false;
    this.lastTime = 0;
    this.accumulator = 0;       // 60fps 固定步长累加器
    this.cameraX = 0;
    this.timeScale = 1;
    this.freezeTimer = 0;
    this.saveTimer = 0;

    // —— 浮动提示文字系统 ——
    // 数组：[{text, x, y, color, timer, duration}]
    this.floatTexts = [];

    // —— 碰撞箱可视化调试 ——
    this.showHitboxes = false;

    // ★ v4 传送门 / 转场系统
    this.transitionState = null;    // null | "fadeOut" | "switching" | "fadeIn"
    this.transitionAlpha = 0;       // 0=透明 1=全黑
    this.transitionTimer = 0;
    this.portalCooldown = 0;        // 传送冷却 ms（防重复触发）
    this.transitionTarget = null;   // { mapId, targetX, targetY }
    this._mapConfigs = null;        // 缓存地图配置 JSON
  }

  async start() {
    this.canvas = document.getElementById("game");
    this._container = document.getElementById("game-container");

    // 配置加载
    const consts = await this.loadConsts();
    this.consts = consts;

    // ■ 动态设置 canvas 物理分辨率（CSS 尺寸 × devicePixelRatio）
    // 游戏逻辑坐标保持 960×540 不变，Renderer 内做 DPR 缩放变换
    const containerW = this._container.clientWidth;
    const containerH = this._container.clientHeight;
    this.renderer = new Renderer(this.canvas, consts);
    this.renderer.applyDPR(containerW, containerH);

    // 存档加载（含 v1→v2 自动迁移）
    this.data = GameData.load();
    window.__WX_SAVE__ = this.data;

    // 资源预加载
    this.asset = new AssetManager(consts);
    await this.asset.preload();

    // ★ 陷阱帧动画图片预加载
    await SpikeTrap.loadThornImages();
    await SpikeTrap.loadLavaImages();

    // ■ 加载角色序列帧
    const seqFrames = await this.asset.loadFrameSequence(
      "assets/img/player/move_frames", "frame_", 120, "_nobg.png"
    );

    // 输入系统
    this.input = new InputManager();

    // 地图加载
    const mapConfigs = await fetch("config/mapConfig.json").then(r => r.json());
    this._mapConfigs = mapConfigs;  // ★ v4 缓存用于转场
    const mapCfg = mapConfigs[this.data.currentMap] || mapConfigs.woodValley;
    this.map = MapLoader.load(this.data.currentMap, consts, mapCfg, this.asset);

    // 玩家
    this.player = new Player(mapCfg.spawn.x, mapCfg.spawn.y, consts);
    this.player.setAssetManager(this.asset);
    this.player.setAnimFrames(seqFrames);

    // —— 动态招式管理器（v2）——
    this.skill = new SkillManager(this.player, this.asset, this.data);
    const skillCfg = await fetch("config/skillConfig.json").then(r => r.json());
    this.skill.registerConfig(skillCfg);
    this.skill.initFromSave();
    this.player.setSkillSystem(this.skill);

    // 弹反系统
    this.parry = new ParrySystem(this.player, consts);
    this.player.setParrySystem(this.parry);       // ★ v4 注入弹反引用，供 takeDamage 检测

    // ★ v4 战斗系统组件
    this.hitboxSys = new HitboxSystem();
    this.vfxRenderer = new SkillVFXRenderer(this.hitboxSys, this.asset);
    // 注入到 SkillManager
    this.skill.setCombatSystems(this.hitboxSys, this.vfxRenderer);

    // 陷阱系统
    this.trap = new TrapSystem(mapCfg, Collision);

    // UI（含技能面板入口 + 浮动文字渲染）
    this.ui = new UIManager(consts, this.data, this.player, this.skill, this.parry);
    // 将浮动文字引用注入 UIManager，使其能绘制
    if (this.ui.setFloatTexts) {
      this.ui.setFloatTexts(this.floatTexts);
    }

    AudioManager.initOnGesture();

    // 后台切页暂停
    document.addEventListener("visibilitychange", () => {
      this.paused = document.hidden;
      if (this.paused) AudioManager.pauseAll(); else AudioManager.resumeAll();
    });

    // 首次操作说明弹窗
    this.ui.showIntro();

    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  async loadConsts() {
    if (this._consts) return this._consts;
    this._consts = await fetch("config/gameConst.json").then(r => r.json());
    return this._consts;
  }

  loop(now) {
    if (!this.running) return;

    const FIXED_DT = 1000 / 60;
    let rawDt = now - this.lastTime;
    this.lastTime = now;
    if (rawDt > 200) rawDt = 200;

    this.accumulator += rawDt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      if (!this.paused) this.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (this.accumulator > FIXED_DT * 5) this.accumulator = 0;

    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt) {
    // ==================== ★ v4 转场状态处理 ====================
    if (this.transitionState) {
      this._updateTransition(dt);
      return;  // 转场期间暂停游戏逻辑
    }

    // ==================== 0. 碰撞箱可视化切换（H 键） ====================
    if (this.input) {
      const hNow = this.input.isDown("h");
      if (hNow && !this._wasHDown) {
        this.showHitboxes = !this.showHitboxes;
        this.addFloatText(this.showHitboxes ? "碰撞箱 ON" : "碰撞箱 OFF", "#88ddff");
      }
      this._wasHDown = hNow;
    }

    // ★ DEBUG 飞行模式（Q 键切换，后续整块可删除）——
    if (this.player && this.input.flyTogglePressed()) {
      this.player.toggleFly();
      this.addFloatText(this.player.isFlying ? "飞行 ON" : "飞行 OFF", "#88ddff");
    }

    // ★ v5 调试：U 键解锁全部技能
    if (this.input && this.input._wasUDown === undefined) this.input._wasUDown = false;
    const uDown = !!(this.input.down && this.input.down["u"]);
    if (this.skill && uDown && !this.input._wasUDown) {
      const result = this.skill.unlockAllSkills();
      if (result.unlocked > 0) {
        // ★ 刷新 SkillPanel 过滤缓存，确保背包立即显示新解锁的技能
        if (this.ui && this.ui.skillPanel) {
          this.ui.skillPanel._invalidateFilterCache();
        }
        this.floatTexts.push({
          text: `已解锁 ${result.unlocked} 个新技能（共 ${result.total}）`,
          x: this.consts.canvas.width / 2,
          y: 120,
          color: "#caa64a",
          timer: 3000,
          duration: 3000
        });
      }
    }
    if (this.input) this.input._wasUDown = uDown;

    // ★ v4 VFX 粒子更新（每帧驱动）
    if (this.vfxRenderer) this.vfxRenderer.update(dt);

    // ==================== 0.1 闪避触发（Shift，优先于攻击）====================
    if (this.input.dodgePressed()) {
      if (this.player.startDodge(this.input, this.map.width)) {
        AudioManager.play && AudioManager.play("dodge");   // 闪避音效（如有）
      }
    }

    // ==================== 1. 动态招式触发：从槽位读取当前装配的技能ID ====================
    const slotKeys = ["light1", "light2", "light3", "heavy1", "heavy2", "heavy3", "parry"];

    // ★ v6 蓄力技能释放检测（松开按键时触发）
    if (this._chargeSlot) {
      // 蓄力中断保护：受伤/死亡/闪避时取消蓄力
      if (this.player.state !== "charge") {
        this.skill.cancelCharge();
        this._chargeSlot = null;
      } else if (this.skill.isCharging()) {
        this.skill.updateCharge(dt);
        if (!this.input.isSlotDown(this._chargeSlot)) {
          // 按键松开 → 释放蓄力技
          this.skill.releaseCharge();
          this._chargeSlot = null;
        }
      } else {
        // 蓄力已结束（可能被 cancel）
        this._chargeSlot = null;
      }
    }

    // 非蓄力中的槽位检测
    if (!this._chargeSlot) {
      for (const sk of slotKeys) {
        if (this.input.isSlotPressed(sk)) {
          const skillId = this.skill.getSlotSkillId(sk);
          if (skillId && this.skill.canCast(skillId)) {
            if (sk === "parry") {
              this.parry.trigger();
            } else {
              // ★ 检查是否为蓄力技能
              const s = this.skill.skills[skillId];
              if (s && s.charge && s.charge.enabled) {
                // 蓄力技能：开始蓄力
                if (this.skill.startCharge(skillId, this.map.enemies, this.map)) {
                  this._chargeSlot = sk;
                }
              } else {
                // 非蓄力技能：即时施放
                this.skill.startCast(skillId, this.map.enemies, this.map);
              }
            }
          }
        }
      }
    }

    // ==================== 2. 玩家更新 ====================
    this.player.update(dt, this.input, this.map);

    // ==================== 3. 敌人更新 ====================
    for (const e of this.map.enemies) e.update(dt);

    // ==================== 4. 弹反更新 ====================
    this.parry.update(dt);

    // 检测弹反成功文字提示（ParrySystem 内部设置标记后此处消费）
    if (this.parry._showParryText) {
      this.addFloatText("弹反", "#e8e8f0");
      this.parry._showParryText = false;
    }

    // ==================== 5. 陷阱推进与触发 ====================
    // 完美闪避检测：如果玩家有残留碰撞箱且处于 dodge 无敌状态，
    // 检查残留箱位置是否有陷阱会命中 → 视为完美闪避
    const ghost = this.player.getGhostRect();
    const dodging = this.player.state === "dodge";

    this.trap.update(dt, this.player, (result, trap) => {
      if (result && result.damage) {
        // ★ v4 弹反成功时 result._parried=true，跳过受击音效
        if (!result._parried) {
          if (!dodging) AudioManager.play("hit");
        }
      }
    });

    // —— 完美闪避检测（残留箱 vs 陷阱伤害区）——
    if (ghost && dodging && this.player.invuln > 0) {
      const perfectDodge = this.trap.checkAtPosition(ghost);
      if (perfectDodge) {
        // 完美闪避成功！
        console.log("[GameMain] 完美闪避！陷阱:", perfectDodge.type);
        // 延长无敌至 500ms
        this.player.invuln = Math.max(this.player.invuln, 500);
        // 设置反击标记
        this.player.canCounter = true;
        // 浮动提示
        this.addFloatText("完美闪避", "#caa64a");
        AudioManager.play && AudioManager.play("perfectDodge");  // 音效（如有）
      }
    }

    // ==================== 6. 相机跟随 ====================
    const half = this.consts.canvas.width / 2;
    let target = this.player.x + this.player.w / 2 - half;
    target = Math.max(0, Math.min(target, this.map.width - this.consts.canvas.width));
    this.cameraX = MathTool.lerp(this.cameraX, target, this.consts.camera.lerp);

    this.input.endFrame();

    // ==================== 7. 浮动文字计时更新 ====================
    this._updateFloatTexts(dt);

    // ==================== 8. 存档节流 ====================
    this.saveTimer += dt;
    if (this.saveTimer >= 1000) { this.saveTimer = 0; GameData.save(window.__WX_SAVE__); }

    // ==================== 9. ★ v4 多传送门检测 ====================
    if (this.portalCooldown > 0) {
      this.portalCooldown -= dt;
    }
    if (this.portalCooldown <= 0 && this.player.state !== "dead") {
      const hitPortal = MapLoader.checkPortalCollision(this.player, this.map);
      if (hitPortal) {
        this._triggerPortal(hitPortal);
      }
    }
  }

  render() {
    const ctx = this.renderer.ctx;
    const c = this.consts;
    this.renderer.clear();

    // —— 世界层（相机平移）——
    this.renderer.beginWorld(this.cameraX);
    this.map.drawBackground(ctx, this.cameraX);
    this.map.drawGround(ctx);
    this.map.drawPlatforms(ctx);       // ★ v3 多平台渲染
    this.map.drawPortals(ctx);          // ★ v4 多传送门渲染
    this.trap.draw(ctx);
    for (const e of this.map.enemies) e.draw(ctx);
    this.player.draw(ctx);
    this.skill.draw(ctx);             // 攻击动画 + 解锁提示
    this.parry.draw(ctx);             // 弹反效果
    this._drawHitboxes(ctx);          // 碰撞箱调试可视化
    this.renderer.endWorld();

    // —— UI 层（屏幕空间）：状态栏 + 技能面板 + 浮动文字 ——
    this.ui.render(ctx);              // 含 StatusBar / SkillPanel / FloatTexts

    // ★ v4 转场遮罩层
    this._drawTransitionOverlay(ctx);
  }

  // ==================== 浮动文字管理 ====================

  // 添加一条浮动提示文字
  addFloatText(text, color) {
    const W = this.consts.canvas.width;
    const H = this.consts.canvas.height;
    this.floatTexts.push({
      text,
      color: color || "#fff",
      x: W / 2,
      y: H * 0.38,                   // 屏幕偏上位置
      startY: H * 0.38,              // 记录起始 Y（用于向上飘动计算）
      timer: 800,                    // 持续时间 ms
      duration: 800                  // 总时长 ms
    });
  }

  _updateFloatTexts(dt) {
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const ft = this.floatTexts[i];
      ft.timer -= dt;
      // 向上飘动
      ft.y = ft.startY - ((ft.duration - ft.timer) / ft.duration) * 40;
      if (ft.timer <= 0) this.floatTexts.splice(i, 1);
    }
  }

  // ==================== ★ v4 传送门/转场系统 ====================

  // 触发传送门
  _triggerPortal(portalCfg) {
    console.log(`[GameMain] 进入传送门 → ${portalCfg.targetMap}`);
    this.portalCooldown = 1500;               // 1.5 秒冷却
    this.transitionTarget = {
      mapId:   portalCfg.targetMap,
      targetX: portalCfg.targetX,
      targetY: portalCfg.targetY
    };
    this.transitionState = "fadeOut";
    this.transitionAlpha = 0;
    this.transitionTimer = 0;

    // 暂停玩家输入
    this.player.vx = 0;
    this.player.vy = 0;
  }

  // 转场动画更新
  _updateTransition(dt) {
    const FADE_DURATION = 350;   // 单次渐隐/渐现 ms

    this.transitionTimer += dt;

    if (this.transitionState === "fadeOut") {
      this.transitionAlpha = Math.min(1, this.transitionTimer / FADE_DURATION);
      if (this.transitionAlpha >= 1) {
        this.transitionState = "switching";
        this.transitionTimer = 0;
        this._doMapSwitch();   // 即时切换地图
      }
    } else if (this.transitionState === "switching") {
      // 等待一帧让新场景准备好，然后渐入
      this.transitionState = "fadeIn";
      this.transitionAlpha = 1;
      this.transitionTimer = 0;
    } else if (this.transitionState === "fadeIn") {
      this.transitionAlpha = Math.max(0, 1 - this.transitionTimer / FADE_DURATION);
      if (this.transitionAlpha <= 0) {
        // 转场完成
        this.transitionState = null;
        this.transitionAlpha = 0;
        this.transitionTarget = null;
        console.log("[GameMain] 转场完成");
      }
    }
  }

  // 执行地图切换
  _doMapSwitch() {
    const t = this.transitionTarget;
    if (!t || !this._mapConfigs) return;

    const newCfg = this._mapConfigs[t.mapId];
    if (!newCfg) {
      console.warn(`[GameMain] 地图 ${t.mapId} 不存在`);
      this.transitionState = null;
      return;
    }

    console.log(`[GameMain] 切换至地图: ${newCfg.name}`, `坐标:(${t.targetX},${t.targetY})`);

    // 1. 保存当前地图到存档
    this.data.currentMap = t.mapId;
    if (!this.data.mapExplore[t.mapId]) {
      this.data.mapExplore[t.mapId] = { unlock: true, box: [] };
    }
    GameData.save(this.data);

    // 2. 重新载入新地图
    this.map = MapLoader.load(t.mapId, this.consts, newCfg, this.asset);

    // 3. 重设玩家位置（传送至目标坐标）
    this.player.x = t.targetX;
    this.player.y = t.targetY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    this.player.jumpCount = 0;
    this.player.isJumpHolding = false;
    this.player.jumpHoldTimer = 0;
    this.player.clearCombatMarks();

    // 4. 重建陷阱系统（绑定新地图的陷阱配置）
    try {
      this.trap = new TrapSystem(newCfg, Collision);
    } catch (e) {
      console.error("[GameMain] 陷阱系统初始化失败:", e);
      this.trap = new TrapSystem({ traps: [] }, Collision);
    }

    // 5. 重置相机，立切到玩家位置
    const halfW = this.consts.canvas.width / 2;
    this.cameraX = Math.max(0,
      Math.min(t.targetX + this.player.w / 2 - halfW,
        this.map.width - this.consts.canvas.width));
    this.cameraX = Math.max(0, this.cameraX);

    // 6. 浮动提示
    this.floatTexts.push({
      text: `进入 ${newCfg.name}`,
      x: this.consts.canvas.width / 2,
      y: 100,
      startY: 100,
      color: "#caa64a",
      timer: 1800,
      duration: 1800
    });

    console.log("[GameMain] 地图 + 陷阱 + 玩家位置已重置");
  }

  // 转场遮罩层绘制（屏幕空间）
  _drawTransitionOverlay(ctx) {
    if (!this.transitionState) return;
    const W = this.consts.canvas.width;
    const H = this.consts.canvas.height;
    ctx.fillStyle = `rgba(0,0,0,${this.transitionAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ==================== 碰撞箱可视化调试 ====================
  // 在世界空间中以半透明线框叠加渲染所有物体的碰撞矩形
  _drawHitboxes(ctx) {
    if (!this.showHitboxes) return;

    const fillA = 0.12;     // 填充透明度
    const strokeA = 0.65;   // 边框透明度
    const lw = 1.5;         // 线宽

    // 辅助：绘制一个 AABB 矩形
    const drawBox = (rect) => {
      if (!rect) return;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    };

    // 1. 玩家 — 青色
    ctx.strokeStyle = `rgba(0,230,200,${strokeA})`;
    ctx.fillStyle   = `rgba(0,230,200,${fillA})`;
    ctx.lineWidth   = lw;
    drawBox(this.player.getRect());

    // 2. 敌人 — 红色
    ctx.strokeStyle = `rgba(255,70,70,${strokeA})`;
    ctx.fillStyle   = `rgba(255,70,70,${fillA})`;
    for (const e of this.map.enemies) {
      if (!e.alive) continue;
      drawBox(e.getRect());
    }

    // 3. 陷阱 — 橙色（圆形碰撞体用圆绘制，矩形用框绘制）
    ctx.strokeStyle = `rgba(255,160,40,${strokeA})`;
    ctx.fillStyle   = `rgba(255,160,40,${fillA})`;
    for (const t of this.trap.traps) {
      const c = t.getCircle && t.getCircle();
      if (c) {
        ctx.beginPath();
        ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        drawBox(t.getRect());
      }
    }

    // 4. 平台 — 蓝色
    if (this.map.platforms) {
      ctx.strokeStyle = `rgba(80,160,255,${strokeA})`;
      ctx.fillStyle   = `rgba(80,160,255,${fillA})`;
      for (const p of this.map.platforms) {
        drawBox(p);
      }
    }

    // 5. 传送门 — 紫色（圆形碰撞体，与 checkPortalCollision 圆心/半径一致）
    if (this.map.portals) {
      ctx.strokeStyle = `rgba(200,90,255,${strokeA})`;
      ctx.fillStyle   = `rgba(200,90,255,${fillA})`;
      for (const p of this.map.portals) {
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        const r  = Math.min(p.w, p.h) / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 6. 当前攻击判定箱 — 黄色
    const activeHb = this.skill && this.skill.getActiveHitbox && this.skill.getActiveHitbox();
    if (activeHb) {
      ctx.strokeStyle = `rgba(255,255,60,${strokeA})`;
      ctx.fillStyle   = `rgba(255,255,60,${fillA * 1.5})`;
      drawBox(activeHb);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const game = new GameMain();
  game.start();
});
