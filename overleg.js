// Overleg for comité members: a button next to a participant, story, photo or page that
// opens the conversation about it, or starts one. Load after reunie.js, data.js and nav.js;
// nav.js loads it by itself for comité members on pages that do not. Others never see it.
const Overleg = (() => {
  const E = Reunie.esc;
  const PICTO = { vrij: '💬', deelnemer: '👤', verhaal: '📝', foto: '📷', pagina: '📄' };
  const SOORT = { vrij: 'Vrij onderwerp', deelnemer: 'Deelnemer', verhaal: 'Verhaal', foto: 'Foto', pagina: 'Pagina' };
  const hier = location.pathname.split('/').pop() || 'index.html';
  let lijst = [], comite = false;

  async function herlaad() {
    lijst = await Data.overleg().catch(() => lijst);
    return lijst;
  }
  // Resolves to true for comité members, once their conversations are loaded.
  const klaar = (async () => {
    if (!Data.ingelogd()) return false;
    comite = await Data.beheerder().catch(() => false);
    if (comite) await herlaad();
    return comite;
  })();

  // "📝 Verhaal: De verdwenen pan"
  const onderwerp = (soort, naam) => `${PICTO[soort] || '💬'} ${soort === 'vrij' ? SOORT.vrij : `${SOORT[soort]}: ${naam || '?'}`}`;
  const status = s => `<span class="st ${E(s)}">${E(s)}</span>`;

  // The conversation about an item: an open one first, else the latest.
  const over = (soort, ref) => {
    const bij = lijst.filter(g => g.soort === soort && g.ref === String(ref));
    return bij.find(g => g.status !== 'done') || bij[0] || null;
  };

  // Button for an item: '' for non-comité (or before klaar).
  function knop(soort, ref, naam, tekst = 'Bespreek') {
    if (!comite) return '';
    const g = over(soort, ref);
    return g ? `<a class="praat" href="beheer.html#overleg-${E(g.id)}" title="${E(g.titel)}">💬 Overleg ${status(g.status)}</a>`
      : `<button type="button" class="praat" data-ov-soort="${E(soort)}" data-ov-ref="${E(ref)}" data-ov-naam="${E(naam || '')}">💬 ${E(tekst)}</button>`;
  }

  // ---- dialog "Nieuw overleg" ----
  let nieuw = null;
  function dialoog() {
    let d = document.getElementById('ov-dlg');
    if (d) return d;
    document.body.insertAdjacentHTML('beforeend', `<dialog id="ov-dlg" class="card dialoog">
      <form method="dialog" id="ov-form" novalidate>
        <h3 style="margin:0 0 8px">Nieuw overleg</h3>
        <p style="margin:0 0 10px">Over: <span class="ond" id="ov-ond"></span></p>
        <label>Onderwerp<input id="ov-titel" maxlength="80" autocomplete="off" placeholder="bijv. Klopt dit jaartal?" required></label>
        <label style="margin-top:10px"><span>Eerste bericht <span class="muted" style="font-weight:400">(optioneel)</span></span><textarea id="ov-tekst" maxlength="1000" style="min-height:90px"></textarea></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="ov-hot"> <span>Meteen op ${status('hot')} zetten</span></label>
        <p class="muted" style="font-size:13px;margin:8px 0 0">Alleen het comité ziet dit overleg.</p>
        <p class="err" id="ov-fout" hidden></p>
        <div class="acties">
          <button class="btn ghost" value="nee" type="submit" formnovalidate>Annuleren</button>
          <button class="btn" value="ja" type="submit" id="ov-ok">Starten</button>
        </div>
      </form>
    </dialog>`);
    d = document.getElementById('ov-dlg');
    document.getElementById('ov-form').addEventListener('submit', async e => {
      if (e.submitter?.value !== 'ja') return;
      e.preventDefault();
      const titel = document.getElementById('ov-titel').value.trim(), fout = document.getElementById('ov-fout');
      fout.hidden = !!titel; fout.textContent = 'Geef het overleg een onderwerp.';
      if (!titel) return;
      const ok = document.getElementById('ov-ok');
      ok.disabled = true;
      try {
        const id = await Data.startOverleg({ ...nieuw, titel, tekst: document.getElementById('ov-tekst').value,
          status: document.getElementById('ov-hot').checked ? 'hot' : 'open' });
        await herlaad();
        d.close();
        location.href = 'beheer.html#overleg-' + id;
      } catch (err) { fout.textContent = err.message; fout.hidden = false; }
      ok.disabled = false;
    });
    return d;
  }

  function start(soort = 'vrij', ref = null, naam = null) {
    nieuw = { soort, ref, ref_naam: naam };
    const d = dialoog();
    document.getElementById('ov-ond').textContent = onderwerp(soort, naam);
    document.getElementById('ov-titel').value = ''; document.getElementById('ov-tekst').value = '';
    document.getElementById('ov-hot').checked = false; document.getElementById('ov-fout').hidden = true;
    d.showModal();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-ov-soort]');
    if (b) start(b.dataset.ovSoort, b.dataset.ovRef, b.dataset.ovNaam);
  });

  // Every page except Beheer: a line above the footer to talk about this page.
  klaar.then(ja => {
    if (!ja || hier === 'beheer.html') return;
    const naam = document.title.split(' · ')[0].replace(/^Reünie 25 jaar Scouting Brandevoort$/, 'Home');
    document.getElementById('voet')?.insertAdjacentHTML('beforebegin',
      `<div class="paginavoet">Comité: ${knop('pagina', hier, naam, 'Overleg over deze pagina')}</div>`);
  });

  return { klaar, knop, start, herlaad, lijst: () => lijst, onderwerp, status, PICTO };
})();
