const { KEYS, readArray, writeArray } = require('../../utils/storage.js');

Page({
  data: {
    dishes: []
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const dishes = readArray(KEYS.MENU_LIST).map(d => {
      const stock = typeof (d && d.stock) === 'number' ? d.stock : null;
      const stockWarn = typeof (d && d.stockWarn) === 'number' ? d.stockWarn : 5;
      return {
        id: d && d.id,
        icon: (d && d.icon) || '🍽️',
        name: (d && d.name) || '',
        stock,
        stockText: stock === null ? '不限' : String(stock),
        onSale: !(d && d.onSale === false),
        soldOut: stock !== null && stock <= 0,
        lowStock: stock !== null && stock > 0 && stock <= stockWarn
      };
    });
    this.setData({ dishes });
  },

  // 菜品库存字段更新（写回 custom_menu_list，点餐页/推荐区下次展示即生效）
  updateDish(id, patch) {
    const menu = readArray(KEYS.MENU_LIST);
    writeArray(KEYS.MENU_LIST, menu.map(d => (String(d && d.id) === String(id) ? { ...d, ...patch } : d)));
    this.refresh();
  },

  // 库存 +1 / -1（未设置过库存的按 50 起步；最小 0）
  changeStock(e) {
    const { id, delta } = e.currentTarget.dataset;
    const dish = readArray(KEYS.MENU_LIST).find(d => String(d && d.id) === String(id));
    if (!dish) return;
    const current = typeof dish.stock === 'number' ? dish.stock : 50;
    const stock = Math.max(0, current + Number(delta));
    this.updateDish(id, { stock });
  },

  // 在售 / 下架切换
  toggleSale(e) {
    const id = e.currentTarget.dataset.id;
    const dish = readArray(KEYS.MENU_LIST).find(d => String(d && d.id) === String(id));
    if (!dish) return;
    this.updateDish(id, { onSale: !(dish.onSale !== false) });
  }
})
