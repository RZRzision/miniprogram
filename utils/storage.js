// 本地存储统一管理：KEY 常量 + 安全读写工具
// 历史 key（custom_menu_list / user_orders / user_recipes / custom_bg）保持原样，老数据不受影响；
// 新增功能的 key 统一在这里登记，避免字符串散落各文件。
const KEYS = {
  MENU_LIST: 'custom_menu_list',   // 菜单
  USER_ORDERS: 'user_orders',      // 订单历史
  USER_RECIPES: 'user_recipes',    // 菜谱
  CUSTOM_BG: 'custom_bg',          // 点餐页海报背景
  BILLS: 'bills',                  // 记账账单
  MEAL_DIARY: 'meal_diary',        // 饭饭日记
  RECENT_VIEWS: 'recent_views',    // 最近浏览的菜品 id（猜你喜欢信号）
  FAVORITES: 'favorites',          // 收藏的菜品 id（猜你喜欢信号）
  SEARCH_HISTORY: 'search_history',// 搜索历史（最多 10 条）
  USER_PROFILE: 'user_profile',    // 用户资料（昵称/头像，本地保存）
  COUPONS: 'coupons',              // 已领取的优惠券
  CATEGORIES: 'categories',        // 菜品分类（分类管理）
  TABLES: 'tables',                // 桌台（堂食桌号）
  SETTINGS: 'shop_settings'        // 营业设置（店铺名/自动接单/深夜时段）
};

// 默认菜品分类（首次使用时由分类管理页写入，点餐/管理页空数据时作回退）
const DEFAULT_CATEGORIES = ['硬菜', '家常菜', '快手菜', '甜品饮料'];

// 安全读取对象：非对象（含数组）或异常时返回 fallback，页面不崩溃
function readObject(key, fallback) {
  try {
    const val = wx.getStorageSync(key);
    return (val && typeof val === 'object' && !Array.isArray(val)) ? val : (fallback || null);
  } catch (e) {
    return fallback || null;
  }
}

// 安全读取数组：key 不存在、存了非数组脏数据、Storage 异常时一律返回 []，页面不崩溃
function readArray(key) {
  try {
    const val = wx.getStorageSync(key);
    return Array.isArray(val) ? val : [];
  } catch (e) {
    return [];
  }
}

function writeArray(key, list) {
  try {
    wx.setStorageSync(key, Array.isArray(list) ? list : []);
    return true;
  } catch (e) {
    return false;
  }
}

// 判断 Storage 中是否已经存在该 key；用于区分“首次使用”和“用户主动清空”。
function hasKey(key) {
  try {
    const value = wx.getStorageSync(key);
    return value !== '' && value !== undefined && value !== null;
  } catch (e) {
    return false;
  }
}

// 安全写入对象（非对象写入为空对象）
function writeObject(key, obj) {
  try {
    wx.setStorageSync(key, (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {});
    return true;
  } catch (e) {
    return false;
  }
}

// 实际金额：优先使用独立 amount 字段；兼容旧版本没有 amount 时的纯数字 price。
// price 是“奖励/代价”文案，不能因为包含普通文字就被误当成金额。
function getItemAmount(item) {
  const explicit = Number(item && item.amount);
  if (Number.isFinite(explicit) && explicit >= 0) return toAmount(explicit);
  const legacy = Number(item && item.price);
  return Number.isFinite(legacy) && legacy >= 0 ? toAmount(legacy) : 0;
}

// 金额安全转换：任意输入转成保留两位小数的数字，非法返回 0（杜绝 "68" + "20" = "6820"）
function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// 生成不重复 id：Date.now 在快速连续操作时可能撞号，追加随机段
function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 'YYYY-MM-DD'
function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 'HH:mm'
function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// '2026-09-09' → '2026年9月9日 · 星期三'；非法输入原样返回，不抛错
// 用年月日数字构造本地 Date，避免 new Date('2026-09-09') 的 UTC 解析时区偏移
function formatDateCN(dateStr) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateStr || '');
  if (!m) return dateStr || '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日 · ${WEEKDAYS[d.getDay()]}`;
}

module.exports = {
  KEYS,
  DEFAULT_CATEGORIES,
  readArray,
  readObject,
  writeArray,
  hasKey,
  writeObject,
  toAmount,
  getItemAmount,
  genId,
  formatDate,
  formatTime,
  formatDateCN
};
