// Data layer for the reunion site. Every page talks to the data only through
// these functions; nothing else knows where the data lives.
//
// Two modes:
//   * Supabase (SUPABASE_KEY filled in): real registrations, login with an e-mailed code.
//     Plain fetch calls to the Supabase REST API, no library. Security is enforced in the
//     database (row level security, see _supabase/schema.sql), not here.
//   * DEMO (SUPABASE_KEY empty): registrations live in this browser (localStorage), the
//     login code is always 123456, and fictional sample participants are mixed in.
//
// Record (one per person):
//   { email, voornaam, achternaam, bijnaam, geboortejaar,
//     takken: [{ speltak, rol: 'lid' | 'leiding', van, tot }],   tot null = heden
//     toon: { voornaam, achternaam, bijnaam, leeftijd, takken }, what others may see
//     sinds,                                                      registration date
//     erbij: 'ja' | 'misschien' | 'nee', erbij_sinds,             coming? (participant and comité only)
//     id, betaald }                 betaald: date the comité saw the payment, or null
//
// deelnemers() gives { totaal, erbij: { ja, misschien, nee }, personen }: counts only, never who.
//
// Story (Herinneringen), as pages get it:
//   { id, titel, tekst, speltak, jaar, toon_naam, eigen, status, toelichting,
//     voornaam, bijnaam, achternaam, aangemaakt }   name fields null when not shown
//   status: 'nieuw' | 'geplaatst' | 'afgewezen' | 'gemeld'; toelichting only on your own.
//
// Photo, as pages get it (files: pad + '.jpg' and pad + '-klein.jpg', see fotoUrls):
//   { id, pad, titel, speltak, jaar, eigen, status, voornaam, bijnaam, achternaam, aangemaakt }
//
// Overleg (comité only), as pages get it, newest activity first:
//   { id, titel, soort: 'vrij' | 'deelnemer' | 'verhaal' | 'foto' | 'pagina', ref, ref_naam,
//     status: 'open' | 'hot' | 'done', auteur_naam, eigen (you started it), aangemaakt, bijgewerkt,
//     berichten: [{ id, auteur_naam, tekst, systeem, eigen, aangemaakt }] }   oldest message first
//
// Seen (comité badges): gezien() gives { 'gesprek:<id>': time of the last message seen,
// 'beoordelen:': when Te beoordelen was last opened }, on every device. isNieuw(g, gezien)
// says whether a conversation has something new for you; nieuwVoorMij() gives the counts
// { overleg, beoordelen_nieuw, beoordelen } for the menu and the tabs.
//
// Comité members (beheerders) can also list all registrations and mark payments.
// Hoofdbeheerders can also add and remove beheerders. Comité member record:
//   { email, rol: 'beheerder' | 'hoofdbeheerder', toegevoegd_door, toegevoegd_op, naam }
const Data = (() => {
  const SUPABASE_URL = 'https://glvrsppggmfksimpfckp.supabase.co';
  // Publishable ("anon") key: public by design, safe in this file. Never put the secret key here.
  const SUPABASE_KEY = 'sb_publishable_drDndhRXZy_Hql9f9G5ROA_I5FW7pML';
  const DEMO = !SUPABASE_KEY;

  const DEMO_KEY = 'reunie25.demo';
  const DEMO_SESSIE = 'reunie25.sessie';
  const DEMO_BETAALD = 'reunie25.demo.betaald';
  const DEMO_ERBIJ = 'reunie25.demo.erbij';            // { id: { erbij, sinds } } set by the comité
  const DEMO_COMITE = 'reunie25.demo.comite';
  const DEMO_WEG = 'reunie25.demo.weg';                // removed sample participants
  const DEMO_GEBLOKKEERD = 'reunie25.demo.geblokkeerd';
  const DEMO_VERHALEN = 'reunie25.demo.verhalen';
  const DEMO_FOTOS = 'reunie25.demo.fotos';
  const DEMO_OVERLEG = 'reunie25.demo.overleg';
  const DEMO_HARTJES = 'reunie25.demo.hartjes';
  const DEMO_GEZIEN = 'reunie25.demo.gezien';
  const MAX_FOTOS = 30;
  const AUTH = 'reunie25.auth';
  const DEMO_CODE = '123456';

  // ---- shared helpers ------------------------------------------------------

  // localStorage can be missing or throw (private mode): the site must still render.
  const lees = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const schrijf = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const norm = email => String(email || '').trim().toLowerCase();
  const fout = (code, tekst) => Object.assign(new Error(tekst), { code });
  const MELD = {
    bestaat: 'Dit adres is al ingeschreven. Log in om je gegevens aan te passen.',
    onbekend: 'Dit adres kennen we nog niet. Schrijf je eerst in.',
    code: 'Deze code klopt niet of is verlopen. Kijk of je de laatste mail hebt, of vraag een nieuwe code.',
    sessie: 'Je bent niet (meer) ingelogd. Log opnieuw in.',
    wacht: 'Je hebt net al een code gevraagd. Wacht een minuut en probeer het opnieuw.',
    mail: 'De mail kon niet worden verstuurd. Probeer het later opnieuw.',
    net: 'Geen verbinding met de server. Probeer het later opnieuw.',
    adres: 'Dit is geen geldig e-mailadres.',
    recht: 'Dat mag alleen een hoofdbeheerder.',
    geblokkeerd: 'Inschrijven met dit e-mailadres lukt helaas niet. Denk je dat dit niet klopt? Mail dan het reüniecomité via reunie@scoutingbrandevoort.nl.',
    zelf: 'Jezelf verwijderen gaat via Mijn inschrijving → Uitschrijven.',
    comitelid: 'Dit adres hoort bij het comité en kan niet geblokkeerd worden. Haal het eerst weg uit het comité.',
    max: 'Je hebt het maximum van 30 foto\'s bereikt. Wil je een andere delen? Verwijder dan eerst een van je eigen foto\'s.',
    upload: 'Het versturen van een foto lukte niet. Probeer het later opnieuw.',
  };

  // What others may see of a record: hidden fields become null.
  // In Supabase the database does this itself (publieke_deelnemers), so hidden fields never leave it.
  function publiek(r) {
    return {
      voornaam: r.toon.voornaam ? r.voornaam : null,
      achternaam: r.toon.achternaam && r.achternaam ? r.achternaam : null,
      bijnaam: r.toon.bijnaam !== false && r.bijnaam ? r.bijnaam : null,
      geboortejaar: r.toon.leeftijd ? r.geboortejaar : null,
      takken: r.toon.takken && r.takken?.length ? r.takken : null,
    };
  }
  // Without a "seen" time, the last 7 days count as new (same rule as nieuw_voor_mij() in the database).
  const NIEUW_DAGEN = 7;
  const grens = (gezien, sleutel) => gezien[sleutel] ? Date.parse(gezien[sleutel]) : Date.now() - NIEUW_DAGEN * 864e5;
  // Something new by someone else: a new conversation, or a message (status lines not counted).
  function isNieuw(g, gezien = {}) {
    const t = grens(gezien, 'gesprek:' + g.id);
    return (!g.eigen && Date.parse(g.aangemaakt) > t)
      || g.berichten.some(b => !b.eigen && !b.systeem && Date.parse(b.aangemaakt) > t);
  }

  const zichtbaar = p => !!(p.voornaam || p.achternaam || p.bijnaam || p.geboortejaar || p.takken?.length);

  // ---- DEMO ----------------------------------------------------------------

  // Fictional sample participants (DEMO only):
  // [voornaam, achternaam, geboortejaar, speltakken als jeugdlid, toon v/a/l/t, leiding [[speltak, van, tot]]]
  const VOORBEELD = [
    ['Joris', 'Bakker', 1990, ['Explorers', 'Roverscouts'], [1, 0, 0, 1], [['Explorers', 2010, 2016]]],
    ['Mark', 'de Vries', 1975, [], [1, 1, 0, 1], [['Scouts', 2001, 2012], ['Bestuur / vrijwilliger', 2012, null]]],
    ['Lotte', 'Smits', 2000, ['Welpen', 'Scouts'], [1, 0, 1, 1]],
    ['Femke', 'van Dijk', 1992, ['Scouts', 'Explorers'], [1, 0, 1, 1]],
    ['Tim', 'Hendriks', 1998, ['Bevers', 'Welpen', 'Scouts'], [1, 0, 1, 1]],
    ['Bram', 'Peters', 1994, ['Welpen', 'Scouts', 'Explorers'], [1, 1, 1, 1], [['Welpen', 2013, null]]],
    ['Eva', 'Mulder', 2003, ['Bevers', 'Welpen'], [1, 0, 1, 0]],
    ['Ruud', 'Willems', 1970, [], [1, 1, 1, 1], [['Welpen', 2001, 2009], ['Bevers', 2010, 2014]]],
    ['Noor', 'Claassen', 2005, ['Welpen', 'Scouts', 'Explorers', 'Roverscouts'], [1, 0, 1, 1]],
    ['Daan', 'Verhoeven', 1999, ['Welpen', 'Scouts', 'Explorers', 'Roverscouts', 'Vuurvogels'], [1, 0, 0, 1]],
    ['Iris', 'Kuijpers', 1997, ['Welpen'], [1, 1, 0, 1]],
    ['Koen', 'van den Broek', 1996, ['Welpen', 'Scouts'], [1, 0, 1, 1]],
    ['Anouk', 'Gerritsen', 1995, ['Welpen', 'Scouts', 'Explorers'], [1, 0, 1, 1]],
    ['Luuk', 'Swinkels', 2001, ['Bevers', 'Welpen', 'Scouts'], [1, 1, 1, 1]],
    ['Merel', 'Coolen', 1997, ['Welpen', 'Scouts', 'Explorers', 'Roverscouts'], [1, 0, 1, 1], [['Scouts', 2016, null]]],
    ['Stijn', 'van Lieshout', 1993, ['Scouts', 'Explorers', 'Roverscouts', 'Vuurvogels', 'Plusscouts'], [1, 0, 1, 1]],
    ['Sem', 'Vos', 2008, ['Bevers', 'Welpen', 'Scouts', 'Explorers'], [1, 0, 1, 1]],
    ['Jesse', 'Habraken', 1996, ['Scouts'], [1, 0, 0, 1]],
    ['Roos', 'Bekkers', 1989, ['Explorers'], [1, 0, 1, 0], [['Scouts', 2009, 2014]]],
    ['Pim', 'Aarts', 1991, ['Explorers'], [0, 0, 0, 0]],
  ];
  const weg = () => lees(DEMO_WEG, []);
  const voorbeeldAlle = () => VOORBEELD.map(([voornaam, achternaam, geboortejaar, leden, [v, a, l, t], leiding = []]) => ({
    voornaam, achternaam, geboortejaar,
    takken: [
      ...leden.map(s => [s, Reunie.berekenJaren(geboortejaar, s)]).filter(([, j]) => j)
        .map(([speltak, [van, tot]]) => ({ speltak, rol: 'lid', van, tot })),
      ...leiding.map(([speltak, van, tot]) => ({ speltak, rol: 'leiding', van, tot })),
    ],
    toon: { voornaam: !!v, achternaam: !!a, leeftijd: !!l, takken: !!t },
  }));
  const alle = () => lees(DEMO_KEY, []);
  // Full sample records as the comité sees them, with made-up e-mail and dates.
  const voorbeeldVol = () => voorbeeldAlle().map((r, i) => ({
    ...r, bijnaam: '', id: 'voorbeeld-' + i, sinds: `2026-12-${String(i + 1).padStart(2, '0')}`,
    email: `${r.voornaam}.${r.achternaam}`.toLowerCase().replace(/\s+/g, '') + '@voorbeeld.nl',
    toon: { bijnaam: true, ...r.toon },
  })).filter(r => !weg().includes(r.id));
  // Payments in DEMO: { id: date }. Starts with two out of three sample people paid.
  const betaaldLijst = () => lees(DEMO_BETAALD, null)
    ?? Object.fromEntries(VOORBEELD.map((_, i) => ['voorbeeld-' + i, `2027-01-${String(i + 5).padStart(2, '0')}`]).filter((_, i) => i % 3 !== 2));
  // Coming in DEMO: own records keep it themselves, the comité's changes are in DEMO_ERBIJ.
  // Sample people: mostly ja, a few misschien and nee.
  const erbijVan = r => {
    const id = r.id || r.email, i = /^voorbeeld-(\d+)$/.exec(id)?.[1];
    const basis = { erbij: r.erbij || (i == null ? 'ja' : i % 5 === 3 ? 'misschien' : i % 7 === 6 ? 'nee' : 'ja'), sinds: r.erbij_sinds || r.sinds };
    const g = lees(DEMO_ERBIJ, {})[id] || basis;
    return { erbij: g.erbij, erbij_sinds: g.sinds };
  };
  const metBetaald = r => r && { ...r, id: r.id || r.email, betaald: betaaldLijst()[r.id || r.email] || null, ...erbijVan(r) };
  const telErbij = recs => {
    const n = { ja: 0, misschien: 0, nee: 0 };
    for (const r of recs) n[erbijVan(r).erbij]++;
    return n;
  };
  // Comité in DEMO: whoever is logged in is hoofdbeheerder, plus a few sample members.
  const comiteLijst = () => lees(DEMO_COMITE, null) ?? [
    { email: 'mark.devries@voorbeeld.nl', rol: 'hoofdbeheerder', toegevoegd_door: null, toegevoegd_op: '2026-11-20' },
    { email: 'femke.vandijk@voorbeeld.nl', rol: 'beheerder', toegevoegd_door: 'Mark', toegevoegd_op: '2026-11-21' },
    { email: 'ruud@voorbeeld.nl', rol: 'beheerder', toegevoegd_door: 'Mark', toegevoegd_op: '2026-11-22' },
  ];
  // Stories in DEMO, by sample participants (auteur = e-mail).
  const verhalenStore = () => lees(DEMO_VERHALEN, null) ?? [
    { id: 'demo-v1', auteur: 'lotte.smits@voorbeeld.nl', titel: 'Hike in de regen', speltak: 'Scouts', jaar: 2013, toon_naam: true,
      status: 'geplaatst', aangemaakt: '2026-11-12T19:00:00Z',
      tekst: 'We liepen met z\'n zessen vanaf Asten terug naar Brandevoort. Na een uur was de kaart doorweekt en niet meer te lezen, en de route die we hadden uitgestippeld bleek dwars door een maïsveld te gaan.\n\nBram zei dat hij de weg "op gevoel" wel wist. Niemand geloofde hem, maar een beter plan had ook niemand. Drie uur later stonden we, tot op het bot nat, als eerste groep bij de blokhut. De leiding dacht dat we een lift hadden geregeld.\n\nDe chocolademelk die avond was de lekkerste ooit.' },
    { id: 'demo-v2', auteur: 'bram.peters@voorbeeld.nl', titel: 'Mijn eerste overvliegen', speltak: 'Welpen', jaar: 2004, toon_naam: false,
      status: 'geplaatst', aangemaakt: '2026-11-15T10:30:00Z',
      tekst: 'Ik weet nog precies hoe hoog die balk leek. Achteraf was het misschien een meter.' },
    { id: 'demo-v3', auteur: 'tim.hendriks@voorbeeld.nl', titel: 'De verdwenen kampvuurpan', speltak: 'Scouts', jaar: 2010, toon_naam: true,
      status: 'nieuw', aangemaakt: '2026-11-19T08:00:00Z',
      tekst: 'Op zomerkamp was op de laatste avond ineens de grote pan weg. Twee dagen later stond hij, gepoetst en wel, op de stoep van de blokhut.' },
  ];
  // Photos in DEMO: rows in localStorage, image files only in memory (gone after a reload,
  // then a coloured placeholder is shown). Sample photos are placeholders too.
  const demoBestanden = new Map();     // file path -> object URL
  const fotosStore = () => lees(DEMO_FOTOS, null) ?? [
    ['lotte.smits@voorbeeld.nl', 'Kampvuur bij de Brandnetel', 'Scouts', 2012, 'geplaatst', '2026-11-10'],
    ['bram.peters@voorbeeld.nl', 'Kanoën op de Dommel', 'Explorers', 2009, 'geplaatst', '2026-11-11'],
    ['mark.devries@voorbeeld.nl', '10 jaar Scouting Brandevoort', '', 2011, 'geplaatst', '2026-11-12'],
    ['eva.mulder@voorbeeld.nl', 'Overvliegen', 'Welpen', 2010, 'geplaatst', '2026-11-13'],
    ['tim.hendriks@voorbeeld.nl', 'Pinksterkamp', 'Bevers', 2004, 'geplaatst', '2026-11-14'],
    ['femke.vandijk@voorbeeld.nl', 'Zomerkamp', 'Scouts', 2005, 'nieuw', '2026-11-19'],
    ['femke.vandijk@voorbeeld.nl', '', 'Scouts', 2005, 'nieuw', '2026-11-19'],
  ].map(([auteur, titel, speltak, jaar, status, dag], i) => ({
    id: 'demo-f' + i, pad: `demo/${i}`, groep: status === 'nieuw' ? 'demo-g1' : 'demo-g0' + i, auteur, titel, speltak: speltak || null, jaar,
    toon_naam: i !== 1, status, aangemaakt: `${dag}T12:00:00Z`,
  }));
  // Hearts in DEMO: {soort, ref, auteur}; the samples come from made-up participants.
  const hartjesStore = () => lees(DEMO_HARTJES, null)
    ?? [['verhaal', 'demo-v1', 4], ['verhaal', 'demo-v2', 7], ['foto', 'demo-f0', 3], ['foto', 'demo-f1', 12], ['foto', 'demo-f3', 1]]
      .flatMap(([soort, ref, n]) => Array.from({ length: n }, (_, i) => ({ soort, ref, auteur: `voorbeeld-${i}` })));
  const KLEUREN = [['#7fb069', '#3d6b35'], ['#f4a259', '#bc4b51'], ['#5b8e7d', '#2c4696'], ['#f2b705', '#c9772b'], ['#8e7dbe', '#2c4696'], ['#6c9a8b', '#e8c547']];
  function plaatje(pad) {
    const f = fotosStore().find(x => pad.startsWith(x.pad)) || {};
    const [a, b] = KLEUREN[[...pad].reduce((n, c) => n + c.charCodeAt(0), 0) % KLEUREN.length];
    const t = String(f.titel || 'Foto').replace(/[<&>]/g, '');
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="400" y="315" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle">${t}</text></svg>`);
  }

  // Overleg in DEMO: conversations with their messages; auteur = e-mail.
  const overlegStore = () => lees(DEMO_OVERLEG, null) ?? [
    { id: 'demo-o1', titel: 'Tijden middagprogramma', soort: 'pagina', ref: 'programma.html', ref_naam: 'Programma', status: 'open',
      auteur: 'femke.vandijk@voorbeeld.nl', auteur_naam: 'Femke', aangemaakt: '2026-11-18T19:00:00Z', bijgewerkt: '2026-11-19T20:10:00Z',
      berichten: [
        { id: 'demo-b1', auteur: 'femke.vandijk@voorbeeld.nl', auteur_naam: 'Femke', tekst: 'Zullen we de fotopresentatie om 15:00 doen, na de koffie?', systeem: false, aangemaakt: '2026-11-18T19:00:00Z' },
        { id: 'demo-b2', auteur: 'mark.devries@voorbeeld.nl', auteur_naam: 'Mark', tekst: 'Prima, dan kan de borrel om 16:00 beginnen.', systeem: false, aangemaakt: '2026-11-19T20:10:00Z' },
      ] },
    { id: 'demo-o2', titel: 'Klopt dit jaartal?', soort: 'verhaal', ref: 'demo-v2', ref_naam: 'Mijn eerste overvliegen', status: 'hot',
      auteur: 'mark.devries@voorbeeld.nl', auteur_naam: 'Mark', aangemaakt: '2026-11-19T09:00:00Z', bijgewerkt: '2026-11-19T09:05:00Z',
      berichten: [
        { id: 'demo-b3', auteur: 'mark.devries@voorbeeld.nl', auteur_naam: 'Mark', tekst: 'In 2004 had de Welpen nog geen overvliegen bij de blokhut, toch? Weet iemand dit?', systeem: false, aangemaakt: '2026-11-19T09:00:00Z' },
        { id: 'demo-b4', auteur: 'mark.devries@voorbeeld.nl', auteur_naam: 'Mark', tekst: 'zette de status op hot', systeem: true, aangemaakt: '2026-11-19T09:05:00Z' },
      ] },
  ];
  const nu = () => new Date().toISOString();
  const demoId = soort => `demo-${soort}${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const demoPersoon = email => [...voorbeeldVol(), ...alle()].find(x => x.email === email);
  const demoNaam = email => {
    const r = [...voorbeeldVol(), ...alle()].find(x => x.email === email);
    return r ? `${r.voornaam} ${r.achternaam}`.trim() : null;
  };

  const demo = {
    async deelnemers() {
      const recs = [...voorbeeldVol(), ...alle()];
      return { totaal: recs.length, erbij: telErbij(recs), personen: recs.map(publiek).filter(zichtbaar) };
    },
    async vraagCode(email, { nieuw = false } = {}) {
      const bekend = alle().some(r => r.email === norm(email));
      if (nieuw && lees(DEMO_GEBLOKKEERD, []).some(g => g.email === norm(email))) throw fout('geblokkeerd', MELD.geblokkeerd);
      if (nieuw && bekend) throw fout('bestaat', MELD.bestaat);
      if (!nieuw && !bekend && !comiteLijst().some(c => c.email === norm(email))) throw fout('onbekend', MELD.onbekend);
    },
    async bevestig(email, code) {
      if (String(code).trim() !== DEMO_CODE) throw fout('code', MELD.code);
      schrijf(DEMO_SESSIE, norm(email));
    },
    ingelogd: () => !!lees(DEMO_SESSIE, null),
    email: () => lees(DEMO_SESSIE, null),
    async ik() {
      const email = lees(DEMO_SESSIE, null);
      return email ? metBetaald(alle().find(r => r.email === email)) || null : null;
    },
    async bewaar(rec) {
      const email = lees(DEMO_SESSIE, null);
      if (!email) throw fout('sessie', MELD.sessie);
      const list = alle();
      const i = list.findIndex(r => r.email === email);
      const vandaag = new Date().toLocaleDateString('sv');  // local YYYY-MM-DD
      const oud = i >= 0 ? metBetaald(list[i]) : null;
      const erbij = rec.erbij || oud?.erbij || 'ja';
      const nieuw = { ...rec, email, sinds: oud ? oud.sinds : vandaag, erbij,
        erbij_sinds: oud && oud.erbij === erbij ? oud.erbij_sinds : vandaag };
      delete nieuw.id; delete nieuw.betaald;
      const g = lees(DEMO_ERBIJ, {}); delete g[email]; schrijf(DEMO_ERBIJ, g);
      if (i >= 0) list[i] = nieuw; else list.push(nieuw);
      schrijf(DEMO_KEY, list);
      return metBetaald(nieuw);
    },
    async uitschrijven() {
      const email = lees(DEMO_SESSIE, null);
      schrijf(DEMO_KEY, alle().filter(r => r.email !== email));
      schrijf(DEMO_SESSIE, null);
    },
    async uitloggen() { schrijf(DEMO_SESSIE, null); },
    // In DEMO everyone who is logged in is a comité member, so the page can be tried out.
    async beheerder() { return !!lees(DEMO_SESSIE, null); },
    async rol() { return lees(DEMO_SESSIE, null) ? 'hoofdbeheerder' : null; },
    async comite() {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      const lijst = comiteLijst().filter(c => c.email !== ik);
      return [{ email: ik, rol: 'hoofdbeheerder', toegevoegd_door: null, toegevoegd_op: '2026-11-19' }, ...lijst]
        .map(c => ({ ...c, naam: demoNaam(c.email) }));
    },
    async comiteToevoegen(email) {
      const a = norm(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) throw fout('adres', MELD.adres);
      const lijst = comiteLijst();
      if (a === lees(DEMO_SESSIE, null) || lijst.some(c => c.email === a)) return;
      const ik = await this.ik();
      lijst.push({ email: a, rol: 'beheerder', toegevoegd_door: ik?.voornaam || lees(DEMO_SESSIE, null), toegevoegd_op: new Date().toLocaleDateString('sv') });
      schrijf(DEMO_COMITE, lijst);
    },
    async verwijder(id, { blokkeer = false, reden = '' } = {}) {
      const ik = lees(DEMO_SESSIE, null);
      const r = (await this.inschrijvingen()).find(x => x.id === id);
      if (!r) return;
      if (r.email === ik) throw fout('zelf', MELD.zelf);
      if (blokkeer) {
        if (comiteLijst().some(c => c.email === r.email)) throw fout('comitelid', MELD.comitelid);
        const lijst = lees(DEMO_GEBLOKKEERD, []).filter(g => g.email !== r.email);
        const mij = await this.ik();
        lijst.unshift({ email: r.email, reden: reden.trim() || null, door: mij?.voornaam || ik, op: new Date().toLocaleDateString('sv') });
        schrijf(DEMO_GEBLOKKEERD, lijst);
      }
      if (id.startsWith('voorbeeld-')) schrijf(DEMO_WEG, [...weg(), id]);
      else schrijf(DEMO_KEY, alle().filter(x => x.email !== r.email));
    },
    async geblokkeerde() { return lees(DEMO_GEBLOKKEERD, []); },
    async deblokkeer(email) { schrijf(DEMO_GEBLOKKEERD, lees(DEMO_GEBLOKKEERD, []).filter(g => g.email !== norm(email))); },
    async aantalVerhalen() { return verhalenStore().filter(v => v.status === 'geplaatst').length; },
    async magVerhalen() { return !!lees(DEMO_SESSIE, null); },
    async verhalen() {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      return verhalenStore().filter(v => v.status === 'geplaatst' || v.auteur === ik)
        .sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt))
        .map(v => {
          const p = v.toon_naam && demoPersoon(v.auteur);
          const n = p ? publiek(p) : {};
          return { id: v.id, titel: v.titel, tekst: v.tekst, speltak: v.speltak || null, jaar: v.jaar || null, toon_naam: v.toon_naam,
            eigen: v.auteur === ik, status: v.status, toelichting: v.auteur === ik ? v.toelichting || null : null,
            voornaam: n.voornaam || null, bijnaam: n.bijnaam || null, achternaam: n.achternaam || null, aangemaakt: v.aangemaakt };
        });
    },
    async bewaarVerhaal(v) {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      const lijst = verhalenStore();
      const velden = { titel: v.titel, tekst: v.tekst, speltak: v.speltak || null, jaar: v.jaar || null, toon_naam: !!v.toon_naam,
        status: 'nieuw', toelichting: null, melding: null, gemeld_door: null, gemeld_op: null };
      const i = lijst.findIndex(x => x.id === v.id && x.auteur === ik);
      if (i >= 0) Object.assign(lijst[i], velden);
      else lijst.push({ id: 'demo-' + Date.now(), auteur: ik, aangemaakt: new Date().toISOString(), ...velden });
      schrijf(DEMO_VERHALEN, lijst);
    },
    async verwijderVerhaal(id) {
      schrijf(DEMO_VERHALEN, verhalenStore().filter(v => !(v.id === id && v.auteur === lees(DEMO_SESSIE, null))));
    },
    async meldVerhaal(id, reden = '') {
      const lijst = verhalenStore(), v = lijst.find(x => x.id === id && x.status === 'geplaatst');
      if (!v) return;
      const mij = await this.ik();
      Object.assign(v, { status: 'gemeld', melding: reden.trim() || null, gemeld_door: mij?.voornaam || lees(DEMO_SESSIE, null),
        gemeld_op: new Date().toLocaleDateString('sv'), bijgewerkt: nu() });
      schrijf(DEMO_VERHALEN, lijst);
    },
    async teBeoordelen() {
      return verhalenStore().filter(v => v.status === 'nieuw' || v.status === 'gemeld')
        .sort((a, b) => a.aangemaakt.localeCompare(b.aangemaakt))
        .map(v => ({ ...v, auteur_naam: demoNaam(v.auteur) || v.auteur }));
    },
    async beoordeel(id, actie, { notitie = '', titel, tekst } = {}) {
      let lijst = verhalenStore();
      const v = lijst.find(x => x.id === id);
      if (!v) return;
      if (actie === 'plaatsen') Object.assign(v, { status: 'geplaatst', toelichting: null, melding: null, gemeld_door: null, gemeld_op: null });
      else if (actie === 'afwijzen') Object.assign(v, { status: 'afgewezen', toelichting: notitie.trim() || null });
      else if (actie === 'aanpassen') Object.assign(v, { titel, tekst });
      else if (actie === 'verwijderen') lijst = lijst.filter(x => x !== v);
      schrijf(DEMO_VERHALEN, lijst);
    },
    async aantalFotos() { return fotosStore().filter(f => f.status === 'geplaatst').length; },
    async fotos() {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      return fotosStore().filter(f => f.status === 'geplaatst' || f.auteur === ik)
        .sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt))
        .map(f => {
          const p = f.toon_naam && demoPersoon(f.auteur);
          const n = p ? publiek(p) : {};
          return { id: f.id, pad: f.pad, titel: f.titel, speltak: f.speltak, jaar: f.jaar, eigen: f.auteur === ik, status: f.status,
            voornaam: n.voornaam || null, bijnaam: n.bijnaam || null, achternaam: n.achternaam || null, aangemaakt: f.aangemaakt };
        });
    },
    async fotoUrls(paden) { return Object.fromEntries(paden.map(p => [p, demoBestanden.get(p) || plaatje(p)])); },
    async stuurFotos(items, { speltak = null, jaar = null, toon_naam = true } = {}, voortgang = () => {}) {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      const groep = 'demo-g' + Date.now();
      for (const [i, it] of items.entries()) {
        const lijst = fotosStore();
        if (lijst.filter(f => f.auteur === ik).length >= MAX_FOTOS) throw fout('max', MELD.max);
        voortgang(i);
        const id = 'demo-' + Date.now() + '-' + i, pad = `demo/${id}`;
        demoBestanden.set(pad + '.jpg', URL.createObjectURL(it.groot));
        demoBestanden.set(pad + '-klein.jpg', URL.createObjectURL(it.klein));
        lijst.push({ id, pad, groep, auteur: ik, titel: it.titel || '', speltak, jaar, toon_naam, status: 'nieuw', aangemaakt: new Date().toISOString() });
        schrijf(DEMO_FOTOS, lijst);
      }
      voortgang(items.length);
    },
    async verwijderFoto(id) {
      schrijf(DEMO_FOTOS, fotosStore().filter(f => !(f.id === id && f.auteur === lees(DEMO_SESSIE, null))));
    },
    async bewerkFoto(id, { titel = '', speltak = null, jaar = null }) {
      const ik = lees(DEMO_SESSIE, null), lijst = fotosStore(), f = lijst.find(x => x.id === id);
      if (!ik || !f) return;   // in DEMO the logged-in user is a beheerder, so any photo may change
      Object.assign(f, { titel: titel.trim().slice(0, 80), speltak: speltak || null, jaar: jaar || null });
      schrijf(DEMO_FOTOS, lijst);
    },
    async meldFoto(id, reden = '') {
      const lijst = fotosStore(), f = lijst.find(x => x.id === id && x.status === 'geplaatst');
      if (!f) return;
      const mij = await this.ik();
      Object.assign(f, { status: 'gemeld', melding: reden.trim() || null, gemeld_door: mij?.voornaam || lees(DEMO_SESSIE, null),
        gemeld_op: new Date().toLocaleDateString('sv'), bijgewerkt: nu() });
      schrijf(DEMO_FOTOS, lijst);
    },
    async fotosTeBeoordelen() {
      return fotosStore().filter(f => f.status === 'nieuw' || f.status === 'gemeld')
        .sort((a, b) => a.aangemaakt.localeCompare(b.aangemaakt))
        .map(f => ({ ...f, auteur_naam: demoNaam(f.auteur) || f.auteur }));
    },
    async beoordeelFoto(id, actie) {
      let lijst = fotosStore();
      if (actie === 'plaatsen') lijst.filter(f => f.id === id).forEach(f => Object.assign(f, { status: 'geplaatst', melding: null, gemeld_door: null, gemeld_op: null }));
      else if (actie === 'verwijderen') lijst = lijst.filter(f => f.id !== id);
      schrijf(DEMO_FOTOS, lijst);
    },
    async fotoOpslag() { return { geplaatst: await this.aantalFotos(), bytes: fotosStore().length * 400e3 }; },
    async comiteWeghalen(email) {
      schrijf(DEMO_COMITE, comiteLijst().filter(c => !(c.email === norm(email) && c.rol === 'beheerder')));
    },
    // ---- hartjes ----
    async hartjes() {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      const items = { verhaal: verhalenStore(), foto: fotosStore() }, per = new Map();
      for (const h of hartjesStore()) {
        const item = items[h.soort]?.find(x => x.id === h.ref && x.status === 'geplaatst');
        if (!item) continue;
        const k = h.soort + ':' + h.ref;
        const r = per.get(k) || { soort: h.soort, ref: h.ref, aantal: 0, van_mij: false, eigen: item.auteur === ik };
        r.aantal++; r.van_mij ||= h.auteur === ik;
        per.set(k, r);
      }
      return [...per.values()];
    },
    async zetHartje(soort, ref, aan) {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      const item = (soort === 'verhaal' ? verhalenStore() : fotosStore()).find(x => x.id === ref && x.status === 'geplaatst');
      if (!item || item.auteur === ik) throw new Error('Dat kan hier niet.');
      const lijst = hartjesStore().filter(h => !(h.soort === soort && h.ref === ref && h.auteur === ik));
      if (aan) lijst.push({ soort, ref, auteur: ik });
      schrijf(DEMO_HARTJES, lijst);
      return lijst.filter(h => h.soort === soort && h.ref === ref).length;
    },
    async aantalTeBeoordelen() {
      if (!lees(DEMO_SESSIE, null)) return 0;
      return verhalenStore().filter(v => ['nieuw', 'gemeld'].includes(v.status)).length
        + fotosStore().filter(f => ['nieuw', 'gemeld'].includes(f.status)).length;
    },
    async gezien() { return lees(DEMO_SESSIE, null) ? lees(DEMO_GEZIEN, {}) : {}; },
    async zetGezien(items) {
      if (!lees(DEMO_SESSIE, null) || !items.length) return;
      const z = lees(DEMO_GEZIEN, {});
      for (const { soort, ref = '', tijd } of items) {
        const k = `${soort}:${ref}`, t = new Date(Math.min(Date.parse(tijd || nu()), Date.now())).toISOString();
        if (!z[k] || Date.parse(z[k]) < Date.parse(t)) z[k] = t;
      }
      schrijf(DEMO_GEZIEN, z);
    },
    async nieuwVoorMij() {
      if (!lees(DEMO_SESSIE, null)) return { overleg: 0, beoordelen_nieuw: 0, beoordelen: 0 };
      const z = lees(DEMO_GEZIEN, {}), b = grens(z, 'beoordelen:');
      const wacht = [...verhalenStore(), ...fotosStore()].filter(x => ['nieuw', 'gemeld'].includes(x.status));
      return {
        overleg: (await this.overleg()).filter(g => isNieuw(g, z)).length,
        beoordelen_nieuw: wacht.filter(x => Date.parse(x.bijgewerkt || x.aangemaakt) > b).length,
        beoordelen: wacht.length,
      };
    },
    // ---- overleg ----
    async overleg() {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      return overlegStore().map(({ auteur, berichten, ...g }) => ({
        ...g, eigen: auteur === ik, berichten: berichten.map(({ auteur: a, ...b }) => ({ ...b, eigen: a === ik })),
      })).sort((a, b) => b.bijgewerkt.localeCompare(a.bijgewerkt));
    },
    async startOverleg({ titel, soort = 'vrij', ref = null, ref_naam = null, status = 'open', tekst = '' }) {
      const ik = lees(DEMO_SESSIE, null);
      if (!ik) throw fout('sessie', MELD.sessie);
      const naam = (await this.ik())?.voornaam || ik, lijst = overlegStore(), id = demoId('o');
      lijst.push({ id, titel: titel.trim().slice(0, 80), soort, ref: ref == null ? null : String(ref), ref_naam, status, auteur: ik, auteur_naam: naam,
        aangemaakt: nu(), bijgewerkt: nu(),
        berichten: tekst.trim() ? [{ id: demoId('b'), auteur: ik, auteur_naam: naam, tekst: tekst.trim().slice(0, 1000), systeem: false, aangemaakt: nu() }] : [] });
      schrijf(DEMO_OVERLEG, lijst);
      return id;
    },
    async stuurBericht(gesprek, tekst) {
      const ik = lees(DEMO_SESSIE, null), lijst = overlegStore(), g = lijst.find(x => x.id === gesprek);
      if (!ik || !g) return;
      g.berichten.push({ id: demoId('b'), auteur: ik, auteur_naam: (await this.ik())?.voornaam || ik, tekst: tekst.trim().slice(0, 1000), systeem: false, aangemaakt: nu() });
      g.bijgewerkt = nu();
      schrijf(DEMO_OVERLEG, lijst);
    },
    async zetOverlegStatus(gesprek, status) {
      const ik = lees(DEMO_SESSIE, null), lijst = overlegStore(), g = lijst.find(x => x.id === gesprek);
      if (!ik || !g || g.status === status) return;
      g.status = status; g.bijgewerkt = nu();
      g.berichten.push({ id: demoId('b'), auteur: ik, auteur_naam: (await this.ik())?.voornaam || ik, tekst: 'zette de status op ' + status, systeem: true, aangemaakt: nu() });
      schrijf(DEMO_OVERLEG, lijst);
    },
    async verwijderOverleg(id) {     // DEMO: logged in = hoofdbeheerder, so any conversation
      if (!lees(DEMO_SESSIE, null)) return;
      schrijf(DEMO_OVERLEG, overlegStore().filter(g => g.id !== id));
    },
    async verwijderBericht(id) {
      const ik = lees(DEMO_SESSIE, null), lijst = overlegStore();
      for (const g of lijst) g.berichten = g.berichten.filter(b => !(b.id === id && b.auteur === ik && !b.systeem));
      schrijf(DEMO_OVERLEG, lijst);
    },
    async inschrijvingen() {
      if (!lees(DEMO_SESSIE, null)) throw fout('sessie', MELD.sessie);
      return [...voorbeeldVol(), ...alle()].map(metBetaald);
    },
    async zetErbij(id, keuze) {
      const r = (await this.inschrijvingen()).find(x => x.id === id);
      const g = lees(DEMO_ERBIJ, {});
      const sinds = r && r.erbij === keuze ? r.erbij_sinds : new Date().toLocaleDateString('sv');
      g[id] = { erbij: keuze, sinds };
      schrijf(DEMO_ERBIJ, g);
      return sinds;
    },
    async zetBetaald(id, aan) {
      const lijst = betaaldLijst();
      if (aan) lijst[id] ||= new Date().toLocaleDateString('sv'); else delete lijst[id];
      schrijf(DEMO_BETAALD, lijst);
      return lijst[id] || null;
    },
  };

  // ---- Supabase ------------------------------------------------------------

  // Session in localStorage: { access_token, refresh_token, expires_at (s), user: { id, email } }
  const sessie = () => lees(AUTH, null);
  const bewaarSessie = s => schrijf(AUTH, s && {
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
    user: { id: s.user.id, email: s.user.email },
  });

  async function verzoek(pad, { method = 'GET', body, token, headers = {} } = {}) {
    const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = 'Bearer ' + token;
    let r;
    try { r = await fetch(SUPABASE_URL + pad, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw fout('net', MELD.net); }
    const tekst = await r.text();
    let data = null;
    try { data = tekst ? JSON.parse(tekst) : null; } catch { data = tekst; }
    if (!r.ok) {
      const msg = data?.msg || data?.message || data?.error_description || data?.error || r.statusText;
      throw Object.assign(new Error(msg), { status: r.status, code: data?.error_code || data?.code, data });
    }
    return data;
  }

  // Valid access token, refreshed when it (nearly) expired; null when logged out.
  let verversen = null;
  async function token() {
    const s = sessie();
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    verversen ||= verzoek('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } })
      .then(n => { bewaarSessie(n); return n.access_token; })
      .catch(e => { if (e.status && e.status < 500) bewaarSessie(null); return null; })
      .finally(() => { verversen = null; });
    return verversen;
  }
  async function moetToken() {
    const t = await token();
    if (!t) throw fout('sessie', MELD.sessie);
    return t;
  }

  const naarRecord = r => r && ({
    email: r.email, voornaam: r.voornaam, achternaam: r.achternaam, bijnaam: r.bijnaam || '', geboortejaar: r.geboortejaar,
    takken: r.takken || [], sinds: r.sinds, id: r.id, betaald: r.betaald_op || null,
    erbij: r.erbij || 'ja', erbij_sinds: r.erbij_sinds || r.sinds,
    toon: { voornaam: r.toon_voornaam, achternaam: r.toon_achternaam, bijnaam: r.toon_bijnaam ?? true, leeftijd: r.toon_leeftijd, takken: r.toon_takken },
  });
  const naarRij = (rec, id) => ({
    id, voornaam: rec.voornaam, achternaam: rec.achternaam || '', bijnaam: rec.bijnaam || '', geboortejaar: rec.geboortejaar,
    takken: rec.takken || [], erbij: rec.erbij || 'ja',
    toon_voornaam: !!rec.toon.voornaam, toon_achternaam: !!rec.toon.achternaam, toon_bijnaam: rec.toon.bijnaam !== false,
    toon_leeftijd: !!rec.toon.leeftijd, toon_takken: !!rec.toon.takken,
  });

  // ---- Supabase Storage (bucket "fotos") ----
  const BUCKET = SUPABASE_URL + '/storage/v1/object';
  async function opslag(pad, { method = 'GET', body, token: t, type } = {}) {
    const h = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t };
    if (type) h['Content-Type'] = type;
    let r;
    try { r = await fetch(BUCKET + pad, { method, headers: h, body }); }
    catch { throw fout('net', MELD.net); }
    const tekst = await r.text();
    let data = null;
    try { data = tekst ? JSON.parse(tekst) : null; } catch { data = tekst; }
    if (!r.ok) throw Object.assign(new Error(data?.message || data?.error || r.statusText), { status: r.status, data });
    return data;
  }
  const bestanden = paden => paden.flatMap(p => [p + '.jpg', p + '-klein.jpg']);
  async function wisBestanden(paden, t) {
    if (!paden.length) return;
    await opslag('/fotos', { method: 'DELETE', token: t, type: 'application/json', body: JSON.stringify({ prefixes: bestanden(paden) }) }).catch(() => {});
  }
  const urlCache = new Map();          // file path -> { url, tot }
  let beheerderVraag = null;

  const live = {
    async deelnemers() {
      const [totaal, erbij, personen] = await Promise.all([
        verzoek('/rest/v1/rpc/aantal_deelnemers', { method: 'POST', body: {} }),
        verzoek('/rest/v1/rpc/aantal_erbij', { method: 'POST', body: {} }).catch(() => null),
        verzoek('/rest/v1/rpc/publieke_deelnemers', { method: 'POST', body: {} }),
      ]);
      return { totaal, erbij: { ja: 0, misschien: 0, nee: 0, ...(erbij || { ja: totaal }) }, personen };
    },
    // Registering creates the login (create_user); logging in must not.
    async vraagCode(email, { nieuw = false } = {}) {
      if (nieuw && await verzoek('/rest/v1/rpc/is_geblokkeerd_adres', { method: 'POST', body: { adres: norm(email) } }).catch(() => false)) {
        throw fout('geblokkeerd', MELD.geblokkeerd);
      }
      try {
        await verzoek('/auth/v1/otp', { method: 'POST', body: { email: norm(email), create_user: nieuw } });
      } catch (e) {
        if (e.status === 429) throw fout('wacht', MELD.wacht);
        if (!nieuw && (e.status === 422 || e.status === 400)) {
          // Comité members may log in without a registration: create their login on first use.
          const comite = await verzoek('/rest/v1/rpc/is_comite_adres', { method: 'POST', body: { adres: norm(email) } }).catch(() => false);
          if (comite) return this.vraagCode(email, { nieuw: true });
          throw fout('onbekend', MELD.onbekend);
        }
        if (e.status >= 500) throw fout('mail', MELD.mail);
        throw e;
      }
    },
    async bevestig(email, code) {
      try {
        const s = await verzoek('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: norm(email), token: String(code).trim() } });
        bewaarSessie(s);
      } catch (e) {
        if (e.code === 'net') throw e;
        throw fout('code', MELD.code);
      }
    },
    ingelogd: () => !!sessie()?.refresh_token,
    email: () => sessie()?.user?.email || null,
    async ik() {
      const t = await token();
      if (!t) return null;
      const rows = await verzoek(`/rest/v1/deelnemers?select=*&id=eq.${sessie().user.id}`, { token: t });
      if (rows[0]) return naarRecord(rows[0]);
      // No registration: check the login still exists. The comité may have removed it while
      // this browser still holds a valid token; then forget the session (logged out).
      await verzoek('/auth/v1/user', { token: t }).catch(e => { if (e.status >= 400 && e.status < 500) bewaarSessie(null); });
      return null;
    },
    async bewaar(rec) {
      const t = await moetToken();
      const rows = await verzoek('/rest/v1/deelnemers?on_conflict=id', {
        method: 'POST', token: t, body: naarRij(rec, sessie().user.id),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      }).catch(e => {
        if (e.message === 'geblokkeerd') throw fout('geblokkeerd', MELD.geblokkeerd);
        // Login removed by the comité while this browser was still logged in.
        if (e.code === '23503') { bewaarSessie(null); throw fout('sessie', MELD.sessie); }
        throw e;
      });
      return naarRecord(rows[0]);
    },
    // Removes the login itself; the registration goes with it (on delete cascade).
    async uitschrijven() {
      const t = await moetToken();
      const eigen = await verzoek('/rest/v1/fotos?select=pad', { token: t }).catch(() => []);
      await wisBestanden(eigen.map(r => r.pad), t);
      await verzoek('/rest/v1/rpc/verwijder_mij', { method: 'POST', token: t, body: {} });
      bewaarSessie(null);
    },
    async uitloggen() {
      const t = await token();
      bewaarSessie(null);
      if (t) await verzoek('/auth/v1/logout', { method: 'POST', token: t }).catch(() => {});
    },
    // Comité member? The database decides (table beheerders); this only picks what to show.
    // Asked once per page: the menu, the page itself and overleg.js all want to know.
    beheerder() {
      return beheerderVraag ||= (async () => {
        const t = await token();
        if (!t) return false;
        return !!(await verzoek('/rest/v1/rpc/is_beheerder', { method: 'POST', token: t, body: {} }).catch(() => false));
      })();
    },
    // 'beheerder', 'hoofdbeheerder' or null; again only decides what to show.
    async rol() {
      const t = await token();
      if (!t) return null;
      return await verzoek('/rest/v1/rpc/mijn_rol', { method: 'POST', token: t, body: {} }).catch(() => null);
    },
    async comite() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/comite', { method: 'POST', token: t, body: {} });
    },
    async comiteToevoegen(email) {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/comite_toevoegen', { method: 'POST', token: t, body: { adres: norm(email) } })
        .catch(e => { throw e.code === '22023' ? fout('adres', MELD.adres) : e.code === '42501' ? fout('recht', MELD.recht) : e; });
    },
    // ---- stories ----
    async aantalVerhalen() {
      return await verzoek('/rest/v1/rpc/aantal_verhalen', { method: 'POST', body: {} });
    },
    async magVerhalen() {
      const t = await token();
      if (!t) return false;
      return !!(await verzoek('/rest/v1/rpc/mag_verhalen', { method: 'POST', token: t, body: {} }).catch(() => false));
    },
    async verhalen() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/verhalen_lijst', { method: 'POST', token: t, body: {} });
    },
    // New story (no id) or a change to your own; the database sets status and author.
    async bewaarVerhaal(v) {
      const t = await moetToken();
      const body = { titel: v.titel, tekst: v.tekst, speltak: v.speltak || null, jaar: v.jaar || null, toon_naam: !!v.toon_naam };
      if (v.id) await verzoek(`/rest/v1/verhalen?id=eq.${encodeURIComponent(v.id)}`, { method: 'PATCH', token: t, body, headers: { Prefer: 'return=minimal' } });
      else await verzoek('/rest/v1/verhalen', { method: 'POST', token: t, body: { ...body, auteur: sessie().user.id }, headers: { Prefer: 'return=minimal' } });
    },
    async verwijderVerhaal(id) {
      const t = await moetToken();
      await verzoek(`/rest/v1/verhalen?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', token: t });
    },
    async meldVerhaal(id, reden = '') {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/meld_verhaal', { method: 'POST', token: t, body: { verhaal: id, reden: reden || null } });
    },
    async teBeoordelen() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/te_beoordelen', { method: 'POST', token: t, body: {} });
    },
    async beoordeel(id, actie, { notitie = '', titel = null, tekst = null } = {}) {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/beoordeel_verhaal', { method: 'POST', token: t,
        body: { verhaal: id, actie, notitie: notitie || null, nieuwe_titel: titel, nieuwe_tekst: tekst } });
    },

    // ---- photos ----
    async aantalFotos() {
      return await verzoek('/rest/v1/rpc/aantal_fotos', { method: 'POST', body: {} });
    },
    async fotos() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/fotos_lijst', { method: 'POST', token: t, body: {} });
    },
    // Signed links (valid 1 hour) for file paths like '<pad>-klein.jpg'; cached for 50 minutes.
    async fotoUrls(paden) {
      const t = await moetToken(), nu = Date.now(), uit = {};
      const nodig = paden.filter(p => { const c = urlCache.get(p); if (c && c.tot > nu) { uit[p] = c.url; return false; } return true; });
      for (let i = 0; i < nodig.length; i += 200) {
        const rows = await opslag('/sign/fotos', { method: 'POST', token: t, type: 'application/json',
          body: JSON.stringify({ expiresIn: 3600, paths: nodig.slice(i, i + 200) }) });
        for (const r of rows || []) if (r.signedURL) {
          const url = SUPABASE_URL + '/storage/v1' + r.signedURL;
          urlCache.set(r.path, { url, tot: nu + 50 * 60e3 });
          uit[r.path] = url;
        }
      }
      return uit;
    },
    // items: [{ groot, klein (JPEG blobs), breedte, hoogte, titel }]. Row first (checks the
    // limit of 30), then both files; a failed upload removes the row again.
    async stuurFotos(items, { speltak = null, jaar = null, toon_naam = true } = {}, voortgang = () => {}) {
      const t = await moetToken(), uid = sessie().user.id, groep = crypto.randomUUID();
      for (const [i, it] of items.entries()) {
        voortgang(i);
        const id = crypto.randomUUID(), pad = `${uid}/${id}`;
        await verzoek('/rest/v1/fotos', { method: 'POST', token: t, headers: { Prefer: 'return=minimal' },
          body: { id, auteur: uid, pad, groep, titel: it.titel || '', speltak, jaar, toon_naam: !!toon_naam, breedte: it.breedte, hoogte: it.hoogte } })
          .catch(e => { throw e.message === 'max' ? fout('max', MELD.max) : e; });
        try {
          await opslag(`/fotos/${pad}.jpg`, { method: 'POST', token: t, type: 'image/jpeg', body: it.groot });
          await opslag(`/fotos/${pad}-klein.jpg`, { method: 'POST', token: t, type: 'image/jpeg', body: it.klein });
        } catch (e) {
          await verzoek(`/rest/v1/fotos?id=eq.${id}`, { method: 'DELETE', token: t }).catch(() => {});
          await wisBestanden([pad], t);
          throw fout('upload', MELD.upload);
        }
      }
      voortgang(items.length);
    },
    async verwijderFoto(id) {
      const t = await moetToken();
      const rows = await verzoek(`/rest/v1/fotos?id=eq.${encodeURIComponent(id)}&select=pad`, { method: 'DELETE', token: t, headers: { Prefer: 'return=representation' } });
      await wisBestanden(rows.map(r => r.pad), t);
    },
    async bewerkFoto(id, { titel = '', speltak = null, jaar = null }) {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/bewerk_foto', { method: 'POST', token: t, body: { foto: id, titel, speltak, jaar } });
    },
    async meldFoto(id, reden = '') {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/meld_foto', { method: 'POST', token: t, body: { foto: id, reden: reden || null } });
    },
    // ---- hartjes ----
    async hartjes() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/hartjes', { method: 'POST', token: t, body: {} });
    },
    async zetHartje(soort, ref, aan) {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/zet_hartje', { method: 'POST', token: t, body: { soort, ref, aan } });
    },
    async fotosTeBeoordelen() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/fotos_te_beoordelen', { method: 'POST', token: t, body: {} });
    },
    async beoordeelFoto(id, actie) {
      const t = await moetToken();
      const pad = await verzoek('/rest/v1/rpc/beoordeel_foto', { method: 'POST', token: t, body: { foto: id, actie } });
      if (pad) await wisBestanden([pad], t);
    },
    async fotoOpslag() {
      const t = await moetToken();
      const rows = await verzoek('/rest/v1/rpc/foto_opslag', { method: 'POST', token: t, body: {} });
      return rows[0] || { geplaatst: 0, bytes: 0 };
    },

    async aantalTeBeoordelen() {
      const t = await token();
      if (!t) return 0;
      return await verzoek('/rest/v1/rpc/aantal_te_beoordelen', { method: 'POST', token: t, body: {} }).catch(() => 0);
    },
    async gezien() {
      const t = await token();
      if (!t) return {};
      const rows = await verzoek('/rest/v1/rpc/mijn_gezien', { method: 'POST', token: t, body: {} });
      return Object.fromEntries(rows.map(r => [`${r.soort}:${r.ref}`, r.tijd]));
    },
    async zetGezien(items) {
      if (!items.length) return;
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/zet_gezien', { method: 'POST', token: t, body: { items } });
    },
    async nieuwVoorMij() {
      const t = await token();
      const leeg = { overleg: 0, beoordelen_nieuw: 0, beoordelen: 0 };
      if (!t) return leeg;
      return { ...leeg, ...await verzoek('/rest/v1/rpc/nieuw_voor_mij', { method: 'POST', token: t, body: {} }).catch(() => ({})) };
    },
    // ---- overleg ----
    async overleg() {
      const t = await moetToken(), ik = sessie()?.user?.id;
      const rijen = await verzoek('/rest/v1/gesprekken?select=id,titel,soort,ref,ref_naam,status,auteur,auteur_naam,aangemaakt,bijgewerkt,'
        + 'berichten(id,auteur,auteur_naam,tekst,systeem,aangemaakt)&order=bijgewerkt.desc', { token: t });
      return rijen.map(({ auteur, ...g }) => ({
        ...g, eigen: auteur === ik, berichten: g.berichten.sort((a, b) => a.aangemaakt.localeCompare(b.aangemaakt))
          .map(({ auteur, ...b }) => ({ ...b, eigen: auteur === ik })),
      }));
    },
    async startOverleg({ titel, soort = 'vrij', ref = null, ref_naam = null, status = 'open', tekst = '' }) {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/start_gesprek', { method: 'POST', token: t,
        body: { titel, soort, ref: ref == null ? null : String(ref), ref_naam, status, tekst: tekst || null } });
    },
    async stuurBericht(gesprek, tekst) {
      const t = await moetToken();
      await verzoek('/rest/v1/berichten', { method: 'POST', token: t, headers: { Prefer: 'return=minimal' }, body: { gesprek, tekst: tekst.trim() } });
    },
    async zetOverlegStatus(gesprek, status) {
      const t = await moetToken();
      await verzoek(`/rest/v1/gesprekken?id=eq.${encodeURIComponent(gesprek)}`, { method: 'PATCH', token: t, headers: { Prefer: 'return=minimal' }, body: { status } });
    },
    // Your own conversation, or any as hoofdbeheerder; the database checks that.
    async verwijderOverleg(id) {
      const t = await moetToken();
      const weg = await verzoek(`/rest/v1/gesprekken?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', token: t, headers: { Prefer: 'return=representation' } });
      if (!weg?.length) throw fout('recht', 'Dit gesprek kan alleen worden verwijderd door wie het startte, of door een hoofdbeheerder.');
    },
    async verwijderBericht(id) {
      const t = await moetToken();
      await verzoek(`/rest/v1/berichten?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', token: t });
    },

    // Removes the registration and its login; optionally blocks the address. Photo files go
    // through the Storage API, after the database agreed (the rows go with the login).
    async verwijder(id, { blokkeer = false, reden = '' } = {}) {
      const t = await moetToken();
      const paden = await verzoek('/rest/v1/rpc/fotos_van', { method: 'POST', token: t, body: { deelnemer: id } }).catch(() => []);
      await verzoek('/rest/v1/rpc/verwijder_deelnemer', { method: 'POST', token: t, body: { deelnemer: id, blokkeer: !!blokkeer, waarom: reden || null } })
        .catch(e => { throw MELD[e.message] ? fout(e.message, MELD[e.message]) : e; });  // server codes: zelf, comitelid
      await wisBestanden(paden || [], t);
    },
    async geblokkeerde() {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/geblokkeerde', { method: 'POST', token: t, body: {} });
    },
    async deblokkeer(email) {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/deblokkeer', { method: 'POST', token: t, body: { adres: norm(email) } });
    },
    async comiteWeghalen(email) {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/comite_weghalen', { method: 'POST', token: t, body: { adres: norm(email) } })
        .catch(e => { throw e.code === '42501' ? fout('recht', MELD.recht) : e; });
    },
    // All registrations, oldest first. Row level security returns only your own row to non-members.
    async inschrijvingen() {
      const t = await moetToken();
      const rows = await verzoek('/rest/v1/deelnemers?select=*&order=aangemaakt', { token: t });
      return rows.map(naarRecord);
    },
    async zetErbij(id, keuze) {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/zet_erbij', { method: 'POST', token: t, body: { deelnemer: id, keuze } });
    },
    async zetBetaald(id, aan) {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/zet_betaald', { method: 'POST', token: t, body: { deelnemer: id, betaald: !!aan } });
    },
  };

  return { DEMO, DEMO_CODE, publiek, isNieuw, ...(DEMO ? demo : live) };
})();
