const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (e) { return d; } };
const families = readJ('families.json', []);
const students = readJ('students.json', []);

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const list = families.map(f => ({
    ...f,
    孩子: (f.children || []).map(id => students.find(s => s.id === id)).filter(Boolean)
  }));
  res.end(JSON.stringify(list));
};
