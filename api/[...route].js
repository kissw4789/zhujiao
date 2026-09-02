const fs = require('fs');
const path = require('path');
const url = require('url');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (e) { return d; } };

let students = readJ('students.json', []);
let families = readJ('families.json', []);
let enrollments = readJ('enrollments.json', []);
let orders = readJ('orders.json', []);
let schedule = readJ('schedule.json', []);
let outlines = readJ('outlines.json', {});
let state = readJ('state.json', { renew: {}, progress: {}, inboxLog: [], opLog: [], seq: {}, leaves: [] });

const today = () => new Date().toISOString().slice(0, 10);
function enrStatus(e, now) {
  if (e.开课 && now < e.开课) return '待开课';
  if (e.结课 && now > e.结课) return '已结课';
  if (!e.开课) return '待开课';
  return '在读';
}
function studentStatus(es, now) {
  if (es.some(e => enrStatus(e, now) === '在读')) return '在读';
  if (es.some(e => enrStatus(e, now) === '待开课')) return '待开课';
  return '已结课';
}
function normalizeTeacher(v) {
  const TEACHER_ALIASES = { '飞飞': '王易飞', '温温': '温佳炜', '小明': '小明老师', '小明老师': '小明老师', '小天': '陈世崇', '小树': '束亚成', '金金': '刘金鑫', '晓晓': '张梦晓' };
  const s = String(v || '').trim().replace(/老师$/, '');
  return TEACHER_ALIASES[s] || TEACHER_ALIASES[s + '老师'] || s;
}
function normalizeSubject(v) {
  const s = String(v || '');
  if (s.includes('物理')) return '物理';
  if (s.includes('数学') || s.includes('奥数') || s.includes('中考') || s.includes('自招')) return '数学';
  return '数学';
}
function classType(v) {
  const s = String(v || '');
  if (s.includes('小明班')) return '小明班';
  if (s.includes('自招')) return '自招';
  if (s.includes('中考')) return '中考';
  if (s.includes('创新')) return '创新';
  if (s.includes('尖子')) return '尖子';
  if (s.includes('奥综') || s.includes('奥数')) return '奥数';
  return '其他';
}
function gradeOfClass(v) {
  const m = String(v || '').match(/^([1-9])/);
  return m ? m[1] + '年级' : '';
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }

  const u = url.parse(req.url, true);
  let p = u.pathname || '/';
  if (p.endsWith('.js')) p = p.slice(0, -3);
  if (!p.startsWith('/api')) p = '/api' + (p.startsWith('/') ? p : '/' + p);
  p = p.replace(/\/+$/, '');
  const now = today();

  let enrById = {};
  enrollments.forEach(e => { if (e.作废 !== true) (enrById[e.studentId || e.id] = enrById[e.studentId || e.id] || []).push(e); });
  let familiesById = {};
  families.forEach(f => { familiesById[f.familyId] = f; });

  if (p === '/api/home') {
    const curActive = enrollments.filter(e => e.作废 !== true && (e.studentId || e.id) && enrStatus(e, now) !== '已结课');
    const curKids = new Set(curActive.map(e => e.studentId || e.id));
    const curClasses = new Set(curActive.map(e => e.班级));
    const weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const curWeekday = weekDayNames[new Date().getDay()];
    const todaySchedule = schedule.filter(s => s.星期 === curWeekday);

    return send(res, 200, {
      今天: now,
      星期: curWeekday,
      当期: '2026秋',
      招生期: '2026秋',
      看板: {
        当期在读: curKids.size,
        当期班级: curClasses.size,
        下期已报: 0,
        下期班级: 0,
        已续班人数: 0,
        续班率: 0,
        待拓科人数: 0
      },
      今日排课: todaySchedule,
      待办: { 跟进到期: [] }
    });
  }

  if (p === '/api/students') {
    const list = students.map(st => {
      const es = enrById[st.id] || [];
      return {
        ...st,
        状态: studentStatus(es, now),
        当期: es.filter(e => enrStatus(e, now) !== '已结课').map(e => ({ 班级: e.班级, 老师: e.老师, 期: e.期, 状态: enrStatus(e, now), 校区: e.校区 })),
        累计缴费: 0,
        家庭: familiesById[st.familyId] || null,
        同家庭人数: (familiesById[st.familyId] || {}).children?.length || 1,
      };
    });
    return send(res, 200, list);
  }

  if (p === '/api/enrollments') {
    return send(res, 200, enrollments.map(e => ({ ...e, 状态: enrStatus(e, now) })));
  }

  if (p === '/api/families') {
    return send(res, 200, families.map(f => ({
      ...f,
      孩子: (f.children || []).map(id => students.find(s => s.id === id)).filter(Boolean)
    })));
  }

  if (p === '/api/schedule') {
    return send(res, 200, schedule);
  }

  if (p === '/api/outlines') {
    return send(res, 200, outlines);
  }

  if (p === '/api/state') {
    return send(res, 200, state);
  }

  if (p === '/api/classes') {
    const map = {};
    enrollments.forEach(e => {
      if (e.作废 === true || !e.班级) return;
      const c = (map[e.班级] = map[e.班级] || { 期: e.期, 学期: e.学期 || '', 班级: e.班级, 学科: e.学科 || normalizeSubject(e.班级), 老师: e.老师, 校区: e.校区, 开课: e.开课, 结课: e.结课, 在班: [], 退出: [], 待确认: [] });
      const st = students.find(s => s.id === (e.studentId || e.id));
      if (st) c.enrolledList = c.enrolledList || [];
      if (st) c.enrolledList.push({ id: st.id, 姓名: st.姓名, 年级: st.年级, 电话: st.电话, familyId: st.familyId });
    });

    const rows = schedule.map(r => {
      const isRent = String(r.课程 || '').includes('教室租用') || r.来源 === '教室租用';
      const c = map[r.班级名称] || map[r.课程] || {};
      const inClass = c.enrolledList || r.enrolledList || (r.在班 && r.在班.length ? r.在班 : []);
      return {
        来源: isRent ? '教室租用' : '课表',
        班号: r.班号,
        星期: r.星期 || '',
        时间: r.时间 || '',
        教室: r.教室 || '',
        课程: r.班级名称 || r.课程 || '',
        班级: r.班级名称 || r.课程 || '',
        班级名: [r.班级名称 || r.课程 || ''],
        期: r.期 || '2026秋',
        老师: normalizeTeacher(r.老师 || c.老师),
        老师全名: r.老师全名 || c.老师 || '',
        校区: r.校区 || c.校区 || '',
        备注: r.备注 || '',
        年级: r.年级 || gradeOfClass(r.班级名称 || r.课程),
        班型: r.班型 || classType(r.班级名称 || r.课程),
        学科: r.学科 || normalizeSubject(r.班级名称 || r.课程) || '数学',
        人数: inClass.length || Number(r.在班人数) || 0,
        在班人数: inClass.length || Number(r.在班人数) || 0,
        在班: inClass,
        enrolledList: inClass,
        退出: c.退出 || [],
        待确认: c.待确认 || [],
        开课: r.开课 || c.开课 || '2026-09-05',
        结课: r.结课 || c.结课 || '2027-01-17',
      };
    });
    return send(res, 200, rows);
  }

  return send(res, 404, { ok: false, path: p, 错误: 'Not found' });
};
