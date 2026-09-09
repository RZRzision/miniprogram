const { KEYS, readArray, toAmount, formatDateCN } = require('../../utils/storage.js');

// '2026-09' + delta 个月 → 归一化 'YYYY-MM'（自动跨年）；非法输入原样返回
function shiftMonth(month, delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) return month;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const year = Math.floor(total / 12);
  const mon = total % 12 + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

// '2026-09' → '2026年9月'
function monthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) return month || '';
  return `${Number(m[1])}年${Number(m[2])}月`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// 单条日记归一化：老数据/脏数据兜底，金额与评分转安全数值
function normalizeEntry(entry) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const dishes = Array.isArray(e.dishes) ? e.dishes.filter(d => typeof d === 'string' && d) : [];
  const images = Array.isArray(e.images) ? e.images.filter(p => typeof p === 'string' && p) : [];
  const rating = Number.isInteger(e.rating) && e.rating >= 1 && e.rating <= 5 ? e.rating : 0;
  return {
    id: e.id !== undefined ? e.id : '',
    date: typeof e.date === 'string' ? e.date : '',
    dateCN: formatDateCN(e.date),
    time: typeof e.time === 'string' ? e.time : '',
    title: typeof e.title === 'string' && e.title ? e.title : '我们的美食时光',
    dishes,
    images,
    amount: toAmount(e.amount),
    rating,
    starsText: rating > 0 ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '未评分'
  };
}

Page({
  data: {
    month: '',
    monthText: '',
    isCurrentMonth: true,
    hasData: false,
    stats: { entryCount: 0, activeDays: 0, totalAmount: 0, avgAmount: 0, avgRatingText: '暂无', imageCount: 0, dishTotal: 0 },
    topDish: { name: '', count: 0 },
    bestEntry: null,      // 评分最高的一次
    costliestEntry: null, // 花费最高的一次
    summary: ''
  },

  onLoad() {
    this.loadMonth(currentMonth());
  },

  // 新增日记后返回本页时按当前选中月份刷新
  onShow() {
    if (this.data.month) {
      this.loadMonth(this.data.month);
    }
  },

  // 统计指定月份：只读取饭饭日记数据（meal_diary），与订单金额、记账金额完全无关
  loadMonth(month) {
    const entries = readArray(KEYS.MEAL_DIARY)
      .map(normalizeEntry)
      .filter(e => e.date.slice(0, 7) === month);

    const entryCount = entries.length;

    // 有记录的天数：按日期去重
    const daySet = new Set(entries.map(e => e.date));

    // 金额全部经 toAmount 归一，不会出现 NaN / undefined / 字符串
    const totalAmount = toAmount(entries.reduce((sum, e) => sum + e.amount, 0));
    // 平均每次花费：0 条记录时保持 0，不除零
    const avgAmount = entryCount > 0 ? toAmount(totalAmount / entryCount) : 0;

    // 平均评分：只统计有评分的记录；无人评分时为 0，展示“暂无”
    const rated = entries.filter(e => e.rating > 0);
    const avgRating = rated.length > 0
      ? Math.round(rated.reduce((sum, e) => sum + e.rating, 0) / rated.length * 10) / 10
      : 0;

    const imageCount = entries.reduce((sum, e) => sum + e.images.length, 0);
    const dishTotal = entries.reduce((sum, e) => sum + e.dishes.length, 0);

    // 做/吃得最多的菜（并列取先出现的一道）
    const dishCount = {};
    entries.forEach(e => e.dishes.forEach(name => {
      dishCount[name] = (dishCount[name] || 0) + 1;
    }));
    let topDish = { name: '', count: 0 };
    Object.keys(dishCount).forEach(name => {
      if (dishCount[name] > topDish.count) {
        topDish = { name, count: dishCount[name] };
      }
    });

    // 评分最高 / 花费最高的一次（并列取先出现的一次）
    let bestEntry = null;
    entries.forEach(e => {
      if (e.rating > 0 && (!bestEntry || e.rating > bestEntry.rating)) bestEntry = e;
    });
    let costliestEntry = null;
    entries.forEach(e => {
      if (e.amount > 0 && (!costliestEntry || e.amount > costliestEntry.amount)) costliestEntry = e;
    });

    // 自动总结
    let summary = '';
    if (entryCount > 0) {
      const parts = [`${monthLabel(month)}你们一起记录了${entryCount}次饭饭时光`];
      if (totalAmount > 0) parts.push(`共花费¥${totalAmount}`);
      if (topDish.name) parts.push(`最常吃的是${topDish.name}`);
      if (avgRating > 0) parts.push(`平均评分${avgRating}星`);
      summary = parts.join('，') + '。';
    }

    this.setData({
      month,
      monthText: monthLabel(month),
      isCurrentMonth: month === currentMonth(),
      hasData: entryCount > 0,
      stats: {
        entryCount,
        activeDays: daySet.size,
        totalAmount,
        avgAmount,
        avgRatingText: avgRating > 0 ? String(avgRating) : '暂无',
        imageCount,
        dishTotal
      },
      topDish,
      bestEntry,
      costliestEntry,
      summary
    });
  },

  // ---- 月份切换（纯页面内状态，不写任何存储，不影响其他页面数据） ----
  prevMonth() {
    this.loadMonth(shiftMonth(this.data.month, -1));
  },

  nextMonth() {
    this.loadMonth(shiftMonth(this.data.month, 1));
  },

  backToCurrent() {
    this.loadMonth(currentMonth());
  },

  // 空状态：返回饭饭日记页写日记
  goCreate() {
    wx.navigateBack();
  }
})
