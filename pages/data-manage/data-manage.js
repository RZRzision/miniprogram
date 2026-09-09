const { KEYS, readArray, readObject, writeArray } = require('../../utils/storage.js');

// 数据管理：各数据项总览 + 逐项清空（带二次确认）+ 一键导出
const SECTIONS = [
  { key: KEYS.USER_ORDERS, label: '订单记录', clearable: true },
  { key: KEYS.BILLS, label: '记账账单', clearable: true },
  { key: KEYS.MEAL_DIARY, label: '饭饭日记', clearable: true },
  { key: KEYS.FAVORITES, label: '我的收藏', clearable: true },
  { key: KEYS.RECENT_VIEWS, label: '浏览历史', clearable: true },
  { key: KEYS.SEARCH_HISTORY, label: '搜索历史', clearable: true },
  { key: KEYS.COUPONS, label: '优惠券', clearable: true },
  { key: KEYS.USER_PROFILE, label: '用户资料', clearable: true },
  { key: KEYS.MENU_LIST, label: '菜品菜单', clearable: false },
  { key: KEYS.USER_RECIPES, label: '菜谱', clearable: false },
  { key: KEYS.CATEGORIES, label: '菜品分类', clearable: false },
  { key: KEYS.TABLES, label: '桌台', clearable: false },
  { key: KEYS.SETTINGS, label: '营业设置', clearable: false },
  { key: KEYS.CUSTOM_BG, label: '海报背景', clearable: false }
];

Page({
  data: {
    sections: []
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const sections = SECTIONS.map(s => {
      const arr = readArray(s.key);
      let countText = '空';
      if (arr.length > 0) {
        countText = `${arr.length} 条`;
      } else {
        const raw = wx.getStorageSync(s.key);
        if ((raw && typeof raw === 'string') || readObject(s.key, null)) {
          countText = '已设置';
        }
      }
      return { key: s.key, label: s.label, countText, clearable: s.clearable };
    });
    this.setData({ sections });
  },

  // 一键导出：全部本地数据 JSON 复制到剪贴板
  exportAll() {
    const dump = {};
    Object.keys(KEYS).forEach(name => {
      dump[name] = wx.getStorageSync(KEYS[name]);
    });
    wx.setClipboardData({
      data: JSON.stringify(dump),
      success: () => wx.showToast({ title: '已复制全部数据', icon: 'success' })
    });
  },

  // 清空单项数据（二次确认；不可清空项直接拦截）
  clearKey(e) {
    const key = e.currentTarget.dataset.key;
    const section = SECTIONS.find(s => s.key === key);
    if (!section || !section.clearable) {
      wx.showToast({ title: '该数据不可清空', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '危险操作',
      content: `确定清空「${section.label}」吗？清空后不可恢复。`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          writeArray(key, []);
          this.refresh();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }
})
