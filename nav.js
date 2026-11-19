// Header, navigation and footer for every page. Pages have <header id="kop"> and
// <footer id="voet">; load after reunie.js and data.js.
(() => {
  const PAGINAS = [
    ['index.html', 'Home'],
    ['programma.html', 'Programma'],
    ['deelnemers.html', 'Wie komen er?'],
    ['vragen.html', 'Vragen'],
  ];
  const hier = location.pathname.split('/').pop() || 'index.html';
  const ingelogd = Data.ingelogd();
  // The last link sits on the right as call to action
  const links = ingelogd
    ? [...PAGINAS, ['mijn.html', 'Mijn inschrijving →', 'cta']]
    : [...PAGINAS, ['inschrijven.html', 'Inschrijven'], ['inloggen.html', 'Inloggen →', 'cta']];
  const menu = links.map(([href, tekst, cls = '']) =>
    `<a href="${href}" class="${[cls, href === hier ? 'on' : ''].join(' ').trim()}"${href === hier ? ' aria-current="page"' : ''}>${tekst}</a>`).join('');

  const demo = Data.DEMO
    ? `<div class="demo">Testversie: inschrijvingen blijven alleen in deze browser, de inlogcode is ${Data.DEMO_CODE}. Namen van anderen zijn verzonnen.</div>`
    : '';

  $('kop').outerHTML = `${demo}<header class="band"><div class="in">
      <a class="brand" href="index.html"><img src="logo-wit.svg" alt="Logo Scouting Brandevoort">
        <span class="t">25 jaar Scouting Brandevoort<small>Reünie · zondag 23 mei 2027 · de Brandnetel</small></span></a>
    </div></header>
    <div class="strip"><nav aria-label="Menu">${menu}</nav></div>`;

  // Comité members get a "Beheer" link before the button on the right.
  if (ingelogd) Data.beheerder().then(ja => {
    const cta = document.querySelector('.strip nav a.cta');
    if (!ja || !cta) return;
    const on = hier === 'beheer.html';
    cta.insertAdjacentHTML('beforebegin', `<a href="beheer.html"${on ? ' class="on" aria-current="page"' : ''}>Beheer</a>`);
  });

  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/svg+xml'; icon.href = 'logo.svg';
  document.head.appendChild(icon);

  $('voet').innerHTML = `Reünie 25 jaar Scouting Brandevoort · zondag 23 mei 2027 · blokhut de Brandnetel, Helmond<br>
    <a href="privacy.html">Privacy</a> · geen cookies, geen tracking · Scobra, sinds 2001`;
})();
