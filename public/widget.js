/**
 * Wilma-Widget zum Einbinden auf einer beliebigen Seite (WordPress & Co.):
 *
 *   <script src="https://IHRE-APP.vercel.app/widget.js" defer></script>
 *
 * Das Skript hängt ein iframe mit `/embed` unten rechts in die Seite und
 * schneidet es auf das zu, was gerade zu sehen ist. Das ist der Kern der
 * Sache: Ein iframe fängt Klicks auf seiner gesamten Fläche ab, auch auf
 * durchsichtigen Stellen. Wäre es dauerhaft so groß wie das geöffnete
 * Fenster, ließe sich die Ecke der Gastgeberseite nie mehr benutzen. Die
 * Maße meldet das Widget selbst nach oben (siehe src/lib/embedFrame.ts).
 *
 * Bewusst in altem JavaScript geschrieben, ohne Abhängigkeiten – es soll
 * auch durch betagte Minimierer von WordPress-Plugins unbeschadet
 * hindurchkommen.
 */
(function () {
  "use strict";

  if (window.__wilmaWidget) return;
  window.__wilmaWidget = true;

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      return all[all.length - 1];
    })();

  if (!script) return;

  /* Die Adresse der App steht im src des Skripts selbst – es muss also
     niemand eine URL doppelt pflegen. Zerlegt wird sie über ein
     Anker-Element, das ist der Weg, den jeder Browser kennt. */
  var appOrigin = script.getAttribute("data-app");
  if (!appOrigin) {
    var parser = document.createElement("a");
    parser.href = script.src;
    appOrigin = parser.protocol + "//" + parser.host;
  }

  /* Maße des geschlossenen Zustands, bis das Widget seine eigenen meldet.
     Die Blase ist jetzt responsiv (9,8rem mobil, 16,8rem auf dem Desktop) –
     hier reicht die größere Desktop-Annahme (269 px) samt Abstand nach
     unten (32 px) und etwas Schlagschatten-Luft (16 px); auf dem Handy
     korrigiert die echte Meldung das sofort nach unten. */
  var INITIAL_SIZE = 320;

  /* Obergrenzen des geöffneten Fensters. Sie entsprechen dem, was das
     Widget selbst höchstens einnimmt: 23rem Panel plus Abstände, 34rem
     Panelhöhe plus Blase (7rem) darunter. */
  var OPEN_MAX_WIDTH = 400;
  var OPEN_MAX_HEIGHT = 700;

  /* Darunter lohnt sich kein Ausschnitt mehr – auf dem Telefon legt sich
     das Fenster über die ganze Seite, sonst wird es unbedienbar eng. */
  var FULLSCREEN_BELOW_WIDTH = 480;
  var FULLSCREEN_BELOW_HEIGHT = 560;

  /* Fürs Dashboard: Ohne diese Angaben wüsste die Auswertung nur, dass
     irgendwo ein /embed geladen wurde – nicht, auf wessen Seite und wo
     darauf. `data-client` ist optional; fehlt es, ordnet der Server anhand
     der Domain zu. */
  var params =
    "parentOrigin=" +
    encodeURIComponent(window.location.origin) +
    "&page=" +
    encodeURIComponent(window.location.href.slice(0, 400));

  var clientId = script.getAttribute("data-client");
  if (clientId) {
    params += "&client=" + encodeURIComponent(clientId);
  }

  if (document.referrer) {
    params += "&ref=" + encodeURIComponent(document.referrer.slice(0, 300));
  }

  var iframe = document.createElement("iframe");
  iframe.title = "Wilma, die digitale Büroassistentin";
  iframe.src = appOrigin + "/embed?" + params;
  /* Ohne diese Freigabe bekommt das iframe weder Mikrofon noch Ton – der
     Sprachmodus und die Diktierfunktion wären damit tot. */
  iframe.allow = "microphone; autoplay; clipboard-write";
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("frameborder", "0");

  var style = iframe.style;
  style.position = "fixed";
  style.right = "0";
  style.bottom = "0";
  style.width = INITIAL_SIZE + "px";
  style.height = INITIAL_SIZE + "px";
  style.border = "0";
  style.margin = "0";
  style.padding = "0";
  style.maxWidth = "100vw";
  style.maxHeight = "100vh";
  style.background = "transparent";
  style.colorScheme = "normal";
  /* Über allem, was WordPress-Themes üblicherweise aufbieten (Sticky-Menüs,
     Cookie-Banner liegen meist bei 999999). */
  style.zIndex = "2147483000";

  /* Zuletzt gemeldeter Zustand – wird beim Drehen oder Verkleinern des
     Fensters erneut angewandt. */
  var current = { state: "collapsed", width: INITIAL_SIZE, height: INITIAL_SIZE };

  function setBox(width, height) {
    style.width = width;
    style.height = height;
  }

  function isNarrow() {
    return (
      window.innerWidth < FULLSCREEN_BELOW_WIDTH ||
      window.innerHeight < FULLSCREEN_BELOW_HEIGHT
    );
  }

  function apply() {
    if (current.state === "overlay") {
      setBox("100%", "100%");
      return;
    }

    if (current.state === "open") {
      if (isNarrow()) {
        setBox("100%", "100%");
        return;
      }
      setBox(
        Math.min(OPEN_MAX_WIDTH, window.innerWidth - 16) + "px",
        Math.min(OPEN_MAX_HEIGHT, window.innerHeight - 24) + "px"
      );
      return;
    }

    /* Geschlossen: exakt die gemeldeten Maße, damit daneben nichts
       blockiert wird. Trotzdem gedeckelt – auf einem schmalen Telefon
       darf die Sprechblase die Seite nicht überragen. */
    setBox(
      Math.min(current.width, window.innerWidth) + "px",
      Math.min(current.height, window.innerHeight) + "px"
    );
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin) return;
    if (event.source !== iframe.contentWindow) return;

    var data = event.data;
    if (!data || data.source !== "wilma-widget") return;

    if (data.state === "collapsed") {
      current = {
        state: "collapsed",
        width: data.width || INITIAL_SIZE,
        height: data.height || INITIAL_SIZE,
      };
    } else if (data.state === "open" || data.state === "overlay") {
      current = { state: data.state, width: 0, height: 0 };
    } else {
      return;
    }

    apply();
  });

  window.addEventListener("resize", apply);

  function mount() {
    document.body.appendChild(iframe);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();
