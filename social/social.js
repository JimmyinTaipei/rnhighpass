// 裝飾與單張模式：?slide=N 只顯示第 N 張（給 headless Chrome 截圖用）
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const MID = '#B6CCF0', PAPER = '#F4F7FC', GOLD = '#E3B04B';

  // 青海波：一列一列往下畫，後畫的蓋住前一列，才會有魚鱗疊壓的效果
  function seigaiha(w, h) {
    const R = 60, dx = 120, dy = 30;
    let s = `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice">`;
    for (let row = 0, y = R * 0.6; y < h + R; row++, y += dy) {
      const off = row % 2 ? dx / 2 : 0;
      for (let x = -dx + off; x < w + dx; x += dx) {
        [R, R * 0.78, R * 0.56, R * 0.34].forEach((r, i) => {
          s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? PAPER : '#DCE6F6'}"` +
            ` stroke="${i === 0 ? GOLD : MID}" stroke-width="${i === 0 ? 2.5 : 2}"/>`;
        });
      }
    }
    return s + '</svg>';
  }

  // 祥雲：幾個圓組成雲身，再加一個金色漩渦
  function cloud(size, opacity) {
    const el = document.createElement('div');
    el.className = 'cloud';
    el.style.width = size + 'px';
    el.style.opacity = opacity;
    // 先畫一層金色粗描邊，再用白色蓋上同樣的形狀，只留下外輪廓的金線
    const body = '<circle cx="62" cy="64" r="30"/><circle cx="104" cy="48" r="38"/>' +
      '<circle cx="148" cy="66" r="26"/><rect x="28" y="64" width="150" height="30" rx="15"/>';
    el.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 200 110">
      <g fill="#fff" stroke="${GOLD}" stroke-width="7">${body}</g>
      <g fill="#fff">${body}</g>
      <path d="M92 60 a13 13 0 1 1 13 13 a22 22 0 1 1 22 -22" fill="none"
        stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
    </svg>`;
    return el;
  }

  document.querySelectorAll('.waves').forEach(el => { el.innerHTML = seigaiha(1080, 190); });

  document.querySelectorAll('.slide').forEach((slide, i) => {
    const a = cloud(i === 0 ? 280 : 220, 1);
    a.style.right = '-36px'; a.style.top = i === 0 ? '330px' : '130px';
    slide.appendChild(a);
  });

  const n = parseInt(new URLSearchParams(location.search).get('slide'), 10);
  if (n) {
    document.body.classList.add('single');
    const s = document.querySelectorAll('.slide')[n - 1];
    if (s) s.classList.add('on');
  }
})();
