const { KEYS, readArray, formatDateCN } = require('../../utils/storage.js');

Page({
  data: {
    reviews: []
  },

  onShow() {
    this.refresh();
  },

  // 我的评价 = 饭饭日记中带评分的记录（复用现有数据，不另建评价存储）
  refresh() {
    const reviews = readArray(KEYS.MEAL_DIARY)
      .filter(d => d && Number.isInteger(d.rating) && d.rating >= 1 && d.rating <= 5)
      .map(d => {
        const rating = d.rating;
        const dishes = Array.isArray(d.dishes) ? d.dishes.filter(n => typeof n === 'string' && n) : [];
        return {
          id: d.id !== undefined ? d.id : '',
          title: typeof d.title === 'string' && d.title ? d.title : '我们的美食时光',
          dateCN: formatDateCN(d.date),
          starsText: '★'.repeat(rating) + '☆'.repeat(5 - rating),
          dishesText: dishes.join('、'),
          remark: typeof d.remark === 'string' ? d.remark : ''
        };
      })
      .sort((a, b) => String(b.dateCN).localeCompare(String(a.dateCN)));
    this.setData({ reviews });
  },

  // 去饭饭日记查看 / 写新评价
  goDiary() {
    wx.switchTab({ url: '/pages/diary/diary' });
  }
})
