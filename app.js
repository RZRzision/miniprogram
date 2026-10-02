const { wxLogin } = require('./utils/auth.js')

App({
  globalData: {
    pendingSelectDishId: null,
    userInfo: null
  },

  onLaunch() {
    console.log('App启动')

    const user = wx.getStorageSync('USER_INFO')

    if (!user) {
      wxLogin()
        .then(res => {
          console.log('微信登录成功', res)
          this.globalData.userInfo = res
        })
        .catch(err => {
          console.error('微信登录失败', err)
        })
    } else {
      console.log('已有登录用户', user)
      this.globalData.userInfo = user
    }

    const migrations = [
      ['user_bills', 'bills'],
      ['user_diary', 'meal_diary']
    ]

    migrations.forEach(([oldKey, newKey]) => {
      try {
        const current = wx.getStorageSync(newKey)
        const legacy = wx.getStorageSync(oldKey)

        const currentMissing =
          current === '' ||
          current === undefined ||
          current === null

        if (currentMissing && Array.isArray(legacy)) {
          wx.setStorageSync(newKey, legacy)
        }
      } catch (e) {
        console.log('数据迁移失败', e)
      }
    })
  }
})