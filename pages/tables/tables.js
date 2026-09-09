const { KEYS, readArray, writeArray } = require('../../utils/storage.js');

const DEFAULT_TABLES = ['1', '2', '3', '4', '5', '6', '7', '8'];

Page({
  data: {
    tables: []
  },

  onShow() {
    this.refresh();
  },

  // 桌台列表存储驱动（结算页堂食桌号选择即时生效）；空数据回退默认 1-8 号桌
  refresh() {
    const tables = readArray(KEYS.TABLES);
    this.setData({ tables: tables.length > 0 ? tables : DEFAULT_TABLES });
  },

  // 新增桌号：取现有最大数字 +1
  addTable() {
    const tables = readArray(KEYS.TABLES);
    const list = tables.length > 0 ? tables : DEFAULT_TABLES;
    let max = 0;
    list.forEach(t => {
      const n = parseInt(t, 10);
      if (Number.isFinite(n) && n > max) max = n;
    });
    const next = String(max + 1);
    writeArray(KEYS.TABLES, [...list, next]);
    this.refresh();
    wx.showToast({ title: `已添加 ${next} 号桌`, icon: 'success' });
  },

  // 删除桌号（二次确认，至少保留一张）
  removeTable(e) {
    const no = e.currentTarget.dataset.no;
    const tables = readArray(KEYS.TABLES);
    const list = tables.length > 0 ? tables : DEFAULT_TABLES;
    if (list.length <= 1) {
      wx.showToast({ title: '至少保留一张桌子', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '提示',
      content: `确定删除 ${no} 号桌吗？`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          writeArray(KEYS.TABLES, list.filter(t => t !== no));
          this.refresh();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
})
