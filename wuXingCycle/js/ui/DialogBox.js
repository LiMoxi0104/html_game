// DialogBox：剧情 / 操作说明 / 解锁提示弹窗（DOM 层，半透明水墨边框）。
// 弹窗 DOM 由 index.html 提供，此处只负责显示/隐藏与内容填充，避免每帧重复创建节点。
class DialogBox {
  static el() { return document.getElementById("wx-dialog"); }
  static show(title, body) {
    const el = DialogBox.el();
    if (!el) return;
    el.querySelector(".wx-dialog-title").textContent = title;
    el.querySelector(".wx-dialog-body").textContent = body;
    el.classList.add("show");
  }
  static hide() {
    const el = DialogBox.el();
    if (el) el.classList.remove("show");
  }
  // 首次进入操作说明
  static showIntro() {
    DialogBox.show("五行轮回 · 烛龙囚笼",
      "WASD / 方向键：移动　空格：跳跃\nJ：水行轻击　K：木行重击　L：匕首弹反（预留）\n移动至尖刺/毒沼触发陷阱，攻击木桩验证三阶段伤害判定。");
    const el = DialogBox.el();
    if (el) {
      const btn = el.querySelector(".wx-dialog-close");
      if (btn) btn.addEventListener("click", DialogBox.hide);
    }
  }
  // 无存储权限容错提示
  static showStorageError() {
    DialogBox.show("存档不可用", "当前浏览器禁止本地存储，进度将不会被保存，但游戏可正常游玩。");
  }
}
