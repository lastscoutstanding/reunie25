// Header, navigation and footer for every page. Pages have <header id="kop"> and
// <footer id="voet">; load after reunie.js and data.js.
(() => {
  // TODO: replace with a local copy (or SVG) of the logo once we have one.
  const LOGO = 'https://scoutingbrandevoort.nl/wp-content/uploads/2016/11/sc_brandevoort_logotranskl1.png';
  const PAGINAS = [
    ['index.html', 'Home'],
    ['programma.html', 'Programma'],
    ['deelnemers.html', 'Wie komen er?'],
    ['vragen.html', 'Vragen'],
  ];
  const hier = location.pathname.split('/').pop() || 'index.html';
  const ingelogd = Data.ingelogd();
  const extra = ingelogd
    ? ['mijn.html', 'Mijn inschrijving', 'login']
    : ['inschrijven.html', 'Inschrijven', ''];
  const links = [...PAGINAS, extra, ...(ingelogd ? [] : [['inloggen.html', 'Inloggen', 'login']])]
    .map(([href, tekst, cls = '']) =>
      `<a href="${href}" class="${[cls, href === hier ? 'on' : ''].join(' ').trim()}">${tekst}</a>`).join('');

  const demo = Data.DEMO
    ? `<div class="demo">Testversie: inschrijvingen blijven alleen in deze browser, de inlogcode is ${Data.DEMO_CODE}. Namen van anderen zijn verzonnen.</div>`
    : '';

  $('kop').outerHTML = `${demo}<header><div class="bar">
      <a class="logo" href="index.html"><img src="${LOGO}" alt="Logo Scouting Brandevoort"> Scouting Brandevoort <b>25</b></a>
      <nav>${links}</nav>
    </div></header>`;

  $('voet').innerHTML = `Reünie 25 jaar Scouting Brandevoort · zondag 23 mei 2027 · blokhut de Brandnetel, Helmond<br>
    <a href="privacy.html">Privacy</a> · geen cookies, geen tracking · Scobra, sinds 2001`;
})();
