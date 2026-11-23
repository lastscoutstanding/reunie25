// Shared helpers for the reunion pages: speltakken.txt, year maths, person cards.
const Reunie = (() => {
  const DATUM = new Date(2027, 4, 23);
  const TIJD = '14:00 – 19:00';

  // "Add to calendar": reunie.ics for Apple Calendar and Outlook, a link for Google Calendar.
  // "42 komen naar de reünie, 11 weten het nog niet": totals only, never who.
  function erbijTekst(n = {}) {
    const ja = n.ja || 0, mis = n.misschien || 0;
    return `${ja} ${ja === 1 ? 'komt' : 'komen'} naar de reünie` + (mis ? `, ${mis} ${mis === 1 ? 'weet' : 'weten'} het nog niet` : '');
  }

  function agenda() {
    const q = new URLSearchParams({
      action: 'TEMPLATE', text: 'Reünie 25 jaar Scouting Brandevoort',
      dates: '20270523T140000/20270523T190000', ctz: 'Europe/Amsterdam',
      location: 'Blokhut de Brandnetel, Brandevoort 13-A, 5706 KA Helmond',
      details: 'Vrije inloop tussen 14:00 en 19:00.',
    });
    return `<a href="reunie.ics" download="reunie-scouting-brandevoort.ics">📅 Zet in je agenda</a>`
      + ` <small class="muted">of <a href="https://calendar.google.com/calendar/render?${q}" target="_blank" rel="noopener">Google Agenda</a></small>`;
  }
  const NU = new Date().getFullYear();
  let cfg = { opgericht: 2001, takken: [] };

  // speltakken.txt: "Naam = leeftijd" per line, "opgericht = jaar", a line without
  // "= leeftijd" is a role without speltak (bestuur). Old names after a |, comma-separated.
  // # starts a comment.
  function parse(txt) {
    const c = { opgericht: 2001, takken: [] };
    for (let line of txt.split('\n')) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('|');
      const oud = i < 0 ? [] : line.slice(i + 1).split(',').map(s => s.trim()).filter(Boolean);
      if (i >= 0) line = line.slice(0, i).trim();
      const m = line.match(/^(.+?)\s*=\s*(\d+)$/);
      if (m && m[1].toLowerCase() === 'opgericht') c.opgericht = +m[2];
      else if (m) c.takken.push({ naam: m[1], vanaf: +m[2], oud });
      else c.takken.push({ naam: line, vanaf: null, oud });
    }
    return c;
  }

  async function laadSpeltakken() {
    const r = await fetch('speltakken.txt', { cache: 'no-cache' });
    cfg = parse(await r.text());
    return cfg;
  }

  // betalen.txt: "sleutel = waarde" per line. Returns null until there is an amount and
  // a link or IBAN, so the payment block stays hidden until the comité has filled it in.
  async function laadBetalen() {
    try {
      const r = await fetch('betalen.txt', { cache: 'no-cache' });
      if (!r.ok) return null;
      const b = {};
      for (const line of (await r.text()).split('\n')) {
        const m = line.trim().match(/^(\w+)\s*=\s*(.*)$/);
        if (m && !line.trim().startsWith('#')) b[m[1].toLowerCase()] = m[2].trim();
      }
      const bedrag = parseFloat((b.bedrag || '').replace(',', '.'));
      const link = /^https:\/\//i.test(b.link || '') ? b.link : '';
      if (!(bedrag > 0) || !(link || b.iban)) return null;
      return { bedrag, link, iban: b.iban || '', naam: b.naam || '', tekst: b.tekst || '' };
    } catch { return null; }
  }
  const euro = n => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0 });

  const takken = () => cfg.takken;
  const opgericht = () => cfg.opgericht;
  const isRol = naam => { const t = cfg.takken.find(t => t.naam === naam); return !t || t.vanaf == null; };
  // Old names of a speltak from speltakken.txt ("Verkenners", ...), and the name a takken row
  // shows: what the person chose under "Heette toen", else the current name.
  const oudeNamen = naam => cfg.takken.find(t => t.naam === naam)?.oud || [];
  const takNaam = r => r.naam || r.speltak;
  // Search text: matches the start of a word in a chosen name, the speltak or its old names.
  const takPast = (r, q) => [r.naam, r.speltak, ...oudeNamen(r.speltak)].filter(Boolean)
    .some(n => n.toLowerCase().split(/[\s/'-]+/).some(w => w.startsWith(q)) || n.toLowerCase().startsWith(q));

  // Years someone was a youth member of a speltak, from birth year; never before opgericht.
  // tot = null means "heden" (still in it), so it stays right in later years.
  // Returns null for roles or when the speltak falls entirely outside [opgericht, now].
  function berekenJaren(geboortejaar, naam) {
    const i = cfg.takken.findIndex(t => t.naam === naam);
    const tak = cfg.takken[i];
    if (!tak || tak.vanaf == null || !geboortejaar) return null;
    // Until the next older speltak; one with the same age runs alongside (Vuurvogels, Plusscouts).
    const volgende = cfg.takken.slice(i + 1).find(t => t.vanaf != null && t.vanaf > tak.vanaf);
    const van = Math.max(geboortejaar + tak.vanaf, cfg.opgericht);
    const tot = volgende ? geboortejaar + volgende.vanaf - 1 : Infinity;
    if (van > NU || van > tot) return null;
    return [van, tot >= NU ? null : tot];
  }

  // Age in the jubilee year (founded + 25 = 2026), from birth year only: shown as
  // "57 bij het jubileum". With only a birth year this is right for more people, both now
  // and on the reunion day, than the reunion year, and when wrong it errs on the young side.
  const jubileum = () => cfg.opgericht + 25;
  const leeftijd = gj => gj ? jubileum() - gj : null;
  // A wink: "2,3 keer zo oud als de club"; close to 25 in years ("4 jaar ouder dan de club").
  function knipoog(gj) {
    const l = leeftijd(gj);
    if (l == null) return '';
    if (l === 25) return 'precies zo oud als de club';
    if (l < 25) return `${25 - l} jaar jonger dan de club`;
    if (l - 25 <= 12) return `${l - 25} jaar ouder dan de club`;
    return `${(l / 25).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} keer zo oud als de club`;
  }
  const leeftijdTekst = gj => gj ? `<span title="In ${jubileum()}, toen Scouting Brandevoort 25 werd: ${knipoog(gj)}">${leeftijd(gj)} bij het jubileum</span>` : '';
  const periode = (van, tot) => tot == null ? `${van}–heden` : van === tot ? `${van}` : `${van}–${tot}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Filter on speltak and/or year; a takken row is {speltak, rol, van, tot}.
  const matcher = (speltak, jaar) => r =>
    (!speltak || r.speltak === speltak) && (!jaar || (r.van <= jaar && jaar <= (r.tot ?? NU)));

  // Display name: Sanne “Snoes” Jansen; just the nickname when nothing else is shown.
  function naam(p) {
    const bij = p.bijnaam && (p.voornaam || p.achternaam) ? `“${p.bijnaam}”` : p.bijnaam;
    return [p.voornaam, bij, p.achternaam].filter(Boolean).join(' ');
  }

  // Is a public row the logged-in person's own? Public rows carry no id, so compare what
  // is shown with your own record as others see it (Data.publiek). Takken are compared
  // as text, because the database may return their keys in another order.
  function zelf(ik) {
    if (!ik) return () => false;
    const sleutel = p => JSON.stringify([p.voornaam ?? null, p.achternaam ?? null, p.bijnaam ?? null, p.geboortejaar ?? null,
      (p.takken || []).map(t => `${t.speltak}|${t.rol}|${t.van ?? ''}|${t.tot ?? ''}`).sort()]);
    const mijn = sleutel(Data.publiek(ik));
    return p => sleutel(p) === mijn;
  }

  // Person card from a public row {voornaam, achternaam, bijnaam, geboortejaar, takken}:
  // fields the person chose to hide are null. jij = your own card, with an accent and a
  // link to your registration. id = anchor, so the home page can link to this card.
  // Round profile photos above the name: g = { toen: url, nu: url }, either may be missing,
  // side by side with "toen" / "nu" under them. As a button (knop) it opens the big view on
  // "Wie doen er mee?".
  function gezicht(g, knop = false) {
    const soorten = ['toen', 'nu'].filter(s => g?.[s]);
    if (!soorten.length) return '';
    const binnen = soorten.map(s => `<span class="g"><img src="${esc(g[s])}" alt=""><small>${s}</small></span>`).join('');
    const wat = soorten.length === 2 ? 'Foto van toen en nu' : `Foto van ${soorten[0]}`;
    return knop ? `<button type="button" class="gezicht" data-gezicht aria-label="${wat}, groot bekijken">${binnen}</button>`
      : `<span class="gezicht" role="img" aria-label="${wat}">${binnen}</span>`;
  }

  // p.gezicht (optional): { toen, nu } URLs of the profile photos, see gezicht(); klik = the
  // photos are a button that opens the big view (on "Wie doen er mee?").
  function kaart(p, hit, jij = false, id = '', klik = false) {
    const naamTekst = esc(naam(p));
    const age = leeftijdTekst(p.geboortejaar);
    const rows = p.takken ? [...p.takken.filter(r => r.rol === 'lid'), ...p.takken.filter(r => r.rol !== 'lid')] : [];
    const chips = rows.map(r => {
      const cls = [r.rol === 'leiding' ? 'ld' : '', hit && hit(r) ? 'hit' : ''].join(' ').trim();
      const label = r.rol === 'leiding' && !isRol(r.speltak) ? `<b>Leiding</b> ${esc(takNaam(r))}` : esc(takNaam(r));
      const nu = r.naam && r.naam !== r.speltak ? ` title="nu ${esc(r.speltak)}"` : '';
      return `<span class="${cls}"${nu}>${label} ${periode(r.van, r.tot)}</span>`;
    }).join('');
    if (!naamTekst && !age && !chips) {
      return '<div class="person anon"><div class="name">Je bent niet zichtbaar in “Wie doen er mee?”</div><div class="meta">Je telt wel mee in het aantal.</div></div>';
    }
    const [tag, extra] = jij ? ['a', ' href="mijn.html" title="Naar je inschrijving"'] : ['div', ''];
    const kop = `<div class="name">${naamTekst || '<span class="muted">Anoniem</span>'}${jij ? ' <span class="pill jij">jij</span>' : ''}</div>
      <div class="meta">${age || '&nbsp;'}</div>`;
    const g = gezicht(p.gezicht, klik && !jij);
    return `<${tag} class="person${jij ? ' zelf' : ''}"${id ? ` id="${id}"` : ''}${extra}>${g}${kop}${chips ? `<div class="tk">${chips}</div>` : ''}${jij ? '<div class="naar">Mijn inschrijving →</div>' : ''}</${tag}>`;
  }

  // Year fields (class "yr" with min/max): arrow up from empty starts at min (opgericht),
  // arrow down from empty at max (this year). Native number inputs would start at 0.
  // data-start: where arrow up from empty begins, when min lies further back (years before 2001).
  function stapJaar(el, d) {
    const min = +el.min, max = +el.max, start = +(el.dataset.start || el.min);
    el.value = el.value === '' ? (d > 0 ? start : max) : Math.min(max, Math.max(min, +el.value + d));
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

  return { DATUM, TIJD, agenda, erbijTekst, NU, laadSpeltakken, laadBetalen, euro, takken, opgericht, isRol, oudeNamen, takNaam, takPast, berekenJaren, jubileum, leeftijd, leeftijdTekst, knipoog, periode, esc, matcher, naam, kaart, zelf, gezicht };
})();

const $ = id => document.getElementById(id);
