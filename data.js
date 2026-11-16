// Data layer for the reunion site. Every page talks to the data only through
// these functions, so switching from DEMO to Supabase only changes this file.
//
// DEMO mode: registrations live in this browser (localStorage), the login code is
// always 123456, and a set of fictional sample participants is mixed in.
//
// Record (one per person, also the future database row):
//   { email, voornaam, achternaam, geboortejaar,
//     takken: [{ speltak, rol: 'lid' | 'leiding', van, tot }],   tot null = heden
//     toon: { voornaam, achternaam, leeftijd, takken },          what others may see
//     sinds }                                                     registration date
const Data = (() => {
  const DEMO = true;
  const KEY = 'reunie25.demo';
  const SESSIE = 'reunie25.sessie';
  const DEMO_CODE = '123456';

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

  // localStorage can be missing or throw (private mode): the site must still render.
  const lees = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const schrijf = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const norm = email => String(email || '').trim().toLowerCase();
  const alle = () => lees(KEY, []);

  const fout = (code, tekst) => Object.assign(new Error(tekst), { code });

  // What others may see of a record: hidden fields become null. In Supabase this is
  // a database view, so hidden fields never leave the server.
  function publiek(r) {
    return {
      voornaam: r.toon.voornaam ? r.voornaam : null,
      achternaam: r.toon.achternaam ? r.achternaam : null,
      geboortejaar: r.toon.leeftijd ? r.geboortejaar : null,
      takken: r.toon.takken ? r.takken : null,
    };
  }
  const zichtbaar = p => !!(p.voornaam || p.achternaam || p.geboortejaar || p.takken?.length);

  // { totaal, personen: public rows of everyone who shows at least something }
  async function deelnemers() {
    const recs = [...(DEMO ? voorbeeld() : []), ...alle()];
    return { totaal: recs.length, personen: recs.map(publiek).filter(zichtbaar) };
  }

  // Step 1 of logging in (and of registering): send a code to this address.
  // nieuw = true when registering: the address must not be registered yet.
  async function vraagCode(email, { nieuw = false } = {}) {
    const bekend = alle().some(r => r.email === norm(email));
    if (nieuw && bekend) throw fout('bestaat', 'Dit adres is al ingeschreven. Log in om je gegevens aan te passen.');
    if (!nieuw && !bekend) throw fout('onbekend', 'Dit adres kennen we nog niet. Schrijf je eerst in.');
    return true;
  }

  // Step 2: check the code; on success the person is logged in.
  async function bevestig(email, code) {
    if (String(code).trim() !== DEMO_CODE) throw fout('code', 'Deze code klopt niet. Kijk of je de laatste mail hebt.');
    schrijf(SESSIE, norm(email));
    return true;
  }

  const ingelogd = () => !!lees(SESSIE, null);

  // Own full record (including email and hidden fields), or null.
  async function ik() {
    const email = lees(SESSIE, null);
    return email ? alle().find(r => r.email === email) || null : null;
  }

  // Create or update the own record of the logged-in person.
  async function bewaar(rec) {
    const email = lees(SESSIE, null);
    if (!email) throw fout('sessie', 'Je bent niet ingelogd.');
    const list = alle();
    const i = list.findIndex(r => r.email === email);
    const nieuw = { ...rec, email, sinds: i >= 0 ? list[i].sinds : new Date().toLocaleDateString('sv') };  // local YYYY-MM-DD
    if (i >= 0) list[i] = nieuw; else list.push(nieuw);
    schrijf(KEY, list);
    return nieuw;
  }

  async function uitschrijven() {
    const email = lees(SESSIE, null);
    schrijf(KEY, alle().filter(r => r.email !== email));
    schrijf(SESSIE, null);
  }

  async function uitloggen() { schrijf(SESSIE, null); }

  return { DEMO, DEMO_CODE, deelnemers, publiek, vraagCode, bevestig, ingelogd, ik, bewaar, uitschrijven, uitloggen };
})();
