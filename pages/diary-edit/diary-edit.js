const { KEYS, readArray, writeArray, toAmount, genId, formatDate, formatTime } = require('../../utils/storage.js');

// 菜品文本的分隔符（支持 、，, ; ； 空格）
const DISH_SEPARATORS = /[，,、;；\s]+/;

Page({
  data: {
    editingId: null,     // 有值 = 编辑已有日记
    orderId: '',         // 可选：关联的订单 id
    form: {
      date: '',
      time: '',
      title: '',
      dishesText: '',
      images: [],
      amount: '',
      rating: 5,
      remark: ''
    },
    menuDishes: []       // 菜单快捷点选：[{ name, active }]
  },

  onLoad(options) {
    this.menuNames = readArray(KEYS.MENU_LIST)
      .map(d => d && d.name)
      .filter((n, i, arr) => typeof n === 'string' && n && arr.indexOf(n) === i)
      .slice(0, 20);

    if (options && options.id !== undefined && options.id !== '') {
      this.loadEntry(options.id);
    } else if (options && options.orderId !== undefined && options.orderId !== '') {
      this.prefillFromOrder(options.orderId);
    } else {
      // 手动新建：默认当前日期时间
      const now = new Date();
      this.setData({
        editingId: null,
        orderId: '',
        form: { date: formatDate(now), time: formatTime(now), title: '', dishesText: '', images: [], amount: '', rating: 5, remark: '' },
        menuDishes: this.buildChips('')
      });
    }
  },

  // 编辑已有日记
  loadEntry(id) {
    const entry = readArray(KEYS.MEAL_DIARY).find(d => String(d && d.id) === String(id));
    if (!entry) {
      wx.showToast({ title: '日记不存在或已删除', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const dishesText = Array.isArray(entry.dishes) ? entry.dishes.join('、') : '';
    this.setData({
      editingId: entry.id,
      orderId: entry.orderId !== undefined ? entry.orderId : '',
      form: {
        date: typeof entry.date === 'string' ? entry.date : formatDate(new Date()),
        time: typeof entry.time === 'string' ? entry.time : formatTime(new Date()),
        title: typeof entry.title === 'string' ? entry.title : '',
        dishesText,
        images: Array.isArray(entry.images) ? entry.images.filter(p => typeof p === 'string') : [],
        amount: toAmount(entry.amount) > 0 ? String(toAmount(entry.amount)) : '',
        rating: Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 5 ? entry.rating : 5,
        remark: typeof entry.remark === 'string' ? entry.remark : ''
      },
      menuDishes: this.buildChips(dishesText)
    });
  },

  // 从订单进入：自动带入订单日期/菜品/金额/orderId，用户仍可修改
  prefillFromOrder(orderId) {
    const order = readArray(KEYS.USER_ORDERS).find(o => String(o && o.id) === String(orderId));
    const now = new Date();
    if (!order) {
      wx.showToast({ title: '未找到该订单，请手动填写', icon: 'none' });
      this.setData({
        editingId: null,
        orderId: '',
        form: { date: formatDate(now), time: formatTime(now), title: '', dishesText: '', images: [], amount: '', rating: 5, remark: '' },
        menuDishes: this.buildChips('')
      });
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const dishes = items.map(d => d && d.name).filter((n, i, arr) => typeof n === 'string' && n && arr.indexOf(n) === i);
    // 订单金额：仅数值奖励可解析（与记账金额是两个概念，这里只是快照预填）
    const amount = items.reduce((sum, d) => {
      if (!d) return sum;
      const qty = (typeof d.quantity === 'number' && d.quantity > 0) ? d.quantity : 1;
      const price = Number(d.price);
      return sum + (Number.isFinite(price) ? price * qty : 0);
    }, 0);
    const timeStr = typeof order.time === 'string' ? order.time : '';

    const dishesText = dishes.join('、');
    this.setData({
      editingId: null,
      orderId: order.id,
      form: {
        date: timeStr.slice(0, 10) || formatDate(now),
        time: timeStr.slice(11, 16) || formatTime(now),
        title: '今晚一起做饭',
        dishesText,
        images: [],
        amount: amount > 0 ? String(toAmount(amount)) : '',
        rating: 5,
        remark: ''
      },
      menuDishes: this.buildChips(dishesText)
    });
  },

  buildChips(dishesText) {
    const segs = (dishesText || '').split(DISH_SEPARATORS).filter(Boolean);
    return this.menuNames.map(name => ({ name, active: segs.indexOf(name) > -1 }));
  },

  // ---- 表单事件 ----
  onDateChange(e) { this.setData({ 'form.date': e.detail.value }); },
  onTimeChange(e) { this.setData({ 'form.time': e.detail.value }); },
  onTitleInput(e) { this.setData({ 'form.title': e.detail.value }); },
  onDishesInput(e) {
    const dishesText = e.detail.value;
    this.setData({ 'form.dishesText': dishesText, menuDishes: this.buildChips(dishesText) });
  },
  onAmountInput(e) { this.setData({ 'form.amount': e.detail.value }); },
  onRemarkInput(e) { this.setData({ 'form.remark': e.detail.value }); },

  // 点选菜单菜品：追加/移除到菜品文本
  toggleMenuDish(e) {
    const name = e.currentTarget.dataset.name;
    const segs = this.data.form.dishesText.split(DISH_SEPARATORS).filter(Boolean);
    const idx = segs.indexOf(name);
    if (idx > -1) segs.splice(idx, 1);
    else segs.push(name);
    const dishesText = segs.join('、');
    this.setData({ 'form.dishesText': dishesText, menuDishes: this.buildChips(dishesText) });
  },

  // 点星星评分（1~5）
  setRating(e) {
    const value = Number(e.currentTarget.dataset.value);
    if (value >= 1 && value <= 5) {
      this.setData({ 'form.rating': value });
    }
  },

  // 选照片：相册/拍摄，最多 3 张；用 saveFile 落为本地持久文件，失败退回临时路径
  chooseImage() {
    const remain = 3 - this.data.form.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多选 3 张照片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (paths.length === 0) return;
        const saved = [];
        let pending = paths.length;
        const done = () => {
          this.setData({ 'form.images': this.data.form.images.concat(saved) });
        };
        const fsm = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fsm) { done(); return; }
        paths.forEach(p => {
          fsm.saveFile({
            tempFilePath: p,
            success: (r) => saved.push(r.savedFilePath || p),
            fail: () => saved.push(p),
            complete: () => {
              pending -= 1;
              if (pending === 0) done();
            }
          });
        });
      }
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.form.images.filter((p, i) => i !== index);
    this.setData({ 'form.images': images });
  },

  // 保存日记（新增或覆盖编辑）
  saveDiary() {
    const { form, editingId, orderId } = this.data;
    const now = new Date();

    const dishes = form.dishesText.split(DISH_SEPARATORS)
      .map(s => s.trim())
      .filter((s, i, arr) => s && arr.indexOf(s) === i);

    const record = {
      id: editingId || genId(),
      orderId: orderId || '',
      date: form.date || formatDate(now),
      time: form.time || formatTime(now),
      title: form.title.trim() || '今晚一起做饭',
      dishes,
      images: form.images,
      amount: toAmount(form.amount),          // 保存时的金额快照
      rating: form.rating,
      remark: (form.remark || '').trim()
    };

    let list = readArray(KEYS.MEAL_DIARY);
    if (editingId) {
      list = list.map(d => (String(d && d.id) === String(editingId) ? record : d));
    } else {
      list.unshift(record);
    }
    writeArray(KEYS.MEAL_DIARY, list);

    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 500);
  }
})
