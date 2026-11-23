// Cut a round profile photo out of a bigger one, in the browser.
// Uitsnijden.kies(titel) opens the file chooser (call it from a click), then a dialog where you
// drag the photo and zoom (slider, mouse wheel or two fingers) until your face fits the circle.
// Resolves with a 200 x 200 JPEG blob, or null when cancelled. Only that circle is ever sent;
// the original photo stays on the device.
const Uitsnijden = (() => {
  const UIT = 200;            // output size in px
  const V = 560, R = 240;     // canvas size and circle radius (canvas px; shown at half size)
  const C = V / 2;
  let dlg, cv, ctx, zoom, img, w, h, s, min, ox, oy, klaar;

  function bouw() {
    dlg = document.createElement('dialog');
    dlg.className = 'card dialoog uitsnijden';
    dlg.innerHTML = `<form method="dialog">
        <h3 style="margin:0 0 8px" class="u-titel"></h3>
        <canvas width="${V}" height="${V}" aria-label="Sleep de foto zodat je gezicht in het rondje past"></canvas>
        <p class="muted" style="margin:8px 0;font-size:14px">Sleep de foto en zoom tot je gezicht in het rondje past.</p>
        <label class="u-zoom"><span>Zoom</span><input type="range" min="1" max="5" step="0.01" value="1"></label>
        <div class="acties">
          <button class="btn ghost" value="nee" type="submit">Annuleren</button>
          <button class="btn" value="ja" type="submit">Gebruiken</button>
        </div>
      </form>`;
    document.body.append(dlg);
    cv = dlg.querySelector('canvas'); ctx = cv.getContext('2d'); zoom = dlg.querySelector('input');

    zoom.addEventListener('input', () => zoomNaar(min * +zoom.value));
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      zoom.value = Math.min(5, Math.max(1, +zoom.value - e.deltaY * 0.002));
      zoomNaar(min * +zoom.value);
    }, { passive: false });

    // One finger or the mouse drags; two fingers pinch.
    const vingers = new Map();
    let start = null;
    const schaal = () => V / cv.getBoundingClientRect().width;
    const afstand = () => { const [a, b] = [...vingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      vingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = vingers.size === 2 ? { afstand: afstand(), z: +zoom.value } : { x: e.clientX, y: e.clientY, ox, oy };
    });
    cv.addEventListener('pointermove', e => {
      if (!vingers.has(e.pointerId)) return;
      vingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (vingers.size === 2 && start.afstand) {
        zoom.value = Math.min(5, Math.max(1, start.z * afstand() / start.afstand));
        zoomNaar(min * +zoom.value);
      } else if (vingers.size === 1 && start && !start.afstand) {
        const k = schaal();
        ox = start.ox + (e.clientX - start.x) * k; oy = start.oy + (e.clientY - start.y) * k;
        klem(); teken();
      }
    });
    const los = e => {
      vingers.delete(e.pointerId);
      const [rest] = vingers.values();      // back to dragging with the finger that stayed
      start = rest ? { x: rest.x, y: rest.y, ox, oy } : null;
    };
    cv.addEventListener('pointerup', los);
    cv.addEventListener('pointercancel', los);

    dlg.addEventListener('close', async () => {
      const ja = dlg.returnValue === 'ja';
      const k = klaar; klaar = null;
      k?.(ja ? await uitsnede() : null);
    });
  }

  function klem() {
    ox = Math.min(C - R, Math.max(C + R - w * s, ox));
    oy = Math.min(C - R, Math.max(C + R - h * s, oy));
  }
  function zoomNaar(ns) {
    const cx = (C - ox) / s, cy = (C - oy) / s;     // keep the middle of the circle in place
    s = ns; ox = C - cx * s; oy = C - cy * s;
    klem(); teken();
  }
  function teken() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, V, V);
    ctx.drawImage(img, ox, oy, w * s, h * s);
    ctx.fillStyle = 'rgba(0, 0, 0, .55)';
    ctx.beginPath(); ctx.rect(0, 0, V, V); ctx.arc(C, C, R, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = '#ffe400'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke();
  }
  function uitsnede() {
    const c = document.createElement('canvas');
    c.width = c.height = UIT;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, UIT, UIT);          // transparent PNG: white, not black
    g.drawImage(img, (C - R - ox) / s, (C - R - oy) / s, 2 * R / s, 2 * R / s, 0, 0, UIT, UIT);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
  }

  async function laad(bestand) {
    const url = URL.createObjectURL(bestand);
    try {
      const i = new Image();
      i.src = url;
      await i.decode();
      img = i; w = i.naturalWidth; h = i.naturalHeight;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    min = 2 * R / Math.min(w, h); s = min;
    ox = C - w * s / 2; oy = C - h * s / 2;
    zoom.value = 1;
    klem(); teken();
  }

  // Call from a click: opens the file chooser, then the dialog.
  function kies(titel = 'Snijd jezelf uit') {
    if (!dlg) bouw();
    return new Promise((ok, mis) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const bestand = input.files[0];
        if (!bestand) return ok(null);
        try { await laad(bestand); }
        catch { return mis(new Error('Deze foto kunnen we niet openen. Probeer een JPG of PNG.')); }
        dlg.querySelector('.u-titel').textContent = titel;
        klaar = ok;
        dlg.returnValue = '';
        dlg.showModal();
      });
      input.addEventListener('cancel', () => ok(null));
      input.click();
    });
  }

  return { kies };
})();
