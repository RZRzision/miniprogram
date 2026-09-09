const { KEYS, readObject, writeObject } = require('../../utils/storage.js');

// 深夜时段候选（0:00 ~ 23:00，用于首页“深夜推荐”的本地时间判断）
const NIGHT_OPTIONS = ['0:00', '1:00', '2:00', '3:00', '4:00', '5:00', '6:00', '7:00', '8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];

Page({
  data: {
    shopName: '',
    autoAccept: false,
    nightStart: 21,
    nightOptions: NIGHT_OPTIONS,
    nightIndex: 21
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const settings = readObject(KEYS.SETTINGS, {});
    const nightStart = (typeof settings.nightStart === 'number' && settings.nightStart >= 0 && settings.nightStart <= 23) ? settings.nightStart : 21;
    this.setData({
      shopName: typeof settings.shopName === 'string' ? settings.shopName : '',
      autoAccept: settings.autoAccept === true,
      nightStart,
      nightIndex: nightStart
    });
  },

  onShopNameInput(e) {
    this.setData({ shopName: e.detail.value });
  },

  // 自动接单：新订单创建时直接进入「已接单」（真实影响订单初始状态）
  onAutoAcceptChange(e) {
    this.setData({ autoAccept: e.detail.value === true });
  },

  onNightChange(e) {
    const idx = Number(e.detail.value);
    if (idx >= 0 && idx <= 23) {
      this.setData({ nightStart: idx, nightIndex: idx });
    }
  },

  // 保存全部营业设置
  saveSettings() {
    writeObject(KEYS.SETTINGS, {
      shopName: this.data.shopName.trim(),
      autoAccept: this.data.autoAccept === true,
      nightStart: this.data.nightStart
    });
    wx.showToast({ title: '设置已保存', icon: 'success' });
  }
})
