// StatusBar：顶部状态栏（屏幕空间绘制）。
// v2：显示等级/觉醒/周目 + HP/MP/EXP 条 + 当前装备招式缩写 + 「招」字技能面板入口。
class StatusBar {
  constructor(consts) {
    this.c = consts;
    // 技能面板按钮区域（右侧「招」字图标）
    this.btnRect = { x: 0, y: 0, w: 36, h: 36 };
    this.onSkillClick = null;   // 回调：点击「招」时触发
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

    // 右侧：「招」字技能面板入口按钮
    const btnX = W - 56;
    const btnY = 5;
    this.btnRect.x = btnX;
    this.btnRect.y = btnY;

    // 按钮底色（墨色圆角矩形）
    ctx.fillStyle = "rgba(192,57,43,0.75)";
    this._roundRect(ctx, btnX, btnY, 36, 36, 6);
    ctx.fill();

    // 朱红边框
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, btnX, btnY, 36, 36, 6);
    ctx.stroke();

    // 「招」字
    ctx.fillStyle = "#f5f0e6";
    ctx.font = 'bold 18px "PingFang SC", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("招", btnX + 18, btnY + 19);

    // 当前装备的招式名称缩写（按钮左侧）
    const equipped = data.equippedSkills || {};
    const slotNames = { light1: "", light2: "", light3: "", heavy1: "", heavy2: "", heavy3: "" };
    const nameMap = {};
    if (window.__skillManager) {
      for (const sk in slotNames) {
        const sid = equipped[sk];
        if (sid) {
          const sc = window.__skillManager.skills[sid];
          nameMap[sk] = sc ? sc.name.replace(/^[^\s]+·/, "") : sid;
        }
      }
    }

    // 简洁显示已装备槽位
    let labelParts = [];
    if (equipped.light1) labelParts.push((nameMap.light1 || "轻1"));
    if (equipped.light2) labelParts.push((nameMap.light2 || "轻2"));
    if (equipped.light3) labelParts.push((nameMap.light3 || "轻3"));
    if (equipped.heavy1) labelParts.push((nameMap.heavy1 || "重1"));
    if (equipped.heavy2) labelParts.push((nameMap.heavy2 || "重2"));
    if (equipped.heavy3) labelParts.push((nameMap.heavy3 || "重3"));

    const labelStr = labelParts.length > 0 ? labelParts.join(" | ") : "—";
    ctx.fillStyle = "#d4ccc0";
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(labelStr, btnX - 8, 24);

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

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}
