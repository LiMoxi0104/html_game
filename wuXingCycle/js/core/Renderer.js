// Renderer：Canvas 分层渲染封装，支持 DPR 高清缩放。
// 场景层(视差背景) → 地面层 → 陷阱层 → 角色/敌人层 → 特效层 → UI 层(屏幕空间)。

class Renderer {
  constructor(canvas, consts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.consts = consts;
    this._scale = 1;                    // DPR 缩放比，由 applyDPR() 设置
  }

  /** 根据 CSS 容器尺寸 + devicePixelRatio 缩放画布，保持逻辑坐标 960×540 不变 */
  applyDPR(containerW, containerH) {
    const dpr = window.devicePixelRatio || 1;
    // 设置 canvas 物理像素分辨率
    this.canvas.width  = Math.round(containerW * dpr);
    this.canvas.height = Math.round(containerH * dpr);
    // 缩放比 = 物理像素 / 逻辑像素
    this._scale = (containerW * dpr) / this.consts.canvas.width;
    // 应用比例变换，游戏代码始终使用 960×540 坐标系
    this.ctx.setTransform(this._scale, 0, 0, this._scale, 0, 0);
  }

  clear() {
    // clearRect 在缩放后的坐标系中，960×540 即可覆盖全物理画布
    this.ctx.clearRect(0, 0, this.consts.canvas.width, this.consts.canvas.height);
  }

  /** 进入世界层（相机平移），后续 drawImage 坐标基于游戏世界 */
  beginWorld(camX) {
    this.ctx.save();
    this.ctx.translate(-camX, 0);
  }

  endWorld() { this.ctx.restore(); }

  get context() { return this.ctx; }
}
