const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (e) { return d; } };
const enrollments = readJ('enrollments.json', []);

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const now = new Date().toISOString().slice(0, 10);
  const list = enrollments.map(e => ({
    ...e,
    状态: (!e.开课 || now < e.开课) ? '待开课' : (e.结课 && now > e.结课) ? '已结课' : '在读'
  }));
  res.end(JSON.stringify(list));
};
