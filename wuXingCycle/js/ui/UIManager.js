// UIManager：UI 统管。负责顶部状态栏绘制与弹窗显隐，串接 StatusBar / DialogBox。
class UIManager {
  constructor(consts, data, player) {
    this.consts = consts;
    this.data = data;
    this.player = player;
    this.statusBar = new StatusBar(consts);
  }
  // 屏幕空间渲染（在世界层 restore 之后调用）
  render(ctx) {
    this.statusBar.render(ctx, this.player, this.data);
  }
  // 首次进入弹出操作说明，点击关闭
  showIntro() { DialogBox.showIntro(); }
}
