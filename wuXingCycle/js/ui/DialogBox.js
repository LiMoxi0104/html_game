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
      "WASD / 方向键：移动\n空格：跳跃（空中再按=二段跳，按住=蓄力高跳，短按=矮跳）\n\n【动态招式】\nJ：轻击槽1　S+J：轻击槽2　W+J：轻击槽3\nW+K：重击槽1　A/D+K：重击槽2　S+K：重击槽3\nL：匕首弹反（200ms窗口，成功后1s无敌+处决标记）\nShift：闪避（向后瞬移，残留箱可触发完美闪避）\n\n点击状态栏右侧「招」字可管理技能装配");
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
