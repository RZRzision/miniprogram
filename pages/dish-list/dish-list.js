const { KEYS, readArray, writeArray, toAmount } = require('../../utils/storage.js');

Page({
  data: {
    mode: 'favorites',   // favorites | history
    title: '我的收藏',
    idsKey: '',
    dishes: [],
    emptyText: ''
  },

  onLoad(options) {
    const mode = (options && options.mode === 'history') ? 'history' : 'favorites';
    this.setData({
      mode,
      title: mode === 'history' ? '浏览历史' : '我的收藏',
      emptyText: mode === 'history' ? '暂无浏览记录，去点餐页逛逛吧~' : '还没有收藏菜品，去菜品详情页点 ❤️ 收藏吧~'
    });
    wx.setNavigationBarTitle({ title: mode === 'history' ? '浏览历史' : '我的收藏' });
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  // 从收藏 / 浏览记录的 id 列表映射回现有菜品数据（单一数据源，不复制菜品）
  refresh() {
    const idsKey = this.data.mode === 'history' ? KEYS.RECENT_VIEWS : KEYS.FAVORITES;
    const menu = readArray(KEYS.MENU_LIST);
    const dishes = readArray(idsKey)
      .map(id => menu.find(m => String(m.id) === String(id)))
      .filter(Boolean)
      .map(d => ({
        ...d,
        monthSales: (typeof d.monthSales === 'number' ? d.monthSales : 0),
        stockText: typeof d.stock === 'number' ? (d.stock <= 0 ? '售罄' : `库存 ${d.stock}`) : '库存充足'
      }));
    this.setData({ dishes, idsKey });
  },

  // 点击卡片进入菜品详情
  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  },

  // 从收藏 / 浏览历史中移除单条
  removeItem(e) {
    const id = e.currentTarget.dataset.id;
    const idsKey = this.data.idsKey;
    writeArray(idsKey, readArray(idsKey).filter(v => String(v) !== String(id)));
    this.refresh();
    wx.showToast({ title: '已移除', icon: 'none' });
  },

  // 清空列表（二次确认）
  clearAll() {
    wx.showModal({
      title: '提示',
      content: this.data.mode === 'history' ? '确定清空全部浏览历史吗？' : '确定清空全部收藏吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          writeArray(this.data.idsKey, []);
          this.refresh();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  // 去点餐页逛逛
  goIndex() {
    wx.switchTab({ url: '/pages/index/index' });
  }
})
