const { KEYS, readArray, readObject, writeArray, hasKey, getItemAmount, DEFAULT_CATEGORIES } = require('../../utils/storage.js');
const { hasShipped } = require('../../utils/order-status.js');

Page({
  data: {
    bgImage: '',
    searchKey: '',
    showCartModal: false,
    categories: ['全部', ...DEFAULT_CATEGORIES],
    activeCategory: '全部',
    cart: [],        // 购物车数组：每道菜仅一条记录，quantity 保存份数（唯一数据源）
    cartMap: {},     // 购物车索引表：id → 记录，由 cart 单向派生，与 cart 始终同步
    totalCount: 0,   // 总份数 = 各记录 quantity 之和（不使用数组 length）
    totalAmount: 0,  // 总金额：仅累计可解析为数字的奖励/代价（文案型奖励不计入）
    checkedCount: 0, // 已勾选菜品数（去结算的数量）
    allChecked: false,
    // 默认基础菜单（首次打开小程序时显示）
    // monthSales 为月销基数（历史存量菜单无此字段时按 0 处理；月销展示值 = 基数 + 已出单订单份数）
    // desc/tags 供推荐卡片展示；onSale/stock 供推荐筛选（老数据缺失视为在售、有库存）
    menuList: [
      { id: 1, name: '可乐鸡翅', category: '硬菜', price: '需要一个抱抱', amount: 0, icon: '🍗', selected: false, monthSales: 128, desc: '鸡翅在可乐里泡了个甜蜜的澡，咸甜入魂，深夜食堂的镇店之宝。', tags: ['情侣推荐', '人气王'], onSale: true, stock: 50 },
      { id: 2, name: '红烧肉', category: '硬菜', price: '洗碗一次', amount: 0, icon: '🥩', selected: false, monthSales: 86, desc: '肥而不腻，入口即化，吃完请自觉去洗碗。', tags: ['人气王'], onSale: true, stock: 30 },
      { id: 3, name: '番茄炒蛋', category: '家常菜', price: '夸我一句', amount: 0, icon: '🍳', selected: false, monthSales: 99, desc: '经典家常味，番茄的酸遇上蛋的香，拌饭一绝。', tags: ['情侣推荐'], onSale: true, stock: 80 },
      { id: 4, name: '酸辣土豆丝', category: '快手菜', price: '免费', amount: 0, icon: '🥔', selected: false, monthSales: 66, desc: '爽脆酸辣，五分钟出锅，深夜救急首选。', tags: ['深夜限定'], onSale: true, stock: 60 },
      { id: 5, name: '冰镇奶茶', category: '甜品饮料', price: '给捶背10分钟', amount: 0, icon: '🧋', selected: false, monthSales: 42, desc: '深夜来一杯，杯杯见真心，捶背十分钟不能少。', tags: ['深夜限定', '情侣推荐'], onSale: true, stock: 40 }
    ],
    filteredMenuList: [],
    // 推荐区域：全部由 menuList 单一数据源派生（页面内存视图，不落盘、不建第二套菜品数据）
    recommend: { today: [], couple: [], night: [], nightTip: '', sales: [], guess: [], hotSearches: [] },
    // 搜索历史（最多 10 条，去重、最新在前，存本地 Storage）
    searchHistory: [],
    scrollIntoView: '',
    // 月销结算索引：菜品 id → 已出单订单累计份数（以订单 status === '已出单' 为结算依据，展示时与基数相加）
    shippedSalesMap: {},
    // 口味备注（本次订单的整体口味要求）：tasteRemark 为最终文本，tagActive 记录快捷标签选中态
    tasteTags: ['少辣', '微辣', '正常', '重辣', '少盐', '清淡', '不要香菜', '不要葱', '少冰', '多冰'],
    tasteRemark: '',
    tagActive: {}
  },

  onLoad() {
    // 读取自定义海报背景，并验证本地文件是否仍存在，避免冷启动裂图。
    const savedBg = wx.getStorageSync(KEYS.CUSTOM_BG);
    if (!savedBg) return;
    const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
    if (!fs) {
      this.setData({ bgImage: savedBg });
      return;
    }
    fs.access({
      path: savedBg,
      success: () => this.setData({ bgImage: savedBg }),
      fail: () => {
        wx.removeStorageSync(KEYS.CUSTOM_BG);
        this.setData({ bgImage: '' });
      }
    });
  },

  // 每次进入点餐页时，同步加载管理页（或其他地方）更新后的最新菜单
  onShow() {
    // 分类由分类管理页维护（空数据回退默认分类）
    this.loadCategories();
    // 月销统计依赖订单状态，进入页面时重建已出单份数索引
    this.rebuildSalesMap();

    const customMenu = readArray(KEYS.MENU_LIST);
    if (hasKey(KEYS.MENU_LIST)) {
      // key 已存在时尊重用户现状，即使菜单被全部删除也不能自动复活默认菜品。
      const cart = this.data.cart.filter(c => customMenu.some(m => String(m.id) === String(c.id)));
      this.applyCart(cart, { menuList: customMenu });
    } else {
      // 首次使用，初始化存储默认菜品
      writeArray(KEYS.MENU_LIST, this.data.menuList);
      const cart = this.data.cart.filter(c => this.data.menuList.some(m => String(m.id) === String(c.id)));
      this.applyCart(cart);
    }

    // 推荐区域依赖最新菜单与月销索引
    this.buildRecommendations();
    this.loadSearchHistory();
    this.handlePendingSelect();
  },

  // 菜谱页“去点这道菜”跳转回来后：自动切换分类、定位并短暂高亮目标菜品。
  handlePendingSelect() {
    const app = getApp();
    const targetId = app.globalData && app.globalData.pendingSelectDishId;
    if (targetId === undefined || targetId === null || targetId === '') return;
    app.globalData.pendingSelectDishId = null;
    const dish = this.data.menuList.find(d => String(d.id) === String(targetId));
    if (!dish) {
      wx.showToast({ title: '这道菜已下架，下次再来吧~', icon: 'none' });
      return;
    }
    this.setData({ activeCategory: dish.category || '全部', searchKey: '' }, () => {
      this.updateFilteredList();
      this.setData({ scrollIntoView: `dish-${dish.id}` });
    });
  },

  // 分类侧栏：分类管理页维护（存储驱动，空数据回退默认分类）；被删除的选中分类回落“全部”
  loadCategories() {
    const cats = readArray(KEYS.CATEGORIES);
    const list = cats.length > 0 ? cats : DEFAULT_CATEGORIES;
    const active = (this.data.activeCategory === '全部' || list.indexOf(this.data.activeCategory) > -1)
      ? this.data.activeCategory
      : '全部';
    this.setData({ categories: ['全部', ...list], activeCategory: active });
  },

  // ---- 推荐区域（全部由 menuList 单一数据源派生，只做内存视图，不落盘） ----
  // 统一规则：仅推荐在售且有库存的菜品；月销展示值 = 基数 + 已出单订单份数；各区域封顶 6 个
  buildRecommendations() {
    const available = this.data.menuList
      .filter(d => d.onSale !== false && !(typeof d.stock === 'number' && d.stock <= 0))
      .map(d => ({
        ...d,
        monthSales: (typeof d.monthSales === 'number' ? d.monthSales : 0) + (this.data.shippedSalesMap[String(d.id)] || 0),
        desc: d.desc || '大厨还没有写介绍~',
        tagsShow: (Array.isArray(d.tags) ? d.tags : []).slice(0, 2)
      }))
      .sort((a, b) => b.monthSales - a.monthSales); // 月销降序为兜底排序

    const cap = (list, n) => list.slice(0, n);

    // 今日推荐：按日期确定性轮换（本地规则，每天不同，不用随机数）
    const daySeed = Math.floor(Date.now() / 86400000);
    const rotated = available.map((_, i) => available[(i + daySeed) % available.length]);

    // 情侣推荐：优先 tags 含“情侣推荐”（couple 字段族）；无命中时回退高销量
    const couple = available.filter(d => (d.tags || []).indexOf('情侣推荐') > -1);

    // 深夜推荐：优先 tags 含“深夜限定”，回退甜品饮料分类；结合当前小时给出文案
    // （深夜开始时间可在营业设置中调整，默认 21 点）
    const hour = new Date().getHours();
    const settings = readObject(KEYS.SETTINGS, {});
    const nightStart = (typeof settings.nightStart === 'number' && settings.nightStart >= 0 && settings.nightStart <= 23) ? settings.nightStart : 21;
    const deepNight = hour >= nightStart || hour < 5;
    const night = available.filter(d => (d.tags || []).indexOf('深夜限定') > -1);
    const nightDrink = available.filter(d => d.category === '甜品饮料');

    // 猜你喜欢：收藏(+3) + 最近购买(+2) + 最近浏览(+1) + 月销热度(封顶3) 的本地打分
    const favorites = readArray(KEYS.FAVORITES).map(String);
    const recentViews = readArray(KEYS.RECENT_VIEWS).map(String);
    const recentBought = [];
    readArray(KEYS.USER_ORDERS).slice(-5).forEach(order => {
      (order && Array.isArray(order.items) ? order.items : []).forEach(d => {
        if (d && d.id !== undefined && recentBought.indexOf(String(d.id)) === -1) {
          recentBought.push(String(d.id));
        }
      });
    });
    const scored = available
      .map(d => {
        const key = String(d.id);
        let score = Math.min(3, d.monthSales / 50);
        if (favorites.indexOf(key) > -1) score += 3;
        if (recentBought.indexOf(key) > -1) score += 2;
        if (recentViews.indexOf(key) > -1) score += 1;
        return { ...d, guessScore: score };
      })
      .sort((a, b) => b.guessScore - a.guessScore || b.monthSales - a.monthSales);

    // 热门搜索：取月销最高的前 5 个菜品的名称（动态生成，去重）
    const hotSearches = [];
    available.forEach(d => {
      if (hotSearches.indexOf(d.name) === -1 && hotSearches.length < 5) {
        hotSearches.push(d.name);
      }
    });

    this.setData({
      recommend: {
        today: cap(rotated, 6),
        couple: cap(couple.length > 0 ? couple : available, 6),
        night: cap(night.length > 0 ? night : (nightDrink.length > 0 ? nightDrink : available), 6),
        nightTip: deepNight ? '夜深了，来点慰藉吧 🌙' : '先种草，深夜再吃 🌙',
        sales: cap(available, 6),
        guess: cap(scored, 4),
        hotSearches
      }
    });
  },

  // 点击推荐卡片 / 菜品进入详情页
  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  },

  // 月销派生统计：遍历订单，已出过餐的订单（已出单/已完成）按菜品 quantity 累计（旧订单无 quantity 按 1 份）
  // 不在状态切换时回写菜品存储 —— 以订单状态为唯一结算依据（见 utils/order-status.js 的 hasShipped），
  // 天然幂等：进入已出单 +q、退回 -q、再次进入 +q、推进到已完成仍保留贡献、删除已出单订单自动撤销，
  // 任何重复点击都不会重复累计
  rebuildSalesMap() {
    const shippedSalesMap = {};
    readArray(KEYS.USER_ORDERS).forEach(order => {
      if (!order || !hasShipped(order.status) || !Array.isArray(order.items)) return;
      order.items.forEach(dish => {
        if (!dish) return;
        const key = String(dish.id);
        const qty = (typeof dish.quantity === 'number' && dish.quantity > 0) ? dish.quantity : 1;
        shippedSalesMap[key] = (shippedSalesMap[key] || 0) + qty;
      });
    });
    this.setData({ shippedSalesMap });
  },

  // 点击更换海报背景
  changeBg() {
    if (this._savingBg) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res && res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tempFilePath) return;
        const oldPath = wx.getStorageSync(KEYS.CUSTOM_BG);
        this.setData({ bgImage: tempFilePath });
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fs || typeof wx.saveFile !== 'function') {
          wx.setStorageSync(KEYS.CUSTOM_BG, tempFilePath);
          return;
        }
        this._savingBg = true;
        wx.saveFile({
          tempFilePath,
          success: (saveRes) => {
            const savedPath = saveRes.savedFilePath;
            wx.setStorageSync(KEYS.CUSTOM_BG, savedPath);
            this.setData({ bgImage: savedPath });
            if (oldPath && oldPath !== savedPath) {
              fs.unlink({ filePath: oldPath, fail: () => {} });
            }
          },
          fail: () => wx.showToast({ title: '背景保存失败，本次仍可使用', icon: 'none' }),
          complete: () => { this._savingBg = false; }
        });
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

  // 清空购物车：同时清理 cart / cartMap / totalCount / totalAmount / selected 标记 / 弹窗展示状态 / 口味备注
  clearCart() {
    this.applyCart([], { showCartModal: false, tasteRemark: '', tagActive: {} });
  },

  // ---- 口味备注 ----
  // 从备注文本解析出各快捷标签的选中态（自由输入与标签共存，文本是唯一数据源）
  refreshTagActive(remark) {
    const segs = (remark || '').split(/[，,、;；\s]+/).filter(Boolean);
    const tagActive = {};
    this.data.tasteTags.forEach(tag => { tagActive[tag] = segs.indexOf(tag) > -1; });
    return tagActive;
  },

  // 点击快捷标签：追加 / 再次点击移除
  toggleTasteTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const segs = this.data.tasteRemark.split(/[，,、;；\s]+/).filter(Boolean);
    const idx = segs.indexOf(tag);
    if (idx > -1) segs.splice(idx, 1);
    else segs.push(tag);
    const tasteRemark = segs.join('，');
    this.setData({ tasteRemark, tagActive: this.refreshTagActive(tasteRemark) });
  },

  // 自由输入备注
  onRemarkInput(e) {
    const tasteRemark = e.detail.value;
    this.setData({ tasteRemark, tagActive: this.refreshTagActive(tasteRemark) });
  },

  // quantity 安全转换：undefined / null / 空串 / NaN / 非数字字符串一律按 1 份处理；
  // 数字与数字字符串（如 "2"）统一转成数字，最小值 0，向下取整，
  // 从源头杜绝 "1" + 1 = "11" 一类的字符串拼接和 NaN 传染
  toQuantity(value) {
    const n = Number(value);
    if (value === undefined || value === null || String(value).trim() === '' || Number.isNaN(n)) {
      return 1;
    }
    return Math.max(0, Math.floor(n));
  },

  // 统一购物车更新出口：
  // 1) quantity 安全归一化（转数字、最小 0），数量为 0 的记录自动移除
  // 2) checked 结算勾选：旧数据/新入车默认勾选，显式取消(false)原样保留
  // 3) 以 cart 为准重建 cartMap 索引表 —— cart 是唯一数据源，cartMap 单向派生，永不冲突
  // 4) 总份数 totalCount 用 quantity 求和（不使用数组 length），同步 totalAmount 与 menuList.selected
  applyCart(rawCart, extra = {}) {
    const { menuList: nextMenuList, ...restExtra } = extra;
    const cart = (Array.isArray(rawCart) ? rawCart : [])
      .map(item => ({
        ...item,
        quantity: this.toQuantity(item.quantity),
        checked: item.checked !== false
      }))
      .filter(item => item.quantity > 0);

    // cartMap：id → 购物车记录，key 统一转字符串以兼容数字/字符串 id
    const cartMap = {};
    cart.forEach(item => { cartMap[String(item.id)] = item; });

    // 总份数 = Σ quantity；总金额仅统计能解析为数字的奖励/代价
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cart.reduce((sum, item) => sum + getItemAmount(item) * item.quantity, 0);

    // 结算勾选统计
    const checkedCount = cart.filter(item => item.checked).length;
    const allChecked = checkedCount > 0 && checkedCount === cart.length;

    // selected 与购物车状态保持一致：在车即 true，不在车即 false
    const sourceMenu = Array.isArray(nextMenuList) ? nextMenuList : this.data.menuList;
    const menuList = sourceMenu.map(item => ({
      ...item,
      selected: cart.some(c => String(c.id) === String(item.id))
    }));

    this.setData({ cart, cartMap, totalCount, totalAmount, checkedCount, allChecked, menuList, ...restExtra }, () => {
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
    const { activeCategory, searchKey, cartMap } = this.data;
    const hasSearch = searchKey.trim() !== '';
    let newCategory = activeCategory;

    // 1. 分类筛选
    if (!hasSearch && activeCategory !== '全部') {
      list = list.filter(item => item.category === activeCategory);
    }

    // 2. 搜索：模糊匹配 名称 / 描述 / 分类 / 标签；支持空格分词（每个词都需命中任一字段）
    if (searchKey.trim() !== '') {
      const keywords = searchKey.trim().toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(item => {
        const haystack = [item.name, item.desc, item.category]
          .concat(Array.isArray(item.tags) ? item.tags : [])
          .map(field => String(field || '').toLowerCase());
        return keywords.every(k => haystack.some(h => h.indexOf(k) > -1));
      });

      // 搜索时自动切换到第一个结果所属的分类
      if (list.length > 0 && list[0].category !== activeCategory) {
        newCategory = list[0].category;
      }
    }

    // 3. 附上购物车数量 / 月销 / 描述 / 标签 / 库存（生成新对象，避免污染原始菜单数据）
    //    月销展示值 = 菜品 monthSales 基数（旧数据缺失按 0） + 已出单订单累计份数
    const { shippedSalesMap } = this.data;
    const filteredMenuList = list.map(item => {
      const inCart = cartMap[String(item.id)];
      const stock = typeof item.stock === 'number' ? item.stock : null;
      const soldOut = item.onSale === false || (stock !== null && stock <= 0);
      return {
        ...item,
        quantity: inCart ? inCart.quantity : 0,
        monthSales: (typeof item.monthSales === 'number' ? item.monthSales : 0) + (shippedSalesMap[String(item.id)] || 0),
        descShow: item.desc || '',
        tagsShow: (Array.isArray(item.tags) ? item.tags : []).slice(0, 2),
        stockText: stock === null ? '库存充足' : (stock <= 0 ? '售罄' : `库存 ${stock}`),
        soldOut
      };
    });

    this.setData({ filteredMenuList, activeCategory: newCategory });
  },

  // ---- 搜索历史与热门搜索 ----
  loadSearchHistory() {
    // 最多 10 条、去重、最新在前（写入时已保证，读取再兜底）
    this.setData({ searchHistory: readArray(KEYS.SEARCH_HISTORY).slice(0, 10) });
  },

  // 保存搜索历史：相同关键词不重复、新搜索移动到最前面、最多 10 条
  saveHistory(keyword) {
    const key = (keyword || '').trim();
    if (!key) return;
    let history = readArray(KEYS.SEARCH_HISTORY).filter(k => k !== key);
    history.unshift(key);
    history = history.slice(0, 10);
    writeArray(KEYS.SEARCH_HISTORY, history);
    this.setData({ searchHistory: history });
  },

  // 键盘确认搜索：记录历史并刷新结果
  onSearchConfirm(e) {
    const key = (e.detail.value || '').trim();
    this.setData({ searchKey: key }, () => this.updateFilteredList());
    if (key) this.saveHistory(key);
  },

  // 点击搜索历史：直接再次搜索（该关键词移动到最前面）
  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword;
    if (!keyword) return;
    this.setData({ searchKey: keyword }, () => this.updateFilteredList());
    this.saveHistory(keyword);
  },

  // 点击热门搜索：直接搜索该菜品名
  onHotTap(e) {
    const keyword = e.currentTarget.dataset.keyword;
    if (!keyword) return;
    this.setData({ searchKey: keyword }, () => this.updateFilteredList());
    this.saveHistory(keyword);
  },

  // 清空搜索历史
  clearSearchHistory() {
    writeArray(KEYS.SEARCH_HISTORY, []);
    this.setData({ searchHistory: [] });
    wx.showToast({ title: '已清空搜索历史', icon: 'none' });
  },

  // 点击左侧分类标签
  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ activeCategory: category }, () => {
      this.updateFilteredList();
    });
  },

  // 选择菜品（点击菜品行 / “+”按钮 / 推荐卡片“+”）：首次加入 quantity = 1，再次选择同一道菜 quantity + 1
  increaseQuantity(e) {
    const result = this.addToCartById(e.currentTarget.dataset.id);
    if (result === -1) {
      wx.showToast({ title: '该菜品已售罄或下架', icon: 'none' });
    } else if (result === -2) {
      wx.showToast({ title: '库存不足，无法继续添加', icon: 'none' });
    }
  },

  // 加菜统一入口（页内按钮、推荐卡片、菜品详情页共用）：
  // 与 cartMap/applyCart 同一条数量管线 —— 同一道菜只存在一条记录，quantity 安全累加
  // 返回该菜品加入后的最新份数；菜品不存在返回 0
  addToCartById(id) {
    const dish = this.data.menuList.find(m => String(m.id) === String(id));
    if (!dish) return 0;

    // 售罄 / 下架拦截（返回 -1 由调用方提示）
    if (dish.onSale === false || (typeof dish.stock === 'number' && dish.stock <= 0)) {
      return -1;
    }

    // 通过 cartMap（与 cart 同步的索引表）查找已有记录，保证同一道菜只存在一条记录
    const existing = this.data.cartMap[String(id)];
    let cart;
    if (existing) {
      // 已在购物车：库存上限校验（不限库存菜品不限制），防止超库存购买
      const stock = typeof dish.stock === 'number' ? dish.stock : null;
      if (stock !== null && existing.quantity + 1 > stock) {
        return -2;
      }
      // 同一条记录安全 +1（toQuantity 防止字符串拼接与 NaN）
      cart = this.data.cart.map(c => (String(c.id) === String(id) ? { ...c, quantity: this.toQuantity(c.quantity) + 1 } : c));
    } else {
      // 首次加入：复制菜品入车（不引用 menuList 对象，避免相互污染），quantity 固定为数字 1
      cart = [...this.data.cart, {
        id: dish.id,
        name: dish.name,
        price: dish.price,
        amount: getItemAmount(dish),
        category: dish.category,
        icon: dish.icon,
        image: dish.image,
        quantity: 1
      }];
    }
    this.applyCart(cart);

    const inCart = cart.find(c => String(c.id) === String(id));
    return inCart.quantity;
  },

  // 数量 -1：减到 0 自动删除该记录，cartMap / 总份数 / 总金额 / 弹窗状态由 applyCart 统一联动更新
  decreaseQuantity(e) {
    const id = e.currentTarget.dataset.id;
    const existing = this.data.cartMap[String(id)];
    if (!existing) return;

    const next = this.toQuantity(existing.quantity) - 1;
    let cart;
    if (next <= 0) {
      // 数量减到 0：从购物车数组中移除该记录
      cart = this.data.cart.filter(c => String(c.id) !== String(id));
    } else {
      cart = this.data.cart.map(c => (String(c.id) === String(id) ? { ...c, quantity: next } : c));
    }

    // 如果购物车删空了，自动收起展开框（进入空购物车状态）
    const showCartModal = cart.length === 0 ? false : this.data.showCartModal;
    this.applyCart(cart, { showCartModal });
  },

  // 占位：拦截步进器区域点击，避免冒泡触发菜品行的加菜逻辑
  noop() {},

  // ---- 结算勾选 ----
  // 勾选/取消勾选单个菜品（只影响结算范围，数量与顺序不变）
  toggleCartChecked(e) {
    const id = e.currentTarget.dataset.id;
    const cart = this.data.cart.map(c => (String(c.id) === String(id) ? { ...c, checked: !c.checked } : c));
    this.applyCart(cart);
  },

  // 全选 / 取消全选
  checkAllCart() {
    const target = !this.data.allChecked;
    const cart = this.data.cart.map(c => ({ ...c, checked: target }));
    this.applyCart(cart);
  },

  // 直接删除购物车中的单个菜品（不经数量递减）
  removeCartItem(e) {
    const id = e.currentTarget.dataset.id;
    const cart = this.data.cart.filter(c => String(c.id) !== String(id));
    // 如果购物车删空了，自动收起展开框
    const showCartModal = cart.length === 0 ? false : this.data.showCartModal;
    this.applyCart(cart, { showCartModal });
  },

  // 供结算页读取：被勾选菜品的副本 + 已填写的口味备注（延续到结算页）
  getCheckedCart() {
    return {
      items: this.data.cart.filter(c => c.checked).map(c => ({ ...c })),
      remark: this.data.tasteRemark || ''
    };
  },

  // 去结算：只携带被勾选的菜品进入结算页，未勾选的继续留在购物车
  goCheckout() {
    if (this.data.checkedCount === 0) {
      wx.showToast({ title: '请先勾选要结算的菜品', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/checkout/checkout' });
  },

  // 结算成功后的回调（由结算页调用）：只移除已购买的菜品，未勾选的保留；
  // 口味备注随订单完成复位；购物车删空时收起弹窗
  completeCheckout(purchasedIds) {
    const ids = (Array.isArray(purchasedIds) ? purchasedIds : []).map(String);
    const cart = this.data.cart.filter(c => ids.indexOf(String(c.id)) === -1);
    const showCartModal = cart.length === 0 ? false : this.data.showCartModal;
    this.applyCart(cart, { showCartModal, tasteRemark: '', tagActive: {} });
  }
})