const { KEYS, readArray, writeArray } = require('../../utils/storage.js');
const { hasShipped } = require('../../utils/order-status.js');

const FALLBACK_DESC = '大厨还没有写介绍，先点一份试试味道吧~';

Page({
  data: {
    dish: null,       // 展示用菜品信息（月销/描述已兜底）
    favorited: false, // 收藏态
    soldOut: false,   // 售罄 / 下架
    loadError: ''
  },

  onLoad(options) {
    // 记录菜品 id 供 onShow 重新校验；URL 参数为字符串，统一转数字
    this.dishId = (options && options.id !== undefined && options.id !== '') ? Number(options.id) : null;
    this.loadDish();
  },

  // 收藏态/菜品信息可能变化，每次展示时刷新
  onShow() {
    if (this.dishId !== null) {
      this.loadDish();
    }
  },

  // 按菜品 id 读取菜品；id 非法、菜品不存在或数据异常时进入友好错误态
  loadDish() {
    const id = this.dishId;
    if (id === null || Number.isNaN(id)) {
      this.setData({ dish: null, loadError: '菜品参数有误，请返回重新选择~' });
      return;
    }

    const menuList = readArray(KEYS.MENU_LIST);
    const dish = Array.isArray(menuList) ? menuList.find(m => String(m.id) === String(id)) : null;

    if (!dish) {
      this.setData({ dish: null, loadError: '这道菜已经下架或不存在了，去看看其他美味吧~' });
      return;
    }

    // 记录最近浏览（猜你喜欢信号）：去重后置顶，最多保留 10 条
    const views = readArray(KEYS.RECENT_VIEWS).filter(v => String(v) !== String(id));
    views.unshift(dish.id);
    writeArray(KEYS.RECENT_VIEWS, views.slice(0, 10));

    // 月销 = 基数 + 已出单订单份数（与首页同一口径）
    let shipped = 0;
    readArray(KEYS.USER_ORDERS).forEach(order => {
      if (!order || !hasShipped(order.status) || !Array.isArray(order.items)) return;
      order.items.forEach(item => {
        if (item && String(item.id) === String(id)) {
          shipped += (typeof item.quantity === 'number' && item.quantity > 0) ? item.quantity : 1;
        }
      });
    });

    this.setData({
      dish: {
        ...dish,
        desc: dish.desc || FALLBACK_DESC,
        monthSales: (typeof dish.monthSales === 'number' ? dish.monthSales : 0) + shipped,
        tagsShow: (Array.isArray(dish.tags) ? dish.tags : []).slice(0, 3),
        stockText: typeof dish.stock === 'number' ? `剩余 ${dish.stock} 份` : '库存充足'
      },
      favorited: readArray(KEYS.FAVORITES).some(f => String(f) === String(id)),
      soldOut: dish.onSale === false || (typeof dish.stock === 'number' && dish.stock <= 0),
      loadError: ''
    });
  },

  // 收藏 / 取消收藏（猜你喜欢信号）
  toggleFavorite() {
    if (!this.data.dish) return;
    const id = this.data.dish.id;
    let favorites = readArray(KEYS.FAVORITES);
    if (this.data.favorited) {
      favorites = favorites.filter(f => String(f) !== String(id));
    } else {
      favorites.unshift(id);
    }
    writeArray(KEYS.FAVORITES, favorites);
    this.setData({ favorited: !this.data.favorited });
    wx.showToast({ title: this.data.favorited ? '已收藏 ❤️' : '已取消收藏', icon: 'none' });
  },

  // 加入购物车：复用页面栈中点餐页实例的购物车数量管线（quantity/selected/cartMap 全同步）
  addToCart() {
    if (!this.data.dish) return;

    if (this.data.soldOut) {
      wx.showToast({ title: '该菜品已售罄或下架', icon: 'none' });
      return;
    }

    const indexPage = getCurrentPages().find(p => p.route === 'pages/index/index');
    if (!indexPage || typeof indexPage.addToCartById !== 'function') {
      wx.showToast({ title: '请从点餐页进入后重试', icon: 'none' });
      return;
    }

    const quantity = indexPage.addToCartById(this.data.dish.id);
    if (quantity > 0) {
      wx.showToast({ title: `已加入购物车 · 共 ${quantity} 份`, icon: 'none' });
    } else {
      wx.showToast({ title: '该菜品已售罄或下架，无法加入', icon: 'none' });
    }
  },

  // 错误态：返回点餐页
  backToIndex() {
    wx.switchTab({ url: '/pages/index/index' });
  }
})
