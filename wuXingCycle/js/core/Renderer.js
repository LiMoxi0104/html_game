// Renderer：Canvas 分层渲染封装。阶段1 采用单 Canvas 按层顺序绘制：
// 场景层(视差背景) → 地面层 → 陷阱层 → 角色/敌人层 → 特效层 → UI 层(屏幕空间)。
class Renderer {
  constructor(canvas, consts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.consts = consts;
  }
  clear() {
    this.ctx.clearRect(0, 0, this.consts.canvas.width, this.consts.canvas.height);
  }
  // 进入世界层（带相机平移）
  beginWorld(camX) {
    this.ctx.save();
    this.ctx.translate(-camX, 0);
  }
  endWorld() { this.ctx.restore(); }
  get context() { return this.ctx; }
}
