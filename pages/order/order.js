Page({
  data: {
    orders: []
  },

  onShow() {
    this.loadOrders();
  },

  loadOrders() {
    const orders = wx.getStorageSync('user_orders') || [];
    // 时间按早到晚升序排列
    orders.sort((a, b) => a.id - b.id);
    this.setData({ orders });
  },

  // 切换订单状态（已接单 <-> 已出单）
  toggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    let orders = this.data.orders;
    const target = orders.find(o => o.id === id);

    if (target) {
      // 切换状态，默认没有 status 字段时视为已接单
      target.status = (target.status === '已出单') ? '已接单' : '已出单';
      this.setData({ orders });
      wx.setStorageSync('user_orders', orders);

      wx.showToast({
        title: `状态已修改为: ${target.status}`,
        icon: 'none'
      });
    }
  },

  // 删除特定订单
  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要删除这条订单记录吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          let orders = this.data.orders.filter(o => o.id !== id);
          this.setData({ orders });
          wx.setStorageSync('user_orders', orders);
          wx.showToast({ title: '已删除订单', icon: 'success' });
        }
      }
    });
  }
})