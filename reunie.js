// Shared helpers for the reunion pages: speltakken.txt, year maths, person cards.
const Reunie = (() => {
  const DATUM = new Date(2027, 4, 23);
  const NU = new Date().getFullYear();
  let cfg = { opgericht: 2001, takken: [] };

  // speltakken.txt: "Naam = leeftijd" per line, "opgericht = jaar", a line without
  // "= leeftijd" is a role without speltak (bestuur). # starts a comment.
  function parse(txt) {
    const c = { opgericht: 2001, takken: [] };
    for (let line of txt.split('\n')) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(.+?)\s*=\s*(\d+)$/);
      if (m && m[1].toLowerCase() === 'opgericht') c.opgericht = +m[2];
      else if (m) c.takken.push({ naam: m[1], vanaf: +m[2] });
      else c.takken.push({ naam: line, vanaf: null });
    }
    return c;
  }

  async function laadSpeltakken() {
    const r = await fetch('speltakken.txt', { cache: 'no-cache' });
    cfg = parse(await r.text());
    return cfg;
  }

  const takken = () => cfg.takken;
  const opgericht = () => cfg.opgericht;
  const isRol = naam => { const t = cfg.takken.find(t => t.naam === naam); return !t || t.vanaf == null; };

  // Years someone was a youth member of a speltak, from birth year; never before opgericht.
  // tot = null means "heden" (still in it), so it stays right in later years.
  // Returns null for roles or when the speltak falls entirely outside [opgericht, now].
  function berekenJaren(geboortejaar, naam) {
    const i = cfg.takken.findIndex(t => t.naam === naam);
    const tak = cfg.takken[i];
    if (!tak || tak.vanaf == null || !geboortejaar) return null;
    const volgende = cfg.takken.slice(i + 1).find(t => t.vanaf != null);
    const van = Math.max(geboortejaar + tak.vanaf, cfg.opgericht);
    const tot = volgende ? geboortejaar + volgende.vanaf - 1 : Infinity;
    if (van > NU || van > tot) return null;
    return [van, tot >= NU ? null : tot];
  }

  // Age at the reunion from birth year only (one too high for birthdays after 23 May).
  const leeftijd = gj => gj ? DATUM.getFullYear() - gj : null;
  const periode = (van, tot) => tot == null ? `${van}–heden` : van === tot ? `${van}` : `${van}–${tot}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Filter on speltak and/or year; a takken row is {speltak, rol, van, tot}.
  const matcher = (speltak, jaar) => r =>
    (!speltak || r.speltak === speltak) && (!jaar || (r.van <= jaar && jaar <= (r.tot ?? NU)));

  // Person card from a public row {voornaam, achternaam, geboortejaar, takken}:
  // fields the person chose to hide are null.
  function kaart(p, hit) {
    const naam = [p.voornaam, p.achternaam].filter(Boolean).map(esc).join(' ');
    const age = p.geboortejaar ? leeftijd(p.geboortejaar) + ' jaar' : '';
    const rows = p.takken ? [...p.takken.filter(r => r.rol === 'lid'), ...p.takken.filter(r => r.rol !== 'lid')] : [];
    const chips = rows.map(r => {
      const cls = [r.rol === 'leiding' ? 'ld' : '', hit && hit(r) ? 'hit' : ''].join(' ').trim();
      const label = r.rol === 'leiding' && !isRol(r.speltak) ? `<b>Leiding</b> ${esc(r.speltak)}` : esc(r.speltak);
      return `<span class="${cls}">${label} ${periode(r.van, r.tot)}</span>`;
    }).join('');
    if (!naam && !age && !chips) {
      return '<div class="person anon"><div class="name">Niet zichtbaar</div><div class="meta">telt alleen mee in het totaal</div></div>';
    }
    return `<div class="person"><div class="name">${naam || '<span class="muted">Anoniem</span>'}</div>
      <div class="meta">${age || '&nbsp;'}</div>${chips ? `<div class="tk">${chips}</div>` : ''}</div>`;
  }

  // Year fields (class "yr" with min/max): arrow up from empty starts at min (opgericht),
  // arrow down from empty at max (this year). Native number inputs would start at 0.
  function stapJaar(el, d) {
    const min = +el.min, max = +el.max;
    el.value = el.value === '' ? (d > 0 ? min : max) : Math.min(max, Math.max(min, +el.value + d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.addEventListener('keydown', e => {
    if (!e.target.classList?.contains('yr') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    stapJaar(e.target, e.key === 'ArrowUp' ? 1 : -1);
  });
  // Mouse on the spinner of an empty field: upper half = up, lower half = down.
  document.addEventListener('pointerdown', e => {
    const el = e.target;
    if (!el.classList?.contains('yr') || el.value !== '' || el.disabled) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.right - 24) return;
    e.preventDefault(); el.focus();
    stapJaar(el, e.clientY < r.top + r.height / 2 ? 1 : -1);
  });

  return { DATUM, NU, laadSpeltakken, takken, opgericht, isRol, berekenJaren, leeftijd, periode, esc, matcher, kaart };
})();

const $ = id => document.getElementById(id);
