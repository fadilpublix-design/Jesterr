/* script.js - versi tetap (fixed reference) 
   Tujuan: buat posisi path & penempatan {x} konsisten di desktop & HP.
   Hanya mengganti script agar path dihitung menggunakan ukuran viewBox tetap (860x300),
   sehingga desktop dan mobile menampilkan posisi yang sama.
*/

(function () {
  const SVG_ID = 'svg-root';
  const PATH_TOP_ID = 'curve-top';
  const PATH_BOTTOM_ID = 'curve-bottom';
  const ON_SEL = '.on';
  const AFTER_SEL = '.after';
  const IMG_ID = 'x-img';

  // tunables (keep same behavior as sebelumnya)
  const padding = 8;        // jarak aman huruf <-> ikon
  const minScale = 0.30;    // skala minimum jika ruang sempit
  const pathSamples = 360;  // sampling resolution
  const fineTuneY = -4;     // sedikit naikkan ikon supaya visual center pas
  const rotationOffset = 0; // koreksi rotasi jika perlu

  // IMPORTANT: use fixed reference dimensions (matching original viewBox in HTML)
  // Jangan pakai svg.getBoundingClientRect() — itu membuat layout berbeda di device.
  const REF_WIDTH = 860;   // gunakan nilai viewBox width yang ada di HTML
  const REF_HEIGHT = 300;  // gunakan nilai viewBox height yang ada di HTML

  function whenFontsReady(cb) {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(cb).catch(cb);
    } else setTimeout(cb, 200);
  }

  // Rekomputasi path namun menggunakan koordinat tetap (referensi viewBox),
  // sehingga path tidak berubah antar device.
  function recomputePathsFixed() {
    const svg = document.getElementById(SVG_ID);
    if (!svg) return;
    const topPath = svg.querySelector('#' + PATH_TOP_ID);
    const bottomPath = svg.querySelector('#' + PATH_BOTTOM_ID);
    if (!topPath || !bottomPath) return;

    // gunakan REF_WIDTH / REF_HEIGHT sebagai ruang user-space konsisten
    const w = REF_WIDTH;
    const h = REF_HEIGHT;

    // margins dan kontrol proporsional terhadap referensi
    const margin = Math.max(40, w * 0.06);
    // untuk membuat JESTER lebih melengkung, atur controlY lebih kecil (atau negatif)
    const topY = Math.max(60, h * 0.55);         // baseline y untuk top text (relatif)
    const topCtrlY = Math.max(-80, h * 0.08 - 80); // kontrol lebih kecil -> melengkung lebih dramatis
    const bottomY = Math.min(h - 30, h * 0.78);  // baseline y untuk bottom text
    const bottomCtrlY = Math.max(30, h * 0.45);  // kontrol untuk bottom curve

    // bentuk quadratic bezier menggunakan koordinat referensi tetap
    const topD = `M ${margin} ${topY} Q ${w/2} ${topCtrlY} ${w - margin} ${topY}`;
    const bottomD = `M ${margin} ${bottomY} Q ${w/2} ${bottomCtrlY} ${w - margin} ${bottomY}`;

    topPath.setAttribute('d', topD);
    bottomPath.setAttribute('d', bottomD);

    // pastikan viewBox tetap referensi asli (tidak kita ubah)
    // Jika HTML sudah punya viewBox "0 0 860 300", biarkan seperti itu.
    // Kita tidak mengubah attribute viewBox agar koordinat user-space konsisten.
  }

  // Cari titik pada path dengan x terdekat ke centerX (sampling)
  function findClosestPointOnPath(path, targetX, samples = pathSamples) {
    const total = path.getTotalLength();
    let best = { d: Infinity, t: 0, pt: path.getPointAtLength(0) };
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * total;
      const pt = path.getPointAtLength(t);
      const d = Math.abs(pt.x - targetX);
      if (d < best.d) best = { d, t, pt };
    }
    return best;
  }

  function placeAndRotateFixed() {
    const svg = document.getElementById(SVG_ID);
    if (!svg) return;
    const path = svg.querySelector('#' + PATH_BOTTOM_ID);
    const onT = svg.querySelector(ON_SEL);
    const afterT = svg.querySelector(AFTER_SEL);
    const img = svg.querySelector('#' + IMG_ID);
    if (!path || !onT || !afterT || !img) return;

    try {
      // gunakan getComputedTextLength bila tersedia (akurasi pada SVG)
      const onWidth = (typeof onT.getComputedTextLength === 'function') ? onT.getComputedTextLength() : onT.getBBox().width;
      const onBox = onT.getBBox();
      const afterBox = afterT.getBBox();

      // hitung batas kiri/kanan dalam user-space viewBox referensi
      const onEndX = onBox.x + onWidth + padding;
      const afterStartX = afterBox.x - padding;
      let available = afterStartX - onEndX;
      if (available < 6) available = 6;

      const centerX = (onEndX + afterStartX) / 2;

      // cari titik pada path (user-space tetap konsisten karena path dibuat dengan REF coords)
      const best = findClosestPointOnPath(path, centerX);
      const target = best.pt;
      const tAt = best.t;

      // hitung tangent untuk rotasi
      const totalLen = path.getTotalLength();
      const delta = Math.max(0.5, totalLen / pathSamples);
      const p1 = path.getPointAtLength(Math.max(0, tAt - delta));
      const p2 = path.getPointAtLength(Math.min(totalLen, tAt + delta));
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

      // ukuran gambar (pakai attribute width/height dari HTML)
      let imgW = Number(img.getAttribute('width')) || img.getBBox().width;
      let imgH = Number(img.getAttribute('height')) || img.getBBox().height;

      // skala turun jika melebihi ruang tersedia
      if (imgW > available) {
        const scale = Math.max(minScale, (available - 4) / imgW);
        imgW = Math.max(8, Math.round(imgW * scale));
        imgH = Math.max(8, Math.round(imgH * scale));
        img.setAttribute('width', imgW);
        img.setAttribute('height', imgH);
      }

      // hitung posisi (centered di target)
      let imgX = target.x - imgW / 2;
      let imgY = target.y - imgH / 2 + fineTuneY;

      // coba geser sedikit bila overlap
      const leftLimit = onEndX;
      const rightLimit = afterStartX;
      const overlaps = (x) => (x < leftLimit) || (x + imgW > rightLimit);
      if (overlaps(imgX)) {
        let attempt = 0;
        const maxAttempts = 24;
        const step = Math.max(2, Math.round(imgW * 0.08));
        let dir = -1;
        while (attempt < maxAttempts && overlaps(imgX)) {
          imgX += dir * step;
          dir *= -1;
          attempt++;
        }
        if (overlaps(imgX)) {
          imgX = Math.max(leftLimit + 2, Math.min(imgX, rightLimit - imgW - 2));
        }
      }

      // set atribut x,y dan rotasi di sekitar pusat gambar
      img.setAttribute('x', imgX);
      img.setAttribute('y', imgY);
      const cx = imgX + imgW / 2;
      const cy = imgY + imgH / 2;
      img.setAttribute('transform', `rotate(${angleDeg + rotationOffset}, ${cx}, ${cy})`);
    } catch (e) {
      console.warn('placeAndRotateFixed error', e);
    }
  }

  function fullRunFixed() {
    // buat path tetap berdasarkan referensi viewBox (tidak berdasarkan lebar layar)
    recomputePathsFixed();
    // beri sedikit jeda untuk memastikan DOM/SVG stabil lalu tempatkan gambar
    setTimeout(() => {
      placeAndRotateFixed();
      setTimeout(placeAndRotateFixed, 150);
      setTimeout(placeAndRotateFixed, 350);
    }, 30);
  }

  // jalankan setelah fonts siap (agar getBBox & getComputedTextLength stabil)
  whenFontsReady(() => {
    fullRunFixed();
    // pada resize kita tetap jalankan kembali (mis. font-scale atau zoom)
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fullRunFixed, 140);
    });
    // orientationchange juga
    window.addEventListener('orientationchange', () => setTimeout(fullRunFixed, 200));
  });
})();
