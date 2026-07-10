// MathTool：向量/距离/蓄力计时/插值等通用数学工具（禁止硬编码数值，常量取自 gameConst.json）
class MathTool {
  static clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  static lerp(a, b, t) { return a + (b - a) * t; }
  static dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  static rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  // 依据按住时长(ms)判定蓄力阶段，返回 0/1/2（预留给重击三段蓄力）
  static chargeStage(holdMs, thresholds) {
    if (holdMs >= thresholds[2]) return 2;
    if (holdMs >= thresholds[1]) return 1;
    return 0;
  }
}
