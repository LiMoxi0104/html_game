// UIManager：UI 统管（v5）。
// 串接 StatusBar（状态栏 + 招字入口）、SkillPanel（技能管理面板）、DialogBox（弹窗）
// 和 FloatTexts（浮动战斗提示文字：完美闪避 / 弹反）。
// 负责屏幕空间渲染与鼠标事件分发到子组件。
//
// v5 增强：
//   - 绑定鼠标滚轮事件，转发至 SkillPanel 滚动
//   - 统一坐标转换系统：screenToCanvas() 将屏幕坐标→画布逻辑坐标（适配 CSS 缩放画布）
//   - 所有子组件点击/悬停检测均使用统一转换后的逻辑坐标
class UIManager {
  constructor(consts, data, player, skillManager, parrySystem) {
    this.consts = consts;
    this.data = data;
    this.player = player;
    this.sm = skillManager;              // SkillManager 引用
    this.parry = parrySystem;

    this.statusBar = new StatusBar(consts);
    this.skillPanel = new SkillPanel(skillManager, consts);

    // 浮动文字引用（由 GameMain 传入，共享同一数组）
    this.floatTexts = null;

    // 全局引用：供 StatusBar 渲染招式名
    window.__skillManager = skillManager;

    // ★ v5 缓存画布 DOM 元素与缩放系数
    this._canvasEl = document.getElementById("game");
    this._scaleX = 1;
    this._scaleY = 1;
    this._refreshScale();

    // 监听窗口 resize 动态更新缩放系数
    window.addEventListener("resize", () => this._refreshScale());

    // 绑定鼠标事件
    this._bindCanvasClick();
    this._bindWheel();          // v4 滚轮绑定
  }

  // ★ v5 刷新 CSS 缩放系数（屏幕坐标 → 画布逻辑坐标的比例）
  _refreshScale() {
    if (!this._canvasEl) return;
    const rect = this._canvasEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this._scaleX = this.consts.canvas.width / rect.width;
      this._scaleY = this.consts.canvas.height / rect.height;
    }
  }

  // ★ v5 统一坐标转换：屏幕 clientX/Y → 画布逻辑坐标
  // 当 canvas 被 CSS 缩放后，鼠标事件的屏幕坐标需按此比例换算为内部逻辑坐标
  screenToCanvas(clientX, clientY) {
    if (!this._canvasEl) return { x: clientX, y: clientY };
    const rect = this._canvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * this._scaleX,
      y: (clientY - rect.top) * this._scaleY
    };
  }

  // 由 GameMain 注入浮动文字数组引用
  setFloatTexts(floatTexts) {
    this.floatTexts = floatTexts;
  }

  // 屏幕空间渲染
  render(ctx) {
    // 状态栏
    this.statusBar.render(ctx, this.player, this.data);
    // 技能面板（如开启则覆盖绘制）
    this.skillPanel.render(ctx);
    // 浮动战斗提示文字（完美闪避 / 弹反 等）
    if (this.floatTexts) this._renderFloatTexts(ctx);
  }

  showIntro() { DialogBox.showIntro(); }

  // ==================== 浮动文字渲染 ====================

  _renderFloatTexts(ctx) {
    if (!this.floatTexts || this.floatTexts.length === 0) return;

    ctx.save();
    for (const ft of this.floatTexts) {
      const alpha = Math.min(1, ft.timer / 150);   // 淡入快、淡出慢
      const scale = 1 + (1 - ft.timer / ft.duration) * 0.25;  // 轻微放大效果

      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${Math.floor(22 * scale)}px "PingFang SC", "SimHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 文字描边（增强可读性）
      ctx.strokeStyle = "rgba(26,26,26,0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillText(ft.text, ft.x, ft.y);

      // 底部微光条
      const tw = ctx.measureText(ft.text).width;
      const barAlpha = alpha * 0.4;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = barAlpha;
      ctx.fillRect(ft.x - tw / 2 - 4, ft.y + 14, tw + 8, 2);
    }
    ctx.restore();
  }

  // ==================== 鼠标事件分发 ====================
  _bindCanvasClick() {
    const canvas = document.getElementById("game");
    if (!canvas) return;

    canvas.addEventListener("click", (e) => {
      // ★ v5 使用统一坐标转换，传递逻辑坐标给子组件
      const logicCoord = this.screenToCanvas(e.clientX, e.clientY);

      // 优先检测技能面板
      if (this.skillPanel.open) {
        if (this.skillPanel.handleClickLogic(logicCoord.x, logicCoord.y)) return;
        return;
      }

      // 检测状态栏「招」字按钮（使用已转换的逻辑坐标）
      const btn = this.statusBar.btnRect;
      if (logicCoord.x >= btn.x && logicCoord.x <= btn.x + btn.w &&
          logicCoord.y >= btn.y && logicCoord.y <= btn.y + btn.h) {
        this.skillPanel.toggle();
        return;
      }
    });

    // ESC 关闭面板
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Escape" || e.key === "Esc") && this.skillPanel.open) {
        this.skillPanel.toggle();
      }
    });
  }

  // ★ v4 绑定滚轮事件：面板打开时转发给背包滚动
  _bindWheel() {
    const canvas = document.getElementById("game");
    if (!canvas) return;

    canvas.addEventListener("wheel", (e) => {
      if (this.skillPanel.handleWheel(e.deltaY)) {
        e.preventDefault();   // 面板消费了滚轮事件，阻止页面滚动
      }
    }, { passive: false });   // 允许 preventDefault
  }
}
