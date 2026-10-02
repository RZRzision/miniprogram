const { KEYS, readArray, writeArray, getItemAmount } = require('../../utils/storage.js');
const { normalizeStatus, canCancel, statusCls } = require('../../utils/order-status.js');
const { restoreStock } = require('../../utils/stock.js');

const API_BASE_URL = 'http://123.207.245.251:3000';

Page({
  data: {
    orders: []
  },

  onShow() {
    this.loadOrders();
  },


  async loadOrders() {
    wx.showLoading({ title: '加载订单中...' });

    try {
      // 先获取服务器订单列表
      const listRes = await new Promise((resolve, reject) => {
        wx.request({
          url: `${API_BASE_URL}/api/orders`,
          method: 'GET',
          success: resolve,
          fail: reject
        });
      });

      if (
        listRes.statusCode !== 200 ||
        !listRes.data ||
        !listRes.data.success
      ) {
        throw new Error('获取订单列表失败');
      }

      const serverOrders = listRes.data.data || [];

      // 列表接口不包含菜品详情，逐个获取订单详情
      const ordersWithDetails = await Promise.all(
        serverOrders.map(async order => {
          const detailRes = await new Promise((resolve, reject) => {
            wx.request({
              url: `${API_BASE_URL}/api/orders/${order.id}`,
              method: 'GET',
              success: resolve,
              fail: reject
            });
          });

          if (
            detailRes.statusCode !== 200 ||
            !detailRes.data ||
            !detailRes.data.success
          ) {
            throw new Error(`订单 ${order.id} 详情获取失败`);
          }

          const detail = detailRes.data.data;
          const items = (detail.items || []).map(item => ({
            id: item.dish_id,
            name: item.dish_name,
            price: Number(item.price),
            quantity: Number(item.quantity) || 1,
            subtotal: Number(item.subtotal)
          }));

          const createdAt = detail.created_at
            ? new Date(detail.created_at)
            : new Date();

          const pad = n => String(n).padStart(2, '0');
          const timeStr =
            `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())} ` +
            `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`;

          return {
            ...detail,
            id: detail.id,
            time: timeStr,
            items,
            totalCount: items.reduce(
              (sum, item) => sum + item.quantity,
              0
            ),
            amount: Number(detail.total_amount) || 0,
            tasteRemark: detail.remark || ''
          };
        })
      );

      // 早的订单在前，晚的订单在后
      ordersWithDetails.sort((a, b) => a.id - b.id);

      const normalizedOrders = ordersWithDetails.map(order => {
        const status = normalizeStatus(order);

        return {
          ...order,
          date: order.time.slice(0, 10),
          timeOfDay: order.time.slice(11, 16),
          status,
          statusCls: statusCls(status),
          canCancel: canCancel(status)
        };
      });

      this.setData({ orders: normalizedOrders });
    } catch (error) {
      console.error('加载服务器订单失败：', error);
      wx.showToast({
        title: '订单加载失败，请检查网络',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 用户端：取消自己的订单（仅出餐前可取消；状态流转规则见 utils/order-status.js）
  // 取消时若订单已扣减库存（stockSettled 标记），自动回补库存（标志保证只回补一次）

  cancelOrder(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.orders.find(
      o => String(o.id) === String(id)
    );

    if (!target) return;

    if (!target.canCancel) {
      wx.showToast({
        title: '当前状态不可取消',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '提示',
      content: '确定取消该订单吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '正在取消...' });

        wx.request({
          url: `${API_BASE_URL}/api/orders/${id}/cancel`,
          method: 'PATCH',
          header: {
            'content-type': 'application/json'
          },
          data: {
            status: 5
          },
          success: (response) => {
            const result = response.data;

            if (
              response.statusCode === 200 &&
              result &&
              result.success
            ) {
              wx.showToast({
                title: '已取消订单',
                icon: 'success'
              });

              // 重新从服务器加载，显示最新状态
              this.loadOrders();
            } else {
              wx.showToast({
                title: result?.message || '取消失败',
                icon: 'none',
                duration: 2500
              });
            }
          },
          fail: () => {
            wx.showToast({
              title: '网络连接失败',
              icon: 'none'
            });
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      }
    });
  },

  // 删除特定订单
  // 月销为派生统计：已出单订单删除后其贡献自动消失；未出单订单删除不影响月销
  // 库存按订单实际状态决定：已扣减（stockSettled）→ 删除前回补；未扣减 → 不动库存
  async deleteOrder(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '删除订单',
      content: '确定删除这条订单记录吗？',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '删除中' });

        try {
          const result = await new Promise((resolve, reject) => {
            wx.request({
              url: `${API_BASE_URL}/api/orders/${id}/delete`,
              method: 'PATCH',
              success: resolve,
              fail: reject
            });
          });

          if (result.statusCode === 200 && result.data.success) {
            wx.showToast({ title: '删除成功', icon: 'success' });
            await this.loadOrders();
          } else {
            wx.showToast({
              title: result.data.message || '删除失败',
              icon: 'none'
            });
          }
        } catch (error) {
          console.error('删除订单失败：', error);
          wx.showToast({ title: '网络请求失败', icon: 'none' });
        } finally {
          wx.hideLoading();
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
