# Beheerhandleiding lastscoutstanding.com / reünie 25 jaar Scouting Brandevoort

Alle instellingen buiten de code: GitHub, Webreus (DNS), Resend (mail) en Supabase (database en inloggen).
Werk dit bestand bij als er iets verandert. Geheime sleutels staan hier **nooit** in.

Legenda: ✅ gecontroleerd (DNS of live site) · 👤 door Bas ingesteld in een dashboard, niet door Claude gezien

Laatst bijgewerkt: 19 november 2026

---

## Overzicht

```
bezoeker ──▶ lastscoutstanding.com (GitHub Pages, statische site)
                │  fetch met publishable key
                ▼
            Supabase (Ierland) ── database + inloggen met code
                │  SMTP
                ▼
            Resend ── verstuurt de mail met de inlogcode vanaf noreply@lastscoutstanding.com
```

DNS van het domein staat bij Webreus. Mail naar het domein zelf (mailboxen) loopt via Webreus; alleen de verzendmails van de site lopen via Resend.

---

## GitHub

| Wat | Waarde |
| --- | --- |
| Repo | `github.com/lastscoutstanding/lastscoutstanding.com`, branch `main` ✅ |
| Hosting | GitHub Pages, eigen domein via bestand `CNAME` (`lastscoutstanding.com`) ✅ |
| HTTPS | `http://` en `www.` sturen door naar `https://lastscoutstanding.com/` ✅ |
| Lokale kopie | `/Users/familiekrom/Websites/lastscoutstanding.com` |
| Pushen | HTTPS met een fine-grained token in de macOS-sleutelhanger, ook geldig voor deze repo (sinds 16 november 2026). **Verloopt rond 30 december 2026**: op tijd vernieuwen. |

Let op:
- GitHub Pages (Jekyll) publiceert geen mappen die met `_` of `.` beginnen. Daarom staan `_supabase/`, `_docs/` en `.claude/` wel in de repo maar niet op de site (gecontroleerd: `/_supabase/schema.sql` geeft 404 ✅).
- Geen `.nojekyll` toevoegen: dan worden die mappen wél gepubliceerd.
- Na een push duurt het ongeveer een minuut voordat de site bijgewerkt is. Verversen met Cmd+Shift+R.

---

## Webreus (domein en DNS)

Domein `lastscoutstanding.com`, parkeerabonnement. Nameservers `ns10.webreus.net` en `ns11.webreus.net` ✅.
DNS-records (gecontroleerd met `dig`, 18 november 2026 ✅):

| Type | Naam | Waarde | Voor |
| --- | --- | --- | --- |
| A | `lastscoutstanding.com` | `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` | GitHub Pages |
| AAAA | `lastscoutstanding.com` | `2606:50c0:8000::153`, `8001::153`, `8002::153`, `8003::153` | GitHub Pages |
| CNAME | `www` | `lastscoutstanding.github.io.` | GitHub Pages |
| TXT | `resend._domainkey` | `p=MIGfMA0…` (lange sleutel van Resend) | Resend, DKIM |
| CNAME | `send` | `send.forge.rmta.net.` | Resend, afzender/bounces (MX en SPF lopen via deze doorverwijzing) |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DMARC |
| MX | `lastscoutstanding.com` | `10 mx-in-3.webreus.nl.`, `10 mx-in-4.webreus.nl.` | mail van Webreus |
| TXT | `lastscoutstanding.com` | `v=spf1 include:spf.webreus.email -all` | SPF van Webreus |
| CNAME | `autoconfig`, `autodiscover`, `imap`, `mail`, `pop3`, `smtp` | `autoconfig.webreus.email.` / `autodiscover.webreus.email.` / `webreus.email.` | standaardrecords van Webreus |

Niet aankomen: de records voor GitHub Pages en de drie van Resend. De records van Webreus mogen blijven staan; ze zitten Resend niet in de weg.

---

## Resend (verzendmail)

| Wat | Waarde |
| --- | --- |
| Account | 👤 aangemaakt door Bas |
| Domein | `lastscoutstanding.com`, geverifieerd 👤 (DNS-records zie Webreus ✅) |
| Regio | Ireland (eu-west-1) 👤, bevestigd door Bas |
| API-sleutel | 👤 alleen "Sending access", staat alleen in Supabase (SMTP-wachtwoord). Nergens anders bewaren. |
| Gratis limiet | 3.000 mails per maand, **100 per dag** (resend.com/pricing, 18 november 2026) |

Bij veel aanmeldingen op één dag (aankondiging): na 100 mails krijgen mensen pas de volgende dag een code. Aankondiging spreiden of Resend tijdelijk upgraden.

---

## Supabase (database en inloggen)

| Wat | Waarde |
| --- | --- |
| Account | 👤 aangemaakt door Bas, inloggen via GitHub |
| Project | `glvrsppggmfksimpfckp`, URL `https://glvrsppggmfksimpfckp.supabase.co` ✅ |
| Regio | Ierland (eu-west-1) 👤, bevestigd door Bas |
| Abonnement | Free: 500 MB database, 1 GB opslag, 5 GB verkeer per maand, 50.000 gebruikers per maand. Geen automatische backups. |
| Publishable key | `sb_publishable_drDnd…` staat in `reunie25/data.js` ✅. Is openbaar bedoeld. De **secret / service_role key** nooit in de site, de repo of een chat. |
| Schema | `_supabase/schema.sql` gedraaid in de SQL Editor 👤, rechten gecontroleerd ✅. Mag opnieuw gedraaid worden na wijzigingen. |

### Authentication

| Instelling | Waarde |
| --- | --- |
| Inloggen | e-mail met code (OTP), geen wachtwoord. Inschrijven maakt de login aan, inloggen niet. |
| SMTP | 👤 custom SMTP aan: host `smtp.resend.com`, poort `465`, gebruiker `resend`, wachtwoord = Resend API-sleutel, afzender `noreply@lastscoutstanding.com`, naam `Reünie Scouting Brandevoort` |
| Mailtemplates | 👤 "Magic Link" en "Confirm signup" bevatten `{{ .Token }}` (de code van 6 cijfers), geen link. Getest door Bas: werkt. |
| Rate limit mails | 100 per uur (was standaard 30): Authentication → Rate Limits. Let op: Resend gratis = 100 per dag. |

### Database (zie `_supabase/schema.sql`)

| Onderdeel | Wat het doet |
| --- | --- |
| tabel `deelnemers` | één rij per persoon, gekoppeld aan de login; alleen eigen rij lezen/wijzigen/verwijderen (row level security). Comité leest alle rijen. Kolom `betaald_op`: datum waarop het comité de betaling zag, alleen te wijzigen door het comité. Kolom `erbij` (`ja`/`misschien`/`nee`) met `erbij_sinds`: de deelnemer en het comité passen hem aan |
| tabel `beheerders` | comité: `email`, `rol` (`beheerder` of `hoofdbeheerder`), `toegevoegd_door`, `toegevoegd_op`. Niet direct leesbaar via de site. Gewone beheerders voegt een hoofdbeheerder toe op Beheer → Comité. Hoofdbeheerders alleen in de SQL Editor: `insert into public.beheerders (email, rol) values ('naam@example.com', 'hoofdbeheerder') on conflict (email) do update set rol = 'hoofdbeheerder';` |
| tabel `geblokkeerd` | adressen die het comité verwijderde en blokkeerde (`email`, `reden`, `door`, `op`). Zo'n adres krijgt geen code meer bij inschrijven en de trigger weigert een nieuwe rij. Deblokkeren op Beheer → Comité |
| tabel `verhalen` | verhalen bij Herinneringen; alleen eigen verhalen direct leesbaar, de rest via functies. Status `nieuw` → comité plaatst of wijst af; `gemeld` = verborgen na een melding |
| tabel `fotos` + bucket `fotos` (Storage) | foto's bij Herinneringen. Bucket is privé, alleen JPEG tot 1 MB; regels op `storage.objects`: uploaden in je eigen map, bekijken als `foto_zichtbaar()`, verwijderen eigen map of comité. Max. 30 per persoon. Verbruik: Storage in het dashboard, of de tegel op Beheer → Te beoordelen |
| `publieke_deelnemers()` | lijst voor "Wie doen er mee?", verborgen velden zijn leeg; e-mail komt nooit mee (en `erbij` ook niet) |
| `aantal_deelnemers()` | totaal aantal inschrijvingen (ook gebruikt door de keep-alive) |
| `aantal_erbij()` | aantallen ja/misschien/nee voor de tellers op de home en "Wie doen er mee?"; nooit wie |
| `zet_erbij()` | comité: "Erbij?" van iemand anders aanpassen (pagina Beheer) |
| `verwijder_mij()` | uitschrijven: wist login en inschrijving (alleen ingelogd) |
| `zet_betaald()` | comité: betaling afvinken of terugzetten (pagina Beheer) |
| `is_beheerder()` | bepaalt of iemand de pagina Beheer en de link in het menu krijgt |
| `mijn_rol()`, `is_hoofdbeheerder()` | rol van wie ingelogd is; hoofdbeheerders zien op Beheer → Comité de knoppen toevoegen/weghalen |
| `comite()`, `comite_toevoegen()`, `comite_weghalen()` | comitélijst (alleen comité) en gewone beheerders toevoegen/weghalen (alleen hoofdbeheerders) |
| `verwijder_deelnemer()` | comité: inschrijving + login wissen, eventueel adres blokkeren. Niet voor jezelf; comité-adressen niet blokkeren |
| `geblokkeerde()`, `deblokkeer()`, `is_geblokkeerd_adres()` | lijst en deblokkeren (comité); de laatste gebruikt het inschrijfformulier en verraadt alleen óf een adres geblokkeerd is |
| `verhalen_lijst()`, `aantal_verhalen()`, `mag_verhalen()`, `meld_verhaal()` | Herinneringen: geplaatste + eigen verhalen voor deelnemers, aantal voor bezoekers, melden |
| `te_beoordelen()`, `beoordeel_verhaal()` | comité: tabblad Te beoordelen (plaatsen, afwijzen, aanpassen, verwijderen) |
| `fotos_lijst()`, `aantal_fotos()`, `meld_foto()`, `fotos_te_beoordelen()`, `beoordeel_foto()`, `foto_opslag()`, `fotos_van()` | foto's: lijst voor deelnemers, aantal, melden, beoordelen (plaatsen/wissen), opslaggebruik, opruimen bij verwijderen |
| `is_comite_adres()` | inlogpagina: een comitélid zonder inschrijving krijgt toch een code (de login wordt dan aangemaakt). Verraadt alleen óf een adres in het comité zit |
| tabel `gezien` + `mijn_gezien()`, `zet_gezien()`, `nieuw_voor_mij()` | comité: wat iemand in Overleg en Te beoordelen al gezien heeft, voor de gele bolletjes (op elk apparaat). Geen directe toegang. `fotos.bijgewerkt` = wanneer een foto binnenkwam of gemeld werd |
| trigger `deelnemers_stempel` | vult e-mail en datums zelf in (ook `erbij_sinds` bij een andere keuze); een deelnemer kan `betaald_op` niet zelf veranderen. Wijzigingen in de Table Editor of SQL Editor laat hij met rust |

### Let op bij het gratis abonnement

- Een project **pauzeert na een week zonder activiteit**. De site werkt dan niet tot het project in het dashboard weer wordt aangezet. Daarom vraagt een GitHub Action (`.github/workflows/supabase-keep-alive.yml`) elke 3 dagen het aantal inschrijvingen op. Controleren: GitHub → repo → Actions → "Supabase keep-alive" (groene vinkjes). Met "Run workflow" kun je hem met de hand starten. Let op: GitHub zet geplande workflows uit als er 60 dagen niets in de repo is veranderd; dan staat er een melding bij de workflow en zet je hem daar weer aan.
- Geen backups: af en toe zelf een export maken (Table Editor → `deelnemers` → Export CSV).

---

## Website (code in de repo)

| Wat | Waar |
| --- | --- |
| Reüniesite | `reunie25/`; de root `index.html` stuurt door naar `reunie25/` |
| Koppeling met Supabase | alleen `reunie25/data.js`. `SUPABASE_KEY` leeg maken = terug naar demomodus (alles in de browser, code `123456`) |
| Inhoud die je zelf bijhoudt | `reunie25/programma.txt`, `reunie25/vragen.txt`, `reunie25/speltakken.txt`, `reunie25/betalen.txt` (uitleg bovenin elk bestand) |
| Betalen | `reunie25/betalen.txt`: bedrag, betaallink, IBAN. Leeg = geen betaalblok. Verlopen link: nieuwe erin zetten. Het comité vinkt betalingen af op `beheer.html` |
| Beheer | `reunie25/beheer.html`: tabblad Inschrijvingen (zoeken, filter incl. "Nieuw deze week", details, verwijderen/blokkeren, CSV, adressen kopiëren, betaald afvinken) en tabblad Comité (`#comite`: lijst, toevoegen/weghalen, geblokkeerde adressen, "Wie mag wat?"). Alleen voor adressen in `beheerders` |
| Privacyverklaring | `reunie25/privacy.html`: contact Reüniecomité, Blokhut de Brandnetel, Brandevoort 13-A, 5706 KA Helmond, reunie@scoutingbrandevoort.nl |
| Lokaal testen | in de repo: `python3 -m http.server 8000`, dan `http://localhost:8000/reunie25/` (let op: praat met de echte database) |
| Projectcontext voor Claude | `.claude/CLAUDE.md` |

---

## Terugkerende taken en deadlines

- [x] Rate limit mails in Supabase opgehoogd naar 100 per uur.
- [ ] Aankondiging eventueel spreiden vanwege max. 100 mails per dag bij Resend.
- [ ] Overige comité-adressen toevoegen via Beheer → Comité (Bas staat erin).
- [ ] Bij het wissen na de reünie ook de tabellen `beheerders`, `geblokkeerd`, `verhalen` en `fotos` leegmaken, en de bucket `fotos` legen (Storage → fotos → alles selecteren → Delete).
- [ ] Opslag van de foto's in de gaten houden (gratis: 1 GB).
- [ ] GitHub-token vernieuwen vóór ongeveer 30 december 2026.
- [x] Keep-alive tegen het pauzeren van Supabase (GitHub Action, 20 nov 2026).
- [ ] Na het wissen (augustus 2027) de keep-alive-workflow weghalen.
- [ ] Af en toe een CSV-export van `deelnemers` bewaren.
- [ ] **Uiterlijk 23 augustus 2027 alle gegevens wissen** (belofte in de privacyverklaring): in Supabase de tabel `deelnemers` leegmaken en onder Authentication → Users alle gebruikers verwijderen. Daarna de site aanpassen (inschrijven dicht).

---

## Wijzigingen

| Datum | Wat |
| --- | --- |
| 16 nov 2026 | Repo hernoemd naar lastscoutstanding.com; token uitgebreid naar deze repo |
| 17 nov 2026 | Reüniesite in `reunie25/` live in demomodus; root stuurt door |
| 18 nov 2026 | Supabase-project (Ierland), schema, Resend + DNS bij Webreus, SMTP en templates; site live gekoppeld; privacyverklaring af |
| 19 nov 2026 | Kolommen `bijnaam` en `toon_bijnaam`; `publieke_deelnemers()` geeft ook de bijnaam. Schema opnieuw gedraaid vóór de push |
| 19 nov 2026 | Pagina Beheer, kolom `betaald_op`, functie `zet_betaald()`, aangepaste trigger; betaalblok via `betalen.txt`. Schema opnieuw gedraaid, Bas toegevoegd aan `beheerders` ✅ |
| 19 nov 2026 | Rollen beheerder/hoofdbeheerder, tabblad Comité op Beheer, comitéleden kunnen inloggen zonder inschrijving. Schema opnieuw gedraaid, Bas hoofdbeheerder ✅ |
| 19 nov 2026 | Opslagregel "fotos bekijken" aangepast: eigen map en comité mogen altijd selecteren, anders bleven bestanden van verwijderde foto's achter. Schema gedraaid, achtergebleven bestanden opgeruimd ✅ |
| 19 nov 2026 | Foto's bij Herinneringen: bucket `fotos`, tabel `fotos`, beoordelen op Beheer, privacyverklaring aangevuld. Schema opnieuw gedraaid ✅ |
| 19 nov 2026 | Herinneringen met verhalen, tabblad Te beoordelen op Beheer, tabel `verhalen`, privacyverklaring aangevuld. Schema opnieuw gedraaid ✅ |
| 19 nov 2026 | Verwijderen en blokkeren op Beheer, tabel `geblokkeerd`, label "nieuw". Geen goedkeuring vooraf (besloten na mockup). Schema opnieuw gedraaid ✅ |
| 22 nov 2026 | Vraag "Ben je erbij?" (ja/misschien/nee): kolommen `erbij` en `erbij_sinds`, functies `aantal_erbij()` en `zet_erbij()`, aangepaste trigger; privacyverklaring aangevuld. Schema opnieuw gedraaid ✅ |
| 22 nov 2026 | Bolletjes voor het comité = "nieuw sinds je laatst keek": tabel `gezien`, functies `mijn_gezien()`, `zet_gezien()`, `nieuw_voor_mij()`, kolom `fotos.bijgewerkt`; privacyverklaring aangevuld. Schema opnieuw gedraaid ✅ |
| 22 nov 2026 | Oude speltaknamen ("Heette toen"): `takken` kan per speltak een `naam` hebben, max. 30 tekens (functie `takken_namen_ok()`, constraint `takken_namen_kort`). Schema opnieuw gedraaid ✅ |
