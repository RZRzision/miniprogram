const { KEYS, readArray, readObject, writeArray, hasKey, getItemAmount, DEFAULT_CATEGORIES } = require('../../utils/storage.js');
const { hasShipped } = require('../../utils/order-status.js');

// 后端服务器地址
const API_BASE_URL = 'http://123.207.245.251:3000';

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
    totalAmount: 0,  // 总金额：仅累计可解析为数字的奖励/代价
    checkedCount: 0, // 已勾选菜品数（去结算的数量）
    allChecked: false,

    // 默认基础菜单（服务器连接失败时使用）
    menuList: [
      {
        id: 1,
        name: '可乐鸡翅',
        category: '硬菜',
        price: '需要一个抱抱',
        amount: 0,
        icon: '🍗',
        selected: false,
        monthSales: 128,
        desc: '鸡翅在可乐里泡了个甜蜜的澡，咸甜入魂，深夜食堂的镇店之宝。',
        tags: ['情侣推荐', '人气王'],
        onSale: true,
        stock: 50
      },
      {
        id: 2,
        name: '红烧肉',
        category: '硬菜',
        price: '洗碗一次',
        amount: 0,
        icon: '🥩',
        selected: false,
        monthSales: 86,
        desc: '肥而不腻，入口即化，吃完请自觉去洗碗。',
        tags: ['人气王'],
        onSale: true,
        stock: 30
      },
      {
        id: 3,
        name: '番茄炒蛋',
        category: '家常菜',
        price: '夸我一句',
        amount: 0,
        icon: '🍳',
        selected: false,
        monthSales: 99,
        desc: '经典家常味，番茄的酸遇上蛋的香，拌饭一绝。',
        tags: ['情侣推荐'],
        onSale: true,
        stock: 80
      },
      {
        id: 4,
        name: '酸辣土豆丝',
        category: '快手菜',
        price: '免费',
        amount: 0,
        icon: '🥔',
        selected: false,
        monthSales: 66,
        desc: '爽脆酸辣，五分钟出锅，深夜救急首选。',
        tags: ['深夜限定'],
        onSale: true,
        stock: 60
      },
      {
        id: 5,
        name: '冰镇奶茶',
        category: '甜品饮料',
        price: '给捶背10分钟',
        amount: 0,
        icon: '🧋',
        selected: false,
        monthSales: 42,
        desc: '深夜来一杯，杯杯见真心，捶背十分钟不能少。',
        tags: ['深夜限定', '情侣推荐'],
        onSale: true,
        stock: 40
      }
    ],

    filteredMenuList: [],

    // 推荐区域
    recommend: {
      today: [],
      couple: [],
      night: [],
      nightTip: '',
      sales: [],
      guess: [],
      hotSearches: []
    },

    // 搜索历史
    searchHistory: [],

    scrollIntoView: '',

    // 月销结算索引
    shippedSalesMap: {},

    // 口味备注
    tasteTags: [
      '少辣',
      '微辣',
      '正常',
      '重辣',
      '少盐',
      '清淡',
      '不要香菜',
      '不要葱',
      '少冰',
      '多冰'
    ],
    tasteRemark: '',
    tagActive: {}
  },

  /**
   * 从后端加载分类和菜品
   *
   * 后端接口：
   * GET /api/categories
   * GET /api/dishes
   *
   * 后端数据会转换成当前首页原本使用的数据结构，
   * 这样不会破坏现有 WXML、购物车和推荐逻辑。
   */
  loadMenuFromServer(callback) {
    wx.request({
      url: `${API_BASE_URL}/api/categories`,
      method: 'GET',

      success: (categoryRes) => {
        if (!categoryRes.data || !categoryRes.data.success) {
          console.error('获取服务器分类失败：', categoryRes.data);
          this.useLocalMenu(callback);
          return;
        }

        const categories = Array.isArray(categoryRes.data.data)
          ? categoryRes.data.data
          : [];

        wx.request({
          url: `${API_BASE_URL}/api/dishes`,
          method: 'GET',

          success: (dishRes) => {
            if (!dishRes.data || !dishRes.data.success) {
              console.error('获取服务器菜品失败：', dishRes.data);
              this.useLocalMenu(callback);
              return;
            }

            const dishes = Array.isArray(dishRes.data.data)
              ? dishRes.data.data
              : [];

            // 建立分类 ID → 分类名称映射
            const categoryMap = {};

            categories.forEach(item => {
              categoryMap[String(item.id)] = item.name;
            });

            // 把后端菜品转换成当前首页需要的数据结构
            const menuList = dishes.map(item => {
              const priceNumber = Number(item.price);

              return {
                id: item.id,
                name: item.name,

                // 后端使用 category_id，
                // 前端继续使用 category 名称进行筛选
                category: categoryMap[String(item.category_id)] || '其他',
                categoryId: item.category_id,

                // 当前后端使用真实金额
                price: Number.isNaN(priceNumber)
                  ? '¥0.00'
                  : `¥${priceNumber.toFixed(2)}`,

                amount: Number.isNaN(priceNumber)
                  ? 0
                  : priceNumber,

                // 后端暂时没有 icon，所以给一个默认图标
                icon: '🍽️',

                // 后端 image_url 对应当前前端 image
                image: item.image_url || '',

                selected: false,

                // 当前数据库暂时没有月销字段
                monthSales: 0,

                // 后端 description 对应前端 desc
                desc: item.description || '',
                description: item.description || '',

                // 当前数据库暂时没有 tags
                tags: [],

                // status = 1 表示在售
                onSale: item.status === 1,

                // 后端库存直接使用
                stock: typeof item.stock === 'number'
                  ? item.stock
                  : Number(item.stock) || 0
              };
            });

            // 服务器分类名称
            const categoryNames = categories.map(item => item.name);

            // 当前购物车中仍然存在于服务器菜单里的菜品
            const cart = this.data.cart.filter(cartItem => {
              return menuList.some(menuItem => {
                return String(menuItem.id) === String(cartItem.id);
              });
            });

            // 如果当前选择的分类已经不存在，则回到“全部”
            const currentCategory = this.data.activeCategory;
            const activeCategory =
              currentCategory === '全部' ||
              categoryNames.indexOf(currentCategory) > -1
                ? currentCategory
                : '全部';

            this.setData({
              categories: ['全部', ...categoryNames],
              activeCategory,
              menuList
            }, () => {
              // 用服务器菜单重新同步购物车
              this.applyCart(cart, {}, () => {
                console.log(
                  '服务器菜单加载成功，共获取',
                  menuList.length,
                  '道菜品'
                );

                if (typeof callback === 'function') {
                  callback();
                }
              });
            });
          },

          fail: (error) => {
            console.error('请求服务器菜品失败：', error);
            this.useLocalMenu(callback);
          }
        });
      },

      fail: (error) => {
        console.error('请求服务器分类失败：', error);
        this.useLocalMenu(callback);
      }
    });
  },

  /**
   * 后端请求失败时使用本地菜单
   * 保证服务器暂时不可用时首页不会直接白屏。
   */
  useLocalMenu(callback) {
    console.warn('服务器连接失败，暂时使用本地菜单');

    this.loadCategories();

    const customMenu = readArray(KEYS.MENU_LIST);

    if (hasKey(KEYS.MENU_LIST)) {
      const cart = this.data.cart.filter(c =>
        customMenu.some(m => String(m.id) === String(c.id))
      );

      this.applyCart(cart, {
        menuList: customMenu
      }, () => {
        if (typeof callback === 'function') {
          callback();
        }
      });
    } else {
      writeArray(KEYS.MENU_LIST, this.data.menuList);

      const cart = this.data.cart.filter(c =>
        this.data.menuList.some(m => String(m.id) === String(c.id))
      );

      this.applyCart(cart, {}, () => {
        if (typeof callback === 'function') {
          callback();
        }
      });
    }
  },

  onLoad() {
    // 读取自定义海报背景，并验证本地文件是否仍存在
    const savedBg = wx.getStorageSync(KEYS.CUSTOM_BG);

    if (!savedBg) return;

    const fs = wx.getFileSystemManager
      ? wx.getFileSystemManager()
      : null;

    if (!fs) {
      this.setData({
        bgImage: savedBg
      });
      return;
    }

    fs.access({
      path: savedBg,

      success: () => {
        this.setData({
          bgImage: savedBg
        });
      },

      fail: () => {
        wx.removeStorageSync(KEYS.CUSTOM_BG);

        this.setData({
          bgImage: ''
        });
      }
    });
  },

  // 每次进入点餐页时，从服务器同步最新菜单
  onShow() {
    // 月销统计依赖订单状态
    this.rebuildSalesMap();

    // 从后端加载分类和菜品
    this.loadMenuFromServer(() => {
      // 推荐区域依赖最新菜单与月销索引
      this.buildRecommendations();

      // 搜索历史仍然使用本地 Storage
      this.loadSearchHistory();

      // 处理从菜谱页跳转回来的菜品
      this.handlePendingSelect();
    });
  },

  // 菜谱页“去点这道菜”跳转回来后：
  // 自动切换分类、定位并短暂高亮目标菜品。
  handlePendingSelect() {
    const app = getApp();

    const targetId =
      app.globalData &&
      app.globalData.pendingSelectDishId;

    if (
      targetId === undefined ||
      targetId === null ||
      targetId === ''
    ) {
      return;
    }

    app.globalData.pendingSelectDishId = null;

    const dish = this.data.menuList.find(
      d => String(d.id) === String(targetId)
    );

    if (!dish) {
      wx.showToast({
        title: '这道菜已下架，下次再来吧~',
        icon: 'none'
      });
      return;
    }

    this.setData({
      activeCategory: dish.category || '全部',
      searchKey: ''
    }, () => {
      this.updateFilteredList();

      this.setData({
        scrollIntoView: `dish-${dish.id}`
      });
    });
  },

  // 分类侧栏：本地分类管理仍然保留
  // 后端正常时首页使用服务器分类。
  loadCategories() {
    const cats = readArray(KEYS.CATEGORIES);

    const list = cats.length > 0
      ? cats
      : DEFAULT_CATEGORIES;

    const active =
      this.data.activeCategory === '全部' ||
      list.indexOf(this.data.activeCategory) > -1
        ? this.data.activeCategory
        : '全部';

    this.setData({
      categories: ['全部', ...list],
      activeCategory: active
    });
  },

  // ---- 推荐区域 ----

  buildRecommendations() {
    const available = this.data.menuList
      .filter(d =>
        d.onSale !== false &&
        !(typeof d.stock === 'number' && d.stock <= 0)
      )
      .map(d => ({
        ...d,

        monthSales:
          (typeof d.monthSales === 'number'
            ? d.monthSales
            : 0) +
          (this.data.shippedSalesMap[String(d.id)] || 0),

        desc:
          d.desc ||
          '大厨还没有写介绍~',

        tagsShow:
          (Array.isArray(d.tags)
            ? d.tags
            : []
          ).slice(0, 2)
      }))
      .sort((a, b) =>
        b.monthSales - a.monthSales
      );

    const cap = (list, n) =>
      list.slice(0, n);

    // 今日推荐：按日期确定性轮换
    const daySeed =
      Math.floor(Date.now() / 86400000);

    const rotated = available.map(
      (_, i) =>
        available[
          (i + daySeed) % available.length
        ]
    );

    // 情侣推荐
    const couple =
      available.filter(d =>
        (d.tags || []).indexOf('情侣推荐') > -1
      );

    // 深夜推荐
    const hour = new Date().getHours();

    const settings =
      readObject(KEYS.SETTINGS, {});

    const nightStart =
      (
        typeof settings.nightStart === 'number' &&
        settings.nightStart >= 0 &&
        settings.nightStart <= 23
      )
        ? settings.nightStart
        : 21;

    const deepNight =
      hour >= nightStart ||
      hour < 5;

    const night =
      available.filter(d =>
        (d.tags || []).indexOf('深夜限定') > -1
      );

    const nightDrink =
      available.filter(d =>
        d.category === '甜品饮料'
      );

    // 猜你喜欢
    const favorites =
      readArray(KEYS.FAVORITES).map(String);

    const recentViews =
      readArray(KEYS.RECENT_VIEWS).map(String);

    const recentBought = [];

    readArray(KEYS.USER_ORDERS)
      .slice(-5)
      .forEach(order => {
        (
          order &&
          Array.isArray(order.items)
            ? order.items
            : []
        ).forEach(d => {
          if (
            d &&
            d.id !== undefined &&
            recentBought.indexOf(String(d.id)) === -1
          ) {
            recentBought.push(String(d.id));
          }
        });
      });

    const scored = available
      .map(d => {
        const key = String(d.id);

        let score =
          Math.min(
            3,
            d.monthSales / 50
          );

        if (favorites.indexOf(key) > -1) {
          score += 3;
        }

        if (recentBought.indexOf(key) > -1) {
          score += 2;
        }

        if (recentViews.indexOf(key) > -1) {
          score += 1;
        }

        return {
          ...d,
          guessScore: score
        };
      })
      .sort((a, b) =>
        b.guessScore - a.guessScore ||
        b.monthSales - a.monthSales
      );

    // 热门搜索
    const hotSearches = [];

    available.forEach(d => {
      if (
        hotSearches.indexOf(d.name) === -1 &&
        hotSearches.length < 5
      ) {
        hotSearches.push(d.name);
      }
    });

    this.setData({
      recommend: {
        today: cap(rotated, 6),

        couple: cap(
          couple.length > 0
            ? couple
            : available,
          6
        ),

        night: cap(
          night.length > 0
            ? night
            : (
              nightDrink.length > 0
                ? nightDrink
                : available
            ),
          6
        ),

        nightTip:
          deepNight
            ? '夜深了，来点慰藉吧 🌙'
            : '先种草，深夜再吃 🌙',

        sales: cap(available, 6),

        guess: cap(scored, 4),

        hotSearches
      }
    });
  },

  // 点击推荐卡片 / 菜品进入详情页
  goDetail(e) {
    wx.navigateTo({
      url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}`
    });
  },

  // 月销派生统计
  rebuildSalesMap() {
    const shippedSalesMap = {};

    readArray(KEYS.USER_ORDERS)
      .forEach(order => {
        if (
          !order ||
          !hasShipped(order.status) ||
          !Array.isArray(order.items)
        ) {
          return;
        }

        order.items.forEach(dish => {
          if (!dish) return;

          const key = String(dish.id);

          const qty =
            (
              typeof dish.quantity === 'number' &&
              dish.quantity > 0
            )
              ? dish.quantity
              : 1;

          shippedSalesMap[key] =
            (shippedSalesMap[key] || 0) +
            qty;
        });
      });

    this.setData({
      shippedSalesMap
    });
  },

  // 点击更换海报背景
  changeBg() {
    if (this._savingBg) return;

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],

      success: (res) => {
        const tempFilePath =
          res &&
          res.tempFiles &&
          res.tempFiles[0] &&
          res.tempFiles[0].tempFilePath;

        if (!tempFilePath) return;

        const oldPath =
          wx.getStorageSync(
            KEYS.CUSTOM_BG
          );

        this.setData({
          bgImage: tempFilePath
        });

        const fs =
          wx.getFileSystemManager
            ? wx.getFileSystemManager()
            : null;

        if (
          !fs ||
          typeof wx.saveFile !== 'function'
        ) {
          wx.setStorageSync(
            KEYS.CUSTOM_BG,
            tempFilePath
          );
          return;
        }

        this._savingBg = true;

        wx.saveFile({
          tempFilePath,

          success: (saveRes) => {
            const savedPath =
              saveRes.savedFilePath;

            wx.setStorageSync(
              KEYS.CUSTOM_BG,
              savedPath
            );

            this.setData({
              bgImage: savedPath
            });

            if (
              oldPath &&
              oldPath !== savedPath
            ) {
              fs.unlink({
                filePath: oldPath,
                fail: () => {}
              });
            }
          },

          fail: () => {
            wx.showToast({
              title: '背景保存失败，本次仍可使用',
              icon: 'none'
            });
          },

          complete: () => {
            this._savingBg = false;
          }
        });
      }
    });
  },

  // 开关底部的已选清单弹窗
  toggleCartModal() {
    if (
      this.data.cart.length === 0 &&
      !this.data.showCartModal
    ) {
      wx.showToast({
        title: '还未选择菜品哦',
        icon: 'none'
      });
      return;
    }

    this.setData({
      showCartModal:
        !this.data.showCartModal
    });
  },

  // 清空购物车
  clearCart() {
    this.applyCart([], {
      showCartModal: false,
      tasteRemark: '',
      tagActive: {}
    });
  },

  // ---- 口味备注 ----

  refreshTagActive(remark) {
    const segs =
      (remark || '')
        .split(/[，,、;；\s]+/)
        .filter(Boolean);

    const tagActive = {};

    this.data.tasteTags.forEach(tag => {
      tagActive[tag] =
        segs.indexOf(tag) > -1;
    });

    return tagActive;
  },

  // 点击快捷标签
  toggleTasteTag(e) {
    const tag =
      e.currentTarget.dataset.tag;

    const segs =
      this.data.tasteRemark
        .split(/[，,、;；\s]+/)
        .filter(Boolean);

    const idx =
      segs.indexOf(tag);

    if (idx > -1) {
      segs.splice(idx, 1);
    } else {
      segs.push(tag);
    }

    const tasteRemark =
      segs.join('，');

    this.setData({
      tasteRemark,
      tagActive:
        this.refreshTagActive(
          tasteRemark
        )
    });
  },

  // 自由输入备注
  onRemarkInput(e) {
    const tasteRemark =
      e.detail.value;

    this.setData({
      tasteRemark,
      tagActive:
        this.refreshTagActive(
          tasteRemark
        )
    });
  },

  // quantity 安全转换
  toQuantity(value) {
    const n = Number(value);

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === '' ||
      Number.isNaN(n)
    ) {
      return 1;
    }

    return Math.max(
      0,
      Math.floor(n)
    );
  },

  // 统一购物车更新出口
  applyCart(rawCart, extra = {}, done) {
    const {
      menuList: nextMenuList,
      ...restExtra
    } = extra;

    const cart =
      (Array.isArray(rawCart)
        ? rawCart
        : []
      )
        .map(item => ({
          ...item,
          quantity:
            this.toQuantity(
              item.quantity
            ),
          checked:
            item.checked !== false
        }))
        .filter(item =>
          item.quantity > 0
        );

    // cartMap
    const cartMap = {};

    cart.forEach(item => {
      cartMap[String(item.id)] =
        item;
    });

    // 总份数
    const totalCount =
      cart.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      );

    // 总金额
    const totalAmount =
      cart.reduce(
        (sum, item) =>
          sum +
          getItemAmount(item) *
          item.quantity,
        0
      );

    // 结算勾选统计
    const checkedCount =
      cart.filter(
        item => item.checked
      ).length;

    const allChecked =
      checkedCount > 0 &&
      checkedCount === cart.length;

    // selected 与购物车状态保持一致
    const sourceMenu =
      Array.isArray(nextMenuList)
        ? nextMenuList
        : this.data.menuList;

    const menuList =
      sourceMenu.map(item => ({
        ...item,
        selected:
          cart.some(c =>
            String(c.id) ===
            String(item.id)
          )
      }));

    this.setData({
      cart,
      cartMap,
      totalCount,
      totalAmount,
      checkedCount,
      allChecked,
      menuList,
      ...restExtra
    }, () => {
      this.updateFilteredList();

      if (typeof done === 'function') {
        done();
      }
    });
  },

  // 搜索框输入
  onSearchInput(e) {
    this.setData({
      searchKey: e.detail.value
    }, () => {
      this.updateFilteredList();
    });
  },

  // 清空搜索内容
  clearSearch() {
    this.setData({
      searchKey: ''
    }, () => {
      this.updateFilteredList();
    });
  },

  // 综合筛选列表
  updateFilteredList() {
    let list =
      this.data.menuList;

    const {
      activeCategory,
      searchKey,
      cartMap
    } = this.data;

    const hasSearch =
      searchKey.trim() !== '';

    let newCategory =
      activeCategory;

    // 1. 分类筛选
    if (
      !hasSearch &&
      activeCategory !== '全部'
    ) {
      list =
        list.filter(
          item =>
            item.category ===
            activeCategory
        );
    }

    // 2. 搜索
    if (searchKey.trim() !== '') {
      const keywords =
        searchKey
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);

      list =
        list.filter(item => {
          const haystack =
            [
              item.name,
              item.desc,
              item.category
            ]
              .concat(
                Array.isArray(item.tags)
                  ? item.tags
                  : []
              )
              .map(field =>
                String(
                  field || ''
                ).toLowerCase()
              );

          return keywords.every(
            k =>
              haystack.some(
                h =>
                  h.indexOf(k) > -1
              )
          );
        });

      // 搜索时自动切换到第一个结果所属分类
      if (
        list.length > 0 &&
        list[0].category !==
          activeCategory
      ) {
        newCategory =
          list[0].category;
      }
    }

    // 3. 附上购物车数量 / 月销 / 描述 / 标签 / 库存
    const {
      shippedSalesMap
    } = this.data;

    const filteredMenuList =
      list.map(item => {
        const inCart =
          cartMap[
            String(item.id)
          ];

        const stock =
          typeof item.stock === 'number'
            ? item.stock
            : null;

        const soldOut =
          item.onSale === false ||
          (
            stock !== null &&
            stock <= 0
          );

        return {
          ...item,

          quantity:
            inCart
              ? inCart.quantity
              : 0,

          monthSales:
            (
              typeof item.monthSales === 'number'
                ? item.monthSales
                : 0
            ) +
            (
              shippedSalesMap[
                String(item.id)
              ] || 0
            ),

          descShow:
            item.desc || '',

          tagsShow:
            (
              Array.isArray(item.tags)
                ? item.tags
                : []
            ).slice(0, 2),

          stockText:
            stock === null
              ? '库存充足'
              : (
                stock <= 0
                  ? '售罄'
                  : `库存 ${stock}`
              ),

          soldOut
        };
      });

    this.setData({
      filteredMenuList,
      activeCategory:
        newCategory
    });
  },

  // ---- 搜索历史与热门搜索 ----

  loadSearchHistory() {
    this.setData({
      searchHistory:
        readArray(
          KEYS.SEARCH_HISTORY
        ).slice(0, 10)
    });
  },

  // 保存搜索历史
  saveHistory(keyword) {
    const key =
      (keyword || '').trim();

    if (!key) return;

    let history =
      readArray(
        KEYS.SEARCH_HISTORY
      ).filter(
        k => k !== key
      );

    history.unshift(key);

    history =
      history.slice(0, 10);

    writeArray(
      KEYS.SEARCH_HISTORY,
      history
    );

    this.setData({
      searchHistory: history
    });
  },

  // 键盘确认搜索
  onSearchConfirm(e) {
    const key =
      (e.detail.value || '')
        .trim();

    this.setData({
      searchKey: key
    }, () => {
      this.updateFilteredList();
    });

    if (key) {
      this.saveHistory(key);
    }
  },

  // 点击搜索历史
  onHistoryTap(e) {
    const keyword =
      e.currentTarget.dataset.keyword;

    if (!keyword) return;

    this.setData({
      searchKey: keyword
    }, () => {
      this.updateFilteredList();
    });

    this.saveHistory(keyword);
  },

  // 点击热门搜索
  onHotTap(e) {
    const keyword =
      e.currentTarget.dataset.keyword;

    if (!keyword) return;

    this.setData({
      searchKey: keyword
    }, () => {
      this.updateFilteredList();
    });

    this.saveHistory(keyword);
  },

  // 清空搜索历史
  clearSearchHistory() {
    writeArray(
      KEYS.SEARCH_HISTORY,
      []
    );

    this.setData({
      searchHistory: []
    });

    wx.showToast({
      title: '已清空搜索历史',
      icon: 'none'
    });
  },

  // 点击左侧分类标签
  selectCategory(e) {
    const category =
      e.currentTarget.dataset.category;

    this.setData({
      activeCategory: category
    }, () => {
      this.updateFilteredList();
    });
  },

  // 选择菜品
  increaseQuantity(e) {
    const result =
      this.addToCartById(
        e.currentTarget.dataset.id
      );

    if (result === -1) {
      wx.showToast({
        title: '该菜品已售罄或下架',
        icon: 'none'
      });
    } else if (result === -2) {
      wx.showToast({
        title: '库存不足，无法继续添加',
        icon: 'none'
      });
    }
  },

  // 加菜统一入口
  addToCartById(id) {
    const dish =
      this.data.menuList.find(
        m =>
          String(m.id) ===
          String(id)
      );

    if (!dish) return 0;

    // 售罄 / 下架拦截
    if (
      dish.onSale === false ||
      (
        typeof dish.stock === 'number' &&
        dish.stock <= 0
      )
    ) {
      return -1;
    }

    // 查找购物车已有记录
    const existing =
      this.data.cartMap[
        String(id)
      ];

    let cart;

    if (existing) {
      // 库存上限校验
      const stock =
        typeof dish.stock === 'number'
          ? dish.stock
          : null;

      if (
        stock !== null &&
        existing.quantity + 1 > stock
      ) {
        return -2;
      }

      // 同一道菜 quantity + 1
      cart =
        this.data.cart.map(
          c =>
            String(c.id) ===
            String(id)
              ? {
                ...c,
                quantity:
                  this.toQuantity(
                    c.quantity
                  ) + 1
              }
              : c
        );
    } else {
      // 首次加入购物车
      cart = [
        ...this.data.cart,
        {
          id: dish.id,
          name: dish.name,
          price: dish.price,
          amount:
            getItemAmount(dish),
          category:
            dish.category,
          icon: dish.icon,
          image:
            dish.image,
          quantity: 1
        }
      ];
    }

    this.applyCart(cart);

    const inCart =
      cart.find(
        c =>
          String(c.id) ===
          String(id)
      );

    return inCart.quantity;
  },

  // 数量 -1
  decreaseQuantity(e) {
    const id =
      e.currentTarget.dataset.id;

    const existing =
      this.data.cartMap[
        String(id)
      ];

    if (!existing) return;

    const next =
      this.toQuantity(
        existing.quantity
      ) - 1;

    let cart;

    if (next <= 0) {
      cart =
        this.data.cart.filter(
          c =>
            String(c.id) !==
            String(id)
        );
    } else {
      cart =
        this.data.cart.map(
          c =>
            String(c.id) ===
            String(id)
              ? {
                ...c,
                quantity: next
              }
              : c
        );
    }

    const showCartModal =
      cart.length === 0
        ? false
        : this.data.showCartModal;

    this.applyCart(
      cart,
      {
        showCartModal
      }
    );
  },

  // 占位
  noop() {},

  // ---- 结算勾选 ----

  // 勾选/取消勾选单个菜品
  toggleCartChecked(e) {
    const id =
      e.currentTarget.dataset.id;

    const cart =
      this.data.cart.map(
        c =>
          String(c.id) ===
          String(id)
            ? {
              ...c,
              checked:
                !c.checked
            }
            : c
      );

    this.applyCart(cart);
  },

  // 全选 / 取消全选
  checkAllCart() {
    const target =
      !this.data.allChecked;

    const cart =
      this.data.cart.map(
        c => ({
          ...c,
          checked: target
        })
      );

    this.applyCart(cart);
  },

  // 直接删除购物车中的单个菜品
  removeCartItem(e) {
    const id =
      e.currentTarget.dataset.id;

    const cart =
      this.data.cart.filter(
        c =>
          String(c.id) !==
          String(id)
      );

    const showCartModal =
      cart.length === 0
        ? false
        : this.data.showCartModal;

    this.applyCart(
      cart,
      {
        showCartModal
      }
    );
  },

  // 供结算页读取
  getCheckedCart() {
    return {
      items:
        this.data.cart
          .filter(
            c => c.checked
          )
          .map(c => ({
            ...c
          })),

      remark:
        this.data.tasteRemark ||
        ''
    };
  },

  // 去结算
  goCheckout() {
    if (
      this.data.checkedCount === 0
    ) {
      wx.showToast({
        title: '请先勾选要结算的菜品',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: '/pages/checkout/checkout'
    });
  },

  // 结算成功后的回调
  completeCheckout(purchasedIds) {
    const ids =
      (
        Array.isArray(purchasedIds)
          ? purchasedIds
          : []
      ).map(String);

    const cart =
      this.data.cart.filter(
        c =>
          ids.indexOf(
            String(c.id)
          ) === -1
      );

    const showCartModal =
      cart.length === 0
        ? false
        : this.data.showCartModal;

    this.applyCart(
      cart,
      {
        showCartModal,
        tasteRemark: '',
        tagActive: {}
      }
    );
  }
});