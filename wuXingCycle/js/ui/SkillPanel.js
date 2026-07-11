// SkillPanel：水墨风技能管理面板（全屏覆盖层）。
//
// 布局：左侧技能背包（已拥有招式列表 + 熟练度墨条 + 元素筛选按钮） | 右侧槽位区（六个键位）
// 交互流程：
//   1) 点击状态栏「招」字图标打开面板
//   2) 点击右侧某个槽位进入"选择模式"
//   3) 从左侧背包点选目标招式，类型匹配则完成替换；点击已装备技能可卸下
//   4) 再次点击同一槽位或按 ESC 关闭
//
// v5 增强：
//   - 五行元素分类筛选按钮（水/木/金/火/土/全部），点击切换/恢复，关闭面板重置
//   - 槽位选择模式下，已装备技能显示红色"卸下"提示，点击执行 equipSkill(slotKey, null)
//   - 空列表显示对应元素暂无招式提示
//   - 接收 UIManager 统一转换后的逻辑坐标（无需内部再做坐标转换）
//   - 鼠标滚轮支持背包列表上下滚动，步长=1个技能条目(60px)
class SkillPanel {
  constructor(skillManager, consts) {
    this.sm = skillManager;
    this.c = consts;

    this.open = false;              // 面板开关
    this.selectSlot = null;         // 当前选中的槽位key（null = 未选中）
    this.hoverSkill = null;         // 背包中悬停的 skillId
    this.scrollY = 0;               // 背包滚动偏移

    this.scrollStep = 1;            // ★ v6 修复：滚动步长=1个技能条目索引
    this.scrollMax = 0;             // 滚动最大偏移量（动态计算）

    // ★ v5 元素筛选状态
    this.filterElement = null;      // 当前筛选的元素（null=全部显示）
    this._filteredCache = null;     // ★ v5 缓存过滤结果（避免每帧重复计算）
    this._filterDirty = true;       // 标记需要重新计算过滤列表

    // UI 区域常量
    this.padX = 40;
    this.padTop = 70;
    this.panelW = 0;
    this.panelH = 0;
    this.backpackW = 380;           // 左侧背包宽
    this.slotAreaW = 300;            // 右侧槽位区宽
    this.itemH = 56;                 // 每行招式高度
    this.gap = 16;

    // ★ v5 筛选按钮区域常量
    this.filterBtnH = 26;           // 筛选按钮高度
    this.filterBtnGap = 6;          // 筛选按钮间距

    // 五行元素配色
    this.elemColor = {
      water: "#3a7bd5", wood: "#2e8b57", metal: "#9ca3af",
      fire: "#d9480f", earth: "#8a6d3b", none: "#666"
    };
    this.elemIcon = {
      water: "水", wood: "木", metal: "金",
      fire: "火", earth: "土", none: "—"
    };
    this.elemList = ["water", "wood", "metal", "fire", "earth"];   // 可筛选元素列表
  }

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.selectSlot = null;
      this.hoverSkill = null;
      this.scrollY = 0;
      this.filterElement = null;     // ★ v5 关闭时重置筛选
      this._filterDirty = true;      // 标记需要重新计算
    }
  }

  // ==================== 滚轮事件处理 ====================

  // 处理鼠标滚轮事件（面板打开时消费）
  handleWheel(deltaY) {
    if (!this.open) return false;

    const filtered = this._getFilteredSkills();
    if (filtered.length === 0) return true;   // 无技能也消费事件防止穿透

    // 计算最大滚动范围（基于过滤后列表）
    const bh = this.panelH - this.padTop * 2 - 30 - this.filterBtnH - this.filterBtnGap;
    const maxVisible = Math.max(1, Math.floor((bh - 10) / (this.itemH + 4)));
    this.scrollMax = Math.max(0, filtered.length - maxVisible);

    // 更新滚动偏移（clamp 到有效范围）
    if (deltaY > 0) {
      this.scrollY = Math.min(this.scrollY + this.scrollStep, this.scrollMax);
    } else {
      this.scrollY = Math.max(this.scrollY - this.scrollStep, 0);
    }
    return true;   // 消费了滚轮事件
  }

  // ==================== 点击事件处理（v5：接收逻辑坐标）====================

  // ★ v5 新增：接收 UIManager 统一转换后的画布逻辑坐标
  handleClickLogic(logicX, logicY) {
    if (!this.open) return false;
    const W = this._canvasW();
    const H = this._canvasH();

    // 点击外部区域关闭
    const px = (W - this.panelW) / 2;
    const py = (H - this.panelH) / 2;
    if (logicX < px || logicX > px + this.panelW || logicY < py || logicY > py + this.panelH) {
      this.open = false;
      return true;
    }

    return this._hitTest(logicX, logicY);
  }

  // 向后兼容：v4 接口（接收屏幕坐标，内部转换为逻辑坐标）
  handleClick(clientX, clientY) {
    if (!this.open) return false;
    // 获取画布元素并计算缩放比例
    const canvas = document.getElementById("game");
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const scaleX = this._canvasW() / rect.width;
    const scaleY = this._canvasH() / rect.height;
    // 转换为逻辑坐标
    const logicX = (clientX - rect.left) * scaleX;
    const logicY = (clientY - rect.top) * scaleY;
    return this.handleClickLogic(logicX, logicY);
  }

  handleHover(clientX, clientY) {
    if (!this.open) return;
    this.hoverSkill = null;
  }

  _canvasW() { return this.c.canvas.width; }
  _canvasH() { return this.c.canvas.height; }

  // ==================== 内部点击检测 ====================

  // 内部点击检测，返回是否消费了事件
  _hitTest(mx, my) {
    const W = this._canvasW();
    const H = this._canvasH();

    // ★ 默认全屏模式：面板占满整个画布
    const pw = W - 40;
    const ph = H - 40;
    this.panelW = pw;
    this.panelH = ph;

    const px = 20;
    const py = 20;
    const ox = px + this.padX;
    const oy = py + this.padTop;

    // —— ★ v5 元素筛选按钮区域点击检测（增加间距避免与背包标题重合）——
    const filterBtnY = oy - this.filterBtnH - 12;
    const filterResult = this._hitTestFilterButtons(mx, my, ox, filterBtnY);
    if (filterResult) return true;

    // —— 右侧槽位区域点击检测 ——
    const slotStartX = ox + this.backpackW + this.gap * 2;
    const slots = ["light1", "light2", "light3", "heavy1", "heavy2", "heavy3", "parry"];
    for (let i = 0; i < slots.length; i++) {
      const sk = slots[i];
      // 跳过不可更改的锁定槽位（如"L"键弹反槽），避免误点击
      if (this.sm.slots[sk]?.locked) continue;
      const sx = slotStartX;
      const sy = oy + i * (this.itemH + 10);
      if (mx >= sx && mx <= sx + this.slotAreaW && my >= sy && my <= sy + this.itemH) {
        if (this.selectSlot === sk) {
          this.selectSlot = null;     // 再次点击取消选择
        } else {
          this.selectSlot = sk;       // 选中此槽位
        }
        return true;
      }
    }

    // —— 左侧背包点击检测（含卸下功能）——
    if (this.selectSlot) {
      const filtered = this._getFilteredSkills();
      if (filtered.length === 0) return false;

      const bh = ph - this.padTop * 2 - 30 - this.filterBtnH - this.filterBtnGap;
      const visibleCount = Math.max(1, Math.floor(bh / (this.itemH + 4)));
      // ★ 修复：使用Math.floor确保scrollY是整数索引
      const startIdx = Math.max(0, Math.min(Math.floor(this.scrollY), filtered.length - visibleCount));
      const endIdx = Math.min(startIdx + visibleCount, filtered.length);

      for (let i = startIdx; i < endIdx; i++) {
        const sid = filtered[i];
        const relativeIdx = i - startIdx;
        const by = oy + relativeIdx * (this.itemH + 4);
        if (mx >= ox && mx <= ox + this.backpackW && my >= by && my <= by + this.itemH) {
          // ★ v5 卸下功能：检查该技能是否已装备在当前选中槽位
          const eqId = this.sm.getSlotSkillId(this.selectSlot);
          if (eqId === sid) {
            // 点击的是当前槽位已装备的技能 → 执行卸下
            this.sm.equipSkill(this.selectSlot, null);
          } else {
            // 尝试正常装备
            this.sm.equipSkill(this.selectSlot, sid);
          }
          this._invalidateFilterCache();   // ★ v5 装备变更后失效缓存
          this.selectSlot = null;     // 操作完成后退出选择模式
          return true;
        }
      }
    }

    return false;
  }

  // ★ v5 元素筛选按钮点击检测
  _hitTestFilterButtons(mx, my, x, y) {
    const btnW = 44;   // 每个筛选按钮宽度
    // ★ 修复：totalWidth 必须与 _drawFilterButtons 保持一致（含「全部」按钮）
    const btnCount = 1 + this.elemList.length;   // 「全部」+ 金木水火土 = 6 个按钮
    const totalWidth = btnCount * btnW + (btnCount - 1) * this.filterBtnGap;
    let cx = x + (this.backpackW - totalWidth) / 2;   // ★ 居中起始 X（与渲染一致）

    // 「全部」按钮
    const allBtnW = 44;
    const allBtnX = cx;
    cx += allBtnW + this.filterBtnGap;

    // 检测「全部」按钮 — 直接设为 null，显示全部技能
    if (mx >= allBtnX && mx <= allBtnX + allBtnW && my >= y && my <= y + this.filterBtnH) {
      this.filterElement = null;
      this.scrollY = 0;
      this._filterDirty = true;
      return true;
    }

    // 检测各元素按钮
    for (let i = 0; i < this.elemList.length; i++) {
      const el = this.elemList[i];
      if (mx >= cx && mx <= cx + btnW && my >= y && my <= y + this.filterBtnH) {
        // 点击切换：未筛选→筛选此元素；已筛选此元素→取消筛选回到全部
        if (this.filterElement === el) {
          this.filterElement = null;
        } else {
          this.filterElement = el;
        }
        this.scrollY = 0;              // 切换筛选时重置滚动位置
        this._filterDirty = true;       // 标记缓存失效
        return true;
      }
      cx += btnW + this.filterBtnGap;
    }

    return false;
  }

  // ★ v5 获取过滤后的技能列表（带缓存优化，避免每帧重复计算）
  _getFilteredSkills() {
    // 缓存命中：直接返回
    if (!this._filterDirty && this._filteredCache) {
      return this._filteredCache;
    }
    // 缓存未命中：重新计算
    const owned = this.sm.getOwnedSkills(false);
    if (!this.filterElement || this.filterElement === "all") {
      this._filteredCache = owned;
    } else {
      this._filteredCache = owned.filter(sid => {
        const s = this.sm.skills[sid];
        return s && s.element === this.filterElement;
      });
    }
    this._filterDirty = false;
    return this._filteredCache;
  }

  // ★ v5 标记过滤缓存失效（在技能列表变更后调用）
  _invalidateFilterCache() {
    this._filterDirty = true;
    this._filteredCache = null;
  }

  // ==================== 渲染 ====================

  render(ctx) {
    if (!this.open) return;
    const W = this._canvasW();
    const H = this._canvasH();

    // ★ 默认全屏模式：面板占满整个画布，留20px边距
    const pw = W - 40;
    const ph = H - 40;
    const px = 20;
    const py = 20;
    this.panelW = pw;
    this.panelH = ph;

    // 半透明暗色遮罩
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);

    // 宣纸底色
    ctx.fillStyle = "#f5f0e6";
    this._roundRect(ctx, px, py, pw, ph, 12);
    ctx.fill();

    // 外框墨线 + 朱红内边框
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    this._roundRect(ctx, px, py, pw, ph, 12);
    ctx.stroke();
    ctx.strokeStyle = "rgba(192,57,43,0.5)";
    ctx.lineWidth = 1;
    this._roundRect(ctx, px + 4, py + 4, pw - 8, ph - 8, 9);
    ctx.stroke();

    // 标题
    ctx.fillStyle = "#1a1a1a";
    ctx.font = '20px "PingFang SC", "SimHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("招 式 装 配", W / 2, py + 14);

    // 分割线
    const dividerY = py + 48;
    ctx.strokeStyle = "rgba(26,26,26,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 24, dividerY);
    ctx.lineTo(px + pw - 24, dividerY);
    ctx.stroke();

    const ox = px + this.padX;
    const oy = py + this.padTop;

    // ★ v5 先绘制筛选按钮（在背包上方，增加间距避免与背包标题重合）
    this._drawFilterButtons(ctx, ox, oy - this.filterBtnH - 12);

    // 左右内容区
    this._drawBackpack(ctx, ox, oy);
    this._drawSlots(ctx, ox + this.backpackW + this.gap * 2, oy);

    // 底部操作提示
    ctx.fillStyle = "#888";
    ctx.font = '13px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("点击槽位 → 筛选元素 → 装配/卸下  |  ESC / 点外部关闭", W / 2, py + ph - 18);

    ctx.restore();
  }

  // ==================== 左侧：五行元素筛选按钮 ====================

  _drawFilterButtons(ctx, x, y) {
    const btnW = 44;
    const btnH = this.filterBtnH;
    const gap = this.filterBtnGap;
    // ★ 修复：统一使用 btnCount 公式，含「全部」+ 5 元素 = 6 按钮
    const btnCount = 1 + this.elemList.length;
    const totalWidth = btnCount * btnW + (btnCount - 1) * gap;
    let cx = x + (this.backpackW - totalWidth) / 2;

    // 「全部」按钮
    const isAllActive = (this.filterElement === null);
    this._drawFilterBtn(ctx, cx, y, btnW, btnH, "全部", "#666", isAllActive);
    cx += btnW + gap;

    // 五个元素按钮
    for (let i = 0; i < this.elemList.length; i++) {
      const el = this.elemList[i];
      const col = this.elemColor[el];
      const icon = this.elemIcon[el];
      const isActive = (this.filterElement === el);
      this._drawFilterBtn(ctx, cx, y, btnW, btnH, icon, col, isActive);
      cx += btnW + gap;
    }
  }

  _drawFilterButton(ctx, x, y, w, h, label, color, active) {
    // 按钮背景
    ctx.fillStyle = active ? color : "rgba(255,255,255,0.7)";
    this._roundRect(ctx, x, y, w, h, 5);
    ctx.fill();

    // 边框
    ctx.strokeStyle = active ? color : "rgba(26,26,26,0.2)";
    ctx.lineWidth = active ? 1.5 : 1;
    this._roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();

    // 文字
    ctx.fillStyle = active ? "#fff" : color;
    ctx.font = `${active ? 'bold ' : ''}13px "PingFang SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  // ==================== 左侧：技能背包 ====================

  _drawBackpack(ctx, x, y) {
    const c = this.c;
    const filtered = this._getFilteredSkills();   // ★ v5 使用过滤后列表

    // 背包标题（显示当前筛选状态）
    ctx.fillStyle = "#333";
    ctx.font = 'bold 15px "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let title = "— 技能背包 —";
    if (this.filterElement && this.filterElement !== "all") {
      title = `— ${this.elemIcon[this.filterElement]}系招式 —`;
    }
    ctx.fillText(title, x, y - 22);

    // 背包背景框
    const bh = this.panelH - this.padTop * 2 - 30 - this.filterBtnH - this.filterBtnGap;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    this._roundRect(ctx, x, y, this.backpackW, bh, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(26,26,26,0.12)";
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, this.backpackW, bh, 6);
    ctx.stroke();

    // 招式列表（裁剪区域内绘制）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, this.backpackW - 4, bh - 4);
    ctx.clip();

    const maxVisible = Math.max(1, Math.floor((bh - 10) / (this.itemH + 4)));
    // ★ 使用 Math.floor 确保整数索引，与 _hitTest 点击检测逻辑一致
    const startIdx = Math.max(0, Math.min(Math.floor(this.scrollY), filtered.length - maxVisible));
    for (let i = 0; i < Math.min(filtered.length - startIdx, maxVisible); i++) {
      const sid = filtered[startIdx + i];
      this._drawSkillItem(ctx, x + 8, y + 6 + i * (this.itemH + 4), sid);
    }
    ctx.restore();

    // ★ v5 空列表提示（区分"无任何技能"和"筛选无结果"）
    if (filtered.length === 0) {
      ctx.fillStyle = "#aaa";
      ctx.font = '14px "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      if (this.filterElement && this.filterElement !== "all") {
        ctx.fillText(`${this.elemIcon[this.filterElement]}系暂无可装备招式`, x + this.backpackW / 2, y + bh / 2);
      } else {
        ctx.fillText("尚未学会任何招式", x + this.backpackW / 2, y + bh / 2);
      }
    }

    // 滚动条指示（当可滚动时显示）
    if (this.scrollMax > 0) {
      const barH = Math.max(16, bh * Math.min(1, maxVisible / filtered.length));
      const barY = y + 4 + (bh - 8 - barH) * (this.scrollY / this.scrollMax);
      ctx.fillStyle = "rgba(26,26,26,0.18)";
      this._roundRect(ctx, x + this.backpackW - 8, barY, 5, barH, 3);
      ctx.fill();
    }
  }

  // 单个招式行（★ v5 增加卸下提示）
  _drawSkillItem(ctx, x, y, skillId) {
    const s = this.sm.skills[skillId];
    if (!s) return;
    const isEquipped = Object.values(this.sm.data.equippedSkills).indexOf(skillId) >= 0;
    const isSelected = this.selectSlot && this.sm.isOwned(skillId)
      && this._canEquipToSlot(skillId, this.selectSlot);

    // ★ v5 卸下检测：是否是当前选中槽位已装备的技能
    const isTargetForUnequip = this.selectSlot
      && this.sm.getSlotSkillId(this.selectSlot) === skillId;

    // 行背景（悬停/选中高亮/卸下警告）
    if (isTargetForUnequip) {
      // ★ v5 卸下警告：红底高亮
      ctx.fillStyle = "rgba(220,53,69,0.15)";
      this._roundRect(ctx, x - 2, y - 2, this.backpackW - 16, this.itemH, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(220,53,69,0.5)";
      ctx.lineWidth = 1.5;
      this._roundRect(ctx, x - 2, y - 2, this.backpackW - 16, this.itemH, 4);
      ctx.stroke();
    } else if (isSelected) {
      ctx.fillStyle = "rgba(192,57,43,0.12)";
      this._roundRect(ctx, x - 2, y - 2, this.backpackW - 16, this.itemH, 4);
      ctx.fill();
    } else if (isEquipped) {
      ctx.fillStyle = " rgba(42,157,52,0.08)";
      this._roundRect(ctx, x - 2, y - 2, this.backpackW - 16, this.itemH, 4);
      ctx.fill();
    }

    const elemCol = this.elemColor[s.element] || "#666";
    const elemChar = this.elemIcon[s.element] || "?";

    // 元素圆标
    ctx.fillStyle = elemCol;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x + 16, y + this.itemH / 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 元素字
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(elemChar, x + 16, y + this.itemH / 2);

    // 招式名称
    if (isTargetForUnequip) {
      ctx.fillStyle = "#dc3545";   // ★ v5 卸下目标用红色名称
      ctx.font = 'bold 15px "PingFang SC", sans-serif';
    } else {
      ctx.fillStyle = isSelected ? "#c0392b" : (isEquipped ? "#2e8b57" : "#333");
      ctx.font = (isSelected ? "bold " : "") + '15px "PingFang SC", sans-serif';
    }
    ctx.textAlign = "left";
    ctx.fillText(s.name || skillId, x + 38, y + 14);

    // 类型标签
    const typeLabel = { light: "轻击", heavy: "重击", parry: "弹反" };
    ctx.fillStyle = "rgba(100,100,100,0.6)";
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillText(typeLabel[s.type] || s.type, x + 38, y + 34);

    // 消耗/冷却信息
    ctx.fillStyle = "#888";
    ctx.font = '11px monospace';
    ctx.textAlign = "right";
    let info = "";
    if (s.mpCost > 0) info += `${s.mpCost}MP `;
    info += `${(s.cooldownMs / 1000).toFixed(1)}s`;
    ctx.fillText(info, x + this.backpackW - 28, y + 34);

    // 熟练度墨条
    const mastery = this.sm.getMastery(skillId);
    const maxM = this.sm.getMaxMastery(skillId);
    const barX = x + 38, barY = y + this.itemH - 8, barW = this.backpackW - 90, barH = 4;
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(barX, barY, barW, barH);
    if (mastery > 0) {
      ctx.fillStyle = elemCol;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(barX, barY, barW * (mastery / maxM), barH);
      ctx.globalAlpha = 1;
    }

    // 装备/卸下标记
    if (isTargetForUnequip) {
      // ★ v5 红色卸下提示
      ctx.fillStyle = "#dc3545";
      ctx.font = 'bold 11px "PingFang SC", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText("▼ 点击卸下", x + this.backpackW - 28, y + 14);
    } else if (isEquipped) {
      ctx.fillStyle = "#2e8b57";
      ctx.font = '11px "PingFang SC", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText("◆ 已装备", x + this.backpackW - 28, y + 14);
    }
  }

  // ==================== 右侧：槽位区 ====================

  _drawSlots(ctx, x, y) {
    const slots = ["light1", "light2", "light3", "heavy1", "heavy2", "heavy3", "parry"];
    const slotMeta = this.sm.slots;

    // 槽位标题
    ctx.fillStyle = "#333";
    ctx.font = 'bold 15px "PingFang SC", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("— 键位槽 —", x, y - 22);

    for (let i = 0; i < slots.length; i++) {
      const sk = slots[i];
      const meta = slotMeta[sk] || {};
      // 隐藏不可更改的锁定槽位（如"L"键弹反槽），保留代码逻辑不动
      if (meta.locked) continue;
      const eqId = this.sm.getSlotSkillId(sk);
      const eqSkill = eqId ? this.sm.skills[eqId] : null;
      const selected = this.selectSlot === sk;

      const sy = y + i * (this.itemH + 10);

      // 槽位背景（选中态高亮）
      ctx.fillStyle = selected ? "rgba(192,57,43,0.1)" : "rgba(0,0,0,0.04)";
      this._roundRect(ctx, x, sy, this.slotAreaW, this.itemH, 6);
      ctx.fill();

      // 边框
      ctx.strokeStyle = selected ? "rgba(192,57,43,0.6)" : "rgba(26,26,26,0.15)";
      ctx.lineWidth = selected ? 1.5 : 1;
      this._roundRect(ctx, x, sy, this.slotAreaW, this.itemH, 6);
      ctx.stroke();

      // 按键名（如 J / S+J）
      ctx.fillStyle = selected ? "#c0392b" : "#666";
      ctx.font = 'bold 14px "Consolas", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.key || sk, x + 12, sy + this.itemH / 2);

      // 分隔竖线
      ctx.strokeStyle = "rgba(26,26,26,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 54, sy + 8);
      ctx.lineTo(x + 54, sy + this.itemH - 8);
      ctx.stroke();

      // 当前装配的招式名
      if (eqSkill) {
        const eCol = this.elemColor[eqSkill.element] || "#666";
        // 元素小圆点
        ctx.fillStyle = eCol;
        ctx.beginPath();
        ctx.arc(x + 68, sy + this.itemH / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        // 名称
        ctx.fillStyle = "#333";
        ctx.font = '14px "PingFang SC", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(eqSkill.name || eqId, x + 82, sy + this.itemH / 2 + 1);
      } else if (!meta.locked) {
        // 空槽位提示
        ctx.fillStyle = "#bbb";
        ctx.font = '13px "PingFang SC", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText("— 空 —", x + 66, sy + this.itemH / 2 + 1);
      } else {
        // 固定槽
        ctx.fillStyle = "#999";
        ctx.font = '13px "PingFang SC", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(eqSkill ? eqSkill.name : "固定不可换", x + 66, sy + this.itemH / 2 + 1);
      }

      // 类型限制标签
      if (!meta.locked && meta.acceptType) {
        const typeTag = meta.acceptType.join("/").toUpperCase();
        ctx.fillStyle = "rgba(100,100,100,0.45)";
        ctx.font = '10px "PingFang SC", sans-serif';
        ctx.textAlign = "right";
        ctx.fillText(`[${typeTag}]`, x + this.slotAreaW - 10, sy + this.itemH - 8);
      }
      if (meta.locked) {
        ctx.fillStyle = "rgba(150,150,150,0.4)";
        ctx.font = '10px "PingFang SC", sans-serif';
        ctx.textAlign = "right";
        ctx.fillText("[固定]", x + this.slotAreaW - 10, sy + this.itemH - 8);
      }
    }
  }

  // 判断某招式能否装入某槽位
  _canEquipToSlot(skillId, slotKey) {
    const s = this.sm.skills[skillId];
    const meta = this.sm.slots[slotKey];
    if (!s || !meta) return false;
    if (meta.locked) return false;
    if (!meta.acceptType || meta.acceptType.indexOf(s.type) < 0) return false;
    return this.sm.isOwned(skillId);
  }

  _roundRect(ctx, x, y, w, h, r) {
    // ★ v5 修复：arcTo 参数必须是矩形边界上的点
    // 原错误写法 arcTo(x+w, y, x+w+r, r) 导致 Canvas 路径畸形 → 渲染死循环！
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);          // 右上角
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);    // 右下角
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);            // 左下角
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);                    // 左上角
    ctx.closePath();
  }

  // ★ 兼容旧版调用名（_drawFilterButton vs _drawFilterBtn）
  _drawFilterBtn(ctx, x, y, w, h, label, color, active) {
    this._drawFilterButton(ctx, x, y, w, h, label, color, active);
  }
}
