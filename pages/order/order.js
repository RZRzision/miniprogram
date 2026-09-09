const { KEYS, readArray, writeArray, getItemAmount } = require('../../utils/storage.js');
const { normalizeStatus, canCancel, statusCls } = require('../../utils/order-status.js');
const { restoreStock } = require('../../utils/stock.js');

Page({
  data: {
    orders: []
  },

  onShow() {
    this.loadOrders();
  },

  loadOrders() {
    const orders = readArray(KEYS.USER_ORDERS);
    // 时间按早到晚升序排列
    orders.sort((a, b) => a.id - b.id);
    // 兼容旧数据：没有 quantity / tasteRemark / status 字段的订单正常展示，不报错
    const normalizedOrders = orders.map(order => {
      const items = Array.isArray(order.items)
        ? order.items.map(dish => ({
            ...dish,
            quantity: (typeof dish.quantity === 'number' && dish.quantity > 0) ? dish.quantity : 1
          }))
        : [];
      const totalCount = items.reduce((sum, dish) => sum + dish.quantity, 0);
      // 订单金额：仅数值奖励可解析（文案型奖励不计入）；用于「记一笔」快照预填与金额展示
      const amount = items.reduce((sum, dish) => sum + getItemAmount(dish) * dish.quantity, 0);
      const timeStr = typeof order.time === 'string' ? order.time : '';
      // 状态归一化：老订单无 status 按“待接单”处理，徽章样式与可取消性一并给出
      const status = normalizeStatus(order);
      return {
        ...order,
        items,
        totalCount,
        amount,
        date: timeStr.slice(0, 10),      // 'YYYY-MM-DD'，供日记/账单预填
        timeOfDay: timeStr.slice(11, 16),// 'HH:mm'
        tasteRemark: typeof order.tasteRemark === 'string' ? order.tasteRemark : '',
        status,
        statusCls: statusCls(status),
        canCancel: canCancel(status)
      };
    });
    this.setData({ orders: normalizedOrders });
  },

  // 用户端：取消自己的订单（仅出餐前可取消；状态流转规则见 utils/order-status.js）
  // 取消时若订单已扣减库存（stockSettled 标记），自动回补库存（标志保证只回补一次）
  cancelOrder(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.orders.find(o => String(o.id) === String(id));
    if (!target) return;

    if (!target.canCancel) {
      wx.showToast({ title: '当前状态不可取消', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '提示',
      content: '确定取消该订单吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          const fresh = readArray(KEYS.USER_ORDERS);
          const targetOrder = fresh.find(o => String(o.id) === String(id));
          if (targetOrder && targetOrder.stockSettled === true) {
            restoreStock(Array.isArray(targetOrder.items) ? targetOrder.items : []);
          }
          const orders = fresh.map(o => (String(o.id) === String(id) ? { ...o, status: '已取消', stockSettled: false } : o));
          writeArray(KEYS.USER_ORDERS, orders);
          this.loadOrders();
          wx.showToast({ title: '已取消订单', icon: 'none' });
        }
      }
    });
  },

  // 删除特定订单
  // 月销为派生统计：已出单订单删除后其贡献自动消失；未出单订单删除不影响月销
  // 库存按订单实际状态决定：已扣减（stockSettled）→ 删除前回补；未扣减 → 不动库存
  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要删除这条订单记录吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          const fresh = readArray(KEYS.USER_ORDERS);
          const targetOrder = fresh.find(o => String(o.id) === String(id));
          if (targetOrder && targetOrder.stockSettled === true) {
            restoreStock(Array.isArray(targetOrder.items) ? targetOrder.items : []);
          }
          writeArray(KEYS.USER_ORDERS, fresh.filter(o => String(o.id) !== String(id)));
          this.loadOrders();
          wx.showToast({ title: '已删除订单', icon: 'success' });
        }
      }
    });
  },

  // 从订单「记一笔」：把订单金额快照预填进记账页（用户可修改；账单与订单互不影响）
  addBillFromOrder(e) {
    const order = this.data.orders.find(o => String(o.id) === String(e.currentTarget.dataset.id));
    if (!order) return;
    const params = [
      'mode=add',
      `orderId=${order.id}`,
      `amount=${order.amount > 0 ? order.amount : ''}`,
      `title=${encodeURIComponent('情侣晚餐')}`,
      `date=${order.date || ''}`,
      `time=${order.timeOfDay || ''}`
    ].join('&');
    wx.navigateTo({ url: `/pages/bills/bills?${params}` });
  },

  // 从订单「写日记」：进入日记编辑页，自动带入订单日期/菜品/金额/orderId
  writeDiaryFromOrder(e) {
    const order = this.data.orders.find(o => String(o.id) === String(e.currentTarget.dataset.id));
    if (!order) return;
    wx.navigateTo({ url: `/pages/diary-edit/diary-edit?orderId=${order.id}` });
  }
})
