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
    this.cameraX = 0;
    this.timeScale = 1;
    this.freezeTimer = 0;
    this.saveTimer = 0;

    // —— 浮动提示文字系统 ——
    // 数组：[{text, x, y, color, timer, duration}]
    // UIManager.render() 中统一绘制
    this.floatTexts = [];
  }

  async start() {
    this.canvas = document.getElementById("game");

    // 配置加载
    const consts = await this.loadConsts();
    this.consts = consts;
    this.renderer = new Renderer(this.canvas, consts);

    // 存档加载（含 v1→v2 自动迁移）
    this.data = GameData.load();
    window.__WX_SAVE__ = this.data;

    // 资源预加载
    this.asset = new AssetManager(consts);
    await this.asset.preload();

    // 输入系统
    this.input = new InputManager();

    // 地图加载
    const mapConfigs = await fetch("config/mapConfig.json").then(r => r.json());
    const mapCfg = mapConfigs[this.data.currentMap] || mapConfigs.woodValley;
    this.map = MapLoader.load(this.data.currentMap, consts, mapCfg, this.asset);

    // 玩家
    this.player = new Player(mapCfg.spawn.x, mapCfg.spawn.y, consts);

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
    this.vfxRenderer = new SkillVFXRenderer(this.hitboxSys);
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
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt > 50) dt = 50;

    if (!this.paused) this.update(dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt) {
    // ==================== 0. 调试模式切换（H 键） ====================
    if (this.input && this.input._wasHPressed === undefined) this.input._wasHDown = false;
    const hDown = !!(this.input.down && this.input.down["h"]);
    if (this.hitboxSys && hDown && !this.input._wasHDown) {
      this.hitboxSys.toggleDebug();
    }
    if (this.input) this.input._wasHDown = hDown;

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
      if (this.player.startDodge()) {
        AudioManager.play && AudioManager.play("dodge");   // 闪避音效（如有）
      }
    }

    // ==================== 1. 动态招式触发：从槽位读取当前装配的技能ID ====================
    // 遍历所有槽位（含新增 light3），检测对应组合键是否按下
    const slotKeys = ["light1", "light2", "light3", "heavy1", "heavy2", "heavy3", "parry"];
    for (const sk of slotKeys) {
      if (this.input.isSlotPressed(sk)) {
        const skillId = this.skill.getSlotSkillId(sk);
        if (skillId && this.skill.canCast(skillId)) {
          if (sk === "parry") {
            this.parry.trigger();
          } else {
            this.skill.startCast(skillId);
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
  }

  render() {
    const ctx = this.renderer.ctx;
    const c = this.consts;
    this.renderer.clear();

    // —— 世界层（相机平移）——
    this.renderer.beginWorld(this.cameraX);
    this.map.drawBackground(ctx, this.cameraX);
    this.map.drawGround(ctx);
    this.trap.draw(ctx);
    for (const e of this.map.enemies) e.draw(ctx);
    this.player.draw(ctx);
    this.skill.draw(ctx);             // 攻击动画 + 解锁提示
    this.parry.draw(ctx);             // 弹反效果
    this.renderer.endWorld();

    // —— UI 层（屏幕空间）：状态栏 + 技能面板 + 浮动文字 ——
    this.ui.render(ctx);              // 含 StatusBar / SkillPanel / FloatTexts
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
}

window.addEventListener("DOMContentLoaded", () => {
  const game = new GameMain();
  game.start();
});
