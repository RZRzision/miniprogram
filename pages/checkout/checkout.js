const { KEYS, readArray, readObject, writeArray, toAmount, getItemAmount } = require('../../utils/storage.js');
const { deductStock, restoreStock } = require('../../utils/stock.js');

// 结算页口味快捷标签（可多选，与自定义备注合并保存）
const TASTE_TAGS = ['微辣', '中辣', '少油', '少盐', '不加香菜', '不加葱', '其他'];
const REMARK_SEPARATORS = /[，,、;；\s]+/;

Page({
  data: {
    items: [],            // 待结算菜品快照（仅被勾选的菜品）
    totalCount: 0,        // 商品总件数
    originalAmount: 0,    // 商品原价总额（仅数值奖励可计价）
    hasPriced: false,     // 是否存在可计价菜品
    discount: 0,          // 优惠金额（0 ~ 原价）
    payable: 0,           // 实际支付 = 原价 - 优惠
    diningMode: '堂食',   // 用餐方式：堂食 / 打包
    tables: [],           // 桌台列表（桌台管理页维护）
    tableNo: '',          // 桌号（堂食可选；打包为空）
    tasteTags: TASTE_TAGS,
    tasteRemark: '',
    tagActive: {},
    invalidCount: 0,      // 无法结算的菜品数（下架/删除/库存不足）
    submitting: false,    // 防止连续点击产生重复订单
    loadError: ''
  },

  onLoad() {
    // 桌台列表：桌台管理页维护（空数据回退默认 1-8 号桌）
    const savedTables = readArray(KEYS.TABLES);
    this.setData({
      tables: savedTables.length > 0 ? savedTables : ['1', '2', '3', '4', '5', '6', '7', '8']
    });

    // 从页面栈中的点餐页读取被勾选的菜品（单一数据源，不引入草稿存储）
    const pages = getCurrentPages();
    const indexPage = pages.find(p => p.route === 'pages/index/index');
    if (!indexPage || typeof indexPage.getCheckedCart !== 'function') {
      this.setData({ loadError: '结算会话已失效，请从点餐页重新进入~' });
      return;
    }
    const checked = indexPage.getCheckedCart();
    if (!checked || !Array.isArray(checked.items) || checked.items.length === 0) {
      this.setData({ loadError: '没有可结算的菜品，请回点餐页勾选~' });
      return;
    }
    this.indexPage = indexPage;

    // 单价数值化：仅可解析为数字的奖励参与金额计算；小计 = 单价 × 数量
    const items = checked.items.map(item => {
      const priceNum = Math.max(0, getItemAmount(item));
      return { ...item, priceNum, subtotal: toAmount(priceNum * item.quantity) };
    });
    const tasteRemark = checked.remark || '';

    this.setData({ tasteRemark, tagActive: this.refreshTagActive(tasteRemark) });
    // 结算前按最新菜单校验每项菜品（下架/删除/库存不足会被标记并排除）
    this.applyValidation(items);
  },

  // 结算前重新校验每项菜品：删除 / 下架 / 库存不足 → 标记原因并排除出本单（留在购物车）
  validateItems(items) {
    const menu = readArray(KEYS.MENU_LIST);
    return items.map(item => {
      const dish = menu.find(m => String(m.id) === String(item.id));
      if (!dish) return { ...item, invalid: true, invalidReason: '菜品已下架或删除' };
      if (dish.onSale === false) return { ...item, invalid: true, invalidReason: '菜品已下架' };
      if (typeof dish.stock === 'number' && dish.stock < item.quantity) {
        return { ...item, invalid: true, invalidReason: dish.stock <= 0 ? '已售罄' : `库存不足，仅剩 ${dish.stock} 份` };
      }
      return { ...item, invalid: false, invalidReason: '' };
    });
  },

  // 按校验结果重算合计（只统计可结算菜品），返回可结算项
  applyValidation(items) {
    const validated = this.validateItems(items);
    const valid = validated.filter(i => !i.invalid);
    const totalCount = valid.reduce((sum, i) => sum + i.quantity, 0);
    const originalAmount = toAmount(valid.reduce((sum, i) => sum + i.subtotal, 0));
    const discount = Math.min(this.data.discount, originalAmount);
    const payable = toAmount(originalAmount - discount);
    this.setData({
      items: validated,
      invalidCount: validated.length - valid.length,
      totalCount,
      originalAmount,
      discount,
      payable,
      hasPriced: originalAmount > 0
    });
    return valid;
  },

  // 优惠金额：钳制在 0 ~ 原价之间；实付 = 原价 - 优惠，杜绝负数
  onDiscountInput(e) {
    const discount = Math.min(Math.max(0, toAmount(e.detail.value)), this.data.originalAmount);
    this.setData({ discount, payable: toAmount(this.data.originalAmount - discount) });
  },

  // 用餐方式：切换为打包时清空桌号
  setDiningMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== '堂食' && mode !== '打包') return;
    this.setData({ diningMode: mode, tableNo: mode === '打包' ? '' : this.data.tableNo });
  },

  // 堂食选桌号
  setTableNo(e) {
    const no = e.currentTarget.dataset.no;
    if (this.data.tables.indexOf(no) > -1) {
      this.setData({ tableNo: no });
    }
  },

  // ---- 口味备注：快捷标签多选 + 自定义输入（文本为唯一数据源） ----
  refreshTagActive(remark) {
    const segs = (remark || '').split(REMARK_SEPARATORS).filter(Boolean);
    const tagActive = {};
    this.data.tasteTags.forEach(tag => { tagActive[tag] = segs.indexOf(tag) > -1; });
    return tagActive;
  },

  toggleTasteTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const segs = this.data.tasteRemark.split(REMARK_SEPARATORS).filter(Boolean);
    const idx = segs.indexOf(tag);
    if (idx > -1) segs.splice(idx, 1);
    else segs.push(tag);
    const tasteRemark = segs.join('，');
    this.setData({ tasteRemark, tagActive: this.refreshTagActive(tasteRemark) });
  },

  onRemarkInput(e) {
    const tasteRemark = e.detail.value;
    this.setData({ tasteRemark, tagActive: this.refreshTagActive(tasteRemark) });
  },

  // 提交订单：防连续点击；下单前重新校验库存/上下架；扣减库存；写入成功才清理购物车
  submitOrder() {
    if (this.data.submitting) return;
    if (this.data.loadError || this.data.items.length === 0) {
      wx.showToast({ title: '没有可结算的菜品', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });

    // 结算前重新校验（库存 / 上下架可能在填写期间发生变化），只保留可结算项
    const revalidated = this.validateItems(this.data.items);
    const validItems = revalidated.filter(i => !i.invalid).map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      amount: i.amount,
      icon: i.icon,
      quantity: i.quantity,
      priceNum: i.priceNum,
      subtotal: i.subtotal
    }));
    const invalidTip = revalidated.filter(i => i.invalid).map(i => `${i.name}（${i.invalidReason}）`).join('、');

    if (validItems.length === 0) {
      this.setData({ submitting: false });
      wx.showToast({ title: '没有可结算的菜品，请返回调整', icon: 'none' });
      return;
    }

    let stockDeducted = false;   // 库存是否已扣减（订单写入失败时用于回补）
    let orderWritten = false;    // 订单是否已写入（写入后不再回补）
    try {
      const orders = readArray(KEYS.USER_ORDERS);
      // 订单 id：时间戳撞号时递增，保证唯一且单调（排序/删除/关联依赖唯一 id）
      let orderId = Date.now();
      while (orders.some(o => Number(o.id) === orderId)) {
        orderId += 1;
      }

      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const { diningMode, tableNo, tasteRemark } = this.data;
      const totalCount = validItems.reduce((sum, i) => sum + i.quantity, 0);
      const originalAmount = toAmount(validItems.reduce((sum, i) => sum + i.subtotal, 0));
      const discount = Math.min(this.data.discount, originalAmount);
      const payable = toAmount(originalAmount - discount);

      // 完整订单快照（stockSettled 标记库存已扣减：取消/删除时据此回补，且只回补一次）
      const newOrder = {
        id: orderId,
        time: timeStr,
        items: validItems,
        totalCount,
        originalAmount,
        discount,
        payable,
        diningMode,
        tableNo,
        tasteRemark: (tasteRemark || '').trim(),
        stockSettled: true
      };

      // 营业设置「自动接单」开启时，新订单跳过待接单直接进入已接单
      const settings = readObject(KEYS.SETTINGS, {});
      if (settings.autoAccept === true) {
        newOrder.status = '已接单';
      }

      // 扣减库存：先扣库存再写订单；
      // 订单写入失败时在 catch 中回补库存，避免库存被扣但订单不存在
      deductStock(validItems);
      stockDeducted = true;

      // 采用 push 方式追加，早的订单在前面，晚的在后面
      orders.push(newOrder);
      writeArray(KEYS.USER_ORDERS, orders);
      orderWritten = true;

      // 写入成功后才通知点餐页清理：只移除已购买的菜品（校验未通过的留在购物车）
      const purchasedIds = validItems.map(i => i.id);
      if (this.indexPage && typeof this.indexPage.completeCheckout === 'function') {
        this.indexPage.completeCheckout(purchasedIds);
      }

      // 复制清单文本（体现数量与支付信息）
      const menuNames = validItems.map(i => `• ${i.name} × ${i.quantity} (奖励: ${i.price})`).join('\n');
      const modeText = diningMode === '堂食' && tableNo ? `堂食 ${tableNo}号桌` : diningMode;
      const lines = [`【今日晚餐点单】`, menuNames];
      if (payable > 0) {
        lines.push(`实付：¥${payable}（${modeText}${discount > 0 ? '，已优惠 ¥' + discount : ''}）`);
      }
      if (invalidTip) {
        lines.push(`⚠️ 未结算：${invalidTip}`);
      }
      lines.push('', '大厨请准备接单！❤️');
      const orderText = lines.join('\n');

      wx.showModal({
        title: '下单成功！',
        content: orderText,
        confirmText: '复制清单',
        cancelText: '我知道了',
        success: (res) => {
          if (res.confirm) {
            wx.setClipboardData({
              data: orderText,
              success: () => {
                wx.showToast({ title: '已复制清单！' });
              }
            });
          }
        },
        complete: () => {
          wx.navigateBack();
        }
      });
    } catch (e) {
      // 订单创建失败：回补已扣库存（订单未写入时），不清空购物车，恢复按钮允许重试
      if (stockDeducted && !orderWritten) {
        restoreStock(validItems);
      }
      this.setData({ submitting: false });
      wx.showToast({ title: '下单失败，请重试', icon: 'none' });
    }
  },

  // 失效态：返回点餐页
  goBack() {
    wx.navigateBack();
  }
})
