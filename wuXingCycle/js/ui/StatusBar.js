// StatusBar：顶部状态栏（屏幕空间绘制）。显示等级、觉醒值、轮回周目、HP/MP/经验条。
class StatusBar {
  constructor(consts) {
    this.c = consts;
  }
  render(ctx, player, data) {
    const c = this.c;
    const W = c.canvas.width;
    // 半透明墨底
    ctx.save();
    ctx.fillStyle = "rgba(26,26,26,0.78)";
    ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = c.colors.darkRed;
    ctx.fillRect(0, 46, W, 3);

    // 左：等级 / 觉醒 / 周目
    ctx.fillStyle = "#f5f0e6";
    ctx.font = "16px PingFang SC, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(`Lv.${data.level}  觉醒 ${data.awakening}/5  轮回 ${data.cycle}周目`, 16, 24);

    // 中：HP / MP / EXP 条
    const barX = 320, barW = 280;
    this.bar(ctx, barX, 10, barW, 10, player.hp / player.maxHp, c.colors.hp, "HP");
    this.bar(ctx, barX, 24, barW, 10, player.mp / player.maxMp, c.colors.mp, "MP");
    this.bar(ctx, barX, 38, barW, 6, data.exp / data.expNeed, c.colors.exp, "EXP");

    // 右：已解锁招式提示
    ctx.fillStyle = "#f5f0e6";
    ctx.fillText("招式: " + data.unlockSkill.join(" / "), 620, 24);
    ctx.restore();
  }
  bar(ctx, x, y, w, h, ratio, color, label) {
    ratio = Math.max(0, Math.min(1, ratio));
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * ratio, h);
    ctx.strokeStyle = "rgba(245,240,230,0.5)";
    ctx.strokeRect(x, y, w, h);
  }
}
