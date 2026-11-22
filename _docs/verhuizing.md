# Stappenplan reunie.scoutingbrandevoort.nl

20 november 2026 · Bas · overgenomen uit het gedeelde document [Stappenplan reunie.scoutingbrandevoort.nl](https://claude.ai/artifact/5KGTppUXG2Gic6nMQGdBFJ)

De reüniesite verhuist naar een eigen repo `lastscoutstanding/reunie25` op GitHub Pages, bereikbaar als https://reunie.scoutingbrandevoort.nl. De scouting hoeft één keer twee DNS-records te zetten; daarna werk je precies zoals nu. Reken op een avond werk plus wachten op de DNS-beheerder, en doe het vóór de grote aankondiging.

## Wat verandert er voor het onderhoud

De dagelijkse werkwijze blijft gelijk: aanpassen, committen, pushen, live. Alleen het adres en de repo veranderen.

| Onderdeel | Nu | Na de verhuizing |
| --- | --- | --- |
| Adres | lastscoutstanding.com/reunie25/ | reunie.scoutingbrandevoort.nl |
| Repo | `lastscoutstanding/lastscoutstanding.com`, map `reunie25/` | `lastscoutstanding/reunie25`, site in de root |
| Aanpassen en publiceren | push naar `main` | ongewijzigd |
| Lokaal testen | `http://localhost:8000/reunie25/` | `http://localhost:8000/` |
| Supabase, Resend, betaallink | werkt vanaf elk adres | ongewijzigd |
| Afzender inlogmail | noreply@lastscoutstanding.com | ongewijzigd (optioneel later @scoutingbrandevoort.nl) |
| Nodig van de scouting | niets | eenmalig twee DNS-records, en in 2027 één weghalen |
| Ingelogde bezoekers | blijven ingelogd | moeten na de overstap één keer opnieuw inloggen |
| lastscoutstanding.com | stuurt door naar de reünie | vrij voor iets anders; `/reunie25/` stuurt door naar het nieuwe adres |

## Voorbereiding

Zoek uit wie de DNS van scoutingbrandevoort.nl beheert. Dat is niet per se de WordPress-beheerder: de DNS staat bij de registrar of de hostingpartij van het domein, en is vaak met hetzelfde account te bereiken.

- Vraag of het subdomein `reunie` nog vrij is. Bestaat er al een record voor `reunie`, dan moet dat eerst weg (een CNAME kan niet naast een ander record staan).
- Vraag of er een CAA-record op het domein staat. Zo ja, dan moet Let's Encrypt erin genoemd worden, anders kan GitHub geen certificaat maken.
- Plan de overstap vóór de aankondiging. Wie nu al is ingeschreven, moet daarna één keer opnieuw inloggen; hun gegevens blijven gewoon bewaard.
- Kies een moment waarop je de stappen 5 tot en met 7 achter elkaar kunt doen, zodat het oude adres niet lang dubbel draait.

## Stap 1: nieuwe repo maken en de inhoud verplaatsen

De inhoud van `reunie25/` komt in de root van een nieuwe repo, met de geschiedenis van die map erbij. Omdat de site alleen relatieve paden gebruikt, hoeft er in de code niets te veranderen.

1. Maak op GitHub een nieuwe repo `lastscoutstanding/reunie25`: **public** (nodig voor gratis GitHub Pages), helemaal leeg (geen README, geen licentie).
2. Splits in de bestaande repo de map af, met geschiedenis:

   ```bash
   cd ~/Websites/lastscoutstanding.com
   git pull
   git subtree split --prefix=reunie25 -b reunie25-split
   ```

3. Haal die tak binnen in de nieuwe repo:

   ```bash
   cd ~/Websites
   git clone https://github.com/lastscoutstanding/reunie25.git
   cd reunie25
   git fetch ../lastscoutstanding.com reunie25-split
   git checkout -B main FETCH_HEAD
   ```

4. Neem de bestanden buiten de map mee (geen `CNAME` en geen root-`index.html`: die horen bij lastscoutstanding.com):

   ```bash
   cp -R ../lastscoutstanding.com/{_docs,_supabase,.claude,.github,.gitignore} .
   git add -A
   git commit -m "Beheerdocs, schema, workflow en Claude-instellingen overgenomen"
   git push -u origin main
   ```

Pas in `reunie.ics` de regels `DESCRIPTION` en `URL` aan naar `https://reunie.scoutingbrandevoort.nl/`. Een agendabestand kan geen relatieve link bevatten; het is de enige plek met het volledige adres van de site.

Voeg geen `.nojekyll` toe. Zonder dat bestand publiceert GitHub de mappen met een `_` (`_docs`, `_supabase`) niet, net als nu.

## Stap 2: push-token en Claude Code

1. GitHub → Settings → Developer settings → Fine-grained tokens → het token uit de sleutelhanger → voeg de repo `reunie25` toe, met dezelfde rechten als nu: Contents (lezen en schrijven) en Workflows. Zonder Workflows kun je `.github/workflows/` niet pushen.
2. Open voortaan `~/Websites/reunie25` in Claude Code. Daar staat de meegekopieerde `.claude/CLAUDE.md`; die werk je bij in stap 8.
3. Lokaal testen: `python3 -m http.server 8000` in de repo, dan `http://localhost:8000/` (zonder `/reunie25/`). Let op: dat praat met de echte database.

## Stap 3: GitHub Pages aanzetten en testen

1. Repo `reunie25` → Settings → Pages → Source: *Deploy from a branch*, branch `main`, map `/ (root)` → Save.
2. Na een minuut staat de site op `https://lastscoutstanding.github.io/reunie25/`. Dit adres is tijdelijk; nergens delen.
3. Controleer daar: home met aftelling, inloggen met code, "Wie komen er?", Herinneringen en het betaalblok. Inloggen hier telt als een gewone inlog bij Supabase en kost een mail bij Resend.

## Stap 4: domein verifiëren en het DNS-verzoek

Eerst laat je GitHub een verificatiecode maken. Daarmee kan alleen jouw account het subdomein gebruiken, ook als het CNAME-record later blijft staan.

1. GitHub → je profiel → Settings → Pages → *Add a domain* → `reunie.scoutingbrandevoort.nl`. GitHub toont een TXT-record met een code; laat die pagina open.
2. Stuur de DNS-beheerder deze twee records:

| Type | Naam | Waarde | TTL |
| --- | --- | --- | --- |
| CNAME | `reunie` | `lastscoutstanding.github.io.` | 3600 |
| TXT | `_github-pages-challenge-lastscoutstanding.reunie` | de code van GitHub | 3600 |

De CNAME wijst naar `lastscoutstanding.github.io`, zonder `/reunie25`. GitHub zoekt de juiste repo zelf op aan de hand van het domein.

Voorbeeldbericht:

> Voor de reüniesite wil ik graag het adres reunie.scoutingbrandevoort.nl gebruiken. De site staat op GitHub Pages; aan de WordPress-site verandert niets. Kun je deze twee DNS-records toevoegen? [records hierboven]. Staat er al iets op `reunie`, of een CAA-record op het domein, laat het me dan even weten. Na de reünie (uiterlijk augustus 2027) vraag ik je de records weer weg te halen.

3. Zodra de records staan: op dezelfde GitHub-pagina *Verify*. Dat kan tot een dag duren, meestal minder dan een uur.

## Stap 5: eigen domein en HTTPS instellen

1. Repo `reunie25` → Settings → Pages → Custom domain → `reunie.scoutingbrandevoort.nl` → Save. GitHub zet daarvoor zelf een commit met het bestand `CNAME` in de repo: doe daarna lokaal `git pull`.
2. Wacht tot de DNS-check groen is en het certificaat er is. Meestal binnen een uur; soms tot een dag.
3. Vink *Enforce HTTPS* aan. Kan dat nog niet (grijs), dan is het certificaat nog niet klaar.
4. Vanaf nu stuurt `lastscoutstanding.github.io/reunie25/` vanzelf door naar het nieuwe adres.

## Stap 6: Supabase en mail

De site praat vanaf elk adres met Supabase, en inloggen gaat met een code in plaats van een link. Er hoeft dus weinig te veranderen.

1. Supabase → Authentication → URL Configuration → Site URL: `https://reunie.scoutingbrandevoort.nl`. Dat is netjes, niet strikt nodig.
2. Kijk in de mailtemplates *Magic Link* en *Confirm signup* of er een link of tekst met lastscoutstanding.com in staat; zet daar het nieuwe adres neer.
3. Resend en de SMTP-instellingen blijven zoals ze zijn. De mail komt nog steeds van noreply@lastscoutstanding.com, met de naam "Reünie Scouting Brandevoort".

Wil je later toch een afzender @scoutingbrandevoort.nl, dan moet de scouting nog drie of vier DNS-records voor Resend zetten (DKIM, SPF en een MX op `send`). Dat is een apart verzoek en niet nodig voor de verhuizing.

## Stap 7: oude adres laten doorsturen

GitHub Pages kent geen doorverwijzingen op de server, dus elke oude pagina wordt een klein doorstuurbestand. Pas doen als stap 5 helemaal klaar is (HTTPS groen).

1. In de repo `lastscoutstanding.com`: verwijder alles in `reunie25/` behalve de elf `.html`-pagina's (index, inschrijven, inloggen, mijn, deelnemers, herinneringen, programma, vragen, beheer, privacy, over).
2. Vervang de inhoud van elk van die pagina's door dit bestand. Het neemt de paginanaam, `?speltak=` en `#code` mee:

```html
<!DOCTYPE html>
<meta charset="utf-8">
<title>Reünie 25 jaar Scouting Brandevoort</title>
<link rel="canonical" href="https://reunie.scoutingbrandevoort.nl/">
<meta http-equiv="refresh" content="0; url=https://reunie.scoutingbrandevoort.nl/">
<script>
  location.replace("https://reunie.scoutingbrandevoort.nl" +
    location.pathname.replace(/^\/reunie25/, "") + location.search + location.hash);
</script>
<p><a href="https://reunie.scoutingbrandevoort.nl/">De reünie is verhuisd naar reunie.scoutingbrandevoort.nl</a></p>
```

3. Laat de root-`index.html` direct naar `https://reunie.scoutingbrandevoort.nl/` wijzen, of vervang hem later door iets anders voor lastscoutstanding.com.
4. Commit en push. Claude Code kan stap 1 tot en met 3 in één keer voor je doen.

## Stap 8: keep-alive en documentatie

1. Repo `reunie25` → Actions: sta workflows toe als GitHub erom vraagt, open "Supabase keep-alive" en klik *Run workflow*. Een groen vinkje = in orde.
2. Verwijder `.github/workflows/supabase-keep-alive.yml` uit de repo `lastscoutstanding.com`, zodat er maar één draait.
3. Werk in `reunie25` bij:
   - `.claude/CLAUDE.md`: nieuwe repo en adres, site in de root, lokaal testen op `/`, het token dekt deze repo.
   - `_docs/beheer.md`: nieuwe sectie "DNS bij de scouting" met de twee records, wie ze beheert en hoe je diegene bereikt; GitHub-sectie naar de nieuwe repo; regel in Wijzigingen.
   - `README.md`: kort wat de repo is (lost meteen het open punt over de oude reponaam op).
4. Werk in `lastscoutstanding.com` de `CLAUDE.md` bij: de reünie is verhuisd, `reunie25/` bevat alleen doorstuurpagina's.

## Testlijst na de overstap

- [ ] `https://reunie.scoutingbrandevoort.nl` opent met slotje, zonder certificaatwaarschuwing
- [ ] `http://reunie.scoutingbrandevoort.nl` gaat naar https
- [ ] Logo, favicon en stijl laden; programma, vragen en betaalblok tonen de tekst uit de txt-bestanden
- [ ] Inschrijven met een testadres, code ontvangen, gegevens aanpassen, uitschrijven
- [ ] Inloggen als comitélid, Beheer opent, betaald afvinken werkt
- [ ] Herinneringen: verhalen en foto's laden (foto's gaan via ondertekende links van Supabase)
- [ ] `lastscoutstanding.com/reunie25/` en `lastscoutstanding.com/reunie25/deelnemers.html?speltak=Welpen` komen op de juiste pagina uit
- [ ] `lastscoutstanding.com/reunie25/inloggen.html#code` behoudt `#code`
- [ ] Op een telefoon: menu veegbaar, inloggen werkt
- [ ] Keep-alive in `reunie25` groen, in `lastscoutstanding.com` weg

## Terugdraaien en afbouw in 2027

**Terugdraaien** kan tot en met stap 6 zonder gevolgen: de oude site draait dan nog gewoon. Na stap 7 zet je met `git revert` de doorstuurpagina's in `lastscoutstanding.com` terug; de oude site staat dan weer live.

**Afbouw na de reünie** (gegevens uiterlijk 23 augustus 2027 gewist):

1. Site in `reunie25` vervangen door een bedankpagina, of Pages uitzetten.
2. De scouting vragen beide DNS-records weg te halen. Een CNAME die naar een uitgezette site wijst, kan anders door een ander misbruikt worden; de verificatie uit stap 4 beperkt dat, maar weghalen is netter.
3. Het domein onder je profiel → Settings → Pages weghalen.
4. De keep-alive-workflow weghalen en de repo archiveren.
