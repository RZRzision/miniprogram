const { KEYS, readArray, readObject, writeArray, toAmount, getItemAmount, genId, formatDate, DEFAULT_CATEGORIES } = require('../../utils/storage.js');
// 商家/厨房端与用户端共用同一份 user_orders 与同一个状态机，禁止另建订单数据副本
const { normalizeStatus, nextStatus, prevStatus, canCancel, statusCls, hasShipped } = require('../../utils/order-status.js');
const { restoreStock } = require('../../utils/stock.js');

Page({
  data: {
    categories: [],
    categoryIndex: 0,
    iconList: ['🍗', '🥩', '🍳', '🥔', '🧋', '🥟', '🍤', '🍜', '🍲', '🍧', '🍕', '🍰'],
    form: {
      name: '',
      price: '',
      amount: '',
      category: '硬菜',
      icon: '🍗',
      desc: '',
      stock: '50',
      stockWarn: '5',
      image: ''
    },
    editingId: null,   // 非空 = 编辑模式
    menuList: [],
    kitchenOrders: [],
    // 经营 Dashboard（全部实时派生自 user_orders 与菜单，无任何写死数字）
    today: '',
    shopName: '',
    dashboard: {
      todayOrders: 0,
      todayRevenue: 0,
      todaySales: 0,
      pending: 0,    // 待接单
      cooking: 0,    // 制作中
      waitShip: 0,   // 待出单（= 已接单状态：已接单、等待制作出餐）
      shipped: 0,    // 已出单
      done: 0,       // 已完成
      dishCount: 0,
      soldOut: 0
    }
  },

  onShow() {
    this.loadCategories();
    this.loadMenuList();
    this.loadKitchenOrders();
    this.refreshDashboard();
  },

  // 分类列表存储驱动（分类管理页维护；空数据回退默认分类）
  loadCategories() {
    const cats = readArray(KEYS.CATEGORIES);
    const list = cats.length > 0 ? cats : DEFAULT_CATEGORIES;
    // 当前表单分类被删除时回落到第一个
    const formCategory = list.indexOf(this.data.form.category) > -1 ? this.data.form.category : list[0];
    this.setData({ categories: list, categoryIndex: list.indexOf(formCategory), 'form.category': formCategory });
  },

  // ---- 经营 Dashboard ----
  // 单笔订单金额：结算订单用实付快照；普通订单按数值奖励×数量现算（文案型奖励不计入）
  orderRevenue(o) {
    if (!o) return 0;
    if (typeof o.payable === 'number') return Math.max(0, o.payable);
    let sum = 0;
    (Array.isArray(o.items) ? o.items : []).forEach(it => {
      if (!it) return;
      const qty = (typeof it.quantity === 'number' && it.quantity > 0) ? it.quantity : 1;
      sum += getItemAmount(it) * qty;
    });
    return Math.max(0, toAmount(sum));
  },

  refreshDashboard() {
    const orders = readArray(KEYS.USER_ORDERS);
    const todayStr = formatDate(new Date());
    const isToday = (o) => !!(o && typeof o.time === 'string' && o.time.slice(0, 10) === todayStr);

    // 今日有效订单（排除已取消）→ 今日订单 / 今日营业额
    const todayValid = orders.filter(o => isToday(o) && normalizeStatus(o) !== '已取消');
    const todayRevenue = toAmount(todayValid.reduce((sum, o) => sum + this.orderRevenue(o), 0));

    // 今日销量：当天已出单（含已完成）订单的菜品份数 —— 与月销同口径，派生统计不会被重复累计
    const todaySales = orders
      .filter(o => isToday(o) && hasShipped(normalizeStatus(o)))
      .reduce((sum, o) => {
        if (!o || !Array.isArray(o.items)) return sum;
        return sum + o.items.reduce((s, it) => {
          if (!it) return s;
          return s + ((typeof it.quantity === 'number' && it.quantity > 0) ? it.quantity : 1);
        }, 0);
      }, 0);

    // 状态分布（全量订单，含今天以外的历史）
    const counts = { 待接单: 0, 已接单: 0, 制作中: 0, 已出单: 0, 已完成: 0, 已取消: 0 };
    orders.forEach(o => { counts[normalizeStatus(o)] += 1; });

    const menu = readArray(KEYS.MENU_LIST);
    const soldOut = menu.filter(d => d && typeof d.stock === 'number' && d.stock <= 0).length;

    const settings = readObject(KEYS.SETTINGS, {});
    this.setData({
      today: todayStr,
      shopName: typeof settings.shopName === 'string' && settings.shopName ? settings.shopName : '',
      dashboard: {
        todayOrders: todayValid.length,
        todayRevenue,
        todaySales,
        pending: counts['待接单'],
        cooking: counts['制作中'],
        waitShip: counts['已接单'],
        shipped: counts['已出单'],
        done: counts['已完成'],
        dishCount: menu.length,
        soldOut
      }
    });
  },

  // 快捷入口（10 个全部真实跳转）
  goQuick(e) {
    const routes = {
      orders: () => wx.switchTab({ url: '/pages/order/order' }),
      kitchen: () => wx.pageScrollTo({ selector: '#kitchen-section', duration: 300 }),
      dish: () => wx.pageScrollTo({ selector: '#dish-form', duration: 300 }),
      category: () => wx.navigateTo({ url: '/pages/category/category' }),
      stock: () => wx.navigateTo({ url: '/pages/stock/stock' }),
      tables: () => wx.navigateTo({ url: '/pages/tables/tables' }),
      coupons: () => wx.navigateTo({ url: '/pages/coupons/coupons' }),
      settings: () => wx.navigateTo({ url: '/pages/settings/settings' }),
      stats: () => wx.navigateTo({ url: '/pages/shop-stats/shop-stats' }),
      data: () => wx.navigateTo({ url: '/pages/data-manage/data-manage' })
    };
    const route = routes[e.currentTarget.dataset.action];
    if (route) route();
  },

  // 读取本地存储的菜单（脏数据兜底为空数组），并附加售罄 / 库存预警 / 上下架展示态
  loadMenuList() {
    this.setData({ menuList: readArray(KEYS.MENU_LIST).map(d => this.decorateDish(d)) });
  },

  // 菜品展示态装饰：售罄（库存 0）/ 库存预警（0 < stock ≤ stockWarn，旧数据预警值默认 5）/ 上下架
  decorateDish(d) {
    const dish = d && typeof d === 'object' ? d : {};
    const stock = typeof dish.stock === 'number' ? dish.stock : null;
    const stockWarn = typeof dish.stockWarn === 'number' ? dish.stockWarn : 5;
    const soldOut = stock !== null && stock <= 0;
    return {
      ...dish,
      stockText: stock === null ? '不限' : String(stock),
      soldOut,
      lowStock: !soldOut && stock !== null && stock <= stockWarn,
      onSale: dish.onSale !== false,
      descShow: typeof dish.desc === 'string' ? dish.desc : ''
    };
  },

  onInputName(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onInputPrice(e) {
    this.setData({ 'form.price': e.detail.value });
  },

  onInputAmount(e) {
    this.setData({ 'form.amount': e.detail.value });
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

  // ---- 菜品编辑辅助 ----
  blankForm() {
    return {
      name: '',
      price: '',
      amount: '',
      category: this.data.categories[0] || '硬菜',
      icon: '🍗',
      desc: '',
      stock: '50',
      stockWarn: '5',
      image: ''
    };
  },

  // 任意输入安全转非负整数（库存 / 预警值）
  toInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  },

  // 进入编辑：表单预填（月销不进入表单，不可被商家修改）
  startEdit(e) {
    const id = e.currentTarget.dataset.id;
    const dish = this.data.menuList.find(m => String(m.id) === String(id));
    if (!dish) return;
    const catIdx = Math.max(0, this.data.categories.indexOf(dish.category));
    this.setData({
      editingId: dish.id,
      categoryIndex: catIdx,
      form: {
        name: dish.name || '',
        price: dish.price || '',
        amount: typeof dish.amount === 'number' ? String(dish.amount) : '',
        category: this.data.categories[catIdx] || '硬菜',
        icon: dish.icon || '🍗',
        desc: typeof dish.desc === 'string' ? dish.desc : '',
        stock: typeof dish.stock === 'number' ? String(dish.stock) : '50',
        stockWarn: typeof dish.stockWarn === 'number' ? String(dish.stockWarn) : '5',
        image: typeof dish.image === 'string' ? dish.image : ''
      }
    });
    wx.pageScrollTo({ selector: '#dish-form', duration: 300 });
  },

  // 取消编辑，回到新增模式
  cancelEdit() {
    this.setData({ editingId: null, form: this.blankForm() });
  },

  // 保存菜品（新增 / 编辑统一出口）
  // 月销不在表单中：编辑时原值保留，只能由订单进入「已出单」驱动（初始基数仅来自种子数据）
  saveDish() {
    const { form, editingId, categories } = this.data;
    const name = form.name.trim();
    const price = form.price.trim();
    if (!name || !price) {
      wx.showToast({ title: '请填写名称和奖励', icon: 'none' });
      return;
    }
    const stock = this.toInt(form.stock, 50);
    const stockWarn = this.toInt(form.stockWarn, 5);
    const amount = Math.max(0, toAmount(form.amount));
    const category = categories.indexOf(form.category) > -1 ? form.category : (categories[0] || '硬菜');

    if (editingId) {
      // 编辑：id / monthSales / tags 等非表单字段原样保留
      const list = this.data.menuList.map(d => (String(d.id) === String(editingId) ? {
        ...d,
        name,
        price,
        amount,
        category,
        icon: form.icon || '🍗',
        desc: (form.desc || '').trim(),
        stock,
        stockWarn,
        image: form.image || ''
      } : d));
      writeArray(KEYS.MENU_LIST, list);
      this.setData({ menuList: list.map(x => this.decorateDish(x)), editingId: null, form: this.blankForm() });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } else {
      const newDish = {
        id: genId(),
        name,
        price,
        amount,
        category,
        icon: form.icon || '🍗',
        selected: false,
        monthSales: 0,      // 新菜品月销基数从 0 开始，由订单已出单驱动
        onSale: true,
        stock,
        stockWarn,
        desc: (form.desc || '').trim(),
        tags: [],
        image: form.image || ''
      };
      const list = [newDish, ...this.data.menuList];
      writeArray(KEYS.MENU_LIST, list);
      this.setData({ menuList: list.map(x => this.decorateDish(x)), form: this.blankForm() });
      wx.showToast({ title: '添加成功！', icon: 'success' });
    }
  },

  // 上下架（列表行内快捷切换）
  toggleDishSale(e) {
    const id = e.currentTarget.dataset.id;
    const menu = readArray(KEYS.MENU_LIST);
    writeArray(KEYS.MENU_LIST, menu.map(d => (String(d && d.id) === String(id) ? { ...d, onSale: !(d.onSale !== false) } : d)));
    this.loadMenuList();
  },

  // 菜品图片（相册/拍摄，本地 saveFile 持久化）
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tmp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tmp) return;
        const fsm = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fsm) {
          this.setData({ 'form.image': tmp });
          return;
        }
        fsm.saveFile({
          tempFilePath: tmp,
          success: (r) => this.setData({ 'form.image': r.savedFilePath || tmp }),
          fail: () => this.setData({ 'form.image': tmp })
        });
      }
    });
  },

  clearImage() {
    this.setData({ 'form.image': '' });
  },

  onInputDesc(e) { this.setData({ 'form.desc': e.detail.value }); },
  onInputStock(e) { this.setData({ 'form.stock': e.detail.value }); },
  onInputStockWarn(e) { this.setData({ 'form.stockWarn': e.detail.value }); },

  // 删除菜品
  deleteDish(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要下架这道菜吗？',
      success: (res) => {
        if (res.confirm) {
          const list = this.data.menuList.filter(item => String(item.id) !== String(id));
          writeArray(KEYS.MENU_LIST, list);
          this.setData({ menuList: list });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // ---- 厨房/商家端：订单状态流转（直接读写 user_orders，与用户端同一份数据） ----
  loadKitchenOrders() {
    const kitchenOrders = readArray(KEYS.USER_ORDERS)
      .slice()
      .sort((a, b) => a.id - b.id) // 先点的单先做
      .map(order => {
        const o = order && typeof order === 'object' ? order : {};
        const items = Array.isArray(o.items) ? o.items : [];
        const status = normalizeStatus(o);
        return {
          id: o.id,
          time: typeof o.time === 'string' ? o.time : '',
          status,
          statusCls: statusCls(status),
          itemsText: items
            .map(d => (d && d.name ? `${d.name}×${(typeof d.quantity === 'number' && d.quantity > 0) ? d.quantity : 1}` : ''))
            .filter(Boolean)
            .join('、'),
          tasteRemark: typeof o.tasteRemark === 'string' ? o.tasteRemark : '',
          nextStatus: nextStatus(status),
          prevStatus: prevStatus(status),
          canCancel: canCancel(status)
        };
      });
    this.setData({ kitchenOrders });
  },

  // 防抖：同一订单 500ms 内的重复点击只执行一次，避免连点跳过状态
  guardOrderAction(id) {
    const now = Date.now();
    this._actionLocks = this._actionLocks || {};
    if (now - (this._actionLocks[id] || 0) < 500) {
      return false;
    }
    this._actionLocks[id] = now;
    return true;
  },

  // 推进状态：待接单 → 已接单 → 制作中 → 已出单 → 已完成；终态重复推进自动无效
  advanceOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!this.guardOrderAction(id)) return;

    const orders = readArray(KEYS.USER_ORDERS);
    const target = orders.find(o => String(o && o.id) === String(id));
    if (!target) return;

    const next = nextStatus(normalizeStatus(target));
    if (!next) {
      wx.showToast({ title: '订单已完结', icon: 'none' });
      return;
    }

    writeArray(KEYS.USER_ORDERS, orders.map(o => (String(o.id) === String(id) ? { ...o, status: next } : o)));
    this.loadKitchenOrders();
    wx.showToast({ title: `已推进：${next}`, icon: 'none' });
  },

  // 回退状态：处理“点错/撤销”，已出单回退后月销贡献自动抵消（派生统计）
  rollbackOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!this.guardOrderAction(id)) return;

    const orders = readArray(KEYS.USER_ORDERS);
    const target = orders.find(o => String(o && o.id) === String(id));
    if (!target) return;

    const prev = prevStatus(normalizeStatus(target));
    if (!prev) {
      wx.showToast({ title: '已是初始状态', icon: 'none' });
      return;
    }

    writeArray(KEYS.USER_ORDERS, orders.map(o => (String(o.id) === String(id) ? { ...o, status: prev } : o)));
    this.loadKitchenOrders();
    wx.showToast({ title: `已回退：${prev}`, icon: 'none' });
  },

  // 取消订单：仅出餐前允许；重复取消时状态已不在可取消范围，自动无效
  cancelOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!this.guardOrderAction(id)) return;

    const orders = readArray(KEYS.USER_ORDERS);
    const target = orders.find(o => String(o && o.id) === String(id));
    if (!target) return;

    const current = normalizeStatus(target);
    if (!canCancel(current)) {
      wx.showToast({ title: '当前状态不可取消', icon: 'none' });
      return;
    }

    // 取消时回补库存（stockSettled 标志保证只回补一次）
    if (target.stockSettled === true) {
      restoreStock(Array.isArray(target.items) ? target.items : []);
    }
    writeArray(KEYS.USER_ORDERS, orders.map(o => (String(o.id) === String(id) ? { ...o, status: '已取消', stockSettled: false } : o)));
    this.loadKitchenOrders();
    wx.showToast({ title: '订单已取消', icon: 'none' });
  }
})