// 订单状态机（唯一状态字段：user_orders 中订单的 status）
// 用户端（订单页）、商家/厨房端（管理页厨房订单）共用本模块，禁止在任何页面另建状态字段或副本数据。
// 生命周期：待接单 → 已接单 → 制作中 → 已出单 → 已完成；允许在出餐前取消（已取消）。

const STATUS_FLOW = ['待接单', '已接单', '制作中', '已出单', '已完成'];
const CANCELLABLE = ['待接单', '已接单', '制作中']; // 出餐后不可取消

// 状态 → 徽章样式类
const STATUS_META = {
  '待接单': 'pending',
  '已接单': 'accepted',
  '制作中': 'cooking',
  '已出单': 'shipped',
  '已完成': 'done',
  '已取消': 'cancelled'
};

function isValidStatus(status) {
  return STATUS_FLOW.indexOf(status) > -1 || status === '已取消';
}

// 归一化：老订单没有 status 字段、或存了非法值时按“待接单”处理，不报错
function normalizeStatus(order) {
  const status = order && order.status;

  // 兼容服务器返回的数字状态
  const statusMap = {
    0: '待接单',
    1: '已接单',
    2: '制作中',
    3: '已出单',
    4: '已完成',
    5: '已取消'
  };

  if (typeof status === 'number') {
    return statusMap[status] || '待接单';
  }

  // 兼容本地旧订单的中文状态
  return isValidStatus(status) ? status : '待接单';
}

// 下一个状态；终态（已完成/已取消）返回 null，重复推进自动无效
function nextStatus(status) {
  const idx = STATUS_FLOW.indexOf(status);
  return (idx > -1 && idx < STATUS_FLOW.length - 1) ? STATUS_FLOW[idx + 1] : null;
}

// 上一个状态；初始态返回 null（供“点错回退”使用）
function prevStatus(status) {
  const idx = STATUS_FLOW.indexOf(status);
  return idx > 0 ? STATUS_FLOW[idx - 1] : null;
}

// 是否允许取消（仅出餐前）
function canCancel(status) {
  return CANCELLABLE.indexOf(status) > -1;
}

function statusCls(status) {
  return STATUS_META[status] || 'pending';
}

// 月销结算依据：只要出过餐（已出单及之后，含已完成）就视为已贡献；
// 待接单/已接单/制作中/已取消一律不计入。
// 月销为派生统计：进入已出单 +quantity、退回 -quantity、重复进入再 +quantity，
// 由状态本身决定，任何重复点击都不会重复累计。
function hasShipped(status) {
  return status === '已出单' || status === '已完成';
}

module.exports = {
  STATUS_FLOW,
  normalizeStatus,
  nextStatus,
  prevStatus,
  canCancel,
  statusCls,
  hasShipped
};
