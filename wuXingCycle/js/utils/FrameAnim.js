// FrameAnim：序列帧动画管理器。给定帧序列与单帧时长，按累计时间输出当前帧索引。
// 用于攻击/待机/行走等逐帧 PNG 动画，帧率以游戏 60fps 基准换算，避免受设备刷新率影响。
class FrameAnim {
  constructor(frameCount, frameMs) {
    this.frameCount = frameCount;      // 该动画总帧数
    this.frameMs = frameMs;            // 每帧停留毫秒
    this.elapsed = 0;                  // 累计时间
    this.loop = true;
    this.done = false;
  }
  reset() { this.elapsed = 0; this.done = false; }
  // 推进时间，返回当前帧索引（0-based）
  advance(dtMs) {
    if (this.done) return this.frameCount - 1;
    this.elapsed += dtMs;
    const total = this.frameCount * this.frameMs;
    if (this.elapsed >= total) {
      if (this.loop) { this.elapsed = this.elapsed % total; }
      else { this.elapsed = total; this.done = true; return this.frameCount - 1; }
    }
    return Math.floor(this.elapsed / this.frameMs);
  }
  current() {
    const total = this.frameCount * this.frameMs;
    const e = this.loop ? (this.elapsed % total) : Math.min(this.elapsed, total);
    return Math.floor(e / this.frameMs);
  }
}
