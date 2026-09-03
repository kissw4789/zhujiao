// 苏E好学 · 助教工作台模块化入口
(async function () {
  try {
    const ok = await window.ZJ.bootstrap.ensureAuth();
    if (ok) await window.ZJ.bootstrap.afterLogin();
  } catch (e) {
    console.error(e);
    const box = document.createElement('div');
    box.className = 'boot-error';
    box.innerHTML = `<b>系统启动失败</b><div>${String(e && e.message || e)}</div>`;
    document.body.appendChild(box);
  }
})();
