const { KEYS, readArray, writeArray, hasKey, genId } = require('../../utils/storage.js');

const DEFAULT_RECIPE = {
  id: 1,
  name: '可乐鸡翅',
  icon: '🍗',
  steps: [
    '鸡翅划刀划两下，焯水捞出。',
    '锅中倒油，煎至两面金黄。',
    '倒入一罐可乐，加两勺生抽、一勺老抽、少许盐。',
    '大火烧开转小火焖15分钟，最后大火收汁即可！'
  ]
};

const ICONS = ['🍗', '🥩', '🍳', '🥔', '🧋', '🥟', '🍤', '🍜', '🍲', '🍧', '🍕', '🍰'];

function normalizeRecipe(item) {
  if (!item || typeof item !== 'object' || item.id === undefined || item.id === null) return null;
  const steps = Array.isArray(item.steps)
    ? item.steps.map(s => String(s == null ? '' : s).trim()).filter(Boolean).slice(0, 50)
    : [];
  return {
    id: item.id,
    name: String(item.name || '未命名菜谱').trim().slice(0, 30),
    icon: item.icon || '🍳',
    steps
  };
}

Page({
  data: {
    showModal: false,
    iconList: ICONS,
    form: { name: '', icon: '🍳', stepsText: '' },
    editingId: null,
    saving: false,
    recipes: [DEFAULT_RECIPE]
  },

  onShow() {
    this.loadRecipes();
    // tab 切换回来时关闭未提交的编辑态，避免旧表单残留。
    if (this.data.showModal) this.closeModal();
  },

  loadRecipes() {
    const raw = readArray(KEYS.USER_RECIPES);
    if (!hasKey(KEYS.USER_RECIPES)) {
      writeArray(KEYS.USER_RECIPES, [DEFAULT_RECIPE]);
      this.setData({ recipes: [DEFAULT_RECIPE] });
      return;
    }
    const recipes = raw.map(normalizeRecipe).filter(Boolean);
    this.setData({ recipes });
  },

  openModal() {
    this.setData({
      showModal: true,
      editingId: null,
      form: { name: '', icon: this.data.iconList[0], stepsText: '' }
    });
  },

  startEdit(e) {
    const id = e.currentTarget.dataset.id;
    const recipe = this.data.recipes.find(r => String(r.id) === String(id));
    if (!recipe) return;
    this.setData({
      showModal: true,
      editingId: recipe.id,
      form: {
        name: recipe.name || '',
        icon: recipe.icon || this.data.iconList[0],
        stepsText: Array.isArray(recipe.steps) ? recipe.steps.join('\n') : ''
      }
    });
  },

  closeModal() {
    this.setData({
      showModal: false,
      editingId: null,
      form: { name: '', icon: '🍳', stepsText: '' }
    });
  },

  onInputName(e) { this.setData({ 'form.name': e.detail.value }); },
  selectIcon(e) { this.setData({ 'form.icon': e.currentTarget.dataset.icon }); },
  onInputSteps(e) { this.setData({ 'form.stepsText': e.detail.value }); },

  saveRecipe() {
    if (this.data.saving) return;
    const name = String(this.data.form.name || '').trim();
    const stepsText = String(this.data.form.stepsText || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' });
      return;
    }
    if (name.length > 30) {
      wx.showToast({ title: '菜品名称最多30字', icon: 'none' });
      return;
    }
    if (!stepsText) {
      wx.showToast({ title: '请输入制作步骤', icon: 'none' });
      return;
    }
    if (stepsText.length > 3000) {
      wx.showToast({ title: '步骤内容最多3000字', icon: 'none' });
      return;
    }

    const steps = stepsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!steps.length) {
      wx.showToast({ title: '步骤不能全是空行', icon: 'none' });
      return;
    }

    const isEditing = this.data.editingId !== null && this.data.editingId !== undefined;
    this.setData({ saving: true });
    let recipes;
    if (isEditing) {
      recipes = this.data.recipes.map(r => String(r.id) === String(this.data.editingId)
        ? { ...r, name, icon: this.data.form.icon || '🍳', steps }
        : r);
    } else {
      recipes = [{ id: genId(), name, icon: this.data.form.icon || '🍳', steps }, ...this.data.recipes];
    }

    const ok = writeArray(KEYS.USER_RECIPES, recipes);
    if (!ok) {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({
      recipes,
      saving: false,
      showModal: false,
      editingId: null,
      form: { name: '', icon: '🍳', stepsText: '' }
    });
    wx.showToast({ title: isEditing ? '修改成功' : '添加成功', icon: 'success' });
  },

  deleteRecipe(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除菜谱',
      content: '确定要删除这份菜谱吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (!res.confirm) return;
        const recipes = this.data.recipes.filter(r => String(r.id) !== String(id));
        if (!writeArray(KEYS.USER_RECIPES, recipes)) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' });
          return;
        }
        this.setData({ recipes });
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  // 菜谱 → 点餐：通过 globalData 传递目标 id，switchTab 后由首页消费并自动定位。
  goOrder(e) {
    const id = e.currentTarget.dataset.id;
    const recipe = this.data.recipes.find(r => String(r.id) === String(id));
    if (!recipe) return;
    const menu = readArray(KEYS.MENU_LIST);
    const dish = menu.find(d => d && d.name === recipe.name);
    if (!dish) {
      wx.showToast({ title: '菜单里暂时没有这道菜', icon: 'none' });
      return;
    }
    getApp().globalData.pendingSelectDishId = dish.id;
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => {
        getApp().globalData.pendingSelectDishId = null;
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  }
});
