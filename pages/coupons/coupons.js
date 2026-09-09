const { KEYS, readArray, writeArray, formatDate, formatTime } = require('../../utils/storage.js');

// 可领取的券池（本地固定配置，领取后写入 KEYS.COUPONS）
const COUPON_POOL = [
  { id: 'newbie3', name: '新客立减券', condition: '无门槛', amount: 3 },
  { id: 'full30', name: '满30减5券', condition: '满30元可用', amount: 5 },
  { id: 'full50', name: '满50减10券', condition: '满50元可用', amount: 10 },
  { id: 'sweet68', name: '情侣甜蜜券', condition: '满68元可用', amount: 13.14 }
];

Page({
  data: {
    claimable: [],
    claimed: []
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const claimed = readArray(KEYS.COUPONS);
    const claimedIds = claimed.map(c => c && c.id);
    this.setData({
      claimable: COUPON_POOL.filter(c => claimedIds.indexOf(c.id) === -1),
      claimed
    });
  },

  // 领取优惠券（写入本地，同一张券不可重复领取）
  claim(e) {
    const id = e.currentTarget.dataset.id;
    const coupon = COUPON_POOL.find(c => c.id === id);
    if (!coupon) return;

    const claimed = readArray(KEYS.COUPONS);
    if (claimed.some(c => c && c.id === id)) {
      wx.showToast({ title: '已经领取过啦', icon: 'none' });
      return;
    }

    const now = new Date();
    claimed.unshift({ ...coupon, claimedAt: `${formatDate(now)} ${formatTime(now)}` });
    writeArray(KEYS.COUPONS, claimed);
    this.refresh();
    wx.showToast({ title: '领取成功', icon: 'success' });
  },

  // 去使用：回到点餐页，结算时在「优惠金额」中填写券面额
  useCoupon() {
    wx.switchTab({ url: '/pages/index/index' });
  }
})
