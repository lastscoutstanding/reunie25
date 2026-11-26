# Stappenplan reunie.scoutingbrandevoort.nl

20 november 2026 · Bas · herschreven op 22 november 2026 naar een parallelle aanpak met een testadres.

De reüniesite verhuist van `lastscoutstanding.com/reunie25/` naar deze repo `lastscoutstanding/reunie25`, en wordt uiteindelijk bereikbaar als https://reunie.scoutingbrandevoort.nl. De nieuwe site draait eerst naast de oude op het testadres `reunie.lastscoutstanding.com` (DNS in eigen beheer, bij Webreus). Zo is alles getest voordat de scouting iets hoeft te doen.

## Belangrijk om te weten

- **Eén eigen domein per repo.** GitHub Pages kiest de repo aan de hand van de hostnaam, en een repo heeft maar één eigen domein. Op de dag van de overstap zet je dus in de repo het domein om van het testadres naar `reunie.scoutingbrandevoort.nl`. Alleen de DNS omzetten is niet genoeg, en het scouting-domein laten doorwijzen naar het testadres werkt niet (dan geeft GitHub een 404).
- **Dezelfde database.** Oude site, testadres en straks het echte adres praten allemaal met dezelfde Supabase. Alles wat je op het testadres doet, is echt en kost mails bij Resend.
- **Opnieuw inloggen.** De inlogsessie zit in de browser, per adres. Na elke adreswissel log je één keer opnieuw in; gegevens blijven gewoon bewaard.
- **Code op één plek wijzigen.** Tot de overstap draait de live site vanuit `lastscoutstanding.com`. Siteveranderingen doe je daar en haal je hier binnen:

  ```bash
  cd ~/Websites/lastscoutstanding.com
  git pull
  git subtree split --prefix=reunie25 -b reunie25-split
  cd ~/Websites/reunie25
  git pull ../lastscoutstanding.com reunie25-split
  ```

## Fase 1: parallel opzetten (22 november 2026)

- [x] Repo `lastscoutstanding/reunie25` aangemaakt (public); `reunie25/` met de geschiedenis afgesplitst naar de root, plus `_docs`, `_supabase`, `.claude`, `.github`, `.gitignore`.
- [x] Push-token dekt de nieuwe repo (Contents + Workflows).
- [x] GitHub Pages aan (`main`, root); eigen domein `reunie.lastscoutstanding.com` (GitHub zette zelf het bestand `CNAME`).
- [x] Webreus: CNAME `reunie` → `lastscoutstanding.github.io.`
- [x] Gecontroleerd: site, txt-bestanden en `reunie.ics` laden op het testadres, gegevens uit Supabase verschijnen, `_docs` en `.claude` geven 404, `lastscoutstanding.github.io/reunie25/` stuurt door naar het testadres.
- [x] *Enforce HTTPS* aan; `http://` stuurt door naar `https://` (gecontroleerd 22 november 2026).
- [x] "Supabase keep-alive" met de hand gestart: geslaagd (22 november 2026). Tot de overstap draait hij in beide repo's; dat kan geen kwaad.
- [x] Inloggen op het testadres als deelnemer en als comitélid werkt (getest door Bas, 23 november 2026). Inschrijven/uitschrijven met een testadres en de telefoon nog niet apart getest.

## Fase 2: DNS bij de scouting (kan ruim van tevoren)

**Status 26 november 2026:** beide records staan bij Threvon (gecontroleerd met `dig`, ook rechtstreeks bij `ns01.threvon.nl`). Nog nagaan: staat het domein onder je profiel → Settings → Pages op *Verified*?

Zoek uit wie de DNS van scoutingbrandevoort.nl beheert. De DNS staat bij **Threvon** (nameservers `ns01`–`ns03.threvon.nl`, `ns04.threvon.eu`), waarschijnlijk de hostingpartij van de WordPress-site; wie daar een account heeft, kan de records zetten.

Nagekeken met `dig` (23 november 2026):

- **Geen CAA-record** op `scoutingbrandevoort.nl` of `reunie`: elke certificaatuitgever mag, dus Let's Encrypt (dat GitHub gebruikt) ook. Na de CNAME gelden de CAA-records van `github.io`, en daar staat Let's Encrypt in. Komt er later toch een CAA-record bij, dan moet daar `0 issue "letsencrypt.org"` naast staan, anders blijft *Enforce HTTPS* grijs.
- **Wildcard:** elk subdomein, ook `reunie`, wijst nu naar `85.10.155.74` (hetzelfde als de WordPress-site). Een expliciet CNAME-record voor `reunie` gaat voor de wildcard; er hoeft niets weg.

1. GitHub → je profiel → Settings → Pages → *Add a domain* → `reunie.scoutingbrandevoort.nl`. GitHub toont een TXT-record met een code; laat die pagina open.
2. Stuur de DNS-beheerder deze twee records:

| Type | Naam | Waarde | TTL |
| --- | --- | --- | --- |
| CNAME | `reunie` | `lastscoutstanding.github.io.` | 3600 |
| TXT | `_github-pages-challenge-lastscoutstanding.reunie` | de code van GitHub | 3600 |

Voorbeeldbericht:

> Voor de reüniesite wil ik graag het adres reunie.scoutingbrandevoort.nl gebruiken. De site staat op GitHub Pages; aan de WordPress-site verandert niets. Kun je deze twee DNS-records toevoegen? [records hierboven]. De bestaande wildcard en de andere records kunnen gewoon blijven staan. Na de reünie (uiterlijk augustus 2027) vraag ik je de records weer weg te halen.

3. Zodra de records staan: op dezelfde GitHub-pagina *Verify*.

Tot de overstap geeft `reunie.scoutingbrandevoort.nl` een 404 van GitHub. Dat is onschuldig: door de verificatie kan geen ander account het adres gebruiken.

## Fase 3: voorbereiden (Claude, op een aparte tak)

Klaarzetten zodat de overstap zelf alleen nog pushen is:

- In deze repo: `reunie.ics` (`DESCRIPTION` en `URL`) naar `https://reunie.scoutingbrandevoort.nl/`. Het agendabestand is de enige plek met het volledige adres. Niet eerder pushen, anders wijst de agendalink naar een adres dat nog niet werkt.
- In `lastscoutstanding.com`: de doorstuurpagina's (zie fase 4, stap 4), root-`index.html` naar het nieuwe adres, keep-alive-workflow weg, `CLAUDE.md` bijgewerkt.
- Vlak voor de overstap: de laatste wijzigingen uit `lastscoutstanding.com` binnenhalen (zie "Code op één plek wijzigen").

## Fase 4: de overstap (een uur, in één keer)

Voorwaarde: fase 2 is klaar (domein geverifieerd, records staan), het liefst vóór de aankondiging.

1. Laatste wijzigingen binnenhalen en de `reunie.ics`-commit pushen.
2. Repo `reunie25` → Settings → Pages → Custom domain → `reunie.scoutingbrandevoort.nl` → Save. GitHub past het bestand `CNAME` zelf aan: daarna lokaal `git pull`.
3. Wachten tot de DNS-check groen is en het certificaat er is (meestal binnen een uur), dan *Enforce HTTPS*.
4. Pas als HTTPS werkt: in `lastscoutstanding.com` de doorstuurpagina's pushen. Daarvoor blijven in `reunie25/` alleen de elf `.html`-pagina's over (index, inschrijven, inloggen, mijn, deelnemers, herinneringen, programma, vragen, beheer, privacy, over), elk met deze inhoud, die paginanaam, `?speltak=` en `#code` meeneemt:

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

5. Supabase → Authentication → URL Configuration → Site URL: `https://reunie.scoutingbrandevoort.nl` (netjes, niet strikt nodig). Kijk in de mailtemplates *Magic Link* en *Confirm signup* of lastscoutstanding.com erin staat.
6. Webreus: het CNAME-record `reunie` weghalen. Het testadres werkt dan niet meer; het is nergens gedeeld, dus doorsturen is niet nodig.
7. Documentatie bijwerken: `.claude/CLAUDE.md` en `_docs/beheer.md` hier (adres, DNS bij de scouting, wie die beheert), en deze lijst afvinken.

Resend en de afzender noreply@lastscoutstanding.com blijven zoals ze zijn. Een afzender @scoutingbrandevoort.nl kan later, met drie of vier extra DNS-records bij de scouting; niet nodig voor de verhuizing.

## Testlijst

Eerst op het testadres (fase 1), daarna nog eens op het echte adres (fase 4).

- [ ] Opent met slotje, zonder certificaatwaarschuwing; `http://` gaat naar `https://`
- [ ] Logo, favicon en stijl laden; programma, vragen en betaalblok tonen de tekst uit de txt-bestanden
- [ ] Inschrijven met een testadres, code ontvangen, gegevens aanpassen, uitschrijven
- [ ] Inloggen als comitélid, Beheer opent, betaald afvinken werkt
- [ ] Herinneringen: verhalen en foto's laden (foto's via ondertekende links van Supabase)
- [ ] "Zet in je agenda" opent het agendabestand met het juiste adres (pas na fase 4)
- [ ] Op een telefoon: menu veegbaar, inloggen werkt
- [ ] Na fase 4: `lastscoutstanding.com/reunie25/`, `…/deelnemers.html?speltak=Welpen` en `…/inloggen.html#code` komen op de juiste pagina uit
- [ ] Keep-alive groen in `reunie25`, weg in `lastscoutstanding.com`

## Terugdraaien en afbouw in 2027

**Terugdraaien:** tot en met fase 4 stap 3 draait de oude site gewoon door. Na stap 4 zet je met `git revert` de doorstuurpagina's in `lastscoutstanding.com` terug.

**Afbouw na de reünie** (gegevens uiterlijk 23 augustus 2027 gewist):

1. Site in `reunie25` vervangen door een bedankpagina, of Pages uitzetten.
2. De scouting vragen beide DNS-records weg te halen.
3. Het domein onder je profiel → Settings → Pages weghalen.
4. De keep-alive-workflow weghalen en de repo archiveren.
