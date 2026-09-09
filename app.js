// 应用级状态 + 旧版本数据兼容迁移
App({
  globalData: {
    pendingSelectDishId: null
  },

  onLaunch() {
    // 兼容其他版本模型使用过的账单/日记 key；仅在新 key 尚不存在时迁移，绝不覆盖现有数据。
    const migrations = [
      ['user_bills', 'bills'],
      ['user_diary', 'meal_diary']
    ];
    migrations.forEach(([oldKey, newKey]) => {
      try {
        const current = wx.getStorageSync(newKey);
        const legacy = wx.getStorageSync(oldKey);
        const currentMissing = current === '' || current === undefined || current === null;
        if (currentMissing && Array.isArray(legacy)) {
          wx.setStorageSync(newKey, legacy);
        }
      } catch (e) {
        // 本地存储异常不阻断小程序启动。
      }
    });
  }
})
