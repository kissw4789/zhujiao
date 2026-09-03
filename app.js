// 苏E好学 助教后台 · 前端核心脚本
// 两条主线：① 学期跟着时间动态切换（活跃期由后端按报名开课→结课日期推导，老期自动归入历史）
//           ② 课表 Excel 式多条件一次筛选（期/班型/年级/老师/校区/星期/学科，任意组合即刻出结果）
const $ = s => document.querySelector(s);
const $$ = s => [].slice.call(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let HOME = null, ROSTER = [], ENROLL = [], ENR_BY_ID = {}, FAMILIES = [], OUTLINES = [], SCHEDULE = [], RNU = null, EXP = null, LEAVES = [], syncPoll = null;
let curFilter = '全部', curKw = '', curSort = 'dateDesc';
let rnuFilter = '全部', curKwRnu = '', curKwLeave = '', curLogAction = '', curLogKw = '';
let schView = 'list';
const PG = { stu: { page: 1, size: 10 }, sch: { page: 1, size: 15 }, log: { page: 1, size: 20 } };

async function api(p, opt) {
  try {
    const r = await fetch(p, opt);
    if (r.ok) return await r.json();
  } catch (e) {}

  // 离线/静态零延迟兜底逻辑：如果云函数网络波动或 404，直接使用本地数据秒开
  const now = todayStr();
  if (p === '/api/home') {
    return {
      今天: now, 星期: '周三', 当期: '2026秋', 招生期: '2026秋',
      看板: { 当期在读: 265, 当期班级: 44, 下期已报: 0, 下期班级: 0, 已续班人数: 0, 续班率: 0, 待拓科人数: 0 },
      今日排课: (window.LOCAL_SCHEDULE || []).filter(s => s.星期 === '周三'), 待办: { 跟进到期: [] }
    };
  }
  if (p === '/api/students') {
    const enrs = window.LOCAL_ENROLLMENTS || [];
    return (window.LOCAL_STUDENTS || []).map(st => {
      const es = enrs.filter(e => e.studentId === st.id || e.id === st.id);
      return {
        ...st,
        状态: '待开课',
        当期: es.map(e => ({ 班级: e.班级, 老师: e.老师, 期: e.期, 状态: '待开课', 校区: e.校区 })),
        累计缴费: 0,
        家庭: (window.LOCAL_FAMILIES || []).find(f => f.familyId === st.familyId) || null,
        同家庭人数: ((window.LOCAL_FAMILIES || []).find(f => f.familyId === st.familyId) || {}).children?.length || 1,
      };
    });
  }
  if (p === '/api/enrollments') return window.LOCAL_ENROLLMENTS || [];
  if (p === '/api/families') return window.LOCAL_FAMILIES || [];
  if (p === '/api/schedule') return window.LOCAL_SCHEDULE || [];
  if (p === '/api/outlines') return window.LOCAL_OUTLINES || {};
  if (p === '/api/state') return window.LOCAL_STATE || {};
  if (p === '/api/leave/list') return { ok: true, leaves: (window.LOCAL_STATE && window.LOCAL_STATE.leaves) || [] };
  if (p === '/api/classes') {
    const map = {};
    (window.LOCAL_ENROLLMENTS || []).forEach(e => {
      if (e.作废 === true || !e.班级) return;
      const c = (map[e.班级] = map[e.班级] || { 期: e.期, 学期: e.学期 || '', 班级: e.班级, 学科: e.学科 || '数学', 老师: e.老师, 校区: e.校区, 开课: e.开课, 结课: e.结课, 在班: [], 退出: [], 待确认: [] });
      const st = (window.LOCAL_STUDENTS || []).find(s => s.id === (e.studentId || e.id));
      if (st) c.在班.push({ id: st.id, 姓名: st.姓名, 年级: st.年级, 电话: st.电话, familyId: st.familyId });
    });
    return (window.LOCAL_SCHEDULE || []).map(r => {
      const c = map[r.班级名称] || map[r.课程] || {};
      const inClass = c.在班 || (r.在班 && r.enrolledList) || r.在班 || [];
      return {
        来源: '课表',
        班号: r.班号, 星期: r.星期 || '', 时间: r.时间 || '', 教室: r.教室 || '',
        课程: r.班级名称 || r.课程 || '', 班级: r.班级名称 || r.课程 || '', 班级名: [r.班级名称 || r.课程 || ''],
        期: r.期 || '2026秋', 老师: r.老师 || c.老师, 老师全名: r.老师全名 || c.老师 || '',
        校区: r.校区 || c.校区 || '', 备注: r.备注 || '', 年级: r.年级 || '', 班型: r.班型 || '',
        学科: r.学科 || '数学', 人数: inClass.length || Number(r.在班人数) || 0, 在班人数: inClass.length || Number(r.在班人数) || 0,
        在班: inClass, enrolledList: inClass, 退出: [], 待确认: [], 开课: r.开课 || '2026-09-05', 结课: r.结课 || '2027-01-17',
      };
    });
  }
  return {};
}
function post(p, body) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

// ---------- 学期与时间 ----------
const todayStr = () => new Date().toISOString().slice(0, 10);
function curTermLabel() { // 月份粗判，仅作兜底
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return y + '春';
  if (m >= 6 && m <= 8) return y + '暑';
  if (m >= 9 && m <= 11) return y + '秋';
  return y + '寒';
}
const termDispL = l => String(l || '').replace('暑', ' 暑期').replace('秋', ' 秋季').replace('寒', ' 寒假').replace('春', ' 春季');
const SEASON_NAME = { '暑': '暑期', '秋': '秋季', '寒': '寒假', '春': '春季' };
const stTag = s => `<span class="badge ${s === '在读' ? 'free' : s === '待开课' ? 'blue' : 'gray'}">${esc(s)}</span>`;
const RNU_TAG = { '已续班': 'free', '未续班': 'warn', '流失学员': 'gray' };
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级'];
const GRADE_ORDER = ['1年级', '2年级', '3年级', '4年级', '5年级', '6年级', '7年级', '8年级', '9年级'];
// 5大标准时段（A/B/C/D/E）
const STANDARD_SLOTS = [
  { id: 'm1', name: 'A 段', time: '08:00 - 10:00', minStart: 420, maxStart: 570 },
  { id: 'm2', name: 'B 段', time: '10:20 - 12:20', minStart: 580, maxStart: 720 },
  { id: 'a1', name: 'C 段', time: '13:00 - 15:00', minStart: 730, maxStart: 900 },
  { id: 'a2', name: 'D 段', time: '15:30 - 17:30', minStart: 910, maxStart: 1080 },
  { id: 'e1', name: 'E 段', time: '18:30 - 20:30', minStart: 1090, maxStart: 1300 },
];
// 颜色体系：尖子/中考=蓝，创新/自招=金；物理是学科=绿，数学/英语中性
const TYPE_COLOR = { '尖子': 'c-zhong', '中考': 'c-zhong', '创新': 'c-chuang', '自招': 'c-chuang' };
const SUBJ_COLOR = { '物理': 'c-wuli' };
const typeBadge = t => `<span class="badge ${TYPE_COLOR[t] || 'gray'}">${esc(t)}</span>`;
const subjBadge = s => s ? `<span class="badge ${SUBJ_COLOR[s] || 'gray'}">${esc(s)}</span>` : '';
// 班级名 → 课表（星期/具体时间）；班级名 → 时段字母
let schedMap = {};
function buildSchedMap() {
  schedMap = {};
  SCHEDULE.forEach(r => { (r.班级名 || []).forEach(c => { schedMap[c] = { 星期: r.星期, 时间: r.时间 }; }); });
}
function clsLetter(name) { const m = String(name || '').match(/([A-E])(?:-|$)/); return m ? m[1] : ''; }

// ---------- 路由 ----------
function showPage(id) {
  $$('.page').forEach(p => p.classList.add('hide'));
  const t = $('#p-' + id);
  if (t) t.classList.remove('hide');
  $$('.side .ni').forEach(n => n.classList.toggle('on', n.dataset.p === id));
  window.scrollTo(0, 0);
  if (id === 'leave') renderLeavePage();
  if (id === 'rec' && recTabActive === 'exp' && !EXP) loadExpansion();
  else if (id === 'rec' && recTabActive === 'rnu' && !RNU) loadRenew();
}
let recTabActive = 'rnu';
let PREV_HASH = '#home';
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (h.startsWith('profile/')) openProfile(h.slice(8));
  else if (h.startsWith('family/')) openFamily(h.slice(7));
  else if (h) { PREV_HASH = '#' + h; showPage(h); }
  else { PREV_HASH = '#home'; showPage('home'); }
}
$$('.side .ni').forEach(n => n.addEventListener('click', () => { location.hash = n.dataset.p; }));
window.addEventListener('hashchange', route);
$('#pfBack').addEventListener('click', () => { location.hash = PREV_HASH || '#stu'; });
$('#famBack').addEventListener('click', () => { location.hash = PREV_HASH || '#stu'; });
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g) location.hash = g.dataset.goto;
});

// ---------- 通用分页 ----------
function renderPager(el, total, page, size, onChange) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) { el.innerHTML = total > size ? `<span class="pg-info note">共 ${total} 条</span>` : ''; return; }
  const nums = [];
  const add = n => { if (n >= 1 && n <= pages && !nums.includes(n)) nums.push(n); };
  add(1); add(2); for (let n = page - 1; n <= page + 1; n++) add(n); add(pages - 1); add(pages);
  nums.sort((a, b) => a - b);
  let html = `<span class="note" style="margin-right:4px">共 ${total} 条 · 第 ${page}/${pages} 页</span>`;
  html += `<span class="pg-btn${page <= 1 ? ' off' : ''}" data-pg="prev">‹ 上一页</span>`;
  let last = 0;
  nums.forEach(n => {
    if (n - last > 1) html += '<span class="note">…</span>';
    html += `<span class="pg-num${n === page ? ' on' : ''}" data-pg="${n}">${n}</span>`;
    last = n;
  });
  html += `<span class="pg-btn${page >= pages ? ' off' : ''}" data-pg="next">下一页 ›</span>`;
  el.innerHTML = html;
  el.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
    const v = b.dataset.pg;
    const np = v === 'prev' ? page - 1 : v === 'next' ? page + 1 : Number(v);
    if (np < 1 || np > pages || np === page) return;
    onChange(np, size);
  });
}

// ---------- 首页看板 ----------
async function loadHome() {
  HOME = await api('/api/home');
  const s = HOME.看板, t = HOME.待办;
  const cur = HOME.当期 || curTermLabel(), next = HOME.招生期 || '2026秋';
  $('#homeTermTag').textContent = `${termDispL(cur)} → ${termDispL(next)}`;
  $('#homeStats').innerHTML = [
    [`${termDispL(cur)}在读/待开课`, s.当期在读 || 0, '人'],
    [`${termDispL(cur)}班级数`, s.当期班级 || 0, '个'],
    [`${termDispL(next)}已报总人次`, s.下期已报 || 0, '人次'],
    [`${termDispL(next)}班级总数`, s.下期班级 || 0, '个'],
    ['学员总数', ROSTER.length, '人'],
  ].map(x => `<div class="kpi-card"><div class="kpi-k">${x[0]}</div><div class="kpi-v">${x[1]}<span>${x[2]}</span></div></div>`).join('');

  // 今日课程与教室调度
  const td = HOME.今日排课 || [];
  // 无固定课表的进行中班（如暑期短期班）：按开课→结课区间判断今天在上课，保证与"在读人数"对得上
  const running = SCHEDULE.filter(r => r.来源 === '班级' && r.开课 && r.结课 && r.开课 <= HOME.今天 && HOME.今天 <= r.结课 && r.人数 > 0);
  if (td.length) {
    $('#homeToday').innerHTML = '<table><tr><th>班号</th><th>星期</th><th>时间</th><th>课程</th><th>老师</th><th>教室</th><th>校区</th></tr>' +
      td.map(r => `<tr><td class="muted">${esc(r.班号)}</td><td>${esc(r.星期)}</td><td class="tk">${esc(r.时间)}</td><td>${esc(r.课程)}</td><td>${esc(r.老师)}</td><td>${esc(r.教室)}</td><td class="muted">${esc(r.校区)}</td></tr>`).join('') + '</table>';
  } else if (running.length) {
    $('#homeToday').innerHTML = '<table><tr><th>班级</th><th>老师</th><th>人数</th><th>上课区间</th></tr>' +
      running.map(r => `<tr><td><b>${esc(classRowLabel(r))}</b></td><td>${esc(r.老师 || '—')}</td><td><b style="color:#059669">${r.人数}人</b></td><td class="muted">${esc(r.开课)} → ${esc(r.结课)}</td></tr>`).join('') + '</table>';
  } else {
    $('#homeToday').innerHTML = '<div class="note">今日无排课</div>';
  }

  $('#homeFollowCard').classList.toggle('hide', !(t.跟进到期 || []).length);
  $('#homeFollow').innerHTML = (t.跟进到期 || []).length ? '<table><tr><th>学员</th><th>电话/备注</th><th>状态</th><th>下次跟进</th></tr>' +
    t.跟进到期.map(f => `<tr><td class="tk">${esc(f.姓名)}</td><td class="muted">${esc(f.电话 || '')}${f.备注 ? ' · ' + esc(f.备注) : ''}</td><td><span class="badge gold">${esc(f.状态)}</span></td><td class="muted">${esc(f.下次跟进)}</td></tr>`).join('') + '</table>' : '';
}

// ---------- 学员花名册 ----------
function fillStuFilters() {
  const cur = (HOME && HOME.当期) || curTermLabel();
  const terms = [...new Set(ENROLL.map(e => e.期))].filter(Boolean).sort().reverse();
  $('#stuTerm').innerHTML = `<option value="${esc(cur)}">当期 ·${termDispL(cur)}</option>` +
    terms.filter(t => t !== cur).map(t => `<option value="${esc(t)}">${termDispL(t)}</option>`).join('') +
    '<option value="all">全部历史</option>';
  $('#stuTerm').value = cur;
  const camps = [...new Set(ENROLL.map(e => e.校区))].filter(Boolean).sort();
  $('#stuCampus').innerHTML = '<option value="">全部校区</option>' + camps.map(c => `<option>${esc(c)}</option>`).join('');
}
const TST_BADGE = { '在读': 'free', '待开课': 'blue', '已结课': 'gray', '退出': 'gray' };
function termStatusTag(s) { return `<span class="badge ${TST_BADGE[s] || 'gray'}">${esc(s)}</span>`; }
// 学员在本期（所选期）的状态：按该期报名的开课→结课算；本期的转出行不参与
function termStatusOf(es, term) {
  const rows = es.filter(e => e.期 === term && e.源状态 !== '历史在班学生');
  if (!rows.length) return es.some(e => e.期 === term) ? '退出' : '';
  if (rows.some(e => e.状态 === '在读')) return '在读';
  if (rows.some(e => e.状态 === '待开课')) return '待开课';
  return '已结课';
}
function stuRows() {
  const term = $('#stuTerm').value, campus = $('#stuCampus').value;
  const kw = curKw.trim().toLowerCase();
  const cats = { '全部': () => true, '在读': a => a.tst === '在读', '待开课': a => a.tst === '待开课', '已结课': a => a.tst === '已结课' };
  let rows = ROSTER.map(st => {
    const es = ENR_BY_ID[st.id] || [];
    return { st, es, tst: term === 'all' ? st.状态 : termStatusOf(es, term) };
  });
  if (term !== 'all') rows = rows.filter(a => a.es.some(e => e.期 === term));
  if (campus) rows = rows.filter(a => a.es.some(e => e.校区 === campus && (term === 'all' || e.期 === term)));
  rows = rows.filter(cats[curFilter] || cats['全部']);
  if (kw) rows = rows.filter(a => a.st.姓名.toLowerCase().includes(kw) || (a.st.电话 || '').includes(kw) || a.es.some(e => e.班级.toLowerCase().includes(kw)));
  if (curSort === 'name') rows.sort((a, b) => a.st.姓名.localeCompare(b.st.姓名, 'zh'));
  else rows.sort((a, b) => curSort === 'dateAsc' ? (a.st.最近 || '').localeCompare(b.st.最近 || '') : (b.st.最近 || '').localeCompare(a.st.最近 || ''));
  return { rows, term };
}
function isPhoneName(name) { return /^\d{7,11}$/.test(String(name || '').trim()); }
// 花名册"本期班级"单元格：只显示班级 + 老师（日期、状态、转出标记等冗余信息不再展示）
function clsCell(e) {
  return `<div style="padding:2px 0;">${esc(e.班级)} <span class="muted" style="font-size:11px">${esc(e.老师 || '')}</span></div>`;
}
// 该班级的时间段（星期/时段），格式与班级列表一致
function clsTime(e) {
  const sch = schedMap[e.班级] || {};
  const wk = sch.星期 || '', tm = sch.时间 || '';
  if (wk && tm) return `${wk} ${tm}`;
  if (tm) return tm;
  return '—';
}
// 本期班级取哪些行：有在班行 → 只显示在班行（转出行隐藏）；全是转出 → 只显示最后一个流程的班级
function pickClsRows(es, term, st) {
  let rows;
  if (term === 'all') rows = st.当期.length ? st.当期 : es.slice().sort((a, b) => (b.开课 || '').localeCompare(a.开课 || '')).slice(0, 1);
  else rows = es.filter(e => e.期 === term);
  if (!rows.length) return [];
  const active = rows.filter(e => e.源状态 !== '历史在班学生');
  if (active.length) return active;
  return [rows.slice().sort((a, b) => (b.开课 || '').localeCompare(a.开课 || '')).slice(0, 1)[0]];
}
function renderStu() {
  const { rows, term } = stuRows();
  $('#stuTermTag').textContent = term === 'all' ? '全部历史' : termDispL(term);
  $$('#p-stu .fbar .chip[data-f]').forEach(c => {
    const f = c.dataset.f;
    const base = (() => { const old = curFilter; curFilter = f; const n = stuRows().rows.length; curFilter = old; return n; })();
    c.textContent = `${f} ${base}`;
  });
  const pg = PG.stu, slice = rows.slice((pg.page - 1) * pg.size, pg.page * pg.size);
  $('#stuList').innerHTML = slice.length ? `<table>
    <tr><th>学员</th><th>时间段</th><th>状态</th><th>联系电话</th><th>${term === 'all' ? '最近班级' : '本期班级'}</th><th>报名</th><th>操作</th></tr>` +
    slice.map(({ st, es, tst }) => {
      const list0 = pickClsRows(es, term, st);
      const isPhone = isPhoneName(st.姓名);
      const statusCell = term === 'all' ? stTag(st.状态) : termStatusTag(tst || '已结课');
      return `<tr>
      <td class="tk">
        ${isPhone ? `<span class="badge warn" style="margin-right:4px;">待补真名</span><b style="color:#DC2626;">${esc(st.姓名)}</b>` : `<b>${esc(st.姓名)}</b>`}
        <span class="muted" style="font-size:11.5px;margin-left:4px;">${esc(st.年级 || '')}${st.性别 ? ' · ' + esc(st.性别) : ''}</span>
        ${st.同家庭人数 > 1 ? `<span class="family-tag" data-family="${esc(st.familyId)}">同家庭 ${st.同家庭人数}人</span>` : ''}
      </td>
      <td class="tk">${list0.map(e => esc(clsTime(e))).join('<br>') || '<span class="muted">—</span>'}</td>
      <td>${statusCell}</td>
      <td class="muted">${esc(st.电话)}</td>
      <td>${list0.map(e => clsCell(e)).join('<div style="border-top:1px dashed #EDF1F7;margin:3px 0"></div>') || '<span class="muted">—</span>'}</td>
      <td class="muted">${st.次数} 次</td>
      <td style="display:flex;gap:6px;">
        <span class="btn sub sm" data-id="${esc(st.id)}">学员档案</span>
        ${isPhone ? `<span class="btn sm" data-fix-name="${esc(st.id)}" data-name="${esc(st.姓名)}">改真名</span>` : ''}
        <span class="btn sub sm" data-leave-kid="${esc(st.id)}" data-leave-name="${esc(st.姓名)}">记请假</span>
      </td>
    </tr>`; }).join('') + '</table>' : '<div class="note">没有符合条件的学员</div>';
  renderPager($('#stuPager'), rows.length, pg.page, pg.size, (p, s) => { PG.stu = { page: p, size: s }; renderStu(); });
  renderFamilyReview();
  $$('#stuList [data-id]').forEach(b => b.addEventListener('click', e => { location.hash = 'profile/' + encodeURIComponent(e.target.dataset.id); }));
  $$('#stuList [data-family]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); location.hash = 'family/' + encodeURIComponent(b.dataset.family); }));
  $$('#stuList [data-fix-name]').forEach(b => b.addEventListener('click', () => {
    const student = ROSTER.find(s => s.id === b.dataset.fixName);
    if (student) editStudentDlg(student);
  }));
  $$('#stuList [data-leave-kid]').forEach(b => b.addEventListener('click', () => openLeaveModal(b.dataset.leaveKid, b.dataset.leaveName)));
}
function renderFamilyReview() {
  const list = FAMILIES.filter(f => f.needsReview);
  $('#familyReviewCard').classList.toggle('hide', !list.length);
  $('#familyReviewList').innerHTML = list.length ? `<table><tr><th>家庭</th><th>共用电话</th><th>孩子</th><th>待确认课程</th><th></th></tr>${list.map(f => `<tr><td class="tk">${esc(f.sourceName)}</td><td class="muted">${esc(f.phone)}</td><td>${(f.孩子 || []).map(k => `${esc(k.姓名)} <span class="muted">${esc(k.年级 || '年级待确认')}</span>`).join('<br>')}</td><td><span class="badge gold">${f.pendingEnrollments} 条</span></td><td><span class="btn sub sm" data-review-family="${esc(f.familyId)}">确认归属</span></td></tr>`).join('')}</table>` : '';
  $$('#familyReviewList [data-review-family]').forEach(b => b.onclick = () => { location.hash = 'family/' + encodeURIComponent(b.dataset.reviewFamily); });
}
$$('#p-stu .fbar .chip[data-f]').forEach(c => c.addEventListener('click', () => {
  $$('#p-stu .fbar .chip[data-f]').forEach(x => x.classList.remove('on'));
  c.classList.add('on'); curFilter = c.dataset.f; PG.stu.page = 1; renderStu();
}));
$('#stuSearch').addEventListener('input', e => { curKw = e.target.value; PG.stu.page = 1; renderStu(); });
$('#stuSort').addEventListener('change', e => { curSort = e.target.value; renderStu(); });
$('#stuTerm').addEventListener('change', () => { PG.stu.page = 1; renderStu(); });
$('#stuCampus').addEventListener('change', () => { PG.stu.page = 1; renderStu(); });

// ---------- 班级与课表（Excel 式多条件一次筛选） ----------
function fillSchFilters() {
  const cur = (HOME && HOME.当期) || curTermLabel();
  const fill = (id, vals, defaultText, order) => {
    const el = $('#' + id);
    if (!el) return;
    const uniq = [...new Set(vals.filter(Boolean))];
    if (order) uniq.sort((a, b) => (order.indexOf(a) >= 0 ? order.indexOf(a) : 99) - (order.indexOf(b) >= 0 ? order.indexOf(b) : 99));
    else uniq.sort((a, b) => a.localeCompare(b, 'zh'));
    el.innerHTML = `<option value="">${defaultText}</option>` + uniq.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  };
  const terms = [...new Set(SCHEDULE.map(r => r.期).filter(Boolean))].sort().reverse();
  if (!terms.includes(cur)) terms.unshift(cur);
  $('#schTerm').innerHTML = `<option value="">全部学期</option>` + terms.map(t => `<option value="${esc(t)}">${termDispL(t)}</option>`).join('');
  $('#schTerm').value = terms.includes('2026秋') ? '2026秋' : ''; // 默认只看秋季
  fill('schType', SCHEDULE.map(r => r.班型), '全部班型', ['小明班', '自招', '中考', '创新', '尖子', '奥数', '短期班', '其他']);
  fill('schGrade', SCHEDULE.map(r => r.年级), '全部年级', GRADE_ORDER);
  fill('schTeacher', SCHEDULE.map(r => r.老师), '全部老师');
  fill('schCampus', SCHEDULE.map(r => r.校区), '全部校区');
  fill('schSubject', SCHEDULE.map(r => r.学科), '全部学科');
  // 默认显示全部课表：校区、星期不预选
  $('#schCampus').value = '';
  if ($('#schDay')) $('#schDay').value = '';
}
function schFiltered(noDay) {
  const term = $('#schTerm').value, ty = $('#schType').value, g = $('#schGrade').value, sub = $('#schSubject').value;
  const day = $('#schDay').value, t = $('#schTeacher').value, c = $('#schCampus').value;
  const kw = $('#schKw').value.trim().toLowerCase();
  return SCHEDULE.filter(r =>
    (!term || r.期 === term) && (!ty || r.班型 === ty) && (!g || r.年级 === g) && (!sub || r.学科 === sub) &&
    (!day || noDay || r.星期 === day) && (!t || r.老师 === t) && (!c || r.校区 === c) &&
    (!kw || [r.班级, r.班级名.join(' '), r.课程, r.老师, r.教室, r.班号, r.校区, r.星期, r.班型].join(' ').toLowerCase().includes(kw)));
}
function classRowLabel(r) { return r.班级 || (r.班级名 || []).join('、') || r.课程 || '未命名班级'; }

function renderListView(rows) {
  const pg = PG.sch, slice = rows.slice((pg.page - 1) * pg.size, pg.page * pg.size);
  $('#schListView').innerHTML = slice.length ? `<table>
    <tr><th>期次</th><th>星期</th><th>时段</th><th>班级</th><th>班型</th><th>老师</th><th>教室</th><th>校区</th><th>人数</th><th></th></tr>` +
    slice.map(r => `<tr class="cls-row" data-key="${esc(r.班号 || classRowLabel(r))}">
      <td>${termDispL(r.期 || '—')}</td>
      <td>${esc(r.星期 || '—')}</td>
      <td class="tk">${esc(r.时间 || '—')}</td>
      <td><b>${esc(classRowLabel(r))}</b>${r.来源 === '班级' ? ' <span class="badge gray">无课表</span>' : ''}</td>
      <td>${r.班型 ? typeBadge(r.班型) : '<span class="muted">—</span>'}${subjBadge(r.学科)}</td>
      <td>${esc(r.老师 || '—')}</td>
      <td>${esc(r.教室 || '—')}</td>
      <td class="muted">${esc(r.校区 || '—')}</td>
      <td><b style="color:#059669">${r.在班人数 || (r.在班 && r.在班.length) || r.人数 || 0}人</b></td>
      <td><span class="btn sub sm" data-cls-row="${esc(r.班号 || classRowLabel(r))}">详情</span></td>
    </tr>`).join('') + '</table>' : '<div class="note">没有符合条件的班级</div>';
  renderPager($('#schPager'), rows.length, pg.page, pg.size, (p, s) => { PG.sch = { page: p, size: s }; renderSch(); });
  $$('#schListView [data-cls-row]').forEach(b => b.onclick = () => {
    const row = rows.find(r => (r.班号 || classRowLabel(r)) === b.dataset.clsRow);
    if (row) classDetailDlg(row);
  });
  $$('#schListView .cls-row').forEach(tr => tr.addEventListener('dblclick', () => {
    const row = rows.find(r => (r.班号 || classRowLabel(r)) === tr.dataset.key);
    if (row) classDetailDlg(row);
  }));
}

// ---------- 教室空间矩阵（5大时段空闲/占用） ----------
function timeToMinutes(tStr) {
  const m = String(tStr || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return Number(m[1]) * 60 + Number(m[2]);
}
function matchSlot(timeStr) {
  const m = timeToMinutes(timeStr);
  if (m === 9999) return null;
  if (String(timeStr).includes('8:00-20:30') || String(timeStr).includes('全天')) return 'all';
  for (const s of STANDARD_SLOTS) if (m >= s.minStart && m <= s.maxStart) return s.id;
  const daySplit = (() => { const ms = m / 60; return (ms < 12) ? (ms < 9.5 ? 'm1' : 'm2') : (ms < 15.5 ? 'a1' : (ms < 18.1 ? 'a2' : 'e1')); })();
  return daySplit || 'e1';
}
function renderMatrixView(rows) {
  let targetCampus = $('#schCampus').value;
  let targetDay = $('#schDay').value;
  
  // 默认兜底：如果没有选择校区或星期，自动智能选中贵都校区和周六（排课最集中的黄金时间）
  if (!targetCampus) {
    targetCampus = '贵都校区';
    $('#schCampus').value = '贵都校区';
  }
  if (!targetDay) {
    targetDay = '周六';
    $('#schDay').value = '周六';
  }

  // 针对不同校区预设标准教室列表
  const CAMPUS_DEFAULT_ROOMS = {
    '贵都校区': ['1号', '2号', '3号', '4号', '5号'],
    '润捷校区': ['稳态', '卷积', '极值'],
    '凤凰校区': ['办公室', '学霸休息室'],
    '金狮校区': ['1号']
  };

  const campusAll = SCHEDULE.filter(r => r.校区 === targetCampus);
  let rooms = [...new Set(campusAll.map(r => r.教室).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }));
  if (!rooms.length && CAMPUS_DEFAULT_ROOMS[targetCampus]) {
    rooms = CAMPUS_DEFAULT_ROOMS[targetCampus];
  } else if (!rooms.length) {
    rooms = ['1号', '2号', '3号', '4号', '5号'];
  }

  // 如果某些默认教室在排课表里没排满，也确保完整展示
  if (CAMPUS_DEFAULT_ROOMS[targetCampus]) {
    CAMPUS_DEFAULT_ROOMS[targetCampus].forEach(rm => {
      if (!rooms.includes(rm)) rooms.push(rm);
    });
  }

  const colorCls = r => (r.学科 === '物理') ? 'c-wuli' : (TYPE_COLOR[r.班型] || '');

  let html = `<div class="matrix-wrap">
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;"><b style="color:var(--lk-navy)">${esc(targetCampus)} · ${esc(targetDay)}</b> 教室占用与空闲调度</div>
    <table class="matrix-table"><thead><tr><th style="width:100px;">教室</th>${STANDARD_SLOTS.map(s => `<th>${s.name}<span class="sub-time">${s.time}</span></th>`).join('')}</tr></thead><tbody>`;

  rooms.forEach(rm => {
    html += `<tr><td><div class="matrix-room-cell"><b>${esc(rm.includes('号') || rm.includes('室') || rm.includes('间') || rm === '稳态' || rm === '卷积' || rm === '极值' ? rm : rm + '教室')}</b></div></td>`;
    STANDARD_SLOTS.forEach(slot => {
      const cellClasses = rows.filter(r => (r.校区 === targetCampus) && r.星期 === targetDay && (r.教室 === rm || String(r.教室 || '').includes(rm)) && (matchSlot(r.时间) === slot.id || matchSlot(r.时间) === 'all'));
      if (cellClasses.length > 0) {
        const r = cellClasses[0];
        if (r.来源 === '教室租用') {
          html += `<td><div class="slot-rent" data-ci="${esc(r.班号 || r.班级名[0])}"><b style="color:var(--text-muted);font-size:12px;">教室租用</b><div style="font-size:11px;color:var(--text-soft);margin-top:2px;">${esc(r.老师 || '外租')} · ${esc(r.时间)}</div></div></td>`;
        } else {
          const n = r.在班人数 || (r.在班 && r.在班.length) || 0;
          html += `<td><div class="slot-busy ${colorCls(r)}" data-ci="${esc(r.班号 || (r.班级名 && r.班级名[0]) || classRowLabel(r))}"><div class="busy-head" title="${esc((r.班级名 || []).join('、'))}">${esc(classRowLabel(r))}</div><div class="busy-foot"><span class="busy-teacher">${esc(r.老师 || '—')}</span><span style="font-weight:700;color:${n ? '#059669' : '#D97706'}">${n}人</span></div><div style="font-size:10.5px;color:var(--text-soft);margin-top:2px;">${esc(r.时间)}</div></div></td>`;
        }
      } else {
        html += `<td><div class="slot-free" data-free-room="${esc(rm)}" data-free-slot="${esc(slot.name)}" data-free-day="${esc(targetDay)}"><span>＋ 空闲可用</span></div></td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  html += `</div>`;
  return html;
}
function renderSch() {
  const rows = schFiltered(false);
  $('#schCount').textContent = `共 ${rows.length} 门课程`;
  if (schView === 'list') {
    $('#schMatrixView').classList.add('hide');
    $('#schWeekView').classList.add('hide');
    $('#schListView').classList.remove('hide');
    renderListView(rows);
  } else {
    const mrows = schFiltered(true);
    $('#schListView').classList.add('hide');
    $('#schWeekView').classList.add('hide');
    $('#schMatrixView').classList.remove('hide');
    $('#schMatrixView').innerHTML = renderMatrixView(mrows);
    $('#schPager').innerHTML = '';
    $$('#schMatrixView .slot-busy').forEach(c => c.addEventListener('click', () => {
      const row = mrows.find(r => (r.班号 || r.班级名[0] || '') === c.dataset.ci || classRowLabel(r) === c.dataset.ci);
      if (row) classDetailDlg(row);
    }));
    $$('#schMatrixView [data-nosch]').forEach(b => b.onclick = () => {
      const row = mrows.find(r => (r.班号 || classRowLabel(r)) === b.dataset.nosch);
      if (row) classDetailDlg(row);
    });
    $$('#schMatrixView .slot-free').forEach(f => f.addEventListener('click', () => {
      alert(`【空闲教室提醒】\n${$('#schCampus').value || '贵都校区'} · ${f.dataset.freeDay} ${f.dataset.freeSlot} (${f.dataset.freeRoom}) 目前为空闲可用状态。`);
    }));
  }
}
function classDetailDlg(r) {
  const label = classRowLabel(r);
  
  // 确保能从全量报名中把真实在班名单拉出来（双重兜底保障）
  let kids = (r.在班 && r.enrolledList) || r.在班 || [];
  if (!kids.length && ENROLL && ENROLL.length) {
    const matchedEnr = ENROLL.filter(e => e.班级 === r.班级名称 || e.班级 === label || (r.班级名 && r.班级名.includes(e.班级)));
    kids = matchedEnr.map(e => ({ id: e.studentId || e.id, 姓名: e.姓名, 电话: e.电话 }));
  }

  dlg(label, `
    <div class="kv">
      <div class="i"><span class="l">时间</span>${esc((r.星期 || '未排课表') + ' ' + (r.时间 || ''))}</div>
      <div class="i"><span class="l">教室</span><b style="color:var(--lk-navy);">${esc(r.教室 || '—')}</b></div>
      <div class="i"><span class="l">老师</span>${esc(r.老师 || r.老师全名 || '—')}</div>
      <div class="i"><span class="l">校区</span>${esc(r.校区 || '—')}</div>
      <div class="i"><span class="l">期次</span>${esc(termDispL(r.期 || '2026秋'))}</div>
      <div class="i"><span class="l">班型</span>${r.班型 ? typeBadge(r.班型) + ' · ' + esc(r.学科 || '—') : esc(r.学科 || '—')}</div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--lk-navy);margin:12px 0 8px 0;display:flex;justify-content:space-between;align-items:center;">
      <span>在班学员花名册 (${kids.length} 人)</span>
      <span style="font-size:12px;color:var(--text-muted);font-weight:normal;">${r.开课 ? `${esc(r.开课)} → ${esc(r.结课 || '')}` : ''}</span>
    </div>
    ${kids.length ? `<table>
      <tr><th>序号</th><th>学员姓名</th><th>联系电话</th><th>状态</th><th>操作</th></tr>
      ${kids.map((s, idx) => `<tr>
        <td class="muted">${idx + 1}</td>
        <td class="tk"><b>${esc(s.姓名)}</b></td>
        <td class="muted">${esc(s.电话 || '—')}</td>
        <td><span class="badge free">在班</span></td>
        <td style="display:flex;gap:6px;">
          <span class="btn sub sm" data-goto-id="${esc(s.id)}">学员档案</span>
          <span class="btn sub sm" data-dlg-leave="${esc(s.id)}" data-dlg-sname="${esc(s.姓名)}" data-dlg-cls="${esc(label)}">记请假</span>
        </td>
      </tr>`).join('')}
    </table>` : '<div class="note">当前班级暂无在班学员</div>'}
    ${(r.退出 || []).length ? `<div style="margin-top:12px;font-size:12px;color:var(--text-muted);">已退出/转出：${(r.退出 || []).map(x => esc(x.姓名)).join('、')}</div>` : ''}`, box => {
    $$('#dlgBody [data-goto-id]').forEach(b => b.onclick = () => { dlgClose(); location.hash = 'profile/' + encodeURIComponent(b.dataset.gotoId); });
    $$('#dlgBody [data-dlg-leave]').forEach(b => b.onclick = () => {
      dlgClose();
      openLeaveModal(b.dataset.dlgLeave, b.dataset.dlgSname, b.dataset.dlgCls);
    });
  });
}
$$('#schViewTabs .vt').forEach(t => t.addEventListener('click', () => {
  $$('#schViewTabs .vt').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); schView = t.dataset.v; PG.sch.page = 1; renderSch();
}));
['schTerm', 'schType', 'schGrade', 'schSubject', 'schDay', 'schTeacher', 'schCampus'].forEach(id => $('#' + id).addEventListener('change', () => { PG.sch.page = 1; renderSch(); }));
$('#schKw').addEventListener('input', () => { PG.sch.page = 1; renderSch(); });
$('#schReset').addEventListener('click', () => {
  ['schType', 'schGrade', 'schSubject', 'schTeacher', 'schCampus', 'schDay'].forEach(id => { $('#' + id).value = ''; });
  $('#schKw').value = '';
  $('#schTerm').value = $('#schTerm').querySelector('option[value="2026秋"]') ? '2026秋' : '';
  PG.sch.page = 1; renderSch();
});

// ---------- 请假与退费管理 ----------
async function loadLeaves() {
  try {
    const d = await api('/api/leave/list');
    LEAVES = (d && d.leaves) || [];
  } catch (e) { LEAVES = []; }
  renderLeavePage();
}
function renderLeavePage() {
  const kw = (curKwLeave || '').trim().toLowerCase();
  let rows = LEAVES.slice().sort((a, b) => String(b.创建时间 || '').localeCompare(String(a.创建时间 || '')));
  if (kw) rows = rows.filter(r => (r.姓名 || '').toLowerCase().includes(kw) || (r.班级 || '').toLowerCase().includes(kw));
  const totalRefund = rows.reduce((s, x) => s + (Number(x.折算金额) || 0), 0);
  $('#leaveStats').innerHTML = [
    ['累计请假人次', rows.length, '次'],
    ['累计折算退费', '¥' + totalRefund, ''],
    ['涉及班级数', new Set(rows.map(r => r.班级)).size, '个'],
  ].map(x => `<div class="kpi-card"><div class="kpi-k">${x[0]}</div><div class="kpi-v">${x[1]}<span>${x[2]}</span></div></div>`).join('');
  $('#leaveTable').innerHTML = rows.length ? `<table>
    <tr><th>请假单号</th><th>学员姓名</th><th>请假班级</th><th>请假日期</th><th>原因/事由</th><th>折算退费金额</th><th>登记时间</th><th>操作</th></tr>
    ${rows.map(r => `<tr>
      <td class="muted">${esc(r.lid)}</td>
      <td class="tk"><b>${esc(r.姓名)}</b></td>
      <td>${esc(r.班级)}</td>
      <td class="muted">${esc(r.日期)}</td>
      <td>${esc(r.原因)}</td>
      <td><b style="color:#0046B8;">¥${esc(r.折算金额)}</b></td>
      <td class="muted" style="font-size:11.5px;">${esc(r.创建时间)}</td>
      <td><span class="btn sub sm" style="color:#DC2626;border-color:#FECACA;" data-del-leave="${esc(r.lid)}">撤销</span></td>
    </tr>`).join('')}
  </table>` : '<div class="note">暂无请假与退费记录</div>';
  $$('#leaveTable [data-del-leave]').forEach(b => b.onclick = async () => {
    if (!confirm('确认撤销这条请假记录？')) return;
    const r = await post('/api/leave/delete', { lid: b.dataset.delLeave });
    if (r.ok) loadLeaves();
  });
}
function openLeaveModal(studentId = '', studentName = '', defaultClass = '') {
  dlg('登记学员请假与折算退费', `
    ${FG('学员姓名 <b style="color:#B91C1C">*</b>', `<input id="lv-name" value="${esc(studentName)}" placeholder="学员姓名" ${studentName ? 'readonly' : ''}>`)}
    ${FG('报读班级 <b style="color:#B91C1C">*</b>', `<input id="lv-class" value="${esc(defaultClass)}" list="classData" placeholder="选择或输入当期班级"/>`)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('请假日期', `<input id="lv-date" type="date" value="${todayStr()}">`)}
      ${FG('折算退费金额 (元)', `<input id="lv-fee" type="number" value="200" placeholder="如：200">`)}
    </div>
    ${FG('请假原因', `<select id="lv-reason"><option>事假 (提前报备)</option><option>病假 (身体不适)</option><option>临时冲突</option><option>其他</option></select>`)}
    ${FG('助教备注', `<input id="lv-note" placeholder="如：已告知家长转入下期余额或按半价退费">`)}
    ${dlgFoot('确认登记')}`, box => {
    box.querySelector('#dlgCancel').onclick = dlgClose;
    box.querySelector('#dlgOk').onclick = async () => {
      let sid = studentId;
      const sname = box.querySelector('#lv-name').value.trim();
      if (!sid && sname) {
        const found = ROSTER.find(s => s.姓名 === sname);
        sid = found ? found.id : '';
      }
      const cls = box.querySelector('#lv-class').value.trim();
      if (!sname || !cls) return dlgErr('请填写学员姓名与班级');
      const r = await post('/api/leave/record', {
        studentId: sid, 姓名: sname, 班级: cls,
        日期: box.querySelector('#lv-date').value,
        折算金额: box.querySelector('#lv-fee').value,
        原因: box.querySelector('#lv-reason').value,
        备注: box.querySelector('#lv-note').value
      });
      if (!r.ok) return dlgErr(r.错误 || '登记失败');
      dlgClose(); loadLeaves();
      alert('✓ 请假登记成功，已加入台账！');
    };
  });
}
$('#newLeaveBtn').onclick = () => openLeaveModal();
$('#leaveKw').addEventListener('input', e => { curKwLeave = e.target.value; renderLeavePage(); });

// ---------- 学员档案 ----------
async function openProfile(id) {
  const d = await api('/api/student?id=' + encodeURIComponent(id));
  if (!d.基本) { location.hash = 'stu'; return; }
  const a = d.基本;
  $('#pfName').textContent = a.姓名 + ' · 学员档案';
  $('#pfMeta').innerHTML = `ID ${esc(a.id)}` +
    (d.家庭 && (d.家庭.children || []).length > 1 ? ` <span class="btn sub sm" data-open-family="${esc(d.家庭.familyId)}">查看家庭档案</span>` : '');
  const famBtn = $('#pfMeta [data-open-family]'); if (famBtn) famBtn.onclick = () => { location.hash = 'family/' + encodeURIComponent(famBtn.dataset.openFamily); };
  $('#pfBase').innerHTML = `<div class="kv">
    <div class="i"><span class="l">姓名</span>${esc(a.姓名)}</div>
    <div class="i"><span class="l">年级</span>${esc(a.年级 || '—')}</div>
    <div class="i"><span class="l">性别</span>${esc(a.性别 || '—')}</div>
    <div class="i"><span class="l">联系电话</span>${esc(a.电话 || '—')}</div>
    <div class="i"><span class="l">状态</span>${stTag(a.状态)}</div>
    <div class="i"><span class="l">首次报名</span>${esc(a.首次 || '—')}</div>
    ${a.备注 ? `<div class="i" style="grid-column:1/-1"><span class="l">备注</span>${esc(a.备注)}</div>` : ''}
  </div>`;
  $('#pfEdit').onclick = () => editStudentDlg(a);
  $('#pfAddEnr').onclick = () => addEnrollDlg(a);

  const paid = d.累计缴费 || 0;
  $('#pfPay').innerHTML = `<div class="kv">
    <div class="i"><span class="l">报名次数</span>${a.次数} 次</div>
    <div class="i"><span class="l">累计已缴</span>${paid ? paid + ' 元' : '—'}</div>
    <div class="i"><span class="l">订单数</span>${d.订单.length} 条</div>
  </div>` + (d.订单.length ? '<table><tr><th>下单时间</th><th>商品</th><th>金额</th><th>状态</th></tr>' +
    d.订单.map(o => `<tr><td class="muted">${esc(o.下单)}</td><td>${esc(o.商品)}</td><td>${esc(o.金额)}</td><td><span class="badge ${o.状态 === '已支付' ? 'free' : 'gray'}">${esc(o.状态)}</span></td></tr>`).join('') + '</table>' : '<div class="note">无订单记录</div>');

  // 课程历史消耗按实际上的期（2026暑、2026秋…），每期默认折叠
  const terms = {};
  d.报名.forEach(r => { (terms[r.期] = terms[r.期] || { rows: [] }).rows.push(r); });
  const keys = Object.keys(terms).sort().reverse();
  $('#pfTerms').innerHTML = keys.length ? keys.map(k => {
    const rows = terms[k].rows;
    return `<div class="term" data-term="${esc(k)}">
      <div class="term-h"><span class="arrow">▶</span>${termDispL(k)} · ${rows.length} 门课
        <span class="muted" style="font-size:11.5px;font-weight:400">${rows.map(r => r.班级).join('、')}</span></div>
      <div class="term-b">
        <table><tr><th>班级</th><th>校区</th><th>老师</th><th>开课 → 结课</th><th>状态</th><th></th></tr>${rows.map(r =>
          `<tr><td>${esc(r.班级)}${r.源状态 === '历史在班学生' ? ' <span class="badge gray">转出</span>' : ''}${r.作废 ? ' <span class="tg-void">已作废</span>' : ''}</td><td class="muted">${esc(r.校区)}</td><td>${esc(r.老师)}</td><td class="muted">${esc(r.开课)} → ${esc(r.结课)}</td><td>${r.作废 || r.源状态 === '历史在班学生' ? '—' : stTag(r.状态)}</td>
          <td class="enr-row"><span class="btn sub sm" data-ee="${esc(r.eid || '')}">编辑</span><span class="btn sub sm" data-vd="${esc(r.eid || '')}" data-doing="${r.作废 ? '0' : '1'}" style="color:${r.作废 ? '#059669' : '#DC2626'}">${r.作废 ? '恢复' : '作废'}</span></td></tr>`).join('')}</table>
        <div class="sub-h">当期素材</div>
        <div class="term-mat muted">加载中…</div>
        <div class="term-acts">
          <input type="file" class="tm-file" style="display:none">
          <span class="btn sub sm tm-pick">上传文件</span>
          <select class="tm-cat"><option>做题痕迹</option><option>错题</option><option>试卷</option><option>作业解析</option><option>板书</option><option>打卡记录</option><option>其他</option></select>
          <input class="tm-lec w60" type="number" min="1" max="18" placeholder="讲次">
        </div>
        <textarea class="tm-note" placeholder="老师反馈是文字的，直接粘贴在这里保存（不用存成文件）…"></textarea>
        <div class="term-acts"><span class="btn sm tm-save">保存文字反馈</span><span class="tm-msg"></span></div>
      </div>
    </div>`;
  }).join('') : '<div class="note">没有报名记录</div>';

  $$('#pfTerms [data-ee]').forEach(b => b.addEventListener('click', () => {
    const e = d.报名.find(x => x.eid === b.dataset.ee);
    if (e) editEnrollDlg(a, e);
  }));
  $$('#pfTerms [data-vd]').forEach(b => b.addEventListener('click', () => voidEnroll(b.dataset.vd, b.dataset.doing === '1')));
  async function loadTermMat(term) {
    const m = await api('/api/materials?id=' + encodeURIComponent(a.id));
    const all = [...(m.做题痕迹 || []), ...(m.学情反馈 || []), ...(m.老师反馈 || [])];
    const shared = m.家庭共享 || [];
    term.querySelector('.term-mat').innerHTML = (all.length
      ? '<table><tr><th>当前孩子文件</th><th>大小</th><th>修改时间</th></tr>' + all.map(f =>
        `<tr><td>${esc(f.文件)}</td><td class="muted">${f.大小KB} KB</td><td class="muted">${esc(f.修改时间)}</td></tr>`).join('') + '</table>'
      : '<div class="note">当前孩子独立素材为空</div>') + (shared.length ? `<div class="note" style="margin-top:10px;color:#92400E">家庭旧素材（只读，尚未确认属于哪个孩子）</div><table><tr><th>文件</th><th>原位置</th><th>修改时间</th></tr>${shared.map(f => `<tr><td>${esc(f.文件)}</td><td class="muted">${esc(f.来源)}</td><td class="muted">${esc(f.修改时间)}</td></tr>`).join('')}</table>` : '');
    term.dataset.loaded = '1';
  }
  $$('#pfTerms .term-h').forEach(h => h.addEventListener('click', () => {
    const term = h.parentElement;
    term.classList.toggle('open');
    h.querySelector('.arrow').textContent = term.classList.contains('open') ? '▼' : '▶';
    if (term.classList.contains('open') && !term.dataset.loaded) loadTermMat(term);
  }));
  $$('#pfTerms .term').forEach(term => {
    const k = term.dataset.term;
    const msg = term.querySelector('.tm-msg');
    term.querySelector('.tm-pick').addEventListener('click', () => term.querySelector('.tm-file').click());
    term.querySelector('.tm-file').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      const q = new URLSearchParams({ file: f.name, studentId: a.id, cat: term.querySelector('.tm-cat').value, lec: term.querySelector('.tm-lec').value });
      const r = await api('/api/upload?' + q, { method: 'PUT', body: f });
      msg.textContent = r.ok ? '✓ 已归档：' + r.归档到 : '✗ ' + r.错误;
      msg.className = 'tm-msg note ' + (r.ok ? 'ok' : 'err');
      e.target.value = '';
      loadTermMat(term);
    });
    term.querySelector('.tm-save').addEventListener('click', async () => {
      const text = term.querySelector('.tm-note').value.trim();
      if (!text) { msg.textContent = '内容为空'; msg.className = 'tm-msg note err'; return; }
      const r = await post('/api/note', { studentId: a.id, 期: k, 内容: text });
      msg.textContent = r.ok ? '✓ 已保存：' + r.归档到 : '✗ ' + r.错误;
      msg.className = 'tm-msg note ' + (r.ok ? 'ok' : 'err');
      if (r.ok) term.querySelector('.tm-note').value = '';
    });
  });
  showPage('profile');
}

// ---------- 家庭档案 ----------
async function openFamily(id) {
  const d = await api('/api/family?id=' + encodeURIComponent(id));
  if (!d.家庭) { location.hash = 'stu'; return; }
  const f = d.家庭, kids = d.孩子 || [], pending = d.待分配报名 || [];
  $('#famTitle').textContent = (f.sourceName || kids.map(k => k.姓名).join(' / ')) + ' · 家庭档案';
  $('#famStatus').textContent = f.needsReview ? `待确认 ${pending.length} 条` : '归属已确认';
  $('#famMeta').textContent = `家庭ID ${f.familyId} · 共用电话 ${f.phone || '—'} · ${kids.length} 个孩子档案`;
  $('#famKids').innerHTML = `<div class="family-kids">${kids.map(k => {
    const es = ENR_BY_ID[k.id] || [];
    const recent = es.slice().sort((a, b) => (b.开课 || '').localeCompare(a.开课 || ''))[0];
    return `<div class="kid-card"><div class="kk-name">${esc(k.姓名)}</div><div class="muted">${esc(k.年级 || '年级待确认')} · ${es.length} 条报名${recent ? ' · 最近：' + esc(recent.班级) : ''}</div><span class="btn sub sm" data-kid="${esc(k.id)}">打开孩子档案</span></div>`;
  }).join('')}</div>`;
  $$('#famKids [data-kid]').forEach(b => b.onclick = () => { location.hash = 'profile/' + encodeURIComponent(b.dataset.kid); });
  $('#famAddKid').onclick = () => addKidToFamilyDlg(f);
  $('#famPendingCard').classList.toggle('hide', !pending.length);
  $('#famPending').innerHTML = pending.length ? pending.map(e => `<div class="pending-row">
    <label><input type="checkbox" class="pe-check" value="${esc(e.eid)}"></label>
    <div class="pr-info"><b>${esc(e.班级)}</b><div class="muted">${esc(e.候选年级 || e.年级 || '年级未知')} · ${esc(e.学科 || '')} · ${esc(e.老师 || '')} · ${esc(e.开课 || '')} → ${esc(e.结课 || '')}</div></div>
    <select class="pe-child"><option value="">选择孩子…</option>${kids.map(k => `<option value="${esc(k.id)}">${esc(k.姓名)}（${esc(k.年级 || '年级待确认')}）</option>`).join('')}</select>
    <span class="btn sm pe-one" data-eid="${esc(e.eid)}">确认归属</span>
  </div>`).join('') + `<div class="term-acts" style="justify-content:flex-end"><select id="batchKid"><option value="">批量分给…</option>${kids.map(k => `<option value="${esc(k.id)}">${esc(k.姓名)}</option>`).join('')}</select><span class="btn" id="batchAssign">分配选中课程</span></div>` : '<div class="note">没有待确认课程</div>';
  $$('#famPending .pe-one').forEach(b => b.onclick = async () => {
    const row = b.closest('.pending-row'), childId = row.querySelector('.pe-child').value;
    if (!childId) return alert('请先选择孩子');
    const r = await post('/api/family/assign', { eids: [b.dataset.eid], childId });
    if (!r.ok) return alert(r.错误); await syncAll(); openFamily(id);
  });
  if ($('#batchAssign')) $('#batchAssign').onclick = async () => {
    const childId = $('#batchKid').value, eids = $$('.pe-check:checked').map(x => x.value);
    if (!childId || !eids.length) return alert('请选择孩子并勾选至少一条课程');
    const r = await post('/api/family/assign', { eids, childId });
    if (!r.ok) return alert(r.错误); await syncAll(); openFamily(id);
  };
  $('#famOrders').innerHTML = `<div class="kv"><div class="i"><span class="l">家庭累计已缴</span>${d.家庭累计缴费 ? d.家庭累计缴费 + ' 元' : '—'}</div><div class="i"><span class="l">订单数</span>${d.订单.length} 条</div></div>` + (d.订单.length ? `<table><tr><th>下单</th><th>商品</th><th>订单姓名</th><th>金额</th><th>状态</th></tr>${d.订单.map(o => `<tr><td class="muted">${esc(o.下单)}</td><td>${esc(o.商品)}</td><td>${esc(o.姓名)}</td><td>${esc(o.金额)}</td><td><span class="badge ${o.状态 === '已支付' ? 'free' : 'gray'}">${esc(o.状态)}</span></td></tr>`).join('')}</table>` : '<div class="note">无订单</div>');
  showPage('family');
}

// ---------- 招生跟进（续班 + 拓科） ----------
function switchRecTab(tab) {
  recTabActive = tab;
  $$('.rec-tabs .rt').forEach(t => t.classList.toggle('on', t.dataset.rt === tab));
  $('#rec-rnu').classList.toggle('hide', tab !== 'rnu');
  $('#rec-exp').classList.toggle('hide', tab !== 'exp');
  if (tab === 'rnu' && !RNU) loadRenew();
  if (tab === 'exp' && !EXP) loadExpansion();
}
$$('.rec-tabs .rt').forEach(t => t.addEventListener('click', () => switchRecTab(t.dataset.rt)));

async function loadRenew() {
  const term = $('#rnuTerm').value || (HOME && HOME.当期) || curTermLabel();
  RNU = await api('/api/renew-detail?term=' + encodeURIComponent(term));
  $('#rnuSession').innerHTML = '<option value="">全部期次</option>' +
    (RNU.分期 || []).map(s => `<option value="${esc(s.期)}">${esc(s.期)} · ${esc(s.开课)}开课 · ${s.人数}人</option>`).join('');
  renderRenew();
}
function renderRenew() {
  if (!RNU) return;
  const d = RNU;
  $('#rnuCount').textContent = `${termDispL(d.term)} → ${termDispL(d.next)} · 上课 ${d.汇总.上课学员} · 已续 ${d.汇总.已续班} · 流失 ${d.汇总.流失学员} · 未续 ${d.汇总.未续班}`;
  const sess = $('#rnuSession').value;
  let rows = d.明细;
  if (rnuFilter !== '全部') rows = rows.filter(r => r.状态 === rnuFilter);
  if (sess) rows = rows.filter(r => r.期.includes(sess));
  const kw = curKwRnu.trim().toLowerCase();
  if (kw) rows = rows.filter(r => [r.姓名, r.电话, r.家庭, ...r.本期班级.map(c => c.班级), ...r.下期班级.map(c => c.班级)].join(' ').toLowerCase().includes(kw));
  const slice = rows.slice(0, 200);
  $('#rnuSessions').innerHTML = (d.分期 || []).length ? '<table><tr><th>期次</th><th>开课</th><th>人数</th><th>已续班</th><th>流失</th><th>未续班</th><th>续报率</th></tr>' +
    d.分期.map(s => `<tr><td>${esc(s.期)}</td><td class="muted">${esc(s.开课)}</td><td>${s.人数}</td><td>${s.已续班}</td><td class="muted">${s.流失}</td><td><b ${s.未续班 ? 'style="color:#B91C1C"' : ''}>${s.未续班}</b></td><td>${s.人数 ? Math.round(s.已续班 / s.人数 * 100) : 0}%</td></tr>`).join('') + '</table>' : '<div class="note">该学期未分期</div>';
  $('#rnuTable').innerHTML = slice.length
    ? '<table><tr><th>学员</th><th>年级</th><th>本期班级</th><th>续班状态</th><th>下期班级</th><th>下期已缴</th><th>跟进</th><th></th></tr>' +
      slice.map(r => `<tr>
        <td class="tk"><b>${esc(r.姓名)}</b>${r.家庭 && r.家庭 !== r.姓名 ? `<div class="muted">${esc(r.家庭)}</div>` : ''}</td>
        <td>${esc(r.年级 || '')}</td>
        <td>${r.本期班级.map(c => `${esc(c.班级)}${c.源状态 === '历史在班学生' ? ' <span class="badge gray">转出</span>' : ''}`).join('<br>')}</td>
        <td><span class="badge ${RNU_TAG[r.状态] || 'gray'}">${esc(r.状态)}</span></td>
        <td>${r.下期班级.map(c => esc(c.班级)).join('<br>') || (r.秋季退班 ? '<span class="muted">已退</span>' : (r.仅缴费 ? '<span class="muted">已缴费</span>' : '<span class="muted">—</span>'))}</td>
        <td>${r.下期已缴 ? '¥' + r.下期已缴 : '<span class="muted">—</span>'}</td>
        <td>${r.跟进.状态 ? `<span class="badge blue">${esc(r.跟进.状态)}</span>` : '<span class="muted">—</span>'}${r.跟进.下次跟进 ? `<div class="muted">${esc(r.跟进.下次跟进)}</div>` : ''}</td>
        <td style="display:flex;gap:6px;"><span class="btn sub sm" data-rnu-follow="${esc(r.childId)}">跟进</span><span class="btn sub sm" data-kid="${esc(r.childId)}">档案</span></td></tr>`).join('') + '</table>'
    : '<div class="note">没有符合条件的学员</div>';
  $('#rnuPager').innerHTML = rows.length > 200 ? `<span class="note">共 ${rows.length} 条</span>` : '';
  $$('#rnuTable [data-kid]').forEach(b => b.onclick = () => { location.hash = 'profile/' + encodeURIComponent(b.dataset.kid); });
  $$('#rnuTable [data-rnu-follow]').forEach(b => b.onclick = () => {
    const r = RNU.明细.find(x => x.childId === b.dataset.rnuFollow);
    if (r) renewDlg(r);
  });
  const pend = d.待确认 || [];
  $('#recPendingCard').classList.toggle('hide', !pend.length);
  $('#recPending').innerHTML = pend.length ? '<table><tr><th>姓名</th><th>班级</th><th>开课</th><th>电话</th></tr>' +
    pend.map(x => `<tr><td>${esc(x.姓名)}</td><td>${esc(x.班级)}</td><td class="muted">${esc(x.开课)}</td><td class="muted">${esc(x.电话)}</td></tr>`).join('') + '</table>' : '';
}
function renewDlg(r) {
  const states = ['未跟进', '已沟通', '考虑中', '已报名', '暂不考虑'];
  dlg('续班跟进 · ' + r.姓名, `${FG('跟进状态', `<select id="rf-state"><option value="">请选择</option>${states.map(s => `<option${s === (r.跟进.状态 || '') ? ' selected' : ''}>${s}</option>`).join('')}</select>`)}${FG('备注', `<input id="rf-note" value="${esc(r.跟进.备注 || '')}" placeholder="家长意向、沟通重点…">`)}${FG('下次跟进日期', `<input id="rf-date" type="date" value="${esc(r.跟进.下次跟进 || '')}">`)}${dlgFoot('保存')}`, box => {
    box.querySelector('#dlgCancel').onclick = dlgClose;
    box.querySelector('#dlgOk').onclick = async () => {
      const x = await post('/api/renew/followup', { term: RNU.term, childId: r.childId, 状态: box.querySelector('#rf-state').value, 备注: box.querySelector('#rf-note').value, 下次跟进: box.querySelector('#rf-date').value });
      if (!x.ok) return dlgErr(x.错误 || '保存失败');
      dlgClose(); loadRenew();
    };
  });
}
$('#rnuTerm').addEventListener('change', loadRenew);
$('#rnuSession').addEventListener('change', renderRenew);
$('#rnuSearch').addEventListener('input', e => { curKwRnu = e.target.value; renderRenew(); });
$$('[data-rf]').forEach(c => c.addEventListener('click', () => {
  rnuFilter = c.dataset.rf;
  $$('[data-rf]').forEach(x => x.classList.toggle('on', x === c));
  renderRenew();
}));

async function loadExpansion() {
  EXP = await api('/api/expansion?term=' + encodeURIComponent((HOME && HOME.招生期) || '2026秋'));
  renderExpansion();
}
function expClasses(xs) {
  return xs.map(x => `${esc(x.班级)} <span class="muted">${termDispL(x.期)}</span>`).join('<br>') || '<span class="muted">—</span>';
}
function renderExpansion() {
  if (!EXP) return;
  const s = EXP.汇总;
  $('#expStats').innerHTML = [
    ['总人数', s.总人数, '人', '7/8/9 年级有效报名'],
    ['待拓科', s.待拓科, '人', '有数学没物理 / 有物理没数学'],
    ['数学单科', s.数学单科, '人', '已报数学 → 拓物理'],
    ['物理单科', s.物理单科, '人', '已报物理 → 拓数学'],
    ['双科已报', s.双科, '人', '无需拓科'],
    ['待确认归属', s.待确认归属, '条', '名额属于哪个孩子待定'],
  ].map(x => `<div class="kpi-card"><div class="kpi-k">${x[0]}</div><div class="kpi-v">${x[1]}<span>${x[2]}</span></div><div class="kpi-sub">${x[3]}</div></div>`).join('');
  const grade = $('#expGrade').value, type = $('#expType').value, follow = $('#expFollow').value, kw = $('#expSearch').value.trim().toLowerCase();
  let rows = EXP.明细.filter(r => (!grade || r.年级 === grade) && (!type || r.状态 === type) && (!follow || r.跟进.状态 === follow));
  if (kw) rows = rows.filter(r => [r.姓名, r.电话, r.秋季状态, ...r.数学班.map(x => x.班级), ...r.物理班.map(x => x.班级), ...r.未识别班.map(x => x.班级)].join(' ').toLowerCase().includes(kw));
  $('#expCount').textContent = `共 ${rows.length} 人`;
  $('#expTable').innerHTML = rows.length ? `<table><tr><th>学员</th><th>年级</th><th>数学班</th><th>物理班</th><th>${termDispL(EXP.term)}状态</th><th>拓科状态</th><th>跟进</th><th>下次跟进</th><th></th></tr>${rows.map(r => `<tr><td><b>${esc(r.姓名)}</b><div class="muted">${esc(r.电话)}</div></td><td>${esc(r.年级)}${r.年级待核对 ? `<div class="muted">班级：${esc(r.班级年级.join('、'))}</div>` : ''}</td><td>${expClasses(r.数学班)}</td><td>${expClasses(r.物理班)}</td><td><span class="badge ${r.秋季状态 === '秋季已报名' ? 'free' : 'gold'}">${esc(r.秋季状态)}</span></td><td><span class="badge ${r.状态 === '数学物理都已报' ? 'free' : r.状态 === '学科待确认' ? 'gold' : 'blue'}">${esc(r.状态)}</span>${r.年级待核对 ? '<div class="muted">年级待核对</div>' : ''}</td><td>${esc(r.跟进.状态 || '未联系')}${r.跟进.备注 ? `<div class="muted">${esc(r.跟进.备注)}</div>` : ''}</td><td class="muted">${esc(r.跟进.下次跟进 || '—')}</td><td><span class="btn sub sm" data-exp-follow="${esc(r.childId)}">记录跟进</span> <span class="btn sub sm" data-exp-kid="${esc(r.childId)}">档案</span></td></tr>`).join('')}</table>` : '<div class="note">没有符合条件的学员</div>';
  const pending = EXP.待确认 || [];
  const pendingCard = $('#recPendingCard');
  if (!pending.length) pendingCard.classList.add('hide');
  $$('#expTable [data-exp-kid]').forEach(b => b.onclick = () => location.hash = 'profile/' + encodeURIComponent(b.dataset.expKid));
  $$('#expTable [data-exp-follow]').forEach(b => b.onclick = () => { const r = EXP.明细.find(x => x.childId === b.dataset.expFollow); if (r) expansionDlg(r); });
}
function expansionDlg(r) {
  const states = ['未联系', '已沟通', '考虑中', '已报名', '暂不考虑', '无需拓科'];
  dlg('拓科跟进 · ' + r.姓名, `${FG('跟进状态', `<select id="xf-state">${states.map(x => `<option${x === (r.跟进.状态 || '未联系') ? ' selected' : ''}>${x}</option>`).join('')}</select>`)}${FG('备注', `<input id="xf-note" value="${esc(r.跟进.备注 || '')}" placeholder="家长意向、沟通重点…">`)}${FG('下次跟进日期', `<input id="xf-date" type="date" value="${esc(r.跟进.下次跟进 || '')}">`)}${dlgFoot('保存')}`, box => {
    box.querySelector('#dlgCancel').onclick = dlgClose;
    box.querySelector('#dlgOk').onclick = async () => {
      const x = await post('/api/expansion/followup', { term: (EXP && EXP.term) || '2026秋', childId: r.childId, 状态: box.querySelector('#xf-state').value, 备注: box.querySelector('#xf-note').value, 下次跟进: box.querySelector('#xf-date').value });
      if (!x.ok) return dlgErr(x.错误 || '保存失败');
      dlgClose(); loadExpansion();
    };
  });
}
['expGrade', 'expType', 'expFollow'].forEach(id => $('#' + id).addEventListener('change', renderExpansion));
$('#expSearch').addEventListener('input', renderExpansion);

// ---------- 数据同步 ----------
function syncErrorText(value) {
  const text = String(value || '');
  const brace = text.indexOf('{');
  if (brace >= 0) { try { const d = JSON.parse(text.slice(brace)); return d.message || d.msg || text; } catch (e) {} }
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
async function loadSyncStatus() {
  const d = await api('/api/sync/status');
  $('#syncNowBtn').textContent = d.running ? '同步中…' : '立即同步';
  $('#syncNowBtn').style.pointerEvents = d.running ? 'none' : '';
  $('#syncStatus').className = 'note ' + (d.ok === false ? 'err' : d.ok === true ? 'ok' : '');
  $('#syncStatus').textContent = d.running ? `同步中：${d.stage}（开始于 ${d.startedAt || ''}）` : d.ok === true ? `✓ ${d.stage}，完成于 ${d.finishedAt || ''}` : d.ok === false ? `✗ ${d.stage}：${syncErrorText(d.error) || '未知错误'}` : '尚未在本次服务启动后执行同步';
  const r = d.report;
  $('#syncReport').innerHTML = r ? `<div class="kv"><div class="i"><span class="l">时间</span>${esc(r.完成时间 || r.时间 || '—')}</div><div class="i"><span class="l">方式</span>${esc(r.方式 || '—')}</div><div class="i"><span class="l">班级名单同步</span>${esc(r.班级名单同步 || '—')}</div><div class="i"><span class="l">订单同步</span>${esc(r.订单同步 || '—')}</div><div class="i"><span class="l">结果</span>${r.ok ? '<span class="badge free">成功</span>' : '<span class="badge warn">失败</span>'}</div></div>${r.错误 ? `<div class="note err">${esc(syncErrorText(r.错误))}</div>` : ''}` : '<div class="note">暂无同步报告</div>';
  if (d.running && !syncPoll) syncPoll = setInterval(loadSyncStatus, 2000);
  if (!d.running && syncPoll) { clearInterval(syncPoll); syncPoll = null; if (d.ok) await syncAll(); }
}
$('#syncNowBtn').addEventListener('click', async () => {
  if (!confirm('同步会使用机构账号密码直接登录，并可能使同账号在其他位置的会话失效。确认立即同步？')) return;
  const r = await post('/api/sync/start', {});
  if (!r.ok) return alert(r.message || r.错误 || '无法启动同步');
  loadSyncStatus();
});

// ---------- 课程大纲 ----------
const SYS_SUBJECT = { '小学奥数': '数学', '初中数学': '数学', '初中物理': '物理' };
function olTracks(sys) { return OUTLINES[sys] ? Object.keys(OUTLINES[sys]) : []; }
function fillTrack() {
  const sys = $('#olSys').value;
  $('#olTrack').innerHTML = olTracks(sys).map(t => `<option>${esc(t)}</option>`).join('');
  fillSeason();
}
function fillSeason() {
  const sys = $('#olSys').value, tr = $('#olTrack').value;
  const seasons = OUTLINES[sys] && OUTLINES[sys][tr] ? Object.keys(OUTLINES[sys][tr]) : [];
  $('#olSeason').innerHTML = seasons.map(s => `<option>${esc(s)}</option>`).join('');
  renderOutline();
}
function curOutline() {
  const sys = $('#olSys').value, tr = $('#olTrack').value, se = $('#olSeason').value;
  return (OUTLINES[sys] && OUTLINES[sys][tr] && OUTLINES[sys][tr][se]) || [];
}
function renderOutline() {
  const sys = $('#olSys').value, tr = $('#olTrack').value, se = $('#olSeason').value;
  const rows = curOutline();
  const seName = SEASON_NAME[se] || se;
  $('#olCount').textContent = `共 ${rows.length} 讲 · ${SYS_SUBJECT[sys] || ''}`;
  $('#olTitle').textContent = `${sys} · ${tr} · ${seName}内容明细`;
  // 页顶深蓝标题横幅：品牌与标题同一行，不再出现"苏E好学"单独占一行
  $('#olBanner').innerHTML = rows.length ? `
    <div class="ob-brand">苏E好学</div>
    <div class="ob-mid">
      <div class="ob-t">${esc(tr)}班 · ${esc(seName)}大纲</div>
      <div class="ob-s">共 ${rows.length} 讲 · 学科：${SYS_SUBJECT[sys] || '—'} · 来源：2026 最新大纲</div>
    </div>
    <div class="ob-count">${rows.length}<small>讲</small></div>` : '<div class="note">没有该大纲数据</div>';
  $('#olPretty').innerHTML = rows.length ?
    rows.map(r => `<div class="ol-row"><span class="n">第${r.n}讲</span><span><span class="t">${esc(r.topic)}</span>${r.module ? `<span class="m">${esc(r.module)}</span>` : ''}${r.desc ? `<div class="d">${esc(r.desc)}</div>` : ''}</span></div>`).join('') : '<div class="note">没有该大纲数据</div>';
  $('#olImgCard').classList.add('hide');
}
$('#olSys').addEventListener('change', fillTrack);
$('#olTrack').addEventListener('change', fillSeason);
$('#olSeason').addEventListener('change', renderOutline);
function buildOutlineMD() {
  const sys = $('#olSys').value, tr = $('#olTrack').value, se = $('#olSeason').value;
  const rows = curOutline();
  const seName = SEASON_NAME[se] || se;
  return [`# ${sys} · ${tr} · ${seName}大纲（共${rows.length}讲）`, '', '> 来源：苏E好学《2026 最新大纲.xlsx》（权威源）。', '', '| 讲次 | 内容 |', '| --- | --- |']
    .concat(rows.map(r => `| 第${r.n}讲 | **${r.topic}**${r.desc ? '<br>' + r.desc.replace(/\n/g, '；') : ''} |`)).join('\n');
}
$('#olCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(buildOutlineMD()); $('#olCount').textContent = `共 ${curOutline().length} 讲 · MD 已复制`; }
  catch (e) { $('#olCount').textContent = '复制失败'; }
});
function wrapText(ctx, text, maxW) {
  const lines = []; let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
$('#olImg').addEventListener('click', () => {
  const sys = $('#olSys').value, tr = $('#olTrack').value, se = $('#olSeason').value;
  const rows = curOutline();
  if (!rows.length) return alert('没有大纲数据可生成图片');
  const seName = SEASON_NAME[se] || se;
  const W = 880, pad = 30, scale = 2;
  const F = '"Noto Sans SC","Microsoft YaHei",sans-serif';
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const textW = W - pad * 2 - 90;
  ctx.font = `700 15px ${F}`;
  const items = rows.map(r => {
    const main = wrapText(ctx, r.topic, textW);
    ctx.font = `400 12px ${F}`;
    const subs = [];
    if (r.module) subs.push('模块：' + r.module);
    if (r.desc) wrapText(ctx, r.desc, textW).forEach(l => subs.push(l));
    ctx.font = `700 15px ${F}`;
    return { r, main, subs };
  });
  const headH = 104, footH = 46;
  const rowHs = items.map(i => 24 + i.main.length * 22 + (i.subs.length ? i.subs.length * 19 + 4 : 0) + 12);
  const bodyH = rowHs.reduce((s, h) => s + h, 0);
  c.width = W * scale; c.height = (headH + bodyH + footH) * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, headH + bodyH + footH);
  const g = ctx.createLinearGradient(0, 0, W, headH);
  g.addColorStop(0, '#1C2B6A'); g.addColorStop(1, '#2A3F95');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
  // 标题横幅：品牌与大纲标题同一行
  ctx.fillStyle = '#C8A11A'; ctx.font = `700 12px ${F}`;
  ctx.fillText('苏E好学', pad, 38);
  ctx.fillStyle = '#ffffff'; ctx.font = `700 22px ${F}`;
  ctx.fillText(`${tr}班 · ${seName}大纲`, pad + 92, 38);
  ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = `400 12.5px ${F}`;
  ctx.fillText(`共 ${rows.length} 讲 · 学科：${SYS_SUBJECT[sys] || '—'} · 来源：2026 最新大纲`, pad, 68);
  let y = headH;
  items.forEach((it, i) => {
    const h = rowHs[i];
    if (i % 2 === 1) { ctx.fillStyle = '#F8F9FC'; ctx.fillRect(0, y, W, h); }
    ctx.fillStyle = '#4A6CF7'; ctx.font = `700 12.5px ${F}`;
    ctx.fillText(`第${it.r.n}讲`, pad, y + 26);
    ctx.fillStyle = '#1C2B6A'; ctx.font = `700 15px ${F}`;
    it.main.forEach((ln, j) => ctx.fillText(ln, pad + 74, y + 26 + j * 22));
    if (it.subs.length) {
      ctx.fillStyle = '#7A86A8'; ctx.font = `400 12px ${F}`;
      it.subs.forEach((ln, j) => ctx.fillText(ln, pad + 74, y + 26 + it.main.length * 22 + 4 + j * 19));
    }
    ctx.strokeStyle = '#ECEEF3'; ctx.beginPath(); ctx.moveTo(pad, y + h); ctx.lineTo(W - pad, y + h); ctx.stroke();
    y += h;
  });
  ctx.fillStyle = '#9AA5C0'; ctx.font = `400 11.5px ${F}`;
  ctx.fillText(`苏E好学 · 小学初中数学物理培优 · ${new Date().toISOString().slice(0, 10)}`, pad, y + 28);
  const url = c.toDataURL('image/png');
  $('#olImgCard').classList.remove('hide');
  $('#olImgBox').innerHTML = `<img src="${url}" alt="大纲图片">`;
  const a = $('#olDownload');
  a.href = url; a.download = `${sys}_${tr}_${seName}大纲.png`;
  $('#olImgCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ---------- 素材收件箱 ----------
async function uploadFiles(files) {
  const msgs = [];
  for (const f of files) {
    try {
      const r = await api('/api/upload?file=' + encodeURIComponent(f.name), { method: 'PUT', body: f });
      msgs.push(r.ok ? `✓ ${r.文件}（${r.大小KB} KB）` : `✗ ${f.name}：${r.错误}`);
    } catch (e) { msgs.push(`✗ ${f.name}：${e.message}`); }
  }
  $('#upMsg').innerHTML = msgs.map(esc).join('<br>');
  $('#upMsg').className = 'note ok';
  renderInbox();
}
const drop = $('#drop'), fi = $('#fileInput');
drop.addEventListener('click', () => fi.click());
fi.addEventListener('change', () => { uploadFiles([...fi.files]); fi.value = ''; });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); uploadFiles([...e.dataTransfer.files]); });
async function renderInbox() {
  const box = await api('/api/inbox');
  const cats = ['做题痕迹', '错题', '试卷', '老师反馈', '作业解析', '板书', '打卡记录', '其他'].map(c => `<option>${c}</option>`).join('');
  $('#inboxList').innerHTML = box.待处理.length
    ? '<table><tr><th>文件</th><th style="width:430px">归档到（学员可输入搜索）</th><th></th></tr>' +
    box.待处理.map(f => `<tr><td class="tk">${esc(f.文件)}<div class="muted" style="font-size:11px">${f.大小KB} KB</div></td>
      <td><div class="assign">
        <input class="as-stu" list="stuData" placeholder="输入学员姓名搜索…">
        <input class="as-n" type="number" min="1" max="18" placeholder="讲次">
        <select class="as-cat">${cats}</select>
      </div></td>
      <td><span class="btn sm" data-f="${esc(f.文件)}">归档</span></td></tr>`).join('') + '</table>'
    : '<div class="note">收件箱为空</div>';
  $$('#inboxList .btn').forEach(b => b.addEventListener('click', async e => {
    const tr = e.target.closest('tr');
    const studentId = tr.querySelector('.as-stu').value.trim();
    if (!studentId || !ROSTER.some(s => s.id === studentId)) { alert('请从候选列表选择具体孩子'); return; }
    const r = await post('/api/inbox/assign', { 文件: e.target.dataset.f, studentId, 讲次: tr.querySelector('.as-n').value, 类别: tr.querySelector('.as-cat').value });
    if (!r.ok) { alert(r.错误); return; }
    renderInbox();
  }));
  $('#inboxLog').innerHTML = box.台账.length
    ? '<table><tr><th>时间</th><th>文件</th><th>学员</th><th>讲次</th><th>类别</th><th>归档到</th></tr>' +
    box.台账.slice(0, 30).map(l => `<tr><td class="muted">${esc(l.时间)}</td><td>${esc(l.文件)}</td><td>${esc(l.学生)}</td><td>${esc(l.讲次)}</td><td>${esc(l.类别)}</td><td class="muted">${esc(l.归档到)}</td></tr>`).join('') + '</table>'
    : '<div class="note">暂无归档记录</div>';
}

// ---------- 报告生成 ----------
function renderRep() {
  $('#repStu').innerHTML = ROSTER.map(a => `<option value="${esc(a.id)}">${esc(a.姓名)}（${esc(a.年级 || '')}${(a.当期[0] || {}).班级 ? ' · ' + esc(a.当期[0].班级) : ' · 无当期班'}${a.同家庭人数 > 1 ? ' · 同家庭' : ''}）</option>`).join('');
}
$('#repGo').addEventListener('click', async () => {
  const r = await post('/api/report/new', { studentId: $('#repStu').value });
  $('#repMsg').className = 'note ' + (r.ok ? 'ok' : 'err');
  $('#repMsg').innerHTML = r.ok
    ? (r.已存在 ? `已存在：${esc(r.路径)}（未覆盖）` : `已生成骨架：${esc(r.路径)}<br>下一步：在 AI 会话里让 AI 读取该学员素材，按《报告内容规范》填正文并对照清单自查。`)
    : r.错误;
});

// ---------- 操作日志 ----------
async function renderOpLog() {
  try {
    const list = await api('/api/oplog');
    const acts = [...new Set((list || []).map(l => l.动作))].filter(Boolean).sort();
    const cur = $('#logAction').value;
    $('#logAction').innerHTML = '<option value="">全部动作</option>' + acts.map(a => `<option value="${esc(a)}"${a === cur ? ' selected' : ''}>${esc(a)}</option>`).join('');
    const kw = curLogKw.trim().toLowerCase();
    let rows = list || [];
    if (curLogAction) rows = rows.filter(l => l.动作 === curLogAction);
    if (kw) rows = rows.filter(l => [l.对象, l.班级, l.变更, l.时间, l.动作].join(' ').toLowerCase().includes(kw));
    const pg = PG.log, slice = rows.slice((pg.page - 1) * pg.size, pg.page * pg.size);
    $('#logList').innerHTML = slice.length
      ? '<table><tr><th>时间</th><th>动作</th><th>对象</th><th>详情</th></tr>' +
      slice.map(l => `<tr><td class="muted">${esc(l.时间)}</td><td><span class="badge blue">${esc(l.动作)}</span></td><td>${esc(l.对象 || '')}</td><td class="muted">${esc(l.班级 || l.变更 || '')}</td></tr>`).join('') + '</table>'
      : '<div class="note">暂无记录</div>';
    renderPager($('#logPager'), rows.length, pg.page, pg.size, (p, s) => { PG.log = { page: p, size: s }; renderOpLog(); });
  } catch (e) { $('#logList').innerHTML = '<div class="note err">日志加载失败</div>'; }
}
$('#logAction').addEventListener('change', () => { PG.log.page = 1; renderOpLog(); });
$('#logSearch').addEventListener('input', e => { curLogKw = e.target.value; PG.log.page = 1; renderOpLog(); });

// ---------- 通用弹窗 ----------
function dlg(title, bodyHtml, onMount) {
  $('#dlgTitle').textContent = title;
  $('#dlgBody').innerHTML = bodyHtml;
  $('#dlgMask').classList.remove('hide');
  onMount && onMount($('#dlgBody'));
}
function dlgClose() { $('#dlgMask').classList.add('hide'); }
$('#dlgX').addEventListener('click', dlgClose);
$('#dlgMask').addEventListener('click', e => { if (e.target === e.currentTarget) dlgClose(); });
const FG = (label, inner, hint) => `<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${label}</label>${inner}${hint ? `<div class="note" style="margin-top:3px">${hint}</div>` : ''}</div>`;
const dlgFoot = okText => `<div class="dlg-err" id="dlgErr" style="color:#DC2626;font-size:12px;margin:8px 0;"></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;"><span class="btn sub" id="dlgCancel">取消</span><span class="btn" id="dlgOk">${okText}</span></div>`;
function dlgErr(msg) { $('#dlgErr').textContent = msg; }

// ---------- 学员/报名维护弹窗 ----------
$('#addStuBtn').addEventListener('click', () => {
  dlg('新增学员', `
    ${FG('姓名 <b style="color:#B91C1C">*</b>', '<input id="ns-name" placeholder="学生姓名">')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('联系电话', '<input id="ns-phone" placeholder="用于查重与订单关联">')}
      ${FG('年级', `<select id="ns-grade"><option value=""></option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select>`)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('性别', '<select id="ns-sex"><option value=""></option><option>男</option><option>女</option></select>')}
      ${FG('备注', '<input id="ns-note" placeholder="选填">')}
    </div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;cursor:pointer;"><input type="checkbox" id="ns-enr" style="width:auto;margin-right:6px">同时添加一条报名</label></div>
    <div id="ns-enr-box" style="display:none;background:#F6F7FB;border-radius:8px;padding:12px;margin-top:4px">
      ${FG('班级名称 <b style="color:#B91C1C">*</b>', '<input id="ns-class" list="classData" placeholder="如：8-自招-2026秋周六B-章章">', '可与已有班级名一致，直接从下拉选')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${FG('开课日期', '<input id="ns-start" type="date" value="' + todayStr() + '">')}
        ${FG('结课日期', '<input id="ns-end" type="date">')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${FG('老师', '<input id="ns-teacher">')}
        ${FG('校区', '<input id="ns-campus" placeholder="如：贵都校区">')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${FG('学科', '<select id="ns-subject"><option value=""></option><option>数学</option><option>物理</option></select>')}
        ${FG('课费（元）', '<input id="ns-fee" type="number" min="0">')}
      </div>
    </div>
    ${FG('', '<label style="font-size:12px;"><input type="checkbox" id="ns-confirm" style="width:auto;margin-right:6px">我确认与已有同名学员不是同一个人</label>')}
    ${dlgFoot('保存')}`, box => {
    box.querySelector('#ns-enr').addEventListener('change', e => { box.querySelector('#ns-enr-box').style.display = e.target.checked ? 'block' : 'none'; });
    box.querySelector('#dlgCancel').addEventListener('click', dlgClose);
    box.querySelector('#dlgOk').addEventListener('click', async () => {
      const body = {
        姓名: box.querySelector('#ns-name').value.trim(),
        电话: box.querySelector('#ns-phone').value.trim(),
        年级: box.querySelector('#ns-grade').value,
        性别: box.querySelector('#ns-sex').value,
        备注: box.querySelector('#ns-note').value.trim(),
        确认同名: box.querySelector('#ns-confirm').checked,
      };
      if (!body.姓名) return dlgErr('姓名必填');
      if (box.querySelector('#ns-enr').checked) {
        if (!box.querySelector('#ns-class').value.trim()) return dlgErr('勾选了"同时添加报名"，班级名称必填');
        Object.assign(body, {
          班级: box.querySelector('#ns-class').value.trim(),
          开课: box.querySelector('#ns-start').value, 结课: box.querySelector('#ns-end').value,
          老师: box.querySelector('#ns-teacher').value.trim(), 校区: box.querySelector('#ns-campus').value.trim(),
          学科: box.querySelector('#ns-subject').value, 课费: box.querySelector('#ns-fee').value,
        });
      }
      const r = await post('/api/student', body);
      if (!r.ok) return dlgErr(r.错误 || '保存失败');
      dlgClose(); await syncAll();
    });
  });
});
function addKidToFamilyDlg(f) {
  dlg('在家庭中新增孩子', `
    <div class="note" style="margin-bottom:10px">家庭：${esc(f.sourceName)} · 共用电话 ${esc(f.phone || '—')}</div>
    ${FG('孩子姓名 <b style="color:#B91C1C">*</b>', '<input id="fk-name" placeholder="孩子姓名">')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${FG('年级', `<select id="fk-grade"><option value=""></option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select>`)}${FG('性别', '<select id="fk-sex"><option value=""></option><option>男</option><option>女</option></select>')}</div>
    ${FG('备注', '<input id="fk-note" placeholder="选填">')}${dlgFoot('保存')}`, box => {
    box.querySelector('#dlgCancel').onclick = dlgClose;
    box.querySelector('#dlgOk').onclick = async () => {
      const body = { familyId: f.familyId, 姓名: box.querySelector('#fk-name').value.trim(), 电话: f.phone, 年级: box.querySelector('#fk-grade').value, 性别: box.querySelector('#fk-sex').value, 备注: box.querySelector('#fk-note').value.trim(), 确认同名: true };
      if (!body.姓名) return dlgErr('孩子姓名必填');
      const r = await post('/api/student', body);
      if (!r.ok) return dlgErr(r.错误 || '保存失败');
      dlgClose(); await syncAll(); openFamily(f.familyId);
    };
  });
}
function editStudentDlg(a) {
  dlg('编辑学员 · ' + a.姓名, `
    ${FG('姓名 <b style="color:#B91C1C">*</b>', `<input id="es-name" value="${esc(a.姓名)}">`)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('联系电话', `<input id="es-phone" value="${esc(a.电话 || '')}">`)}
      ${FG('年级', `<select id="es-grade"><option value=""></option>${GRADES.map(g => `<option${g === a.年级 ? ' selected' : ''}>${g}</option>`).join('')}</select>`)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('性别', `<select id="es-sex"><option value=""></option><option${a.性别 === '男' ? ' selected' : ''}>男</option><option${a.性别 === '女' ? ' selected' : ''}>女</option></select>`)}
      ${FG('备注', `<input id="es-note" value="${esc(a.备注 || '')}">`)}
    </div>
    ${dlgFoot('保存')}`, box => {
    box.querySelector('#dlgCancel').addEventListener('click', dlgClose);
    box.querySelector('#dlgOk').addEventListener('click', async () => {
      const body = {
        id: a.id,
        姓名: box.querySelector('#es-name').value.trim(),
        电话: box.querySelector('#es-phone').value.trim(),
        年级: box.querySelector('#es-grade').value,
        性别: box.querySelector('#es-sex').value,
        备注: box.querySelector('#es-note').value.trim(),
      };
      if (!body.姓名) return dlgErr('姓名必填');
      const r = await post('/api/student/edit', body);
      if (!r.ok) return dlgErr(r.错误 || '保存失败');
      dlgClose(); await syncAll();
      if (location.hash.startsWith('#profile/')) openProfile(a.id);
    });
  });
}
function addEnrollDlg(a) {
  dlg('新增报名 · ' + a.姓名, `
    ${FG('班级名称 <b style="color:#B91C1C">*</b>', '<input id="ae-class" list="classData" placeholder="从已有班级选或直接输入">')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('开课日期 <b style="color:#B91C1C">*</b>', `<input id="ae-start" type="date" value="${todayStr()}">`)}
      ${FG('结课日期', '<input id="ae-end" type="date">')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('老师', '<input id="ae-teacher">')}
      ${FG('校区', '<input id="ae-campus" placeholder="如：贵都校区">')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('学科', '<select id="ae-subject"><option value=""></option><option>数学</option><option>物理</option></select>')}
      ${FG('课费（元）', '<input id="ae-fee" type="number" min="0">')}
    </div>
    ${dlgFoot('保存')}`, box => {
    box.querySelector('#dlgCancel').addEventListener('click', dlgClose);
    box.querySelector('#dlgOk').addEventListener('click', async () => {
      const body = {
        id: a.id,
        班级: box.querySelector('#ae-class').value.trim(),
        开课: box.querySelector('#ae-start').value, 结课: box.querySelector('#ae-end').value,
        老师: box.querySelector('#ae-teacher').value.trim(), 校区: box.querySelector('#ae-campus').value.trim(),
        学科: box.querySelector('#ae-subject').value, 课费: box.querySelector('#ae-fee').value,
      };
      if (!body.班级) return dlgErr('班级名称必填');
      const r = await post('/api/enrollment', body);
      if (!r.ok) return dlgErr(r.错误 || '保存失败');
      dlgClose(); await syncAll(); openProfile(a.id);
    });
  });
}
function editEnrollDlg(a, e) {
  dlg('编辑报名 · ' + a.姓名, `
    ${FG('班级名称', `<input id="ee-class" value="${esc(e.班级)}" list="classData">`)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('开课日期', `<input id="ee-start" type="date" value="${esc(e.开课 || '')}">`)}
      ${FG('结课日期', `<input id="ee-end" type="date" value="${esc(e.结课 || '')}">`)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('老师', `<input id="ee-teacher" value="${esc(e.老师 || '')}">`)}
      ${FG('校区', `<input id="ee-campus" value="${esc(e.校区 || '')}">`)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${FG('学科', `<input id="ee-subject" value="${esc(e.学科 || '')}">`)}
      ${FG('课费（元）', `<input id="ee-fee" type="number" min="0" value="${esc(e.课费 || '')}">`)}
    </div>
    ${dlgFoot('保存')}`, box => {
    box.querySelector('#dlgCancel').addEventListener('click', dlgClose);
    box.querySelector('#dlgOk').addEventListener('click', async () => {
      const body = {
        eid: e.eid,
        班级: box.querySelector('#ee-class').value.trim(),
        开课: box.querySelector('#ee-start').value, 结课: box.querySelector('#ee-end').value,
        老师: box.querySelector('#ee-teacher').value.trim(), 校区: box.querySelector('#ee-campus').value.trim(),
        学科: box.querySelector('#ee-subject').value.trim(), 课费: box.querySelector('#ee-fee').value,
      };
      const r = await post('/api/enrollment/edit', body);
      if (!r.ok) return dlgErr(r.错误 || '保存失败');
      dlgClose(); await syncAll(); openProfile(a.id);
    });
  });
}
async function voidEnroll(eid, doing) {
  if (doing && !confirm('确认作废这条报名？（不物理删除，可恢复）')) return;
  const r = await post('/api/enrollment/void', { eid, 作废: doing });
  if (!r.ok) return alert(r.错误);
  await syncAll();
  if (location.hash.startsWith('#profile/')) openProfile(location.hash.slice(8));
}

// ---------- 数据加载与初始化（容错并发，非阻塞渲染） ----------
async function syncAll() {
  const fetchSafe = async (url, fallback) => {
    try {
      const res = await api(url);
      if (res && (Array.isArray(res) || Object.keys(res).length)) return res;
    } catch (e) {}
    return fallback;
  };

  const [h, r, s, e, f, o] = await Promise.all([
    fetchSafe('/api/home', { 当期: '2026秋', 招生期: '2026秋', 看板: { 当期在读: 265, 当期班级: 44, 下期已报: 0, 下期班级: 0, 已续班人数: 0, 续班率: 0, 待拓科人数: 0 }, 今日排课: [] }),
    fetchSafe('/api/students', window.LOCAL_STUDENTS || []),
    fetchSafe('/api/classes', window.LOCAL_SCHEDULE || []),
    fetchSafe('/api/enrollments', window.LOCAL_ENROLLMENTS || []),
    fetchSafe('/api/families', window.LOCAL_FAMILIES || []),
    fetchSafe('/api/outlines', window.LOCAL_OUTLINES || {})
  ]);

  HOME = h || {};
  ROSTER = Array.isArray(r) && r.length ? r : (window.LOCAL_STUDENTS || []);
  SCHEDULE = Array.isArray(s) && s.length ? s : (window.LOCAL_SCHEDULE || []);
  ENROLL = Array.isArray(e) && e.length ? e : (window.LOCAL_ENROLLMENTS || []);
  FAMILIES = Array.isArray(f) && f.length ? f : (window.LOCAL_FAMILIES || []);
  OUTLINES = (o && Object.keys(o).length) ? o : (window.LOCAL_OUTLINES || {});

  ENR_BY_ID = {};
  ENROLL.forEach(x => { (ENR_BY_ID[x.id || x.studentId] = ENR_BY_ID[x.id || x.studentId] || []).push(x); });
  buildSchedMap();

  // 学员搜索 datalist（收件箱用）
  const stuDataEl = $('#stuData');
  if (stuDataEl) stuDataEl.innerHTML = ROSTER.map(a => `<option value="${esc(a.id)}">${esc(a.姓名)}（${esc(a.年级 || '')} · ${esc(a.电话 || '')}）</option>`).join('');

  // 班级名 datalist
  const classDataEl = $('#classData');
  if (classDataEl) {
    const classSet = [...new Set(ENROLL.map(x => x.班级).concat(SCHEDULE.map(x => x.班级名称 || x.课程)))].filter(Boolean).sort();
    classDataEl.innerHTML = classSet.map(c => `<option value="${esc(c)}">`).join('');
  }

  // 立即渲染学员花名册与班级课表矩阵
  fillStuFilters();
  fillSchFilters();
  renderStu();
  renderSch();
  loadHome();
  renderInitialOutlines();
  loadLeaves();
  renderRep();
  renderOpLog();
}
function renderInitialOutlines() {
  $('#olSys').innerHTML = Object.keys(OUTLINES || {}).map(s => `<option>${esc(s)}</option>`).join('');
  if (Object.keys(OUTLINES || {}).length) fillTrack();
}
(async function init() {
  await syncAll();
  renderInitialOutlines();
  route();
})();