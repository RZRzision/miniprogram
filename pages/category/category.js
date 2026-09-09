const { KEYS, readArray, writeArray, DEFAULT_CATEGORIES } = require('../../utils/storage.js');

Page({
  data: {
    categories: [],
    newName: '',
    editingName: null,   // 正在重命名的分类（原名称）；null = 无编辑中的行
    renameValue: ''
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    this.setData({ categories: readArray(KEYS.CATEGORIES) });
  },

  onNameInput(e) {
    this.setData({ newName: e.detail.value });
  },

  // 新增分类（名称非空、不可重复；点餐页侧栏与管理页选择器即时生效）
  addCategory() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '分类名称不能为空', icon: 'none' });
      return;
    }
    const list = readArray(KEYS.CATEGORIES);
    if (list.indexOf(name) > -1) {
      wx.showToast({ title: '分类名称不能重复', icon: 'none' });
      return;
    }
    list.push(name);
    writeArray(KEYS.CATEGORIES, list);
    this.setData({ newName: '' });
    this.refresh();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  // ---- 重命名（编辑分类名称，并同步改写使用该分类的菜品） ----
  startRename(e) {
    this.setData({ editingName: e.currentTarget.dataset.name, renameValue: e.currentTarget.dataset.name });
  },

  onRenameInput(e) {
    this.setData({ renameValue: e.detail.value });
  },

  cancelRename() {
    this.setData({ editingName: null, renameValue: '' });
  },

  // 保存重命名：非空、不与其他分类重名；同步更新菜单中引用旧名称的菜品
  saveRename() {
    const oldName = this.data.editingName;
    const newName = (this.data.renameValue || '').trim();
    if (!oldName) return;

    if (!newName) {
      wx.showToast({ title: '分类名称不能为空', icon: 'none' });
      return;
    }

    const list = readArray(KEYS.CATEGORIES);
    if (list.indexOf(oldName) === -1) {
      // 行数据已失效（分类被并发删除），静默复位
      this.cancelRename();
      return;
    }
    if (newName !== oldName && list.indexOf(newName) > -1) {
      wx.showToast({ title: '分类名称不能重复', icon: 'none' });
      return;
    }

    // 1. 更新分类名称  2. 级联改写所有使用旧名称的菜品（保持菜品与侧栏对应）
    writeArray(KEYS.CATEGORIES, list.map(c => (c === oldName ? newName : c)));
    const menu = readArray(KEYS.MENU_LIST);
    writeArray(KEYS.MENU_LIST, menu.map(d => (d && d.category === oldName ? { ...d, category: newName } : d)));

    this.setData({ editingName: null, renameValue: '', categories: list.map(c => (c === oldName ? newName : c)) });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  // ---- 排序：上移 / 下移（持久化到存储，首页侧栏与菜品页选择器按此顺序展示） ----
  moveCategory(e) {
    const index = Number(e.currentTarget.dataset.index);
    const delta = Number(e.currentTarget.dataset.delta);
    const list = readArray(KEYS.CATEGORIES);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;

    this.setData({ editingName: null, renameValue: '' }); // 移动前退出编辑态，避免行错位
    const swapped = list.slice();
    swapped[index] = list[target];
    swapped[target] = list[index];
    writeArray(KEYS.CATEGORIES, swapped);
    this.refresh();
  },

  // 删除分类：分类下还有菜品时拒绝，提示先处理菜品（二次确认）
  removeCategory(e) {
    const name = e.currentTarget.dataset.name;
    const list = readArray(KEYS.CATEGORIES);
    if (list.indexOf(name) === -1) return;

    const used = readArray(KEYS.MENU_LIST).filter(d => d && d.category === name).length;
    if (used > 0) {
      wx.showToast({ title: `该分类下还有 ${used} 道菜品，请先移走或删除这些菜品`, icon: 'none' });
      return;
    }

    wx.showModal({
      title: '提示',
      content: `确定删除分类「${name}」吗？`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          writeArray(KEYS.CATEGORIES, list.filter(c => c !== name));
          this.refresh();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 首次使用：一键写入默认分类
  seedDefaults() {
    writeArray(KEYS.CATEGORIES, DEFAULT_CATEGORIES.slice());
    this.refresh();
    wx.showToast({ title: '已写入默认分类', icon: 'success' });
  }
})
