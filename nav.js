// Header, navigation and footer for every page. Pages have <header id="kop"> and
// <footer id="voet">; load after reunie.js and data.js.
(() => {
  const PAGINAS = [
    ['index.html', 'Home'],
    ['programma.html', 'Programma'],
    ['deelnemers.html', 'Wie komen er?'],
    ['herinneringen.html', 'Herinneringen'],
    ['vragen.html', 'Vragen'],
  ];
  const hier = location.pathname.split('/').pop() || 'index.html';
  const ingelogd = Data.ingelogd();
  // Pages in a row (one swipeable row on phones), plus a button on the right that stays put.
  const links = ingelogd ? PAGINAS : [...PAGINAS, ['inschrijven.html', 'Inschrijven']];
  const [ctaHref, ctaLang, ctaKort] = ingelogd ? ['mijn.html', 'Mijn inschrijving', 'Mijn'] : ['inloggen.html', 'Inloggen', 'Inloggen'];
  const link = (href, tekst, cls = '') =>
    `<a href="${href}" class="${[cls, href === hier ? 'on' : ''].join(' ').trim()}"${href === hier ? ' aria-current="page"' : ''}>${tekst}</a>`;
  const menu = links.map(([href, tekst]) => link(href, tekst)).join('');
  const cta = link(ctaHref, `<span class="lang">${ctaLang}</span><span class="kort">${ctaKort}</span> →`, 'cta');

  const demo = Data.DEMO
    ? `<div class="demo">Testversie: inschrijvingen blijven alleen in deze browser, de inlogcode is ${Data.DEMO_CODE}. Namen van anderen zijn verzonnen.</div>`
    : '';

  $('kop').outerHTML = `${demo}<header class="band"><div class="in">
      <a class="brand" href="index.html"><img src="logo-wit.svg" alt="Logo Scouting Brandevoort">
        <span class="t">25 jaar Scouting Brandevoort<small>Reünie · zondag 23 mei 2027 · de Brandnetel</small></span></a>
    </div></header>
    <div class="strip"><div class="in"><nav aria-label="Menu">${menu}</nav>${cta}</div></div>`;

  // Phones: show the current page and fade an edge while there is more to swipe to that side.
  const nav = document.querySelector('.strip nav');
  const rand = () => {
    nav.classList.toggle('terug', nav.scrollLeft > 4);
    nav.classList.toggle('meer', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
  };
  const opDeHuidige = () => {
    const on = nav.querySelector('a.on');
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - nav.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
    rand();
  };
  nav.addEventListener('scroll', rand, { passive: true });
  addEventListener('resize', rand);
  opDeHuidige();

  // Comité members get a "Beheer" link at the end of the row.
  // The yellow number counts stories and photos waiting for a decision. They also get the
  // overleg buttons (overleg.js), loaded here unless the page loads it itself.
  if (ingelogd) Data.beheerder().then(ja => {
    if (!ja) return;
    nav.insertAdjacentHTML('beforeend', link('beheer.html', 'Beheer<span class="vlag" id="vlag-beheer" hidden></span>'));
    opDeHuidige();
    Data.aantalTeBeoordelen().then(n => {
      const v = $('vlag-beheer');
      if (!v || !n) return;
      v.textContent = n; v.title = `${n} ${n === 1 ? 'ding wacht' : 'dingen wachten'} op beoordeling`; v.hidden = false;
    });
    // Wait until the page's own scripts ran: it may load overleg.js itself.
    const laad = () => {
      if (typeof Overleg !== 'undefined') return;
      const s = document.createElement('script');
      s.src = 'overleg.js';
      document.body.appendChild(s);
    };
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', laad) : laad();
  });

  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/svg+xml'; icon.href = 'logo.svg';
  document.head.appendChild(icon);

  $('voet').innerHTML = `Reünie 25 jaar Scouting Brandevoort · zondag 23 mei 2027 · blokhut de Brandnetel, Helmond<br>
    <a href="privacy.html">Privacy</a> · <a href="over.html">Over deze site</a> · geen cookies, geen tracking · Scobra, sinds 2001`;
})();
