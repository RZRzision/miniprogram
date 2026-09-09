const { KEYS, readArray, toAmount, getItemAmount } = require('../../utils/storage.js');
const { normalizeStatus, hasShipped, STATUS_FLOW } = require('../../utils/order-status.js');

Page({
  data: {
    overview: { totalOrders: 0, validOrders: 0, revenue: 0, avgOrder: 0 },
    statusDist: [],
    topDishes: [],
    hasData: false
  },

  onShow() {
    this.refresh();
  },

  // 商家数据统计：全部实时派生自 user_orders（已取消不计入营业额）
  refresh() {
    const orders = readArray(KEYS.USER_ORDERS);
    const valid = orders.filter(o => o && normalizeStatus(o) !== '已取消');

    const revenue = toAmount(valid.reduce((total, o) => {
      if (typeof o.payable === 'number') return total + Math.max(0, o.payable);
      let itemSum = 0;
      (Array.isArray(o.items) ? o.items : []).forEach(it => {
        if (!it) return;
        const qty = (typeof it.quantity === 'number' && it.quantity > 0) ? it.quantity : 1;
        const price = Number(it.price);
        if (Number.isFinite(price)) itemSum += price * qty;
      });
      return total + Math.max(0, toAmount(itemSum));
    }, 0));
    const avgOrder = valid.length > 0 ? toAmount(revenue / valid.length) : 0;

    // 状态分布
    const statusDist = STATUS_FLOW.concat(['已取消']).map(status => ({
      status,
      count: orders.filter(o => normalizeStatus(o) === status).length
    }));

    // 销量 Top5（已出单口径，与月销一致）
    const dishCount = {};
    orders.forEach(o => {
      if (!o || !hasShipped(normalizeStatus(o)) || !Array.isArray(o.items)) return;
      o.items.forEach(it => {
        if (!it || !it.name) return;
        const qty = (typeof it.quantity === 'number' && it.quantity > 0) ? it.quantity : 1;
        dishCount[it.name] = (dishCount[it.name] || 0) + qty;
      });
    });
    const topDishes = Object.keys(dishCount)
      .map(name => ({ name, count: dishCount[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    this.setData({
      overview: { totalOrders: orders.length, validOrders: valid.length, revenue, avgOrder },
      statusDist,
      topDishes,
      hasData: orders.length > 0
    });
  }
})
