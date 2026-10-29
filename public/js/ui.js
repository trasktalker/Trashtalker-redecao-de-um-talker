// Shared accessibility enhancements; existing copy and form handlers are retained.
var ICONE_SENHA_VISIVEL =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
var ICONE_SENHA_OCULTA =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

function wirePasswordVisibility(scope) {
  (scope || document).querySelectorAll('input[type="password"]:not([data-password-toggle])').forEach(function (input) {
    input.dataset.passwordToggle = "true";

    var wrapper = document.createElement("div");
    wrapper.className = "password-input-wrap";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "password-visibility-toggle";
    button.setAttribute("aria-label", "Mostrar senha");
    button.setAttribute("aria-pressed", "false");
    button.title = "Mostrar senha";
    button.innerHTML = ICONE_SENHA_VISIVEL;
    button.addEventListener("click", function () {
      var visivel = input.type === "text";
      input.type = visivel ? "password" : "text";
      var label = visivel ? "Mostrar senha" : "Ocultar senha";
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(!visivel));
      button.title = label;
      button.innerHTML = visivel ? ICONE_SENHA_VISIVEL : ICONE_SENHA_OCULTA;
      input.focus({ preventScroll: true });
    });
    wrapper.appendChild(button);
  });
}

// As ferramentas "Ensaiar conversa"/"Levar para a vida real" (antigo
// js/socializacao.js) foram removidas, mas guardavam rascunhos e notas no
// navegador sob o prefixo "tt-social:". Sem interface para ver ou apagar,
// esses dados não servem mais pra nada - são apagados aqui (minimização de
// dados). Ver a Política de Cookies.
(function apagarDadosDasFerramentasRemovidas() {
  [window.localStorage, window.sessionStorage].forEach(function (store) {
    try {
      Object.keys(store).filter(function (k) { return k.indexOf("tt-social:") === 0; })
        .forEach(function (k) { store.removeItem(k); });
    } catch (_) {}
  });
})();

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll('button svg, a svg').forEach(function (icon) { icon.setAttribute('aria-hidden', 'true'); });
  document.querySelectorAll('input[type="email"]').forEach(function (input) { input.spellcheck = false; });
  document.querySelectorAll("button[title]").forEach(function (button) {
    if (!button.hasAttribute("aria-label")) {
      button.setAttribute("aria-label", button.title);
    }
  });
  document.querySelectorAll(".field").forEach(function (field, index) {
    var input = field.querySelector("input:not([type=hidden]), textarea");
    var hint = field.querySelector(".field-hint");
    if (input && hint) {
      hint.id = hint.id || "field-hint-" + index;
      input.setAttribute("aria-describedby", hint.id);
    }
  });
  document.querySelectorAll(".banner-error, .field-error").forEach(function (el) {
    el.setAttribute("role", "alert");
  });
  document.querySelectorAll(".banner-success").forEach(function (el) {
    el.setAttribute("role", "status");
  });
  document.querySelectorAll('.sidebar a[href]').forEach(function (link) {
    if (link.getAttribute("href") === window.location.pathname) {
      link.setAttribute("aria-current", "page");
    }
  });
  document.querySelectorAll('input[type="email"]').forEach(function (input) {
    input.autocomplete = "email";
  });
  document.querySelectorAll('.auth-card input[type="password"]').forEach(function (input) {
    input.autocomplete = location.pathname === "/login" ? "current-password" : "new-password";
  });
  wirePasswordVisibility(document);
  showCookieNotice();
  iniciarTooltips();
});

// Aviso INFORMATIVO de cookies (detalhes em /cookies). O app só guarda o
// essencial - o cookie de login e preferências no navegador -, que não
// depende de consentimento (LGPD; diretiva ePrivacy). Por isso não há
// "Aceitar/Recusar": um "Recusar" que não recusa nada seria enganoso.
var COOKIE_NOTICE_KEY = "tt-cookie-notice";
function showCookieNotice() {
  try { if (localStorage.getItem(COOKIE_NOTICE_KEY) === "1") return; } catch (_) {}
  var notice = document.createElement("div");
  notice.className = "cookie-notice";
  notice.setAttribute("role", "region");
  notice.setAttribute("aria-label", "Aviso sobre cookies");
  var text = document.createElement("p");
  text.textContent = "Usamos só o essencial: um cookie para manter você conectado e o " +
    "armazenamento do navegador para suas preferências. Sem rastreamento e sem anúncios. ";
  var link = document.createElement("a");
  link.href = "/cookies";
  link.textContent = "Política de Cookies";
  text.appendChild(link);
  var ok = document.createElement("button");
  ok.type = "button";
  ok.className = "btn-outline";
  ok.textContent = "Entendi";
  ok.addEventListener("click", function () {
    try { localStorage.setItem(COOKIE_NOTICE_KEY, "1"); } catch (_) {}
    notice.remove();
  });
  notice.append(text, ok);
  document.body.appendChild(notice);
}


// Explicit lifecycle events; payloads come from API responses, never DOM text.
window.TTState = { user: null, chat: null, generating: false };
function emitTT(name, detail) {
  if (name === 'user') TTState.user = detail;
  if (name === 'chat' || name === 'response') TTState.chat = detail.chat;
  if (name === 'generating') TTState.generating = detail;
  if (name === 'logout') TTState = { user: null, chat: null, generating: false };
  document.dispatchEvent(new CustomEvent('tt:' + name, { detail: detail }));
  return detail;
}
function showUIMessage(message, anchor, isError) {
  var host = typeof anchor === 'string' ? document.querySelector(anchor) : anchor;
  // Um seletor com vírgula devolve o primeiro elemento na ORDEM DO DOCUMENTO,
  // e <main class="app-content"> envolve o .chat-composer - o aviso ia parar
  // no fim do <main>, fora da tela. Por isso testa um por vez, na ordem de
  // preferência.
  ['.chat-composer', '.welcome-screen', '.app-content', 'main'].forEach(function (selector) {
    host = host || document.querySelector(selector);
  });
  if (!host) return;
  var status = host.querySelector(':scope > .ui-message');
  if (!status) {
    status = document.createElement('div');
    status.className = 'ui-message';
    host.appendChild(status);
  }
  status.setAttribute('role', isError === false ? 'status' : 'alert');
  status.textContent = (isError === false ? '' : 'Aviso: ') + message;
  return status;
}

// --------------------------------------------------------------------------
// Tooltips
// --------------------------------------------------------------------------
// Todo `title` do app vira uma bolha própria (.ui-tooltip), no mesmo visual
// da bolha da voz (voice.js) e com as cores do tema - o tooltip nativo do
// navegador não segue o tema nem dá pra estilizar. O texto sai do `title`
// (que é removido, senão o nativo aparece junto) e vai para data-tooltip.
// Quem já escreve `el.title = ...` continua igual: um MutationObserver
// converte na hora, inclusive em elementos criados depois.

var MARGEM_BOLHA = 8; // distância mínima das bordas da tela e do alvo

/**
 * Coloca a bolha `el` acima de `ancora`, centralizada nela; sem espaço em
 * cima, vai para baixo (.is-below vira a setinha). Nunca sai da tela: se for
 * empurrada para dentro, a setinha (--seta-x) continua apontando o alvo.
 * Usada pelos tooltips e pela bolha da voz.
 */
function posicionarBolha(el, ancora) {
  var alvo = ancora.getBoundingClientRect();
  var largura = el.offsetWidth;
  var altura = el.offsetHeight;
  var centro = alvo.left + alvo.width / 2;

  var esquerda = centro - largura / 2;
  esquerda = Math.max(MARGEM_BOLHA, Math.min(esquerda, window.innerWidth - largura - MARGEM_BOLHA));
  var abaixo = alvo.top - altura - MARGEM_BOLHA < MARGEM_BOLHA;
  var seta = Math.max(10, Math.min(centro - esquerda, largura - 10));

  el.classList.toggle("is-below", abaixo);
  el.style.left = Math.round(esquerda) + "px";
  el.style.top = Math.round(abaixo ? alvo.bottom + MARGEM_BOLHA : alvo.top - altura - MARGEM_BOLHA) + "px";
  el.style.setProperty("--seta-x", Math.round(seta) + "px");
}

// Um só elemento, reaproveitado. `alvo` é o elemento com o tooltip aberto
// (ou esperando o atraso do hover para abrir).
var tooltip = { el: null, alvo: null, espera: null };

function guardarTitulo(el) {
  var texto = el.getAttribute("title");
  if (texto === null) return;
  el.removeAttribute("title");
  if (!texto.trim()) {
    delete el.dataset.tooltip;
    return;
  }
  el.dataset.tooltip = texto;
  // O `title` também servia de nome acessível para botões só com ícone.
  if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !el.textContent.trim()) {
    el.setAttribute("aria-label", texto);
  }
  if (tooltip.alvo === el && tooltip.el && !tooltip.el.hidden) {
    tooltip.el.textContent = texto;
    posicionarBolha(tooltip.el, el);
  }
}

function mostrarTooltip(alvo) {
  if (!alvo.isConnected || alvo.hasAttribute("data-tooltip-off") || !alvo.dataset.tooltip) {
    esconderTooltip();
    return;
  }
  if (!tooltip.el) {
    tooltip.el = document.createElement("div");
    tooltip.el.className = "ui-tooltip";
    tooltip.el.setAttribute("role", "tooltip");
    tooltip.el.hidden = true;
    document.body.appendChild(tooltip.el);
  }
  tooltip.alvo = alvo;
  tooltip.el.textContent = alvo.dataset.tooltip;
  tooltip.el.hidden = false;
  posicionarBolha(tooltip.el, alvo);
}

function esconderTooltip() {
  clearTimeout(tooltip.espera);
  tooltip.espera = null;
  tooltip.alvo = null;
  if (tooltip.el) tooltip.el.hidden = true;
}

function alvoDoTooltip(evento) {
  return evento.target && evento.target.closest ? evento.target.closest("[data-tooltip]") : null;
}

function iniciarTooltips() {
  document.body.querySelectorAll("[title]").forEach(guardarTitulo);
  new MutationObserver(function (mudancas) {
    mudancas.forEach(function (mudanca) {
      if (mudanca.type === "attributes") {
        guardarTitulo(mudanca.target);
        return;
      }
      mudanca.addedNodes.forEach(function (no) {
        if (no.nodeType !== 1) return;
        guardarTitulo(no);
        no.querySelectorAll("[title]").forEach(guardarTitulo);
      });
    });
    if (tooltip.alvo && !tooltip.alvo.isConnected) esconderTooltip();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

  // Mouse: abre depois de um instante, como o nativo. Toque não tem hover,
  // então não abre (o nativo também não).
  document.addEventListener("pointerover", function (evento) {
    if (evento.pointerType === "touch") return;
    var alvo = alvoDoTooltip(evento);
    if (!alvo || alvo === tooltip.alvo) return;
    esconderTooltip();
    tooltip.alvo = alvo;
    tooltip.espera = setTimeout(function () {
      if (tooltip.alvo === alvo) mostrarTooltip(alvo);
    }, 350);
  });
  document.addEventListener("pointerout", function (evento) {
    if (!tooltip.alvo || !tooltip.alvo.contains(evento.target)) return;
    if (evento.relatedTarget && tooltip.alvo.contains(evento.relatedTarget)) return;
    esconderTooltip();
  });

  // Teclado: abre na hora, só com foco visível (clique com o mouse não).
  document.addEventListener("focusin", function (evento) {
    var alvo = alvoDoTooltip(evento);
    if (!alvo) return;
    var focoVisivel = false;
    try { focoVisivel = evento.target.matches(":focus-visible"); } catch (_) {}
    if (!focoVisivel) return;
    esconderTooltip();
    mostrarTooltip(alvo);
  });
  document.addEventListener("focusout", function (evento) {
    if (tooltip.alvo && tooltip.alvo.contains(evento.target)) esconderTooltip();
  });

  document.addEventListener("pointerdown", esconderTooltip);
  document.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape" && tooltip.alvo) esconderTooltip();
  });
  document.addEventListener("scroll", esconderTooltip, true);
  window.addEventListener("resize", esconderTooltip);
}
