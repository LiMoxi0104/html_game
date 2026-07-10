// GameMain：游戏主循环与启动编排。统一驱动 timeScale / freezeTimer（阶段1 仅初始化，供后续卡肉复用），
// 管理分层渲染顺序、输入→攻击触发、陷阱系统更新与后台切页暂停。
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
    this.skill = null;
    this.trap = null;
    this.ui = null;
    this.running = false;
    this.paused = false;
    this.lastTime = 0;
    this.cameraX = 0;
    this.timeScale = 1;
    this.freezeTimer = 0;
    this.saveTimer = 0;
  }

  async start() {
    this.canvas = document.getElementById("game");

    // 配置加载（固定数值外置，禁止硬编码）
    const consts = await this.loadConsts();
    this.consts = consts;
    this.renderer = new Renderer(this.canvas, consts);

    this.data = GameData.load();
    window.__WX_SAVE__ = this.data;   // 供 SkillSystem 触发存档

    this.asset = new AssetManager(consts);
    await this.asset.preload();

    this.input = new InputManager();

    const mapConfigs = await fetch("config/mapConfig.json").then(r => r.json());
    const mapCfg = mapConfigs[this.data.currentMap] || mapConfigs.woodValley;
    this.map = MapLoader.load(this.data.currentMap, consts, mapCfg, this.asset);

    this.player = new Player(mapCfg.spawn.x, mapCfg.spawn.y, consts);
    this.skill = new SkillSystem(this.player, this.asset);
    const skillCfg = await fetch("config/skillConfig.json").then(r => r.json());
    this.skill.registerSkills(skillCfg);
    this.player.setSkillSystem(this.skill);

    // 陷阱系统：读取地图配置中的 traps，按 type 实例化
    this.trap = new TrapSystem(mapCfg, Collision);

    this.ui = new UIManager(consts, this.data, this.player);

    AudioManager.initOnGesture();

    // 后台切页暂停主循环与音频
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
    if (dt > 50) dt = 50;             // 防止切回标签页时巨幅跳变

    if (!this.paused) this.update(dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt) {
    // —— 攻击触发（轻击 J / 重击 K）——
    if (this.input.attackLightPressed() && this.skill.canCast("water_slash")) {
      this.skill.startCast("water_slash");
    }
    if (this.input.attackHeavyPressed() && this.skill.canCast("wood_slash")) {
      this.skill.startCast("wood_slash");
    }

    this.player.update(dt, this.input, this.map);

    for (const e of this.map.enemies) e.update(dt);

    // 陷阱推进与触发（与玩家 Collision 对接）
    this.trap.update(dt, this.player, (result, trap) => {
      if (result && result.damage) AudioManager.play("hit");
    });

    // 相机跟随（带 lerp 平滑）
    const half = this.consts.canvas.width / 2;
    let target = this.player.x + this.player.w / 2 - half;
    target = Math.max(0, Math.min(target, this.map.width - this.consts.canvas.width));
    this.cameraX = MathTool.lerp(this.cameraX, target, this.consts.camera.lerp);

    this.input.endFrame();

    // 存档节流：约每 1s 写一次，避免每帧写 localStorage
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
    this.skill.draw(ctx);             // 攻击三阶段帧 / 占位绘制
    this.renderer.endWorld();

    // —— UI 层（屏幕空间）——
    this.ui.render(ctx);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const game = new GameMain();
  game.start();
});
