(function () {
  const Z = window.ZJ;
  const { esc, termDispL, RNU_TAG, TST_BADGE, TYPE_COLOR, SUBJ_COLOR, SYS_SUBJECT, SEASON_NAME, GRADES, GRADE_ORDER, todayStr } = Z.utils;
  const { qs: $, qsa: $$, renderPager, toast, dlg, dlgClose, dlgErr, FG, dlgFoot, showPage } = Z.ui;
  const api = Z.api;
  const st = Z.state;
  const M = Z.modules = Z.modules || {};

  const badge = (s, cls = 'gray') => `<span class="badge ${cls}">${esc(s)}</span>`;
  const stTag = s => badge(s, s === '在读' ? 'free' : s === '待开课' ? 'blue' : 'gray');
  const termStatusTag = s => `<span class="badge ${TST_BADGE[s] || 'gray'}">${esc(s)}</span>`;
  const typeBadge = t => `<span class="badge ${TYPE_COLOR[t] || 'gray'}">${esc(t)}</span>`;
  const subjBadge = s => s ? `<span class="badge ${SUBJ_COLOR[s] || 'gray'}">${esc(s)}</span>` : '';
  const classRowLabel = r => r.班级 || (r.班级名 || []).join('、') || r.课程 || '未命名班级';

  let schedMap = {};
  function buildSchedMap() {
    schedMap = {};
    st.SCHEDULE.forEach(r => { (r.班级名 || [r.班级]).filter(Boolean).forEach(c => { schedMap[c] = { 星期: r.星期, 时间: r.时间 }; }); });
  }

  function renderHome() {
    const h = st.HOME || {};
    const s = h.看板 || {};
    const cur = h.当期 || '2026秋';
    const tag = $('#homeTermTag'); if (tag) tag.textContent = `${termDispL(cur)} 数据云端同步`;
    const stats = $('#homeStats');
    if (stats) stats.innerHTML = [
      [`${termDispL(cur)}在读/待开课`, s.当期在读 || 0, '人'],
      [`${termDispL(cur)}班级数`, s.当期班级 || 0, '个'],
      ['学员档案总数', st.ROSTER.length, '人'],
      ['报名记录', st.ENROLL.length, '条'],
      ['课表记录', st.SCHEDULE.length, '项'],
    ].map(x => `<div class="kpi-card"><div class="kpi-k">${x[0]}</div><div class="kpi-v">${x[1]}<span>${x[2]}</span></div></div>`).join('');
    const td = h.今日排课 || [];
    const today = $('#homeToday');
    if (today) today.innerHTML = td.length ? '<table><tr><th>班号</th><th>星期</th><th>时间</th><th>课程</th><th>老师</th><th>教室</th><th>校区</th></tr>' +
      td.map(r => `<tr><td class="muted">${esc(r.班号 || '')}</td><td>${esc(r.星期 || '')}</td><td class="tk">${esc(r.时间 || '')}</td><td>${esc(r.课程 || r.班级 || '')}</td><td>${esc(r.老师 || '')}</td><td>${esc(r.教室 || '')}</td><td class="muted">${esc(r.校区 || '')}</td></tr>`).join('') + '</table>' : '<div class="note">今日无排课</div>';
    const follow = ((h.待办 || {}).跟进到期 || []);
    const followCard = $('#homeFollowCard'); if (followCard) followCard.classList.toggle('hide', !follow.length);
    const inboxCard = $('#homeInboxCard'); if (inboxCard) inboxCard.classList.add('hide');
  }

  function fillStuFilters() {
    const cur = (st.HOME && st.HOME.当期) || '2026秋';
    const terms = [...new Set(st.ENROLL.map(e => e.期))].filter(Boolean).sort().reverse();
    const el = $('#stuTerm');
    if (el) {
      el.innerHTML = `<option value="${esc(cur)}">当期 ·${termDispL(cur)}</option>` + terms.filter(t => t !== cur).map(t => `<option value="${esc(t)}">${termDispL(t)}</option>`).join('') + '<option value="all">全部历史</option>';
      el.value = cur;
    }
    const camps = [...new Set(st.ENROLL.map(e => e.校区))].filter(Boolean).sort();
    const campus = $('#stuCampus'); if (campus) campus.innerHTML = '<option value="">全部校区</option>' + camps.map(c => `<option>${esc(c)}</option>`).join('');
  }
  function termStatusOf(es, term) {
    const rows = es.filter(e => e.期 === term && e.源状态 !== '历史在班学生' && !e.作废);
    if (!rows.length) return es.some(e => e.期 === term) ? '退出' : '';
    if (rows.some(e => e.状态 === '在读')) return '在读';
    if (rows.some(e => e.状态 === '待开课')) return '待开课';
    return '已结课';
  }
  function stuRows() {
    const term = ($('#stuTerm') || {}).value || '2026秋', campus = ($('#stuCampus') || {}).value || '';
    const kw = st.filters.stuKw.trim().toLowerCase();
    const cats = { '全部': () => true, '在读': a => a.tst === '在读', '待开课': a => a.tst === '待开课', '已结课': a => a.tst === '已结课' };
    let rows = st.ROSTER.map(a => { const es = st.ENR_BY_ID[a.id] || []; return { st: a, es, tst: term === 'all' ? a.状态 : termStatusOf(es, term) }; });
    if (term !== 'all') rows = rows.filter(a => a.es.some(e => e.期 === term));
    if (campus) rows = rows.filter(a => a.es.some(e => e.校区 === campus && (term === 'all' || e.期 === term)));
    rows = rows.filter(cats[st.filters.stuFilter] || cats['全部']);
    if (kw) rows = rows.filter(a => (a.st.姓名 || '').toLowerCase().includes(kw) || (a.st.电话 || '').includes(kw) || a.es.some(e => (e.班级 || '').toLowerCase().includes(kw)));
    if (st.filters.stuSort === 'name') rows.sort((a, b) => (a.st.姓名 || '').localeCompare(b.st.姓名 || '', 'zh'));
    else rows.sort((a, b) => st.filters.stuSort === 'dateAsc' ? (a.st.最近 || '').localeCompare(b.st.最近 || '') : (b.st.最近 || '').localeCompare(a.st.最近 || ''));
    return { rows, term };
  }
  function pickClsRows(es, term, person) {
    let rows = term === 'all' ? (person.当期 && person.当期.length ? person.当期 : es.slice(0, 1)) : es.filter(e => e.期 === term);
    const active = rows.filter(e => e.源状态 !== '历史在班学生' && !e.作废);
    return active.length ? active : rows.slice(0, 1);
  }
  function clsTime(e) { const x = schedMap[e.班级] || {}; return x.星期 && x.时间 ? `${x.星期} ${x.时间}` : (e.时间 || '—'); }
  function clsCell(e) { return `<div style="padding:2px 0;">${esc(e.班级 || '')} <span class="muted" style="font-size:11px">${esc(e.老师 || '')}</span></div>`; }
  function renderStudents() {
    const box = $('#stuList'); if (!box) return;
    const { rows, term } = stuRows();
    const tag = $('#stuTermTag'); if (tag) tag.textContent = term === 'all' ? '全部历史' : termDispL(term);
    $$('#p-stu .fbar .chip[data-f]').forEach(c => { c.textContent = `${c.dataset.f}`; c.classList.toggle('on', st.filters.stuFilter === c.dataset.f); });
    const pg = st.PG.stu, slice = rows.slice((pg.page - 1) * pg.size, pg.page * pg.size);
    box.innerHTML = slice.length ? `<table><tr><th>学员</th><th>时间段</th><th>状态</th><th>联系电话</th><th>${term === 'all' ? '最近班级' : '本期班级'}</th><th>报名</th><th>操作</th></tr>` + slice.map(({ st: person, es, tst }) => {
      const list0 = pickClsRows(es, term, person);
      return `<tr><td class="tk"><b>${esc(person.姓名)}</b><span class="muted" style="font-size:11.5px;margin-left:4px;">${esc(person.年级 || '')}${person.性别 ? ' · ' + esc(person.性别) : ''}</span>${person.同家庭人数 > 1 ? `<span class="family-tag" data-family="${esc(person.familyId)}">同家庭 ${person.同家庭人数}人</span>` : ''}</td><td class="tk">${list0.map(e => esc(clsTime(e))).join('<br>') || '<span class="muted">—</span>'}</td><td>${term === 'all' ? stTag(person.状态) : termStatusTag(tst || '已结课')}</td><td class="muted">${esc(person.电话)}</td><td>${list0.map(clsCell).join('<div style="border-top:1px dashed #EDF1F7;margin:3px 0"></div>') || '<span class="muted">—</span>'}</td><td class="muted">${person.次数 || es.length} 次</td><td style="display:flex;gap:6px;"><span class="btn sub sm" data-id="${esc(person.id)}">学员档案</span><span class="btn sub sm" data-leave-kid="${esc(person.id)}" data-leave-name="${esc(person.姓名)}">记请假</span></td></tr>`;
    }).join('') + '</table>' : '<div class="note">没有符合条件的学员</div>';
    renderPager($('#stuPager'), rows.length, pg.page, pg.size, (p, s) => { st.PG.stu = { page: p, size: s }; renderStudents(); });
    box.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { location.hash = 'profile/' + encodeURIComponent(b.dataset.id); });
    box.querySelectorAll('[data-family]').forEach(b => b.onclick = () => { location.hash = 'family/' + encodeURIComponent(b.dataset.family); });
    box.querySelectorAll('[data-leave-kid]').forEach(b => b.onclick = () => openLeaveModal(b.dataset.leaveKid, b.dataset.leaveName));
  }

  function fillSchFilters() {
    const cur = (st.HOME && st.HOME.当期) || '2026秋';
    const fill = (id, vals, defaultText, order) => {
      const el = $('#' + id); if (!el) return;
      const uniq = [...new Set(vals.filter(Boolean))];
      if (order) uniq.sort((a, b) => (order.indexOf(a) >= 0 ? order.indexOf(a) : 99) - (order.indexOf(b) >= 0 ? order.indexOf(b) : 99));
      else uniq.sort((a, b) => String(a).localeCompare(String(b), 'zh'));
      el.innerHTML = `<option value="">${defaultText}</option>` + uniq.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    };
    const terms = [...new Set(st.SCHEDULE.map(r => r.期).filter(Boolean))].sort().reverse();
    if (!terms.includes(cur)) terms.unshift(cur);
    const term = $('#schTerm'); if (term) { term.innerHTML = `<option value="">全部学期</option>` + terms.map(t => `<option value="${esc(t)}">${termDispL(t)}</option>`).join(''); term.value = terms.includes('2026秋') ? '2026秋' : ''; }
    fill('schType', st.SCHEDULE.map(r => r.班型), '全部班型', ['小明班', '自招', '中考', '创新', '尖子', '奥数', '短期班', '其他']);
    fill('schGrade', st.SCHEDULE.map(r => r.年级), '全部年级', GRADE_ORDER);
    fill('schTeacher', st.SCHEDULE.map(r => r.老师), '全部老师');
    fill('schCampus', st.SCHEDULE.map(r => r.校区), '全部校区');
    fill('schSubject', st.SCHEDULE.map(r => r.学科), '全部学科');
  }
  function schFiltered() {
    const term = ($('#schTerm') || {}).value || '', ty = ($('#schType') || {}).value || '', g = ($('#schGrade') || {}).value || '', sub = ($('#schSubject') || {}).value || '';
    const day = ($('#schDay') || {}).value || '', t = ($('#schTeacher') || {}).value || '', c = ($('#schCampus') || {}).value || '', kw = (($('#schKw') || {}).value || '').trim().toLowerCase();
    return st.SCHEDULE.filter(r => (!term || r.期 === term) && (!ty || r.班型 === ty) && (!g || r.年级 === g) && (!sub || r.学科 === sub) && (!day || r.星期 === day) && (!t || r.老师 === t) && (!c || r.校区 === c) && (!kw || [r.班级, (r.班级名 || []).join(' '), r.课程, r.老师, r.教室, r.班号, r.校区, r.星期, r.班型].join(' ').toLowerCase().includes(kw)));
  }
  function renderSchedule() {
    const box = $('#schListView'); if (!box) return;
    const rows = schFiltered();
    $('#schCount').textContent = `课表 · ${rows.length} 项`;
    const pg = st.PG.sch, slice = rows.slice((pg.page - 1) * pg.size, pg.page * pg.size);
    box.innerHTML = slice.length ? `<table><tr><th>期次</th><th>星期</th><th>时段</th><th>班级</th><th>班型</th><th>老师</th><th>教室</th><th>校区</th><th>人数</th><th></th></tr>` + slice.map(r => `<tr><td>${termDispL(r.期 || '—')}</td><td>${esc(r.星期 || '—')}</td><td class="tk">${esc(r.时间 || '—')}</td><td><b>${esc(classRowLabel(r))}</b></td><td>${r.班型 ? typeBadge(r.班型) : '<span class="muted">—</span>'}${subjBadge(r.学科)}</td><td>${esc(r.老师 || '—')}</td><td>${esc(r.教室 || '—')}</td><td class="muted">${esc(r.校区 || '—')}</td><td><b style="color:#059669">${r.在班人数 || r.人数 || 0}人</b></td><td><span class="btn sub sm" data-cls="${esc(r.班号 || classRowLabel(r))}">详情</span></td></tr>`).join('') + '</table>' : '<div class="note">没有符合条件的班级</div>';
    renderPager($('#schPager'), rows.length, pg.page, pg.size, (p, s) => { st.PG.sch = { page: p, size: s }; renderSchedule(); });
    box.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => { const row = rows.find(r => (r.班号 || classRowLabel(r)) === b.dataset.cls); if (row) classDetailDlg(row); });
  }
  function classDetailDlg(r) {
    dlg(classRowLabel(r), `<div class="kv"><div class="i"><span class="l">时间</span>${esc(r.星期 || '')} ${esc(r.时间 || '')}</div><div class="i"><span class="l">老师</span>${esc(r.老师 || '')}</div><div class="i"><span class="l">教室</span>${esc(r.校区 || '')} ${esc(r.教室 || '')}</div><div class="i"><span class="l">人数</span>${r.在班人数 || 0} 人</div></div>${(r.在班 || []).length ? `<table><tr><th>#</th><th>姓名</th><th>年级</th><th>电话</th><th></th></tr>${(r.在班 || []).map((x, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(x.姓名)}</b></td><td>${esc(x.年级 || '')}</td><td class="muted">${esc(x.电话 || '')}</td><td><span class="btn sub sm" data-goto-id="${esc(x.id)}">档案</span></td></tr>`).join('')}</table>` : '<div class="note">当前班级暂无在班学员</div>'}`, box => { box.querySelectorAll('[data-goto-id]').forEach(b => b.onclick = () => { dlgClose(); location.hash = 'profile/' + encodeURIComponent(b.dataset.gotoId); }); });
  }

  async function loadLeaves() { const d = await api.get('/api/leave/list').catch(() => ({ leaves: [] })); st.LEAVES = d.leaves || []; renderLeavePage(); }
  function renderLeavePage() {
    const kw = (st.filters.leaveKw || '').trim().toLowerCase();
    let rows = st.LEAVES.slice().sort((a, b) => String(b.创建时间 || '').localeCompare(String(a.创建时间 || '')));
    if (kw) rows = rows.filter(r => (r.姓名 || '').toLowerCase().includes(kw) || (r.班级 || '').toLowerCase().includes(kw));
    const stats = $('#leaveStats'); if (stats) stats.innerHTML = [['累计请假人次', rows.length, '次'], ['累计折算退费', '¥' + rows.reduce((s, x) => s + (Number(x.折算金额) || 0), 0), ''], ['涉及班级数', new Set(rows.map(r => r.班级)).size, '个']].map(x => `<div class="kpi-card"><div class="kpi-k">${x[0]}</div><div class="kpi-v">${x[1]}<span>${x[2]}</span></div></div>`).join('');
    const box = $('#leaveTable'); if (!box) return;
    box.innerHTML = rows.length ? `<table><tr><th>请假单号</th><th>学员姓名</th><th>请假班级</th><th>请假日期</th><th>原因/事由</th><th>折算退费金额</th><th>登记时间</th><th>操作</th></tr>${rows.map(r => `<tr><td class="muted">${esc(r.lid)}</td><td class="tk"><b>${esc(r.姓名)}</b></td><td>${esc(r.班级)}</td><td class="muted">${esc(r.日期)}</td><td>${esc(r.原因)}</td><td><b style="color:#0046B8;">¥${esc(r.折算金额)}</b></td><td class="muted">${esc(r.创建时间 || '')}</td><td><span class="btn sub sm" style="color:#DC2626;border-color:#FECACA;" data-del-leave="${esc(r.lid)}">撤销</span></td></tr>`).join('')}</table>` : '<div class="note">暂无请假与退费记录</div>';
    box.querySelectorAll('[data-del-leave]').forEach(b => b.onclick = async () => { if (!confirm('确认撤销这条请假记录？')) return; const r = await api.post('/api/leave/delete', { lid: b.dataset.delLeave }); if (r.ok) { await loadLeaves(); toast('已撤销'); } });
  }
  function openLeaveModal(studentId = '', studentName = '', defaultClass = '') { dlg('登记学员请假与折算退费', `${FG('学员姓名 <b style="color:#B91C1C">*</b>', `<input id="lv-name" value="${esc(studentName)}" placeholder="学员姓名" ${studentName ? 'readonly' : ''}>`)}${FG('报读班级 <b style="color:#B91C1C">*</b>', `<input id="lv-class" value="${esc(defaultClass)}" list="classData" placeholder="选择或输入当期班级"/>`)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${FG('请假日期', `<input id="lv-date" type="date" value="${todayStr()}">`)}${FG('折算退费金额 (元)', '<input id="lv-fee" type="number" value="200">')}</div>${FG('请假原因', '<select id="lv-reason"><option>事假 (提前报备)</option><option>病假 (身体不适)</option><option>临时冲突</option><option>其他</option></select>')}${FG('助教备注', '<input id="lv-note" placeholder="选填">')}${dlgFoot('确认登记')}`, box => { box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { let sid = studentId; const sname = box.querySelector('#lv-name').value.trim(); if (!sid && sname) { const found = st.ROSTER.find(s => s.姓名 === sname); sid = found ? found.id : ''; } const cls = box.querySelector('#lv-class').value.trim(); if (!sname || !cls) return dlgErr('请填写学员姓名与班级'); const r = await api.post('/api/leave/record', { studentId: sid, 姓名: sname, 班级: cls, 日期: box.querySelector('#lv-date').value, 折算金额: box.querySelector('#lv-fee').value, 原因: box.querySelector('#lv-reason').value, 备注: box.querySelector('#lv-note').value }); if (!r.ok) return dlgErr(r.错误 || '登记失败'); dlgClose(); await loadLeaves(); toast('请假登记成功'); }; }); }

  async function openProfile(id) {
    const d = await api.get('/api/student?id=' + encodeURIComponent(id)).catch(() => null); if (!d || !d.基本) { location.hash = 'stu'; return; }
    const a = d.基本; $('#pfName').textContent = a.姓名 + ' · 学员档案'; $('#pfMeta').innerHTML = `ID ${esc(a.id)}` + (d.家庭 && (d.家庭.children || []).length > 1 ? ` <span class="btn sub sm" data-open-family="${esc(d.家庭.familyId)}">查看家庭档案</span>` : '');
    const famBtn = $('#pfMeta [data-open-family]'); if (famBtn) famBtn.onclick = () => { location.hash = 'family/' + encodeURIComponent(famBtn.dataset.openFamily); };
    $('#pfBase').innerHTML = `<div class="kv"><div class="i"><span class="l">姓名</span>${esc(a.姓名)}</div><div class="i"><span class="l">年级</span>${esc(a.年级 || '—')}</div><div class="i"><span class="l">性别</span>${esc(a.性别 || '—')}</div><div class="i"><span class="l">联系电话</span>${esc(a.电话 || '—')}</div><div class="i"><span class="l">状态</span>${stTag(a.状态)}</div><div class="i"><span class="l">首次报名</span>${esc(a.首次 || '—')}</div>${a.备注 ? `<div class="i" style="grid-column:1/-1"><span class="l">备注</span>${esc(a.备注)}</div>` : ''}</div>`;
    $('#pfEdit').onclick = () => editStudentDlg(a); $('#pfAddEnr').onclick = () => addEnrollDlg(a);
    const orders = d.订单 || []; $('#pfPay').innerHTML = `<div class="kv"><div class="i"><span class="l">报名次数</span>${a.次数 || (d.报名 || []).length} 次</div><div class="i"><span class="l">累计已缴</span>${d.累计缴费 ? d.累计缴费 + ' 元' : '—'}</div><div class="i"><span class="l">订单数</span>${orders.length} 条</div></div>` + (orders.length ? '<table><tr><th>下单时间</th><th>商品</th><th>金额</th><th>状态</th></tr>' + orders.map(o => `<tr><td class="muted">${esc(o.下单)}</td><td>${esc(o.商品)}</td><td>${esc(o.金额)}</td><td>${badge(o.状态, o.状态 === '已支付' ? 'free' : 'gray')}</td></tr>`).join('') + '</table>' : '<div class="note">无订单记录</div>');
    const terms = {}; (d.报名 || []).forEach(r => { (terms[r.期] = terms[r.期] || []).push(r); });
    $('#pfTerms').innerHTML = Object.keys(terms).sort().reverse().map(k => `<div class="term open"><div class="term-h"><span class="arrow">▼</span>${termDispL(k)} · ${terms[k].length} 门课</div><div class="term-b"><table><tr><th>班级</th><th>校区</th><th>老师</th><th>开课 → 结课</th><th>状态</th><th></th></tr>${terms[k].map(r => `<tr><td>${esc(r.班级)}${r.源状态 === '历史在班学生' ? ' <span class="badge gray">转出</span>' : ''}${r.作废 ? ' <span class="tg-void">已作废</span>' : ''}</td><td class="muted">${esc(r.校区)}</td><td>${esc(r.老师)}</td><td class="muted">${esc(r.开课)} → ${esc(r.结课)}</td><td>${r.作废 || r.源状态 === '历史在班学生' ? '—' : stTag(r.状态)}</td><td><span class="btn sub sm" data-ee="${esc(r.eid || '')}">编辑</span><span class="btn sub sm" data-vd="${esc(r.eid || '')}" data-doing="${r.作废 ? '0' : '1'}" style="color:${r.作废 ? '#059669' : '#DC2626'}">${r.作废 ? '恢复' : '作废'}</span></td></tr>`).join('')}</table></div></div>`).join('') || '<div class="note">没有报名记录</div>';
    $('#pfTerms').querySelectorAll('[data-ee]').forEach(b => b.onclick = () => { const e = (d.报名 || []).find(x => x.eid === b.dataset.ee); if (e) editEnrollDlg(a, e); });
    $('#pfTerms').querySelectorAll('[data-vd]').forEach(b => b.onclick = () => voidEnroll(b.dataset.vd, b.dataset.doing === '1'));
    showPage('profile');
  }
  async function openFamily(id) {
    const d = await api.get('/api/family?id=' + encodeURIComponent(id)).catch(() => null); if (!d || !d.家庭) { location.hash = 'stu'; return; }
    const f = d.家庭, kids = d.孩子 || [], pending = d.待分配报名 || [];
    $('#famTitle').textContent = (f.sourceName || kids.map(k => k.姓名).join(' / ')) + ' · 家庭档案'; $('#famStatus').textContent = f.needsReview ? `待确认 ${pending.length} 条` : '归属已确认'; $('#famMeta').textContent = `家庭ID ${f.familyId} · 共用电话 ${f.phone || '—'} · ${kids.length} 个孩子档案`;
    $('#famKids').innerHTML = `<div class="family-kids">${kids.map(k => `<div class="kid-card"><div class="kk-name">${esc(k.姓名)}</div><div class="muted">${esc(k.年级 || '年级待确认')}</div><span class="btn sub sm" data-kid="${esc(k.id)}">打开孩子档案</span></div>`).join('')}</div>`;
    $('#famKids').querySelectorAll('[data-kid]').forEach(b => b.onclick = () => { location.hash = 'profile/' + encodeURIComponent(b.dataset.kid); });
    $('#famPendingCard').classList.toggle('hide', !pending.length); $('#famPending').innerHTML = pending.length ? '<div class="note">当前有待确认报名，请在后续家庭归属模块处理。</div>' : '<div class="note">没有待确认课程</div>';
    const orders = d.订单 || []; $('#famOrders').innerHTML = `<div class="kv"><div class="i"><span class="l">家庭累计已缴</span>${d.家庭累计缴费 ? d.家庭累计缴费 + ' 元' : '—'}</div><div class="i"><span class="l">订单数</span>${orders.length} 条</div></div>` + (orders.length ? `<table><tr><th>下单</th><th>商品</th><th>订单姓名</th><th>金额</th><th>状态</th></tr>${orders.map(o => `<tr><td class="muted">${esc(o.下单)}</td><td>${esc(o.商品)}</td><td>${esc(o.姓名)}</td><td>${esc(o.金额)}</td><td>${badge(o.状态, o.状态 === '已支付' ? 'free' : 'gray')}</td></tr>`).join('')}</table>` : '<div class="note">无订单</div>');
    showPage('family');
  }

  async function loadRenew() { st.RNU = await api.get('/api/renew-detail?term=' + encodeURIComponent((($('#rnuTerm') || {}).value) || (st.HOME && st.HOME.当期) || '2026秋')); renderRenew(); }
  function renderRenew() { const d = st.RNU; if (!d || !$('#rnuTable')) return; $('#rnuCount').textContent = `${termDispL(d.term)} · 上课 ${d.汇总.上课学员} · 已续 ${d.汇总.已续班} · 流失 ${d.汇总.流失学员} · 未续 ${d.汇总.未续班}`; const rows = d.明细 || []; $('#rnuSessions').innerHTML = '<div class="note">秋季为整期统计</div>'; $('#rnuTable').innerHTML = rows.length ? '<table><tr><th>学员</th><th>年级</th><th>本期班级</th><th>续班状态</th><th>跟进</th><th></th></tr>' + rows.slice(0, 200).map(r => `<tr><td class="tk"><b>${esc(r.姓名)}</b></td><td>${esc(r.年级 || '')}</td><td>${(r.本期班级 || []).map(c => esc(c.班级)).join('<br>')}</td><td><span class="badge ${RNU_TAG[r.状态] || 'gray'}">${esc(r.状态)}</span></td><td>${esc((r.跟进 || {}).状态 || '—')}</td><td><span class="btn sub sm" data-rnu-follow="${esc(r.childId)}">跟进</span><span class="btn sub sm" data-kid="${esc(r.childId)}">档案</span></td></tr>`).join('') + '</table>' : '<div class="note">没有符合条件的学员</div>'; $('#rnuTable').querySelectorAll('[data-kid]').forEach(b => b.onclick = () => location.hash = 'profile/' + encodeURIComponent(b.dataset.kid)); $('#rnuTable').querySelectorAll('[data-rnu-follow]').forEach(b => b.onclick = () => renewDlg(rows.find(x => x.childId === b.dataset.rnuFollow))); }
  function renewDlg(r) { if (!r) return; const f = r.跟进 || {}; dlg('续班跟进 · ' + r.姓名, `${FG('跟进状态', `<select id="rf-state">${['未跟进', '已沟通', '考虑中', '已报名', '暂不考虑'].map(s => `<option${s === (f.状态 || '') ? ' selected' : ''}>${s}</option>`).join('')}</select>`)}${FG('备注', `<input id="rf-note" value="${esc(f.备注 || '')}">`)}${FG('下次跟进日期', `<input id="rf-date" type="date" value="${esc(f.下次跟进 || '')}">`)}${dlgFoot('保存')}`, box => { box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { const x = await api.post('/api/renew/followup', { term: st.RNU.term, childId: r.childId, 状态: box.querySelector('#rf-state').value, 备注: box.querySelector('#rf-note').value, 下次跟进: box.querySelector('#rf-date').value }); if (!x.ok) return dlgErr(x.错误 || '保存失败'); dlgClose(); loadRenew(); }; }); }
  async function loadExpansion() { st.EXP = await api.get('/api/expansion?term=' + encodeURIComponent((st.HOME && st.HOME.招生期) || '2026秋')); renderExpansion(); }
  function renderExpansion() { const d = st.EXP; if (!d || !$('#expTable')) return; const s = d.汇总 || {}; $('#expStats').innerHTML = [['总人数', s.总人数 || 0, '人'], ['待拓科', s.待拓科 || 0, '人'], ['数学单科', s.数学单科 || 0, '人'], ['物理单科', s.物理单科 || 0, '人']].map(x => `<div class="kpi-card"><div class="kpi-k">${x[0]}</div><div class="kpi-v">${x[1]}<span>${x[2]}</span></div></div>`).join(''); const rows = d.明细 || []; $('#expCount').textContent = `共 ${rows.length} 人`; $('#expTable').innerHTML = rows.length ? `<table><tr><th>学员</th><th>年级</th><th>数学班</th><th>物理班</th><th>拓科状态</th><th>跟进</th><th></th></tr>${rows.map(r => `<tr><td><b>${esc(r.姓名)}</b><div class="muted">${esc(r.电话)}</div></td><td>${esc(r.年级)}</td><td>${(r.数学班 || []).map(x => esc(x.班级)).join('<br>') || '<span class="muted">—</span>'}</td><td>${(r.物理班 || []).map(x => esc(x.班级)).join('<br>') || '<span class="muted">—</span>'}</td><td>${badge(r.状态, 'blue')}</td><td>${esc((r.跟进 || {}).状态 || '未联系')}</td><td><span class="btn sub sm" data-exp-follow="${esc(r.childId)}">记录跟进</span></td></tr>`).join('')}</table>` : '<div class="note">没有符合条件的学员</div>'; $('#expTable').querySelectorAll('[data-exp-follow]').forEach(b => b.onclick = () => expansionDlg(rows.find(x => x.childId === b.dataset.expFollow))); }
  function expansionDlg(r) { if (!r) return; const f = r.跟进 || {}; dlg('拓科跟进 · ' + r.姓名, `${FG('跟进状态', `<select id="xf-state">${['未联系', '已沟通', '考虑中', '已报名', '暂不考虑', '无需拓科'].map(x => `<option${x === (f.状态 || '未联系') ? ' selected' : ''}>${x}</option>`).join('')}</select>`)}${FG('备注', `<input id="xf-note" value="${esc(f.备注 || '')}">`)}${FG('下次跟进日期', `<input id="xf-date" type="date" value="${esc(f.下次跟进 || '')}">`)}${dlgFoot('保存')}`, box => { box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { const x = await api.post('/api/expansion/followup', { term: (st.EXP && st.EXP.term) || '2026秋', childId: r.childId, 状态: box.querySelector('#xf-state').value, 备注: box.querySelector('#xf-note').value, 下次跟进: box.querySelector('#xf-date').value }); if (!x.ok) return dlgErr(x.错误 || '保存失败'); dlgClose(); loadExpansion(); }; }); }

  function renderOutlines() { const out = st.OUTLINES || {}; const sysEl = $('#olSys'); if (!sysEl) return; sysEl.innerHTML = Object.keys(out).map(s => `<option>${esc(s)}</option>`).join(''); fillTrack(); }
  function olTracks(sys) { return st.OUTLINES[sys] ? Object.keys(st.OUTLINES[sys]) : []; }
  function fillTrack() { const sys = $('#olSys').value || Object.keys(st.OUTLINES || {})[0] || ''; $('#olTrack').innerHTML = olTracks(sys).map(t => `<option>${esc(t)}</option>`).join(''); fillSeason(); }
  function fillSeason() { const sys = $('#olSys').value, tr = $('#olTrack').value; const seasons = st.OUTLINES[sys] && st.OUTLINES[sys][tr] ? Object.keys(st.OUTLINES[sys][tr]) : []; $('#olSeason').innerHTML = seasons.map(s => `<option>${esc(s)}</option>`).join(''); renderOutlineDetail(); }
  function curOutline() { return ((st.OUTLINES[$('#olSys').value] || {})[$('#olTrack').value] || {})[$('#olSeason').value] || []; }
  function renderOutlineDetail() { if (!$('#olPretty')) return; const rows = curOutline(), sys = $('#olSys').value, tr = $('#olTrack').value, se = $('#olSeason').value, seName = SEASON_NAME[se] || se; $('#olCount').textContent = `共 ${rows.length} 讲 · ${SYS_SUBJECT[sys] || ''}`; $('#olTitle').textContent = `${sys || ''} · ${tr || ''} · ${seName || ''}内容明细`; $('#olPretty').innerHTML = rows.length ? rows.map(r => `<div class="ol-row"><span class="n">第${r.n}讲</span><span><span class="t">${esc(r.topic)}</span>${r.module ? `<span class="m">${esc(r.module)}</span>` : ''}${r.desc ? `<div class="d">${esc(r.desc)}</div>` : ''}</span></div>`).join('') : '<div class="note">没有该大纲数据</div>'; }

  function renderRep() { const el = $('#repStu'); if (el) el.innerHTML = st.ROSTER.map(a => `<option value="${esc(a.id)}">${esc(a.姓名)}（${esc(a.年级 || '')}${(a.当期 && a.当期[0] || {}).班级 ? ' · ' + esc(a.当期[0].班级) : ' · 无当期班'}）</option>`).join(''); }
  function renderOpLog() { const list = st.OPLOG || []; const acts = [...new Set(list.map(l => l.动作))].filter(Boolean).sort(); const act = $('#logAction'); if (act) act.innerHTML = '<option value="">全部动作</option>' + acts.map(a => `<option>${esc(a)}</option>`).join(''); const box = $('#logList'); if (!box) return; box.innerHTML = list.length ? '<table><tr><th>时间</th><th>动作</th><th>对象</th><th>详情</th></tr>' + list.slice(0, 200).map(l => `<tr><td class="muted">${esc(l.时间 || '')}</td><td>${badge(l.动作 || '', 'blue')}</td><td>${esc(l.对象 || '')}</td><td class="muted">${esc(l.班级 || l.变更 || '')}</td></tr>`).join('') + '</table>' : '<div class="note">暂无记录</div>'; }
  function renderSync() { if ($('#syncStatus')) $('#syncStatus').textContent = '云端数据库模式：机构自动同步暂未启用；当前数据来自最新导入和在线增量录入。'; if ($('#syncReport')) $('#syncReport').innerHTML = '<div class="note">如需再次导入机构导出的 Excel，请走导入脚本。</div>'; }

  function editStudentDlg(a) { dlg('编辑学员 · ' + a.姓名, `${FG('姓名 <b style="color:#B91C1C">*</b>', `<input id="es-name" value="${esc(a.姓名)}">`)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${FG('联系电话', `<input id="es-phone" value="${esc(a.电话 || '')}">`)}${FG('年级', `<select id="es-grade"><option value=""></option>${GRADES.map(g => `<option${g === a.年级 ? ' selected' : ''}>${g}</option>`).join('')}</select>`)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${FG('性别', `<select id="es-sex"><option value=""></option><option${a.性别 === '男' ? ' selected' : ''}>男</option><option${a.性别 === '女' ? ' selected' : ''}>女</option></select>`)}${FG('备注', `<input id="es-note" value="${esc(a.备注 || '')}">`)}</div>${dlgFoot('保存')}`, box => { box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { const body = { id: a.id, 姓名: box.querySelector('#es-name').value.trim(), 电话: box.querySelector('#es-phone').value.trim(), 年级: box.querySelector('#es-grade').value, 性别: box.querySelector('#es-sex').value, 备注: box.querySelector('#es-note').value.trim() }; if (!body.姓名) return dlgErr('姓名必填'); const r = await api.post('/api/student/edit', body); if (!r.ok) return dlgErr(r.错误 || '保存失败'); dlgClose(); await refresh(); if (location.hash.startsWith('#profile/')) openProfile(a.id); else renderStudents(); }; }); }
  function addStudentDlg(familyId = '') { dlg('新增学员', `${FG('姓名 <b style="color:#B91C1C">*</b>', '<input id="ns-name" placeholder="学生姓名">')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${FG('联系电话', '<input id="ns-phone">')}${FG('年级', `<select id="ns-grade"><option value=""></option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select>`)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${FG('性别', '<select id="ns-sex"><option value=""></option><option>男</option><option>女</option></select>')}${FG('备注', '<input id="ns-note">')}</div><div style="margin-bottom:12px;"><label style="font-size:12px;cursor:pointer;"><input type="checkbox" id="ns-enr" style="width:auto;margin-right:6px">同时添加一条报名</label></div><div id="ns-enr-box" style="display:none;background:#F6F7FB;border-radius:8px;padding:12px;margin-top:4px">${FG('班级名称', '<input id="ns-class" list="classData">')}${FG('开课日期', `<input id="ns-start" type="date" value="${todayStr()}">`)}${FG('结课日期', '<input id="ns-end" type="date">')}${FG('老师', '<input id="ns-teacher">')}${FG('校区', '<input id="ns-campus">')}${FG('学科', '<select id="ns-subject"><option value=""></option><option>数学</option><option>物理</option></select>')}${FG('课费', '<input id="ns-fee" type="number">')}</div>${dlgFoot('保存')}`, box => { box.querySelector('#ns-enr').onchange = e => box.querySelector('#ns-enr-box').style.display = e.target.checked ? 'block' : 'none'; box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { const body = { familyId, 姓名: box.querySelector('#ns-name').value.trim(), 电话: box.querySelector('#ns-phone').value.trim(), 年级: box.querySelector('#ns-grade').value, 性别: box.querySelector('#ns-sex').value, 备注: box.querySelector('#ns-note').value.trim() }; if (!body.姓名) return dlgErr('姓名必填'); if (box.querySelector('#ns-enr').checked) Object.assign(body, { 班级: box.querySelector('#ns-class').value.trim(), 开课: box.querySelector('#ns-start').value, 结课: box.querySelector('#ns-end').value, 老师: box.querySelector('#ns-teacher').value.trim(), 校区: box.querySelector('#ns-campus').value.trim(), 学科: box.querySelector('#ns-subject').value, 课费: box.querySelector('#ns-fee').value }); const r = await api.post('/api/student', body); if (!r.ok) return dlgErr(r.错误 || '保存失败'); dlgClose(); await refresh(); renderStudents(); toast('学员已保存'); }; }); }
  function addEnrollDlg(a) { dlg('新增报名 · ' + a.姓名, `${FG('班级名称 <b style="color:#B91C1C">*</b>', '<input id="ae-class" list="classData">')}${FG('开课日期', `<input id="ae-start" type="date" value="${todayStr()}">`)}${FG('结课日期', '<input id="ae-end" type="date">')}${FG('老师', '<input id="ae-teacher">')}${FG('校区', '<input id="ae-campus">')}${FG('学科', '<select id="ae-subject"><option value=""></option><option>数学</option><option>物理</option></select>')}${FG('课费', '<input id="ae-fee" type="number">')}${dlgFoot('保存')}`, box => { box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { const body = { id: a.id, 班级: box.querySelector('#ae-class').value.trim(), 开课: box.querySelector('#ae-start').value, 结课: box.querySelector('#ae-end').value, 老师: box.querySelector('#ae-teacher').value.trim(), 校区: box.querySelector('#ae-campus').value.trim(), 学科: box.querySelector('#ae-subject').value, 课费: box.querySelector('#ae-fee').value }; if (!body.班级) return dlgErr('班级名称必填'); const r = await api.post('/api/enrollment', body); if (!r.ok) return dlgErr(r.错误 || '保存失败'); dlgClose(); await refresh(); openProfile(a.id); }; }); }
  function editEnrollDlg(a, e) { dlg('编辑报名 · ' + a.姓名, `${FG('班级名称', `<input id="ee-class" value="${esc(e.班级)}" list="classData">`)}${FG('开课日期', `<input id="ee-start" type="date" value="${esc(e.开课 || '')}">`)}${FG('结课日期', `<input id="ee-end" type="date" value="${esc(e.结课 || '')}">`)}${FG('老师', `<input id="ee-teacher" value="${esc(e.老师 || '')}">`)}${FG('校区', `<input id="ee-campus" value="${esc(e.校区 || '')}">`)}${FG('学科', `<input id="ee-subject" value="${esc(e.学科 || '')}">`)}${FG('课费', `<input id="ee-fee" type="number" value="${esc(e.课费 || '')}">`)}${dlgFoot('保存')}`, box => { box.querySelector('#dlgCancel').onclick = dlgClose; box.querySelector('#dlgOk').onclick = async () => { const body = { eid: e.eid, 班级: box.querySelector('#ee-class').value.trim(), 开课: box.querySelector('#ee-start').value, 结课: box.querySelector('#ee-end').value, 老师: box.querySelector('#ee-teacher').value.trim(), 校区: box.querySelector('#ee-campus').value.trim(), 学科: box.querySelector('#ee-subject').value.trim(), 课费: box.querySelector('#ee-fee').value }; const r = await api.post('/api/enrollment/edit', body); if (!r.ok) return dlgErr(r.错误 || '保存失败'); dlgClose(); await refresh(); openProfile(a.id); }; }); }
  async function voidEnroll(eid, doing) { if (doing && !confirm('确认作废这条报名？')) return; const r = await api.post('/api/enrollment/void', { eid, 作废: doing }); if (!r.ok) return alert(r.错误 || '操作失败'); await refresh(); if (location.hash.startsWith('#profile/')) openProfile(location.hash.slice(9)); }

  async function refresh() { await Z.bootstrap.loadAllData(); renderAll(); }
  function initCommon() {
    $$('.side .ni').forEach(n => n.onclick = () => { location.hash = n.dataset.p; });
    window.onhashchange = Z.bootstrap.route;
    $('#addStuBtn') && ($('#addStuBtn').onclick = () => addStudentDlg());
    $('#newLeaveBtn') && ($('#newLeaveBtn').onclick = () => openLeaveModal());
    $('#leaveKw') && ($('#leaveKw').oninput = e => { st.filters.leaveKw = e.target.value; renderLeavePage(); });
    $$('#p-stu .fbar .chip[data-f]').forEach(c => c.onclick = () => { st.filters.stuFilter = c.dataset.f; st.PG.stu.page = 1; renderStudents(); });
    $('#stuSearch') && ($('#stuSearch').oninput = e => { st.filters.stuKw = e.target.value; st.PG.stu.page = 1; renderStudents(); });
    $('#stuSort') && ($('#stuSort').onchange = e => { st.filters.stuSort = e.target.value; renderStudents(); });
    $('#stuTerm') && ($('#stuTerm').onchange = () => { st.PG.stu.page = 1; renderStudents(); });
    $('#stuCampus') && ($('#stuCampus').onchange = () => { st.PG.stu.page = 1; renderStudents(); });
    ['schTerm', 'schType', 'schGrade', 'schSubject', 'schDay', 'schTeacher', 'schCampus'].forEach(id => $('#' + id) && ($('#' + id).onchange = () => { st.PG.sch.page = 1; renderSchedule(); }));
    $('#schKw') && ($('#schKw').oninput = () => { st.PG.sch.page = 1; renderSchedule(); });
    $('#schReset') && ($('#schReset').onclick = () => { ['schType', 'schGrade', 'schSubject', 'schTeacher', 'schCampus', 'schDay'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; }); $('#schKw').value = ''; const t = $('#schTerm'); if (t) t.value = '2026秋'; renderSchedule(); });
    $('#rnuTerm') && ($('#rnuTerm').onchange = loadRenew);
    $('#rnuSession') && ($('#rnuSession').onchange = renderRenew);
    $('#rnuSearch') && ($('#rnuSearch').oninput = e => { st.filters.rnuKw = e.target.value; renderRenew(); });
    $$('#p-rec [data-rf]').forEach(c => c.onclick = () => { st.filters.rnuFilter = c.dataset.rf; renderRenew(); });
    $('#expGrade') && ($('#expGrade').onchange = renderExpansion); $('#expType') && ($('#expType').onchange = renderExpansion); $('#expFollow') && ($('#expFollow').onchange = renderExpansion); $('#expSearch') && ($('#expSearch').oninput = renderExpansion);
    $('#olSys') && ($('#olSys').onchange = fillTrack); $('#olTrack') && ($('#olTrack').onchange = fillSeason); $('#olSeason') && ($('#olSeason').onchange = renderOutlineDetail);
    $('#logAction') && ($('#logAction').onchange = () => { st.filters.logAction = $('#logAction').value; renderOpLog(); });
    $('#logSearch') && ($('#logSearch').oninput = e => { st.filters.logKw = e.target.value; renderOpLog(); });
  }
  function renderAll() {
    buildSchedMap();
    fillStuFilters(); fillSchFilters();
    const stuData = $('#stuData'); if (stuData) stuData.innerHTML = st.ROSTER.map(a => `<option value="${esc(a.id)}">${esc(a.姓名)}（${esc(a.年级 || '')} · ${esc(a.电话 || '')}）</option>`).join('');
    const classData = $('#classData'); if (classData) classData.innerHTML = [...new Set(st.ENROLL.map(x => x.班级).concat(st.SCHEDULE.map(x => x.班级 || x.课程)))].filter(Boolean).sort().map(c => `<option value="${esc(c)}">`).join('');
    renderHome(); renderStudents(); renderSchedule(); renderLeavePage(); renderOutlines(); renderRep(); renderOpLog(); renderSync();
  }
  function onPage(id) { if (id === 'leave') loadLeaves(); if (id === 'rec' && !st.RNU) loadRenew(); if (id === 'sync') renderSync(); if (id === 'oln') renderOutlineDetail(); }

  M.initCommon = initCommon;
  M.renderAll = renderAll;
  M.onPage = onPage;
  M.openProfile = openProfile;
  M.openFamily = openFamily;
})();
