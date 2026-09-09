Page({
  data: {
    showModal: false,
    iconList: ['🍗', '🥩', '🍳', '🥔', '🧋', '🥟', '🍤', '🍜', '🍲', '🍧', '🍕', '🍰'],
    form: {
      name: '',
      icon: '🍳',
      stepsText: ''
    },
    // 默认示例菜谱
    recipes: [
      {
        id: 1,
        name: '可乐鸡翅',
        icon: '🍗',
        steps: [
          '鸡翅划刀划两下，焯水捞出。',
          '锅中倒油，煎至两面金黄。',
          '倒入一罐可乐，加两勺生抽、一勺老抽、少许盐。',
          '大火烧开转小火焖15分钟，最后大火收汁即可！'
        ]
      }
    ]
  },

  onShow() {
    this.loadRecipes();
  },

  loadRecipes() {
    const customRecipes = wx.getStorageSync('user_recipes');
    if (customRecipes && customRecipes.length > 0) {
      this.setData({ recipes: customRecipes });
    } else {
      wx.setStorageSync('user_recipes', this.data.recipes);
    }
  },

  openModal() {
    this.setData({ showModal: true });
  },

  closeModal() {
    this.setData({ showModal: false });
  },

  onInputName(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  selectIcon(e) {
    this.setData({ 'form.icon': e.currentTarget.dataset.icon });
  },

  onInputSteps(e) {
    this.setData({ 'form.stepsText': e.detail.value });
  },

  // 提交并保存新菜谱
  submitRecipe() {
    const { name, icon, stepsText } = this.data.form;

    if (!name.trim()) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' });
      return;
    }
    if (!stepsText.trim()) {
      wx.showToast({ title: '请输入制作步骤', icon: 'none' });
      return;
    }

    // 按换行分割为多个步骤数组
    const steps = stepsText.split('\n').map(s => s.trim()).filter(s => s.length > 0);

    const newRecipe = {
      id: Date.now(),
      name: name.trim(),
      icon,
      steps
    };

    let recipes = this.data.recipes;
    recipes.unshift(newRecipe);

    wx.setStorageSync('user_recipes', recipes);
    this.setData({
      recipes,
      showModal: false,
      'form.name': '',
      'form.stepsText': ''
    });

    wx.showToast({ title: '添加成功！', icon: 'success' });
  },

  // 删除菜谱
  deleteRecipe(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要删除这份菜谱吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          let recipes = this.data.recipes.filter(r => r.id !== id);
          this.setData({ recipes });
          wx.setStorageSync('user_recipes', recipes);
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
})