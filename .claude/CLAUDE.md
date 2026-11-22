# lastscoutstanding.com

Domein van Bas. Nu vooral de site voor de reünie van 25 jaar Scouting Brandevoort (Helmond) in `reunie25/`; de root stuurt daarheen door.
Repo: github.com/lastscoutstanding/lastscoutstanding.com, gehost op GitHub Pages (lastscoutstanding.com, via `CNAME`).
Stand: 22 november 2026.

## Werkwijze in Claude Code

- Werk direct in deze lokale repo. Begin een taak met `git pull`; Bas past soms zelf bestanden aan via GitHub.
- Eén logische wijziging = één commit. Push pas na akkoord van Bas: de site staat live.
- Testen via `python3 -m http.server 8000` in de repo-root (config `site` in `.claude/launch.json`), dan `/reunie25/`. De txt-bestanden worden met `fetch` geladen en werken niet via `file://`.
- Het push-token in de sleutelhanger dekt sinds 16 november 2026 ook deze repo. Sinds 20 november 2026 heeft het ook het recht Workflows (nodig voor `.github/workflows/`).
- Werk dit bestand bij na elke grotere wijziging, vooral "Reünie" en "Open punten".

## Architectuur

Vanilla HTML/CSS/JS, geen build-stap. Alleen relatieve paden, zodat `reunie25/` als geheel kan verhuizen (bijv. later via een doorverwijzing vanaf reunie.scoutingbrandevoort.nl). Geen cookies of tracking. Alleen NL.

| Pad | Rol |
| --- | --- |
| `index.html` | Stuurt door naar `reunie25/` (meta refresh). Vervangen als de root iets anders moet worden |
| `reunie25/index.html` | Home: datum en tijd, agendalink, aftelling, tellers (doen mee / komen / misschien), namen (10 op telefoon, 20 breder; zijn er meer, dan een willekeurige selectie per bezoek, jijzelf altijd vooraan), "Nieuw bij Herinneringen" (nieuwste geplaatste verhaal en foto voor deelnemers, links naar `herinneringen.html#verhaal-<id>` / `#foto-<id>`; anderen een teaser met aantallen) |
| `reunie25/inschrijven.html` | "Doe mee" (inschrijven), eerste vraag "Ben je erbij?"; ingelogd = gegevens aanpassen |
| `reunie25/inloggen.html` | Inloggen met e-mail + code van 6 cijfers (stap `#code`) |
| `reunie25/mijn.html` | Eigen inschrijving: "Ben je erbij?" met één klik aanpassen, kaartje, links "wie was er tegelijk met jou", betaalblok (alleen bij ja), "Weet je het al?" (misschien), agendablok (niet bij nee), aanpassen, uitschrijven, uitloggen |
| `reunie25/deelnemers.html` | "Wie doen er mee?": zoeken, filter speltak + jaar (`?speltak=&jaar=`), tabblad "Per jaar" |
| `reunie25/herinneringen.html` | Herinneringen (menu na "Wie doen er mee?"): tabblad Verhalen (lezen, zoeken/filteren, delen, eigen verhaal aanpassen/verwijderen, "Meld het") en Foto's (`#fotos`: grid, groot bekijken met pijltjes/vegen, meerdere tegelijk delen, eigen foto verwijderen, "Meld het"), met hartjes bij beide. Alleen voor deelnemers en comité; anderen zien een teaser met het aantal |
| `reunie25/programma.html` + `programma.txt` | Programma (`tijd | omschrijving`, andere regels = alinea) |
| `reunie25/vragen.html` + `vragen.txt` | FAQ (`V:` / `A:`); `{bedrag}` = bedrag uit `betalen.txt`, e-mailadressen worden links |
| `reunie25/beheer.html` | Comité. Tabblad Inschrijvingen: tegels, zoeken, filters te combineren (erbij / betaald / nieuw deze week), kolom "Erbij?" met keuzelijst + "sinds", details, verwijderen (+ blokkeren, `<dialog>`), CSV, adressen kopiëren, betaald afvinken. Tabblad Te beoordelen (`#beoordelen`): foto's per inzending (plaatsen / afwijzen = wissen, "Alle N plaatsen"), opslaggebruik, en nieuwe/aangepaste en gemelde verhalen plaatsen, afwijzen (met opmerking), aanpassen, verwijderen. Tabblad Overleg (`#overleg`, `#overleg-<id>`): comité-chat, zie "Overleg". Tabblad Comité (`#comite`): lijst, hoofdbeheerder voegt beheerders toe/haalt weg, geblokkeerde adressen (deblokkeren), tabel "Wie mag wat?". Link "Beheer" alleen voor beheerders (`Data.beheerder()`, rol via `Data.rol()`) |
| `reunie25/reunie.ics` | Agendabestand (14:00–19:00, Europe/Amsterdam); `Reunie.agenda()` maakt de links "Zet in je agenda" + Google Agenda (home, programma, mijn). Bevat het volledige adres van de site |
| `reunie25/betalen.txt` | Bedrag, betaallink, IBAN voor het betaalblok op `mijn.html`; leeg = geen blok |
| `reunie25/over.html` | "Over deze site" (link in de footer): gemaakt door Peter (“Peter Limonade”) en Claude samen; tijdens gebruik kijkt geen AI mee |
| `reunie25/privacy.html` | Privacyverklaring (noemt Supabase en Resend, wissen uiterlijk 23 augustus 2027) |
| `reunie25/speltakken.txt` | Speltakken met instapleeftijd, `opgericht = 2001`; regel zonder leeftijd = rol zonder speltak (Bestuur / vrijwilliger); oude namen achter een `\|` (zie "Oude speltaknamen") |
| `reunie25/reunie.js` | Gedeeld: speltakken.txt inlezen, jaren berekenen, persoonskaartje, `esc()`, jaarvelden-pijltjes |
| `reunie25/data.js` | Datalaag: de enige plek die met opslag praat. `SUPABASE_KEY` leeg = DEMO (localStorage), ingevuld = Supabase via `fetch` (geen bibliotheek) |
| `.github/workflows/supabase-keep-alive.yml` | Houdt Supabase wakker: elke 3 dagen één aanroep van `aantal_deelnemers` |
| `_docs/beheer.md` | Beheerhandleiding: alle instellingen bij GitHub, Webreus (DNS), Resend en Supabase. Bijwerken bij elke wijziging daar |
| `_docs/verhuizing.md` | Stappenplan (nog niet uitgevoerd) om de reünie te verhuizen naar een eigen repo `reunie25` op reunie.scoutingbrandevoort.nl (optie 1a, 20 november 2026) |
| `_supabase/schema.sql` | Tabellen, row level security en functies voor Supabase; één keer draaien in de SQL-editor. Map met `_`, dus niet gepubliceerd |
| `reunie25/nav.js` | Kop (blauwe band met logo, titel en datum) + lichte menubalk eronder (sticky, actieve pagina geel onderstreept, "Mijn inschrijving →" / "Inloggen →" vast rechts; onder 760 px één veegbare regel met vervaagde randen en "Mijn →"), footer, testversie-balk bij DEMO |
| `reunie25/logo.svg`, `logo-wit.svg` | Logo als vector, zie "Reünie" |
| `reunie25/overleg.js` | Overleg-knopjes (💬) voor het comité bij deelnemers, verhalen, foto's en onderaan elke pagina, en de dialoog "Nieuw overleg". Herinneringen en Beheer laden het zelf; op andere pagina's laadt `nav.js` het voor comitéleden |
| `reunie25/theme.css` | Stijl; kleuren van scoutingbrandevoort.nl (#2c4696) en het logo (geel). Licht/donker volgt het systeem |

## Reünie

- Zondag 23 mei 2027, 14:00–19:00, vrije inloop, blokhut de Brandnetel, Helmond. Scouting Brandevoort is opgericht in 2001.
- Contactadres van het comité: reunie@scoutingbrandevoort.nl (sinds 19 november 2026). Bijdrage € 5 per persoon (bedrag in `betalen.txt`). Voor iedereen van de club, van nu en toen (jeugdleden, leiding, bestuur, vrijwilligers), geen introducés. Er komt waarschijnlijk een leeftijdsgrens; nog niet bepaald (22 november 2026). Woordkeus: "scouts van nu en toen", niet "oud-leden" of "(oud-)leden"; anoniem gedeeld = "gedeeld door iemand van de club". Knop/menu "Doe mee" i.p.v. "Inschrijven". Op Beheer → Comité worden de hoofdbeheerders bij naam genoemd, uit de lijst zelf.
- "Scobra" alleen heel spaarzaam gebruiken (nu één keer, in de footer): niet iedereen vindt het een goede naam.
- Logo: `reunie25/logo.svg` (zwarte letters) en `logo-wit.svg` (witte letters, in de blauwe kop; ook favicon via `nav.js`). Omgezet van het originele Illustrator-bestand uit 2011 (`~/Documents/Peter/Scouting Brandevoort/Nieuwe logo/20110503 Definitief/`), een PDF-compatibel `.ai`. macOS rendert dat bestand met een zwarte lelie; de SVG heeft de juiste kleuren (geel #ffe400, rood #fa0000, blauw #495faa).
- Persoon: voornaam, achternaam, bijnaam (optioneel, max. 40, getoond als Sanne “Snoes” Jansen), e-mail, geboortejaar, `takken: [{speltak, rol: 'lid'|'leiding', van, tot, naam?}]` (`tot` null = heden, `naam` = oude naam), `toon: {voornaam, achternaam, bijnaam, leeftijd, takken}`, `sinds`, `erbij` + `erbij_sinds` (zie "Ben je erbij?").
- Jeugdlid-jaren worden berekend uit geboortejaar + `speltakken.txt` (je zit in een speltak tot de leeftijd van de eerstvolgende hogere speltak; dezelfde leeftijd = naast elkaar, zoals Vuurvogels en Plusscouts, allebei Stam vanaf 21), in kalenderjaren, nooit vóór 2001, en zijn met de hand aan te passen. Leiding-jaren vult iemand zelf in. Jaren vóór 2001 (oudere leden) kunnen met de hand of met pijltje omlaag, tot 1930; pijltje omhoog vanuit leeg begint bij 2001 (`data-start`). Het jaarfilter op "Wie doen er mee?" begint bij 2001.
- Leeftijd = jubileumjaar (opgericht + 25 = 2026) − geboortejaar, getoond als "57 bij het jubileum" (21 november 2026; eerst 2027). Klopt vaker dan het reüniejaar, nu en op de reüniedag, en zit het ernaast dan is iemand een jaar jonger. Knipoog in de tooltip en op `mijn.html`: "2,3 keer zo oud als de club" / "5 jaar jonger dan de club". Geen "Scobra".
- E-mailadressen ziet alleen het comité; `beheer.html` heeft CSV-download en "Kopieer e-mailadressen" (van de gefilterde rijen, voor BCC).
- Jezelf terugvinden (20 november 2026): ingelogd krijgt je eigen naam-pill op de home een geel accent (en staat vooraan), en je kaartje op "Wie doen er mee?" een gele rand met "jij". Herkend met `Reunie.zelf(ik)`: vergelijkt de publieke velden met `Data.publiek(ik)`, want publieke rijen hebben geen id. Je eigen pill en kaartje linken naar `mijn.html`.
- Namen op de home linken naar `deelnemers.html#p-N` (20 november 2026): N = positie in de lijst van `Data.deelnemers()`, die beide pagina's in dezelfde volgorde krijgen. Het kaartje scrollt in beeld en licht even geel op. Bij een in- of uitschrijving tussen twee pagina-loads kan het een plek verschuiven; geaccepteerd.
- Privacy: verborgen velden zijn `null` in de publieke rij (`Data.publiek`). Bij een filter op speltak/jaar verschijnen mensen met verborgen speltakken alleen in het vaste blok "Ook ingeschreven, speltak niet getoond", zodat het filter niets verraadt.
- Rollen (19 november 2026): bezoeker, deelnemer, beheerder, hoofdbeheerder (tabel `beheerders`, kolom `rol`). Hoofdbeheerders alleen via de SQL Editor; op de site voegt een hoofdbeheerder alleen gewone beheerders toe of haalt ze weg. Comitéleden kunnen inloggen zonder inschrijving (`is_comite_adres()` → login wordt aangemaakt) en komen dan op Beheer; `inschrijven.html` toont hun een noot. DEMO: ingelogd = hoofdbeheerder, comité in `reunie25.demo.comite`.
- Verwijderen en blokkeren (19 november 2026, na mockup): elke beheerder mag het; blokkeren alleen samen met verwijderen; geen goedkeuring vooraf. "Nieuw" = ingeschreven in de afgelopen 7 dagen. Geblokkeerd adres: geen code bij inschrijven (`is_geblokkeerd_adres()`) en de trigger weigert de rij; melding zonder verwijt met reunie@scoutingbrandevoort.nl. DEMO: `reunie25.demo.geblokkeerd`, verwijderde voorbeelden in `reunie25.demo.weg`.
- Inlogflow: inschrijven → formulier in sessionStorage → code → pas dan opslaan. E-mailadres nooit in de URL.
- DEMO: inlogcode `123456`, 20 verzonnen voorbeelddeelnemers, inschrijvingen in localStorage (`reunie25.demo`, sessie `reunie25.sessie`). Ingelogd = beheerder; betalingen in `reunie25.demo.betaald`.
- Betalen (19 november 2026): vaste betaallink van de bank, geen betaalprovider. Het comité vinkt betalingen af op `beheer.html` (`zet_betaald()`, kolom `betaald_op`); de trigger voorkomt dat een deelnemer zichzelf op betaald zet. Lokaal testen in DEMO: `SUPABASE_KEY` tijdelijk leeg maken, niet committen.

## Oude speltaknamen (gebouwd 22 november 2026, na mockup; vraag van Marc)

- In `speltakken.txt` staan per speltak oude/andere namen achter een `|` (lijst van Bas, ook namen van vóór 2001 voor oudere leden; "DWEK" bewust weggelaten). Onder een aangevinkte speltak kiest iemand "Heette toen": huidige naam (standaard), een oude naam, of "andere naam…" (vrij, max. 30, schemacheck `takken_namen_ok`).
- De speltak zelf blijft de huidige naam: filters, jaren, "Per jaar" en "wie was er tegelijk" werken daarop. Kaartje toont de gekozen naam met tooltip "nu Scouts"; Beheer/CSV "Verkenners (Scouts) 1991–1994". Filtermenu toont de eerste twee oude namen; het zoekveld vindt ook speltakken via (oude) namen (`Reunie.takPast`).
- DEMO: Mark (leiding Verkenners) en Ruud (leiding Esta's vanaf 1996).

## Ben je erbij? (gebouwd 22 november 2026, na mockup)

- Doel: de drempel verlagen. Wie nog niet weet of hij in mei kan, of niet kan, doet toch mee (herinneringen delen). Kolom `erbij` (`ja`/`misschien`/`nee`, standaard en voor bestaande inschrijvingen `ja`) en `erbij_sinds` (trigger zet die bij een andere keuze).
- Alleen de deelnemer en het comité zien de keuze. Publiek alleen de aantallen (variant A, gekozen door Bas): home "N scouts van nu en toen doen mee" + "X komen naar de reünie, Y weten het nog niet"; "helaas niet" telt alleen mee in het totaal. Iedereen staat in de lijst op "Wie doen er mee?". Geen teken op het kaartje en geen filter, want dat zou de keuze per persoon verraden.
- Formulier: drie grote keuzes met een regel eronder; bij ja geen woord over betalen (Bas: geen twijfel injecteren). Nee-tekst van Bas: "Jammer dat je niet kan! … pas het dan hier aan" (link naar `mijn.html`).
- Mijn inschrijving: knoppen Ja!/Misschien/Helaas niet slaan meteen op via `Data.bewaar`. Al betaald en dan "helaas niet": "Het comité … neemt contact met je op" (terugbetalen regelt het comité zelf).
- Beheer: comité wijzigt via `zet_erbij()`. Betaalvinkje alleen bij ja of als er al betaald is. CSV (nu van de gefilterde rijen) heeft kolommen Erbij en Erbij sinds.
- DEMO: voorbeelddeelnemers deels misschien/nee; wijzigingen door het comité in `reunie25.demo.erbij`.

## Verhalen (19 november 2026, na mockup)

- Tabel `verhalen` (titel ≤ 80, tekst ≤ 3000, speltak, jaar, `toon_naam`, `status` nieuw/geplaatst/afgewezen/gemeld). Trigger `verhalen_stempel`: elke nieuwe of aangepaste versie door de schrijver wordt weer `nieuw`; comitéfuncties zetten `reunie.comite = '1'` om dat te omzeilen.
- Naam bij een verhaal volgt wat iemand op "Wie doen er mee?" toont; `toon_naam` uit = "gedeeld door een oud-lid".
- Toon: de controle door het comité niet benadrukken. Schrijver ziet "wordt binnenkort geplaatst" en na insturen "verschijnt zo snel mogelijk". Afgewezen: "niet geplaatst" + opmerking.
- DEMO: `reunie25.demo.verhalen` met drie voorbeeldverhalen.
- Verhalen worden met de rest gewist (uiterlijk 23 augustus 2027). Bewaren voor later (boekje/archief) zou toestemming bij het insturen vragen; nog niet besloten.

## Overleg (gebouwd 20 november 2026, na mockup)

- Comité-chat op Beheer → Overleg. Tabellen `gesprekken` (titel, soort vrij/deelnemer/verhaal/foto/pagina, `ref` + `ref_naam`, status open/hot/done) en `berichten` (≤ 1000 tekens, `systeem` = "X zette de status op hot"). Alleen voor beheerders (row level security). Starten via `start_gesprek()`; triggers vullen auteur, naam (`mijn_naam()`) en tijden in, en na de start kan alleen de status veranderen.
- Iedereen in het comité mag de status wijzigen. Een gesprek verwijderen (met alle berichten) mag wie het startte, en een hoofdbeheerder elk gesprek (21 november 2026, eerst kon het niet). Je eigen bericht verwijderen mag, aanpassen niet. Een gesprek over een verwijderde deelnemer blijft staan met "(verwijderd)".
- Knopje bij een item telt alleen lopende gesprekken (niet done): geen = "💬 Bespreek"; één = link "💬 Overleg *status*"; meer = "💬 N gesprekken" naar `beheer.html?over=<soort>:<ref>#overleg` (lijst gefilterd op dat item, "alles tonen" haalt het filter weg). Bij één of meer staat er een "+" naast voor een nieuw gesprek over hetzelfde item.
- Geen mail en niet live. Gele stip bij een gesprek = nieuw gesprek of nieuw bericht van een ander (geen statusregels, niet je eigen) sinds je het laatst opende.
- Bolletjes (22 november 2026, na mockup; Bas miste ochtendberichten van een collega): geel = "nieuw voor jou sinds je laatst keek", weg zodra je kijkt. Overleg-tab: aantal gesprekken met een stip. Te beoordelen-tab: geel = binnengekomen of gemeld sinds je dat tabblad opende, anders grijs getal = wacht nog. "Beheer" in het menu: beide gele getallen samen, op elke pagina (`nieuw_voor_mij()`; op Beheer houdt de pagina het zelf bij via `window.eigenVlagBeheer`). Hot heeft geen bolletje meer (rood label en bovenaan in de lijst blijven). Gezien staat per comitélid in de tabel `gezien` (op elk apparaat); zonder rij telt de afgelopen 7 dagen als nieuw. Oude localStorage `reunie25.overleg.gezien` wordt één keer overgezet. Op de computer opent Overleg vanzelf het bovenste ongelezen gesprek. DEMO: `reunie25.demo.gezien`. Hot telt bewust nergens mee, omdat gesprekken lang op hot kunnen staan.
- DEMO: `reunie25.demo.overleg` met twee voorbeeldgesprekken.
- Wordt met de rest gewist (uiterlijk 23 augustus 2027), met de hand; staat in de privacyverklaring.

## Hartjes (gebouwd 21 november 2026, na mockup)

- Hartje bij geplaatste verhalen (voetregel) en foto's (geven in de grote weergave; bolletje met aantal op de miniatuur). Eén per deelnemer per item, nog een keer tikken haalt het weg. Niet bij je eigen item: daar staat "N mensen vinden dit leuk" (bij 0 niets). Woord "leuk", niet "mooi".
- Je ziet het aantal, nooit wie. Geen sortering op hartjes (geen wedstrijd).
- Tabel `hartjes` (`verhaal` of `foto`, `auteur`), zonder directe toegang: `hartjes()` geeft per item aantal, `van_mij`, `eigen`; `zet_hartje(soort, ref, aan)` geeft het nieuwe aantal. Gaat mee weg met het verhaal, de foto of de login.
- `mijn.html`: blok "Jouw herinneringen" met het totaal aantal hartjes op je eigen verhalen en foto's, alleen als het er meer dan 0 zijn.
- DEMO: `reunie25.demo.hartjes`, met voorbeeldhartjes van verzonnen deelnemers.

## Foto's (gebouwd 19 november 2026)

Besloten op 18 en 19 november 2026, na mockups:
- Tabblad Foto's op `herinneringen.html`. Alleen ingelogde deelnemers zien en uploaden foto's; bezoekers krijgen uitleg met inloggen/inschrijven.
- Nieuwe foto's zijn pas zichtbaar na goedkeuring door het comité (tab "Te beoordelen"); de uploader ziet ze zelf met "wacht op goedkeuring".
- Per foto: titel, jaar, speltak (filter zoals op "Wie doen er mee?"), "gedeeld door". Knop "Sta jij hierop…?" verbergt een foto en meldt het aan het comité.
- Verkleinen in de browser vóór upload: 1600 px (~200–350 KB) + miniatuur 400 px (~50 KB); opnieuw opslaan haalt ook GPS/EXIF weg. Supabase Free: 1 GB opslag, 5 GB verkeer per maand. Max. 30 foto's per persoon (trigger `fotos_stempel`).
- Opslag: privé-bucket `fotos` (alleen JPEG, max. 1 MB), bestanden `<auteur>/<id>.jpg` en `-klein.jpg`; tabel `fotos` met status nieuw/geplaatst/gemeld. Bekijken via ondertekende links (1 uur geldig). Bestanden wist de site via de Storage API (ook bij uitschrijven en bij verwijderen door het comité); SQL kan dat niet.
- Afwijzen = de foto wordt gewist (geen "niet geplaatst" zoals bij verhalen).
- Aanpassen (20 november 2026): uploader en comité wijzigen titel, speltak en jaar in de grote weergave (`bewerk_foto()`). Geen nieuwe beoordeling, want de foto zelf verandert niet. Een andere foto = verwijderen en opnieuw delen, en die gaat wel langs het comité.
- DEMO: rijen in `reunie25.demo.fotos`, geüploade bestanden alleen in het geheugen (na herladen een gekleurd vlak).
- Let op bij testen: een browsertabblad op de achtergrond kan het verkleinen pauzeren.

## Open punten

- [x] Supabase gekoppeld (project `glvrsppggmfksimpfckp`, regio Ierland/eu-west-1, 18 november 2026): schema gedraaid, inloggen met code getest door Bas.
- [x] Mail via Resend (`noreply@lastscoutstanding.com`, DNS bij Webreus: `resend._domainkey`, `send` → forge.rmta.net, `_dmarc`). Gratis: 3.000/maand, 100/dag. Supabase-mailtemplates "Magic Link" en "Confirm signup" bevatten `{{ .Token }}`.
- [x] Rate limit mails in Supabase opgehoogd naar 100 per uur (door Bas, gemeld 20 november 2026).
- [ ] Aankondiging eventueel spreiden: Resend (gratis) verstuurt max. 100 mails per dag, en elke inschrijving of inlog kost een mail.
- [x] Keep-alive (20 november 2026): GitHub Action `.github/workflows/supabase-keep-alive.yml` roept elke 3 dagen `aantal_deelnemers` aan. GitHub zet geplande workflows uit na 60 dagen zonder activiteit in de repo; dan in het tabblad Actions weer aanzetten. Weghalen na het wissen (augustus 2027).
- [x] Schema opnieuw gedraaid in Supabase (beheer + betaald), Bas staat in `beheerders` (19 november 2026).
- [ ] Bedrag en betaallink in `betalen.txt`; nagaan hoe lang de link van de bank geldig blijft.
- [x] Schema opnieuw gedraaid (rollen + comité), Bas hoofdbeheerder (19 november 2026).
- [x] Schema opnieuw gedraaid (verhalen), 19 november 2026.
- [x] Schema opnieuw gedraaid (foto's, bucket en opslagregels), 19 november 2026.
- [x] Schema opnieuw gedraaid (`bewerk_foto`), 20 november 2026.
- [ ] Foto's verwijderen en uitschrijven met foto's testen (uploaden en bekijken werken live, getest door Bas 20 november 2026).
- [x] Menu op telefoon: één veegbare regel in plaats van drie regels (20 november 2026, na mockup).
- [x] Privacyverklaring af (18 november 2026): contact Reüniecomité, Blokhut de Brandnetel, Brandevoort 13-A, 5706 KA Helmond, reunie@scoutingbrandevoort.nl; alles gewist uiterlijk 23 augustus 2027. Bij de foto's de verklaring aanvullen.
- [x] Schema opnieuw gedraaid (verwijderen/blokkeren), 19 november 2026.
- [ ] Gegevens wissen uiterlijk 23 augustus 2027, met de hand (tabellen `deelnemers`, `beheerders`, `geblokkeerd`, `verhalen`, `fotos`, `hartjes`, `gesprekken`, `berichten`, `gezien`, de bucket `fotos` en de logins in Supabase). Er wordt niets automatisch gewist.
- [x] Schema opnieuw gedraaid (overleg + `aantal_te_beoordelen`), 20 november 2026.
- [x] Schema opnieuw gedraaid (gesprek verwijderen), 21 november 2026.
- [x] Schema opnieuw gedraaid (hartjes), 21 november 2026.
- [x] Schema opnieuw gedraaid (erbij), 22 november 2026; live gecontroleerd (`aantal_erbij`, `.ics` als `text/calendar`).
- [ ] "Ben je erbij?" live testen als deelnemer (keuze wijzigen op Mijn inschrijving) en op Beheer; agendabestand testen in Apple Agenda en Google Agenda.
- [x] Schema opnieuw gedraaid (bolletjes), 22 november 2026. Bolletjes nog live testen zodra er iets nieuws binnenkomt.
- [x] Schema opnieuw gedraaid (oude speltaknamen), 22 november 2026.
- [ ] Leeftijdsgrens bepalen; dan controle op geboortejaar in het formulier en een vraag in `vragen.txt`.
- [ ] Hartjes live testen (geven, weghalen, eigen item, blok op Mijn inschrijving).
- [ ] Programma en vragen verder invullen (`programma.txt`, `vragen.txt`); tijden 14:00–19:00 staan erin (22 november 2026).
- [x] Jaarvelden-pijltjes werken in Safari (getest door Bas, 20 november 2026). Keuzelijsten hebben een eigen stijl (`appearance: none`), in Safari nog nakijken.
- [ ] `README.md` noemt de oude reponaam.
- [ ] Eventueel verhuizen naar reunie.scoutingbrandevoort.nl volgens `_docs/verhuizing.md` (vóór de aankondiging; vraagt twee DNS-records van de scouting).
