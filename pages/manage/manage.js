Page({
  data: {
    categories: ['硬菜', '家常菜', '快手菜', '甜品饮料'],
    categoryIndex: 0,
    iconList: ['🍗', '🥩', '🍳', '🥔', '🧋', '🥟', '🍤', '🍜', '🍲', '🍧', '🍕', '🍰'],
    form: {
      name: '',
      price: '',
      category: '硬菜',
      icon: '🍗'
    },
    menuList: []
  },

  onShow() {
    this.loadMenuList();
  },

  // 读取本地存储的菜单
  loadMenuList() {
    const list = wx.getStorageSync('custom_menu_list') || [];
    this.setData({ menuList: list });
  },

  onInputName(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onInputPrice(e) {
    this.setData({ 'form.price': e.detail.value });
  },

  onCategoryChange(e) {
    const idx = e.detail.value;
    this.setData({
      categoryIndex: idx,
      'form.category': this.data.categories[idx]
    });
  },

  selectIcon(e) {
    this.setData({ 'form.icon': e.currentTarget.dataset.icon });
  },

  // 添加新菜品
  addDish() {
    const { name, price, category, icon } = this.data.form;
    if (!name.trim() || !price.trim()) {
      wx.showToast({ title: '请填写名称和奖励', icon: 'none' });
      return;
    }

    const newDish = {
      id: Date.now(),
      name: name.trim(),
      price: price.trim(),
      category,
      icon,
      selected: false
    };

    let list = this.data.menuList;
    list.unshift(newDish);

    // 保存到本地缓存
    wx.setStorageSync('custom_menu_list', list);
    
    this.setData({
      menuList: list,
      'form.name': '',
      'form.price': ''
    });

    wx.showToast({ title: '添加成功！', icon: 'success' });
  },

  // 删除菜品
  deleteDish(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要下架这道菜吗？',
      success: (res) => {
        if (res.confirm) {
          let list = this.data.menuList.filter(item => item.id !== id);
          wx.setStorageSync('custom_menu_list', list);
          this.setData({ menuList: list });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
})