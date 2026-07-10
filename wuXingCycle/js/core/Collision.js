// Collision：矩形/圆形碰撞检测工具。攻击判定盒、陷阱触发区均复用此处方法，统一对接。
class Collision {
  // 轴对齐矩形相交检测：a、b 均为 {x,y,w,h}
  static rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  // 圆形与矩形相交检测（预留给弹反/范围技）
  static circleRect(cx, cy, r, rect) {
    const nx = MathTool.clamp(cx, rect.x, rect.x + rect.w);
    const ny = MathTool.clamp(cy, rect.y, rect.y + rect.h);
    return MathTool.dist(cx, cy, nx, ny) <= r;
  }
}
