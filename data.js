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
//     id, betaald }                 betaald: date the comité saw the payment, or null
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
  const DEMO_COMITE = 'reunie25.demo.comite';
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
  const voorbeeld = () => VOORBEELD.map(([voornaam, achternaam, geboortejaar, leden, [v, a, l, t], leiding = []]) => ({
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
  const voorbeeldVol = () => voorbeeld().map((r, i) => ({
    ...r, bijnaam: '', id: 'voorbeeld-' + i, sinds: `2026-12-${String(i + 1).padStart(2, '0')}`,
    email: `${r.voornaam}.${r.achternaam}`.toLowerCase().replace(/\s+/g, '') + '@voorbeeld.nl',
    toon: { bijnaam: true, ...r.toon },
  }));
  // Payments in DEMO: { id: date }. Starts with two out of three sample people paid.
  const betaaldLijst = () => lees(DEMO_BETAALD, null)
    ?? Object.fromEntries(VOORBEELD.map((_, i) => ['voorbeeld-' + i, `2027-01-${String(i + 5).padStart(2, '0')}`]).filter((_, i) => i % 3 !== 2));
  const metBetaald = r => r && { ...r, id: r.id || r.email, betaald: betaaldLijst()[r.id || r.email] || null };
  // Comité in DEMO: whoever is logged in is hoofdbeheerder, plus a few sample members.
  const comiteLijst = () => lees(DEMO_COMITE, null) ?? [
    { email: 'mark.devries@voorbeeld.nl', rol: 'hoofdbeheerder', toegevoegd_door: null, toegevoegd_op: '2026-11-20' },
    { email: 'femke.vandijk@voorbeeld.nl', rol: 'beheerder', toegevoegd_door: 'Mark', toegevoegd_op: '2026-11-21' },
    { email: 'ruud@voorbeeld.nl', rol: 'beheerder', toegevoegd_door: 'Mark', toegevoegd_op: '2026-11-22' },
  ];
  const demoNaam = email => {
    const r = [...voorbeeldVol(), ...alle()].find(x => x.email === email);
    return r ? `${r.voornaam} ${r.achternaam}`.trim() : null;
  };

  const demo = {
    async deelnemers() {
      const recs = [...voorbeeld(), ...alle()];
      return { totaal: recs.length, personen: recs.map(publiek).filter(zichtbaar) };
    },
    async vraagCode(email, { nieuw = false } = {}) {
      const bekend = alle().some(r => r.email === norm(email));
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
      const nieuw = { ...rec, email, sinds: i >= 0 ? list[i].sinds : new Date().toLocaleDateString('sv') };  // local YYYY-MM-DD
      delete nieuw.id; delete nieuw.betaald;
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
    async comiteWeghalen(email) {
      schrijf(DEMO_COMITE, comiteLijst().filter(c => !(c.email === norm(email) && c.rol === 'beheerder')));
    },
    async inschrijvingen() {
      if (!lees(DEMO_SESSIE, null)) throw fout('sessie', MELD.sessie);
      return [...voorbeeldVol(), ...alle()].map(metBetaald);
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
    toon: { voornaam: r.toon_voornaam, achternaam: r.toon_achternaam, bijnaam: r.toon_bijnaam ?? true, leeftijd: r.toon_leeftijd, takken: r.toon_takken },
  });
  const naarRij = (rec, id) => ({
    id, voornaam: rec.voornaam, achternaam: rec.achternaam || '', bijnaam: rec.bijnaam || '', geboortejaar: rec.geboortejaar,
    takken: rec.takken || [],
    toon_voornaam: !!rec.toon.voornaam, toon_achternaam: !!rec.toon.achternaam, toon_bijnaam: rec.toon.bijnaam !== false,
    toon_leeftijd: !!rec.toon.leeftijd, toon_takken: !!rec.toon.takken,
  });

  const live = {
    async deelnemers() {
      const [totaal, personen] = await Promise.all([
        verzoek('/rest/v1/rpc/aantal_deelnemers', { method: 'POST', body: {} }),
        verzoek('/rest/v1/rpc/publieke_deelnemers', { method: 'POST', body: {} }),
      ]);
      return { totaal, personen };
    },
    // Registering creates the login (create_user); logging in must not.
    async vraagCode(email, { nieuw = false } = {}) {
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
      return naarRecord(rows[0]) || null;
    },
    async bewaar(rec) {
      const t = await moetToken();
      const rows = await verzoek('/rest/v1/deelnemers?on_conflict=id', {
        method: 'POST', token: t, body: naarRij(rec, sessie().user.id),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      });
      return naarRecord(rows[0]);
    },
    // Removes the login itself; the registration goes with it (on delete cascade).
    async uitschrijven() {
      const t = await moetToken();
      await verzoek('/rest/v1/rpc/verwijder_mij', { method: 'POST', token: t, body: {} });
      bewaarSessie(null);
    },
    async uitloggen() {
      const t = await token();
      bewaarSessie(null);
      if (t) await verzoek('/auth/v1/logout', { method: 'POST', token: t }).catch(() => {});
    },
    // Comité member? The database decides (table beheerders); this only picks what to show.
    async beheerder() {
      const t = await token();
      if (!t) return false;
      return !!(await verzoek('/rest/v1/rpc/is_beheerder', { method: 'POST', token: t, body: {} }).catch(() => false));
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
    async zetBetaald(id, aan) {
      const t = await moetToken();
      return await verzoek('/rest/v1/rpc/zet_betaald', { method: 'POST', token: t, body: { deelnemer: id, betaald: !!aan } });
    },
  };

  return { DEMO, DEMO_CODE, publiek, ...(DEMO ? demo : live) };
})();
