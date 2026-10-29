// voice.js
// ========
// Tudo que é voz mora aqui. O resto do app não sabe como isto funciona -
// chat.js só chama initVoiceInput() e addSpeakButton(), e chat.html só
// carrega este arquivo e tem um <div id="voice-controls"> vazio.
//
// Duas metades:
//   - STT (fala -> texto): botão de microfone no campo de mensagem, em
//     push-to-talk, pela Web Speech API do navegador. O texto reconhecido
//     só PREENCHE o campo; quem envia continua sendo a pessoa.
//   - TTS (texto -> fala): botão de alto-falante em cada resposta da IA.
//     Usa só a voz natural do ElevenLabs (POST /api/tts): enquanto ela não
//     chega, um popup avisa e deixa cancelar; se falhar, o popup oferece
//     tentar de novo. Nunca cai na voz robótica do navegador.
//
// Requisitos do navegador:
//   - Contexto seguro: só funciona em HTTPS ou em localhost/127.0.0.1.
//     Servido por IP da rede local (ex.: http://192.168.x.x:5000) o
//     navegador bloqueia o microfone.
//   - SpeechRecognition existe no Chrome/Edge/Safari (com prefixo
//     webkit) e NÃO existe no Firefox. Onde faltar, os botões
//     simplesmente não aparecem e o chat de texto segue igual - é por
//     isso que toda a montagem passa por feature detection.

var VOICE_LANG = "pt-BR";

var ReconhecimentoDeFala =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function temReconhecimento() {
  return typeof ReconhecimentoDeFala === "function";
}

var ICONE_MIC =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="2.5" width="5" height="9" rx="2.5"></rect><path d="M4.8 9.2a5.2 5.2 0 0 0 10.4 0"></path><line x1="10" y1="14.4" x2="10" y2="17.5"></line></svg>';

var ICONE_MIC_PARAR =
  '<svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor"><rect x="5.6" y="5.6" width="8.8" height="8.8" rx="1.6"></rect></svg>';

var ICONE_SOM =
  '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.6h2.6L10 4.6v10.8l-3.4-3H4z"></path><path d="M13 7.4a3.6 3.6 0 0 1 0 5.2"></path></svg>';

var ICONE_SOM_PARAR =
  '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.6h2.6L10 4.6v10.8l-3.4-3H4z"></path><line x1="13" y1="7.6" x2="16.4" y2="12.4"></line><line x1="16.4" y1="7.6" x2="13" y2="12.4"></line></svg>';

// --------------------------------------------------------------------------
// Fala -> texto (STT)
// --------------------------------------------------------------------------

/**
 * Monta o botão de microfone e liga o reconhecimento de fala ao campo de
 * mensagem. Não faz nada (e devolve null) se o navegador não suportar -
 * quem chama não precisa checar.
 *
 * O texto reconhecido é escrito em `inputEl` e NUNCA enviado sozinho: a
 * pessoa revisa e manda como sempre. Se já houver algo digitado, o que
 * for falado é acrescentado no fim em vez de apagar o que estava lá.
 *
 * @param {HTMLTextAreaElement|HTMLInputElement} inputEl - campo de mensagem
 * @param {(texto: string) => void} [onFinalTranscript] - avisado com o
 *   texto final quando o reconhecimento termina (opcional)
 * @returns {HTMLButtonElement|null} o botão criado, ou null se não houver suporte
 */
function initVoiceInput(inputEl, onFinalTranscript) {
  if (!inputEl) return null;
  if (!temReconhecimento()) {
    var unsupported = document.getElementById("voice-label");
    if (unsupported) unsupported.textContent = "Ditado indisponível neste navegador. Você pode digitar.";
    return null;
  }

  var container = document.getElementById("voice-controls");
  if (!container) return null;

  var botao = document.createElement("button");
  // "button" e não "submit": este botão vive dentro do <form> do
  // composer, e um submit aqui mandaria a mensagem sem querer.
  botao.type = "button";
  botao.className = "voice-mic-button";
  botao.innerHTML = ICONE_MIC;
  botao.title = "Falar";
  botao.setAttribute("aria-label", "Ditar mensagem por voz");

  container.appendChild(botao);

  // O CSS só reserva o espaço extra do microfone quando ele realmente
  // existe - sem isso, navegador sem suporte (Firefox) ficaria com um
  // buraco no campo de mensagem.
  var composer = inputEl.closest(".composer");
  if (composer) composer.classList.add("has-voice");

  var reconhecedor = new ReconhecimentoDeFala();
  reconhecedor.lang = VOICE_LANG;
  // continuous = false: o próprio navegador encerra ao detectar silêncio,
  // que é justamente o comportamento de push-to-talk pedido.
  reconhecedor.continuous = false;
  reconhecedor.interimResults = true;
  reconhecedor.maxAlternatives = 1;

  var gravando = false;
  var textoBase = "";
  var textoFinal = "";

  function marcar(ativo) {
    gravando = ativo;
    botao.classList.toggle("is-recording", ativo);
    botao.innerHTML = ativo ? ICONE_MIC_PARAR : ICONE_MIC;
    botao.title = ativo ? "Parar de gravar" : "Falar";
    botao.setAttribute(
      "aria-label",
      ativo ? "Parar de gravar" : "Ditar mensagem por voz",
    );
  }

  // Escreve no campo E dispara o evento "input": sem isso o wireComposer
  // não reavalia nada e a seta de enviar continuaria desabilitada, mesmo
  // com texto na tela.
  function escrever(texto) {
    if (inputEl.disabled || cancelamentoEmAndamento) return;
    inputEl.value = texto;
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  document.addEventListener("tt:generating", function (event) {
    if (event.detail && gravando) { reconhecedor.abort(); marcar(false); }
  });
  reconhecedor.onresult = function (evento) {
    var parcial = "";
    for (var i = evento.resultIndex; i < evento.results.length; i++) {
      var trecho = evento.results[i][0].transcript;
      if (evento.results[i].isFinal) textoFinal += trecho;
      else parcial += trecho;
    }
    escrever(textoBase + textoFinal + parcial);
  };

  reconhecedor.onerror = function (evento) {
    var erro = evento.error;
    // "no-speech" e "aborted" são desfechos normais de push-to-talk (a
    // pessoa desistiu, ou tocou e não falou) - resetar o botão em
    // silêncio, sem alerta, é o comportamento menos irritante.
    if (erro === "no-speech" || erro === "aborted") return;

    var mensagens = {
      "not-allowed":
        "Preciso de permissão para usar o microfone. Libere o acesso nas " +
        "configurações do navegador e tente de novo.",
      "service-not-allowed":
        "O navegador bloqueou o reconhecimento de voz. Isso costuma " +
        "acontecer fora de HTTPS ou localhost.",
      "audio-capture":
        "Não encontrei nenhum microfone disponível neste dispositivo.",
      network:
        "O reconhecimento de voz precisa de internet e a conexão falhou. " +
        "Tente de novo em instantes.",
    };
    showUIMessage(
      mensagens[erro] ||
        "Não consegui te ouvir agora (" + erro + "). Tente de novo.",
    );
  };

  reconhecedor.onend = function () {
    marcar(false);
    if (textoFinal && onFinalTranscript) onFinalTranscript(textoFinal);
  };

  botao.addEventListener("click", function () {
    if (gravando) {
      reconhecedor.stop();
      return;
    }
    // Ditar por cima do que a IA está falando fica confuso, e o eco do
    // alto-falante ainda contamina o reconhecimento.
    pararFala();

    textoFinal = "";
    textoBase = inputEl.value;
    if (textoBase && !/\s$/.test(textoBase)) textoBase += " ";

    try {
      reconhecedor.start();
      marcar(true);
    } catch (_e) {
      // start() lança InvalidStateError se já estiver rodando - o
      // reconhecedor é o mesmo objeto, então basta ignorar.
      marcar(false);
    }
  });

  return botao;
}

// --------------------------------------------------------------------------
// Texto -> fala (TTS)
// --------------------------------------------------------------------------

// A voz é sempre a natural do ElevenLabs, gerada no servidor (POST /api/tts,
// ver backend/ai.py:synthesize_speech) e tocada num <audio>. Enquanto ela
// não chega, um popup pequeno avisa e deixa cancelar. Se o servidor falhar
// (rede, cota), o popup mostra o erro e oferece tentar de novo - nunca lê
// com a voz robótica do navegador no lugar.

// O que está tocando (ou sendo gerado) agora:
// { botao, personality, controle (AbortController do fetch), audio,
//   tocou (o áudio já começou a soar) }.
var falaAtual = null;

/** Interrompe a leitura em andamento (ou a geração do áudio), se houver. */
function pararFala() {
  fecharPopupDaVoz();
  if (!falaAtual) return;
  var anterior = falaAtual;
  falaAtual = null;
  if (anterior.controle) anterior.controle.abort();
  if (anterior.audio) anterior.audio.pause();
  marcarBotaoDeFala(anterior.botao, "parado");
}

/** @param {"parado"|"carregando"|"falando"} estado */
function marcarBotaoDeFala(botao, estado) {
  if (!botao) return;
  var ativo = estado !== "parado";
  botao.classList.toggle("is-speaking", estado === "falando");
  botao.classList.toggle("is-loading", estado === "carregando");
  botao.innerHTML = ativo ? ICONE_SOM_PARAR : ICONE_SOM;
  // Carregando, quem explica é a bolha do popup, colada no botão - o
  // tooltip (ui.js guarda o `title` em data-tooltip) apareceria por cima.
  if (estado === "carregando") {
    botao.removeAttribute("title");
    delete botao.dataset.tooltip;
  } else {
    botao.title = ativo ? "Parar a leitura" : "Ouvir esta resposta";
  }
  botao.setAttribute(
    "aria-label",
    estado === "carregando" ? "Preparando o áudio, clique para cancelar"
      : ativo ? "Parar a leitura" : "Ouvir esta resposta em voz alta",
  );
}

/** Encerra `atual` se ainda for a leitura em andamento. */
function encerrarFala(atual) {
  if (falaAtual !== atual) return;
  falaAtual = null;
  fecharPopupDaVoz();
  marcarBotaoDeFala(atual.botao, "parado");
}

/**
 * Lê `texto` em voz alta com a voz do ElevenLabs, interrompendo qualquer
 * leitura anterior.
 *
 * @param {string} texto
 * @param {HTMLButtonElement} [botao] - botão que dispara, para refletir o estado
 * @param {string} [personality] - decide a voz no servidor ("trashtalker"/"mathias")
 */
function speakMessage(texto, botao, personality) {
  if (!texto || !texto.trim()) return;
  pararFala();
  var atual = { botao: botao, personality: personality };
  falaAtual = atual;

  // Áudio já gerado para este mesmo texto: toca de novo na hora, sem
  // gastar outra chamada (os créditos do ElevenLabs são limitados).
  if (botao && botao._audio && botao._audio.texto === texto) {
    tocarAudio(atual, new Audio(botao._audio.url), texto);
    return;
  }

  var controle = typeof AbortController === "function" ? new AbortController() : null;
  atual.controle = controle;
  marcarBotaoDeFala(botao, "carregando");
  mostrarPopupDaVoz("espera", botao);

  // fetch direto, e não apiFetch: a resposta é um arquivo de áudio, não JSON.
  fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ text: texto, personality: personality }),
    signal: controle ? controle.signal : undefined,
  })
    .then(function (resposta) {
      if (!resposta.ok) throw new Error("/api/tts respondeu " + resposta.status);
      if (falaAtual !== atual) return; // a pessoa parou ou pediu outra mensagem
      if (podeTocarEmPedacos(resposta)) return tocarEmPedacos(atual, resposta, texto);
      return resposta.blob().then(function (blob) {
        if (falaAtual !== atual) return;
        tocarAudio(atual, new Audio(guardarAudio(botao, texto, blob)), texto);
      });
    })
    .catch(function (erro) {
      if (falaAtual !== atual || (erro && erro.name === "AbortError")) return;
      falhaNaVoz(atual, texto, erro);
    });
}

/** Guarda o MP3 completo no botão, para repetir sem nova chamada. Devolve a URL. */
function guardarAudio(botao, texto, blob) {
  var url = URL.createObjectURL(blob);
  if (botao) {
    if (botao._audio) URL.revokeObjectURL(botao._audio.url);
    botao._audio = { texto: texto, url: url };
  }
  return url;
}

// O servidor repassa o MP3 em pedaços conforme o ElevenLabs gera (ver
// backend/ai.py:synthesize_speech). Com MediaSource (Chrome, Edge) o áudio
// começa a tocar no primeiro pedaço, em vez de esperar o arquivo inteiro.
// Sem ele, cai no caminho do blob completo, que funciona em todo lugar.
function podeTocarEmPedacos(resposta) {
  return !!(resposta.body && window.MediaSource &&
    MediaSource.isTypeSupported("audio/mpeg"));
}

function tocarEmPedacos(atual, resposta, texto) {
  var fonte = new MediaSource();
  var audio = new Audio(URL.createObjectURL(fonte));
  var leitor = resposta.body.getReader();
  var pedacos = [];
  var iniciado = false;

  return new Promise(function (resolve, reject) {
    // Falha no meio: se já há áudio tocando, deixa terminar o que chegou.
    function falhou(erro) {
      if (falaAtual !== atual) return resolve();
      if (!iniciado) return reject(erro);
      try { if (fonte.readyState === "open") fonte.endOfStream(); } catch (_e) {}
      resolve();
    }

    fonte.addEventListener("sourceopen", function () {
      URL.revokeObjectURL(audio.src);
      var buffer = fonte.addSourceBuffer("audio/mpeg");

      function proximo() {
        leitor.read().then(function (parte) {
          // Parou, pediu outra mensagem, ou o áudio falhou.
          if (falaAtual !== atual || (iniciado && atual.audio !== audio)) {
            leitor.cancel().catch(function () {});
            resolve();
            return;
          }
          if (parte.done) {
            fonte.endOfStream();
            guardarAudio(atual.botao, texto, new Blob(pedacos, { type: "audio/mpeg" }));
            resolve();
            return;
          }
          pedacos.push(parte.value);
          buffer.appendBuffer(parte.value);
        }).catch(falhou);
      }

      buffer.addEventListener("updateend", function () {
        if (!iniciado && falaAtual === atual) {
          iniciado = true;
          tocarAudio(atual, audio, texto);
        }
        proximo();
      });
      proximo();
    }, { once: true });
  });
}

function tocarAudio(atual, audio, texto) {
  atual.audio = audio;
  audio.onended = function () { encerrarFala(atual); };
  audio.onplaying = function () {
    atual.tocou = true;
    if (falaAtual === atual) fecharPopupDaVoz();
  };
  function falhou(erro) {
    falhaNaVoz(atual, texto, erro || audio.error || "o navegador não conseguiu tocar o áudio");
  }
  audio.onerror = function () { falhou(); };
  marcarBotaoDeFala(atual.botao, "falando");
  // play() é recusado se o navegador bloquear áudio (ex.: Safari depois de
  // uma espera longa desde o clique) - o "Tentar de novo" do popup resolve,
  // porque é um clique novo.
  var tocando = audio.play();
  if (tocando && tocando.catch) tocando.catch(falhou);
}

/**
 * A voz não veio (servidor fora, rede, play() recusado): encerra e mostra o
 * erro no popup, com "Tentar de novo". Se o áudio já estava tocando e falhou
 * no meio, só encerra - a pessoa já ouviu parte e pode clicar de novo.
 */
function falhaNaVoz(atual, texto, motivo) {
  // onerror e a recusa do play() podem disparar os dois: decide uma vez só.
  if (falaAtual !== atual) return;
  if (atual.audio) atual.audio.pause();
  atual.audio = null;
  var jaTocava = atual.tocou;
  encerrarFala(atual);
  if (jaTocava) return;
  console.warn("[voz] não foi possível tocar a voz:", (motivo && motivo.message) || motivo);
  mostrarPopupDaVoz("erro", atual.botao, function () {
    speakMessage(texto, atual.botao, atual.personality);
  });
}

// --------------------------------------------------------------------------
// Popup de espera
// --------------------------------------------------------------------------
// Uma bolha de tooltip colada no botão de ouvir que foi clicado - no mesmo
// lugar do texto que aparece ao passar o mouse nele -, mas com botões, o que
// o `title` nativo não permite. Uma só, montada na primeira vez que é
// preciso e reaproveitada. Não é modal: não bloqueia a página nem tira o
// foco de onde a pessoa está.

var popupVoz = null;

function popupDaVoz() {
  if (popupVoz) return popupVoz;
  var el = document.createElement("div");
  el.className = "voice-popup";
  el.hidden = true;

  var ponto = document.createElement("span");
  ponto.className = "voice-popup-dot";
  ponto.setAttribute("aria-hidden", "true");

  var texto = document.createElement("p");

  var acoes = document.createElement("div");
  acoes.className = "voice-popup-actions";
  var tentar = document.createElement("button");
  tentar.type = "button";
  tentar.className = "voice-popup-action";
  tentar.textContent = "Tentar de novo";
  var fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "voice-popup-action";
  acoes.append(tentar, fechar);

  el.append(ponto, texto, acoes);
  document.body.appendChild(el);

  popupVoz = { el: el, ponto: ponto, texto: texto, tentar: tentar, fechar: fechar,
    aoTentar: null, ancora: null };
  // "Cancelar" na espera, "Fechar" no erro: nos dois casos, parar tudo.
  fechar.addEventListener("click", pararFala);
  tentar.addEventListener("click", function () {
    if (popupVoz.aoTentar) popupVoz.aoTentar();
  });
  return popupVoz;
}

/**
 * @param {"espera"|"erro"} estado
 * @param {HTMLElement} ancora - botão de ouvir onde a bolha aparece
 * @param {() => void} [aoTentar] - ação do "Tentar de novo" (só no erro)
 */
function mostrarPopupDaVoz(estado, ancora, aoTentar) {
  if (!ancora || !ancora.isConnected) return;
  var popup = popupDaVoz();
  var erro = estado === "erro";
  popup.el.setAttribute("role", erro ? "alert" : "status");
  popup.el.classList.toggle("is-error", erro);
  popup.ponto.hidden = erro;
  popup.texto.textContent = erro
    ? "Não foi possível gerar o áudio agora."
    : "Preparando o áudio…";
  popup.tentar.hidden = !erro;
  popup.fechar.textContent = erro ? "Fechar" : "Cancelar";
  popup.aoTentar = aoTentar || null;
  if (popup.ancora && popup.ancora !== ancora) popup.ancora.removeAttribute("data-tooltip-off");
  popup.ancora = ancora;
  // O tooltip do próprio botão ("Ouvir esta resposta", ver ui.js) não pode
  // aparecer por cima desta bolha.
  ancora.setAttribute("data-tooltip-off", "");
  if (typeof esconderTooltip === "function") esconderTooltip();
  popup.el.hidden = false;
  posicionarPopupDaVoz();
  // A conversa rola dentro do .chat-messages, não na janela: o scroll é
  // escutado na fase de captura para pegar a rolagem de qualquer elemento.
  window.addEventListener("resize", posicionarPopupDaVoz);
  document.addEventListener("scroll", posicionarPopupDaVoz, true);
}

/** Mantém a bolha colada no botão (posicionarBolha fica em ui.js). */
function posicionarPopupDaVoz() {
  if (!popupVoz || popupVoz.el.hidden) return;
  var ancora = popupVoz.ancora;
  if (!ancora || !ancora.isConnected) { fecharPopupDaVoz(); return; }
  posicionarBolha(popupVoz.el, ancora);
}

function fecharPopupDaVoz() {
  if (!popupVoz) return;
  popupVoz.el.hidden = true;
  popupVoz.aoTentar = null;
  if (popupVoz.ancora) popupVoz.ancora.removeAttribute("data-tooltip-off");
  popupVoz.ancora = null;
  window.removeEventListener("resize", posicionarPopupDaVoz);
  document.removeEventListener("scroll", posicionarPopupDaVoz, true);
}

// Escape cancela a espera (ou fecha o erro) - a não ser que outro
// componente (seletor de personalidade, janela de confirmação) já tenha
// tratado a tecla.
document.addEventListener("keydown", function (evento) {
  if (evento.key !== "Escape" || evento.defaultPrevented) return;
  if (!popupVoz || popupVoz.el.hidden || document.querySelector(".modal-overlay")) return;
  pararFala();
});

/**
 * Acrescenta o botão de ouvir a uma bolha de resposta da IA. Aparece em
 * qualquer navegador: o áudio do ElevenLabs toca em todos.
 *
 * O texto é lido do DOM só na hora do clique, e não agora, porque a
 * bolha nasce vazia e é preenchida aos poucos pelo efeito de digitação
 * (revealGradually em chat.js).
 *
 * @param {HTMLElement} bolha - elemento .msg-bubble.msg-assistant
 */
function addSpeakButton(bolha) {
  if (!bolha) return;

  var botao = document.createElement("button");
  botao.type = "button";
  botao.className = "voice-speak-button";
  marcarBotaoDeFala(botao, "parado");

  botao.addEventListener("click", function () {
    if (falaAtual && falaAtual.botao === botao) {
      pararFala();
      return;
    }
    var conteudo = bolha.querySelector(".msg-content");
    // buildMessageBubble (chat.js) marca a bolha com data-personality.
    var personality = bolha.dataset.personality || "trashtalker";
    speakMessage(conteudo ? conteudo.textContent : "", botao, personality);
  });

  bolha.appendChild(botao);
}

// Sair da página com o áudio ainda tocando é desagradável: a fala
// continua depois que a tela já mudou.
window.addEventListener("pagehide", pararFala);
