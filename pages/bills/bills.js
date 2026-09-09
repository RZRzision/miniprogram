const { KEYS, readArray, writeArray, toAmount, genId, formatDate, formatTime, formatDateCN } = require('../../utils/storage.js');

// 账单分类：渲染用图标 + 名称；历史账单无分类字段时归入“其他”
const CATEGORIES = [
  { name: '早餐', icon: '🌅' },
  { name: '午餐', icon: '🍚' },
  { name: '晚餐', icon: '🌙' },
  { name: '夜宵', icon: '🍜' },
  { name: '零食', icon: '🍪' },
  { name: '饮料', icon: '🥤' },
  { name: '其他', icon: '🍽️' }
];
const CATEGORY_NAMES = CATEGORIES.map(c => c.name);

// 按时间段粗略猜测分类（订单“记一笔”/手动记一笔的默认值，用户可改）
function guessCategory(timeStr) {
  const hour = parseInt(timeStr, 10);
  if (!Number.isFinite(hour)) return '其他';
  if (hour < 10) return '早餐';
  if (hour < 16) return '午餐';
  if (hour < 21) return '晚餐';
  return '夜宵';
}

function categoryIcon(name) {
  const hit = CATEGORIES.find(c => c.name === name);
  return hit ? hit.icon : '🍽️';
}

// 筛选范围：返回 {start, end}（YYYY-MM-DD 字符串可直接比较），“全部”返回 null
function getFilterRange(filter, now) {
  const todayStr = formatDate(now);
  if (filter === 'today') return { start: todayStr, end: todayStr };
  if (filter === 'week') {
    const day = (now.getDay() + 6) % 7; // 周一为一周第一天
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: formatDate(start), end: formatDate(end) };
  }
  if (filter === 'month') {
    return { start: todayStr.slice(0, 7) + '-01', end: todayStr.slice(0, 7) + '-31' };
  }
  return null;
}

Page({
  data: {
    categories: CATEGORIES,
    bills: [],     // 全量归一化账单（编辑/删除按此查找）
    filter: 'all', // today | week | month | all
    groups: [],    // 当前筛选下按日期分组的展示结构
    filteredSummary: { count: 0, total: 0 },
    stats: { today: 0, month: 0, total: 0 },
    showForm: false,
    editingId: null,
    form: { date: '', time: '', title: '', amount: '', remark: '', orderId: '', category: '其他' }
  },

  onLoad(options) {
    // 从订单页「记一笔」进入：自动填入订单金额/日期等（仅作为快照预填，与订单不绑定）
    this.presetFromOrder(options);
    this.loadBills();
  },

  onShow() {
    this.loadBills();
  },

  // 订单金额 → 账单是快照式预填：之后改账单不改订单，改订单也不动账单
  presetFromOrder(options) {
    if (!options || options.mode !== 'add') return;
    let title = '';
    try {
      title = options.title ? decodeURIComponent(options.title) : '';
    } catch (e) {
      title = options.title || '';
    }
    const amountNum = toAmount(options.amount);
    this.setData({
      showForm: true,
      editingId: null,
      form: {
        date: options.date || formatDate(new Date()),
        time: options.time || formatTime(new Date()),
        title: title || '情侣晚餐',
        amount: amountNum > 0 ? String(amountNum) : '',
        remark: '',
        orderId: options.orderId || '',
        category: guessCategory(options.time)
      }
    });
  },

  loadBills() {
    const raw = readArray(KEYS.BILLS);
    const todayStr = formatDate(new Date());
    const monthStr = todayStr.slice(0, 7);

    // 旧数据兼容：无 category 归入“其他”；金额统一转数字并钳为非负，脏字段逐项兜底
    const bills = raw.map(b => {
      const rec = b && typeof b === 'object' ? b : {};
      const category = CATEGORY_NAMES.indexOf(rec.category) > -1 ? rec.category : '其他';
      return {
        id: rec.id !== undefined ? rec.id : genId(),
        date: typeof rec.date === 'string' ? rec.date : '',
        time: typeof rec.time === 'string' ? rec.time : '',
        title: typeof rec.title === 'string' && rec.title ? rec.title : '吃饭支出',
        remark: typeof rec.remark === 'string' ? rec.remark : '',
        orderId: rec.orderId !== undefined ? rec.orderId : '',
        category,
        categoryIcon: categoryIcon(category),
        amount: Math.max(0, toAmount(rec.amount))
      };
    }).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

    // 顶部统计固定为全局口径（今日/本月/累计），不随列表筛选变化
    const stats = bills.reduce((acc, b) => {
      acc.total += b.amount;
      if (b.date === todayStr) acc.today += b.amount;
      if (b.date.slice(0, 7) === monthStr) acc.month += b.amount;
      return acc;
    }, { today: 0, month: 0, total: 0 });
    stats.today = toAmount(stats.today);
    stats.month = toAmount(stats.month);
    stats.total = toAmount(stats.total);

    this.setData({ bills, stats });
    this.refreshView();
  },

  // 按当前筛选重建分组列表与筛选小计
  refreshView() {
    const range = getFilterRange(this.data.filter, new Date());
    const filtered = range
      ? this.data.bills.filter(b => b.date >= range.start && b.date <= range.end)
      : this.data.bills;

    const groups = [];
    const groupMap = {};
    let filteredTotal = 0;
    filtered.forEach(b => {
      filteredTotal += b.amount;
      if (!groupMap[b.date]) {
        groupMap[b.date] = { date: b.date, dateCN: formatDateCN(b.date), dayTotal: 0, items: [] };
        groups.push(groupMap[b.date]);
      }
      groupMap[b.date].items.push(b);
      groupMap[b.date].dayTotal += b.amount;
    });
    groups.forEach(g => { g.dayTotal = toAmount(g.dayTotal); });

    this.setData({
      groups,
      filteredSummary: { count: filtered.length, total: toAmount(filteredTotal) }
    });
  },

  // 切换筛选（今天 / 本周 / 本月 / 全部），仅影响列表展示，不改存储、不影响顶部统计
  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (['today', 'week', 'month', 'all'].indexOf(filter) === -1) return;
    this.setData({ filter });
    this.refreshView();
  },

  // ---- 表单 ----
  openForm() {
    this.setData({
      showForm: true,
      editingId: null,
      form: {
        date: formatDate(new Date()),
        time: formatTime(new Date()),
        title: '',
        amount: '',
        remark: '',
        orderId: '',
        category: guessCategory(formatTime(new Date()))
      }
    });
  },

  closeForm() {
    this.setData({ showForm: false, editingId: null });
  },

  onDateChange(e) { this.setData({ 'form.date': e.detail.value }); },
  onTimeChange(e) { this.setData({ 'form.time': e.detail.value }); },
  onTitleInput(e) { this.setData({ 'form.title': e.detail.value }); },
  onAmountInput(e) { this.setData({ 'form.amount': e.detail.value }); },
  onRemarkInput(e) { this.setData({ 'form.remark': e.detail.value }); },

  // 选择分类（快捷标签）
  selectCategory(e) {
    const name = e.currentTarget.dataset.name;
    if (CATEGORY_NAMES.indexOf(name) > -1) {
      this.setData({ 'form.category': name });
    }
  },

  // 保存账单（金额快照；新增或覆盖编辑项）
  saveBill() {
    const { form, editingId } = this.data;
    // 金额严格校验：空串 / 非数字 / 负数 / 0 一律拒绝，只保存合法非负金额
    const amount = toAmount(form.amount);
    if (amount <= 0) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' });
      return;
    }

    const record = {
      id: editingId || genId(),
      date: form.date || formatDate(new Date()),
      time: form.time || formatTime(new Date()),
      title: form.title.trim() || '吃饭支出',
      amount,                              // 保存当时的金额快照
      remark: (form.remark || '').trim(),
      orderId: form.orderId || '',         // 可选来源标记，不产生双向绑定
      category: CATEGORY_NAMES.indexOf(form.category) > -1 ? form.category : '其他'
    };

    let bills = readArray(KEYS.BILLS);
    if (editingId) {
      bills = bills.map(b => (String(b && b.id) === String(editingId) ? record : b));
    } else {
      bills.unshift(record);
    }
    writeArray(KEYS.BILLS, bills);

    this.setData({ showForm: false, editingId: null });
    this.loadBills();
    wx.showToast({ title: '已记一笔', icon: 'success' });
  },

  editBill(e) {
    const id = e.currentTarget.dataset.id;
    const bill = this.data.bills.find(b => String(b.id) === String(id));
    if (!bill) return;
    this.setData({
      showForm: true,
      editingId: bill.id,
      form: {
        date: bill.date,
        time: bill.time,
        title: bill.title,
        amount: String(bill.amount),
        remark: bill.remark,
        orderId: bill.orderId,
        category: bill.category
      }
    });
  },

  deleteBill(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这条账单吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          const bills = readArray(KEYS.BILLS).filter(b => String(b && b.id) !== String(id));
          writeArray(KEYS.BILLS, bills);
          this.loadBills();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
})
