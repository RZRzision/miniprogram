// 库存系统：订单创建扣减、取消/删除回补；月销（派生统计）与本模块完全独立
const { KEYS, readArray, writeArray } = require('./storage.js');

// 旧菜品没有 stock 字段时视为「不限库存」的合理默认值：
// 不参与扣减/回补、不会售罄、不参与库存预警，全程不报错
function hasFiniteStock(dish) {
  return !!(dish && typeof dish.stock === 'number');
}

// 按菜品快照调整库存：sign = -1 扣减（最小 0）、+1 回补
// 只影响有 stock 字段的菜品；所有计算防止负数
function adjustStockForItems(items, sign) {
  const menu = readArray(KEYS.MENU_LIST);
  let changed = false;
  items.forEach(item => {
    if (!item) return;
    const dish = menu.find(m => m && String(m.id) === String(item.id));
    if (!dish || !hasFiniteStock(dish)) return;
    const qty = (typeof item.quantity === 'number' && item.quantity > 0) ? item.quantity : 1;
    let next = dish.stock + sign * qty;
    if (next < 0) next = 0;
    if (next !== dish.stock) {
      dish.stock = next;
      changed = true;
    }
  });
  if (changed) writeArray(KEYS.MENU_LIST, menu);
  return changed;
}

// 订单创建成功后扣减库存
function deductStock(items) {
  return adjustStockForItems(items, -1);
}

// 订单取消 / 删除已扣减订单时回补库存
function restoreStock(items) {
  return adjustStockForItems(items, 1);
}

module.exports = { deductStock, restoreStock, hasFiniteStock };
