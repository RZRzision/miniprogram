const { KEYS, readArray, readObject, writeArray, toAmount } = require('../../utils/storage.js');

// 会员等级：按积分解锁（积分 = 每消费 1 元 +1 分，每篇饭饭日记 +5 分）
const LEVELS = [
  { name: '青铜食客', min: 0 },
  { name: '白银食客', min: 100 },
  { name: '黄金食客', min: 300 },
  { name: '钻石食客', min: 600 }
];
const AVATARS = ['🐼', '🐱', '🦊', '🐸', '🐰', '🐻', '🐧', '🦉'];
const DEFAULT_PROFILE = { nickname: '深夜食堂干饭搭子', avatar: '🐼' };

Page({
  data: {
    profile: DEFAULT_PROFILE,
    stats: { mealCount: 0, totalSpend: 0, avgSpend: 0, topDish: '暂无' },
    points: 0,
    pointsFromSpend: 0,
    pointsFromDiary: 0,
    levelName: '青铜食客',
    levelProgress: 0,
    nextLevel: '',
    showPointsPanel: false,
    showAvatarPicker: false,
    avatars: AVATARS,
    couponCount: 0
  },

  onShow() {
    this.refresh();
  },

  // 数据口径（互不重复统计）：
  // 累计消费 = 记账本（bills）金额总和；一起吃饭次数 = 饭饭日记条数；
  // 最常吃菜品 = 日记菜品频次；积分 = floor(累计消费) + 日记数×5
  refresh() {
    const saved = readObject(KEYS.USER_PROFILE, {});
    const profile = {
      nickname: typeof saved.nickname === 'string' && saved.nickname ? saved.nickname : DEFAULT_PROFILE.nickname,
      avatar: typeof saved.avatar === 'string' && saved.avatar ? saved.avatar : DEFAULT_PROFILE.avatar
    };

    const bills = readArray(KEYS.BILLS);
    const totalSpend = toAmount(bills.reduce((sum, b) => sum + Math.max(0, toAmount(b && b.amount)), 0));

    const diaries = readArray(KEYS.MEAL_DIARY);
    const mealCount = diaries.length;
    const avgSpend = mealCount > 0 ? toAmount(totalSpend / mealCount) : 0;

    const dishCount = {};
    diaries.forEach(d => {
      (Array.isArray(d && d.dishes) ? d.dishes : []).forEach(name => {
        if (typeof name === 'string' && name) {
          dishCount[name] = (dishCount[name] || 0) + 1;
        }
      });
    });
    let topDish = '暂无';
    let top = 0;
    Object.keys(dishCount).forEach(name => {
      if (dishCount[name] > top) {
        top = dishCount[name];
        topDish = name;
      }
    });

    // 积分与等级
    const pointsFromSpend = Math.floor(Math.max(0, totalSpend));
    const pointsFromDiary = mealCount * 5;
    const points = pointsFromSpend + pointsFromDiary;
    let levelIdx = 0;
    LEVELS.forEach((l, i) => { if (points >= l.min) levelIdx = i; });
    const current = LEVELS[levelIdx];
    const next = LEVELS[levelIdx + 1] || null;
    const levelProgress = next
      ? Math.min(100, Math.round((points - current.min) / (next.min - current.min) * 100))
      : 100;

    this.setData({
      profile,
      stats: { mealCount, totalSpend, avgSpend, topDish },
      points,
      pointsFromSpend,
      pointsFromDiary,
      levelName: current.name,
      levelProgress,
      nextLevel: next ? next.name : '',
      couponCount: readArray(KEYS.COUPONS).length
    });
  },

  // ---- 用户资料编辑（本地保存） ----
  editNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '输入新昵称',
      success: (res) => {
        if (res.confirm) {
          const nickname = (res.content || '').trim();
          if (!nickname) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
          }
          this.saveProfile({ nickname });
        }
      }
    });
  },

  toggleAvatarPicker() {
    this.setData({ showAvatarPicker: !this.data.showAvatarPicker });
  },

  selectAvatar(e) {
    const avatar = e.currentTarget.dataset.avatar;
    if (avatar) {
      this.saveProfile({ avatar });
    }
  },

  saveProfile(patch) {
    const profile = { ...this.data.profile, ...patch };
    wx.setStorageSync(KEYS.USER_PROFILE, profile);
    this.setData({ profile });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  // ---- 会员积分明细（内联展开） ----
  togglePoints() {
    this.setData({ showPointsPanel: !this.data.showPointsPanel });
  },

  // ---- 功能入口（全部真实跳转） ----
  goOrders() { wx.switchTab({ url: '/pages/order/order' }); },
  goFavorites() { wx.navigateTo({ url: '/pages/dish-list/dish-list?mode=favorites' }); },
  goHistory() { wx.navigateTo({ url: '/pages/dish-list/dish-list?mode=history' }); },
  goCoupons() { wx.navigateTo({ url: '/pages/coupons/coupons' }); },
  goBills() { wx.navigateTo({ url: '/pages/bills/bills' }); },
  goDiary() { wx.switchTab({ url: '/pages/diary/diary' }); },
  goReviews() { wx.navigateTo({ url: '/pages/reviews/reviews' }); },
  goRecipe() { wx.navigateTo({ url: '/pages/recipe/recipe' }); },
  goManage() { wx.navigateTo({ url: '/pages/manage/manage' }); }
})
