Page({
  data: {
    bgImage: '',
    searchKey: '',
    showCartModal: false,
    categories: ['全部', '硬菜', '家常菜', '快手菜', '甜品饮料'],
    activeCategory: '全部',
    cart: [],
    // 默认基础菜单（首次打开小程序时显示）
    menuList: [
      { id: 1, name: '可乐鸡翅', category: '硬菜', price: '需要一个抱抱', icon: '🍗', selected: false },
      { id: 2, name: '红烧肉', category: '硬菜', price: '洗碗一次', icon: '🥩', selected: false },
      { id: 3, name: '番茄炒蛋', category: '家常菜', price: '夸我一句', icon: '🍳', selected: false },
      { id: 4, name: '酸辣土豆丝', category: '快手菜', price: '免费', icon: '🥔', selected: false },
      { id: 5, name: '冰镇奶茶', category: '甜品饮料', price: '给捶背10分钟', icon: '🧋', selected: false }
    ],
    filteredMenuList: []
  },

  onLoad() {
    // 读取自定义海报背景
    const savedBg = wx.getStorageSync('custom_bg');
    if (savedBg) {
      this.setData({ bgImage: savedBg });
    }
  },

  // 每次进入点餐页时，同步加载管理页（或其他地方）更新后的最新菜单
  onShow() {
    const customMenu = wx.getStorageSync('custom_menu_list');
    if (customMenu && customMenu.length > 0) {
      this.setData({ menuList: customMenu }, () => {
        this.updateFilteredList();
      });
    } else {
      // 首次使用，初始化存储默认菜品
      wx.setStorageSync('custom_menu_list', this.data.menuList);
      this.updateFilteredList();
    }
  },

  // 点击更换海报背景
  changeBg() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({ bgImage: tempFilePath });
        wx.setStorageSync('custom_bg', tempFilePath);
      }
    });
  },

  // 开关底部的已选清单弹窗
  toggleCartModal() {
    if (this.data.cart.length === 0 && !this.data.showCartModal) {
      wx.showToast({ title: '还未选择菜品哦', icon: 'none' });
      return;
    }
    this.setData({ showCartModal: !this.data.showCartModal });
  },

  // 清空购物车
  clearCart() {
    let menuList = this.data.menuList.map(item => ({ ...item, selected: false }));
    this.setData({
      menuList,
      cart: [],
      showCartModal: false
    }, () => {
      this.updateFilteredList();
    });
  },

  // 搜索框输入事件
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value }, () => {
      this.updateFilteredList();
    });
  },

  // 清空搜索内容
  clearSearch() {
    this.setData({ searchKey: '' }, () => {
      this.updateFilteredList();
    });
  },

  // 综合筛选列表（同时处理分类与关键词）
  updateFilteredList() {
    let list = this.data.menuList;
    const { activeCategory, searchKey } = this.data;

    // 1. 分类筛选
    if (activeCategory !== '全部') {
      list = list.filter(item => item.category === activeCategory);
    }

    // 2. 搜索关键词筛选
    if (searchKey.trim() !== '') {
      const keyword = searchKey.trim().toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(keyword));
    }

    this.setData({ filteredMenuList: list });
  },

  // 点击左侧分类标签
  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ activeCategory: category }, () => {
      this.updateFilteredList();
    });
  },

  // 点击选择/取消选择菜品
  toggleSelect(e) {
    const item = e.currentTarget.dataset.item;
    let menuList = this.data.menuList;
    let cart = this.data.cart;

    const targetItem = menuList.find(i => i.id === item.id);
    if (targetItem) {
      targetItem.selected = !targetItem.selected;
      if (targetItem.selected) {
        cart.push(targetItem);
      } else {
        const index = cart.findIndex(i => i.id === targetItem.id);
        if (index > -1) cart.splice(index, 1);
      }
    }

    // 如果购物车删空了，自动收起展开框
    const showCartModal = cart.length === 0 ? false : this.data.showCartModal;

    this.setData({ menuList, cart, showCartModal }, () => {
      this.updateFilteredList();
    });
  },

  // 一键下单（存入订单历史并清空当前勾选）
  submitOrder() {
    if (this.data.cart.length === 0) {
      wx.showToast({ title: '还没点菜呢~', icon: 'none' });
      return;
    }

    // 格式化当前时间
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newOrder = {
      id: Date.now(),
      time: timeStr,
      items: JSON.parse(JSON.stringify(this.data.cart))
    };

    const existingOrders = wx.getStorageSync('user_orders') || [];
    // 采用 push 方式追加，确保早的订单在前面，晚的在后面
    existingOrders.push(newOrder);
    wx.setStorageSync('user_orders', existingOrders);

    // 复制清单文本
    const menuNames = this.data.cart.map(item => `• ${item.name} (奖励: ${item.price})`).join('\n');
    const orderText = `【今日晚餐点单】\n${menuNames}\n\n大厨请准备接单！❤️`;

    wx.showModal({
      title: '下单成功！',
      content: orderText,
      confirmText: '复制清单',
      cancelText: '我知道了',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: orderText,
            success: () => {
              wx.showToast({ title: '已复制清单！' });
            }
          });
        }
      },
      complete: () => {
        // 下单完成后自动重置已选菜品
        this.clearCart();
      }
    });
  }
})