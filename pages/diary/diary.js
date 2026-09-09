const { KEYS, readArray, writeArray, toAmount, formatDateCN } = require('../../utils/storage.js');

Page({
  data: {
    entries: [],        // 归一化后的日记（新→旧）
    brokenImages: {}    // 图片加载失败标记：`${id}_${index}` → true，展示“图片已失效”
  },

  onShow() {
    this.loadDiary();
  },

  loadDiary() {
    const raw = readArray(KEYS.MEAL_DIARY);
    // 旧数据兼容：字段缺失/类型异常全部兜底，不报错
    const entries = raw.map(item => {
      const entry = item && typeof item === 'object' ? item : {};
      const dishes = Array.isArray(entry.dishes) ? entry.dishes.filter(d => typeof d === 'string' && d) : [];
      const images = Array.isArray(entry.images) ? entry.images.filter(p => typeof p === 'string' && p) : [];
      const rating = Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 5 ? entry.rating : 0;
      return {
        id: entry.id !== undefined ? entry.id : '',
        orderId: entry.orderId !== undefined && entry.orderId !== '' ? entry.orderId : '',
        date: typeof entry.date === 'string' ? entry.date : '',
        dateCN: formatDateCN(entry.date),
        time: typeof entry.time === 'string' ? entry.time : '',
        title: typeof entry.title === 'string' && entry.title ? entry.title : '我们的美食时光',
        dishes,
        dishesText: dishes.join('、'),
        images,
        amount: toAmount(entry.amount),
        rating,
        starsText: rating > 0 ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '未评分',
        remark: typeof entry.remark === 'string' ? entry.remark : ''
      };
    }).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    this.setData({ entries, brokenImages: {} });
  },

  // 图片路径失效（如临时文件被清理）时标记，展示“图片已失效”，不影响页面其它内容
  onImageError(e) {
    const key = `${e.currentTarget.dataset.id}_${e.currentTarget.dataset.index}`;
    this.setData({ [`brokenImages.${key}`]: true });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/diary-edit/diary-edit' });
  },

  goEdit(e) {
    wx.navigateTo({ url: `/pages/diary-edit/diary-edit?id=${e.currentTarget.dataset.id}` });
  },

  goBills() {
    wx.navigateTo({ url: '/pages/bills/bills' });
  },

  // 月度回顾：按月统计饭饭日记数据
  goMonthly() {
    wx.navigateTo({ url: '/pages/monthly/monthly' });
  },

  // 删除必须二次确认
  deleteEntry(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这篇饭饭日记吗？删除后无法恢复哦~',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          const list = readArray(KEYS.MEAL_DIARY).filter(d => String(d && d.id) !== String(id));
          writeArray(KEYS.MEAL_DIARY, list);
          this.loadDiary();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
})
