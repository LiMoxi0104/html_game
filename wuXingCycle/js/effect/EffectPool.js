// EffectPool：特效对象池骨架（阶段1 预留）。用于复用水流/藤蔓/火龙/陨石/弹反火花等特效，
// 避免频繁 new Image 造成内存泄漏与掉帧。阶段2 接入具体特效。
class EffectPool {
  constructor(factory, initial = 0) {
    this.factory = factory;
    this.pool = [];
    for (let i = 0; i < initial; i++) this.pool.push(this.factory());
  }
  acquire() {
    return this.pool.length ? this.pool.pop() : this.factory();
  }
  release(obj) { this.pool.push(obj); }
  get size() { return this.pool.length; }
}
