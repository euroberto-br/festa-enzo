/**
 * 🎨 VIRE UM TUBARÃO — gerador de desenhos com IA
 * Backend em Google Apps Script: recebe a selfie da tubarao.html,
 * pede ao Azure AI Foundry (modelo gpt-image-2) uma versão desenho
 * animado (estilo Baby Shark) e devolve a imagem gerada.
 * A chave da API fica AQUI no Google — nunca no site (que é público
 * no GitHub Pages).
 *
 * ── PASSO A PASSO (faz uma vez só) ─────────────────────────────────
 * 1. Tenha em mãos a chave (apikey) do recurso do Azure AI Foundry
 *    (portal do Azure → seu recurso → Chaves e Ponto de Extremidade).
 * 2. Acesse https://script.new e crie um projeto novo
 *    (sugestão de nome: "Vire um Tubarão — Enzo 3 anos").
 * 3. Apague o conteúdo do editor e cole ESTE arquivo inteiro. Salve (💾).
 * 4. Guarde a chave em Configurações do projeto (⚙️ na lateral) →
 *    "Propriedades do script" → "Adicionar propriedade do script":
 *    - Propriedade: AZURE_API_KEY
 *    - Valor: a apikey do recurso
 *    ⚠️ NUNCA cole a chave neste arquivo — ele fica público no GitHub!
 * 5. Clique em "Implantar" → "Nova implantação".
 *    - Tipo (engrenagem ⚙️): "App da Web"
 *    - Executar como: "Eu"
 *    - Quem pode acessar: "Qualquer pessoa"   ← importante!
 * 6. Clique em "Implantar", autorize com sua conta Google
 *    (em "Avisos de segurança", use Avançado → Acessar projeto).
 * 7. Copie a "URL do app da Web" (termina com /exec) e cole na
 *    constante SCRIPT_URL no topo do <script> da tubarao.html. 🎉
 *
 * Para testar: abra a URL /exec no navegador — deve aparecer
 * {"ok":true,"servico":"vire-um-tubarao",...}.
 *
 * ⚠️ Se editar este código depois, faça "Implantar" →
 * "Gerenciar implantações" → ✏️ → Versão: "Nova versão" → Implantar
 * (a URL continua a mesma).
 * ───────────────────────────────────────────────────────────────────
 */

// Azure AI Foundry — endpoint OpenAI v1 do recurso
// (usamos /images/edits: entra a selfie + prompt, sai o desenho)
var AZURE_BASE = 'https://projetosites-resource.services.ai.azure.com/openai/v1';
var MODELO = 'gpt-image-2';
var TAMANHO = '1024x1024';

// o prompt fica no servidor: ninguém consegue trocar o estilo pelo site
// (o texto em pt-BR — frase + selo da festa — é carimbado depois, pela
//  própria tubarao.html, no canvas: grafia e identidade visual garantidas)
var PROMPT =
  'Transform the person in this photo into a cartoon character in the style of ' +
  "the animated show \"Baby Shark's Big Show\" (Nickelodeon): flat bold colors, " +
  'thick dark outlines, rounded toy-like shapes, big expressive cartoon eyes and a ' +
  'cheerful smile. Keep the person clearly recognizable: same hairstyle and hair ' +
  'color, same skin tone, same glasses/beard/accessories if present, similar ' +
  'clothing colors. Place them underwater in a bright, happy ocean scene with ' +
  'bubbles, corals and small fish, as if they were a guest character in the show. ' +
  'Keep the bottom 20% of the image as simple background (sand or water), with no ' +
  'important elements there. The illustration must contain absolutely NO text: ' +
  'no letters, no words, no captions, no logos, no watermarks and no TV network ' +
  'branding of any kind. Kid-friendly, vibrant, high quality cartoon illustration.';

function doPost(e) {
  try {
    var chave = PropertiesService.getScriptProperties().getProperty('AZURE_API_KEY');
    if (!chave) return resposta({ ok: false, erro: 'sem-chave' });

    var dados = JSON.parse(e.postData.contents);
    var imagem = String(dados.imagem || '');
    var mime = String(dados.mime || 'image/jpeg');

    // base64 de uma foto comprimida no navegador fica bem abaixo disso;
    // qualquer coisa maior é abuso ou erro
    if (!imagem || imagem.length > 6000000) {
      return resposta({ ok: false, erro: 'foto-invalida' });
    }
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
      return resposta({ ok: false, erro: 'foto-invalida' });
    }

    contarUso(); // só estatística — sem teto diário

    var selfie = Utilities.newBlob(Utilities.base64Decode(imagem), mime, 'selfie.jpg');

    // multipart/form-data (UrlFetchApp monta sozinho quando o payload tem blob)
    var payload = {
      image: selfie,
      prompt: PROMPT,
      model: MODELO,
      size: TAMANHO,
      n: '1',
      output_format: 'png',
      quality: 'medium',        // rápido o bastante p/ caber no tempo do Apps Script
      input_fidelity: 'high'    // preserva melhor o rosto da pessoa
    };

    // se o modelo recusar algum parâmetro opcional ("Unknown parameter"),
    // remove só ele e tenta de novo
    var r, corpo, tentativas = 0;
    while (true) {
      r = UrlFetchApp.fetch(AZURE_BASE + '/images/edits', {
        method: 'post',
        headers: { Authorization: 'Bearer ' + chave },
        payload: payload,
        muteHttpExceptions: true
      });
      corpo = r.getContentText();
      var desconhecido = (r.getResponseCode() === 400) &&
        (corpo.match(/[Uu]nknown parameter[^a-z_]*'?([a-z_]+)'?/) || [])[1];
      if (!desconhecido || !(desconhecido in payload) || ++tentativas > 3) break;
      delete payload[desconhecido];
    }

    var codigo = r.getResponseCode();
    if (codigo === 429) {
      // cota/limite de taxa da API do Azure (não é o nosso contador diário)
      return resposta({ ok: false, erro: 'cota-ia', detalhe: corpo.slice(0, 500) });
    }
    if (codigo !== 200) {
      // foto barrada pelo filtro de conteúdo
      if (/moderation|content_(policy|filter)|safety|responsible/i.test(corpo)) {
        return resposta({ ok: false, erro: 'bloqueada' });
      }
      return resposta({ ok: false, erro: 'ia', detalhe: corpo.slice(0, 500) });
    }

    var json = JSON.parse(corpo);
    var item = json.data && json.data[0];
    if (item && item.b64_json) {
      return resposta({ ok: true, imagem: item.b64_json, mime: 'image/png' });
    }
    return resposta({ ok: false, erro: 'ia', detalhe: corpo.slice(0, 500) });
  } catch (erro) {
    return resposta({ ok: false, erro: 'ia', detalhe: String(erro).slice(0, 500) });
  }
}

/**
 * Conta as gerações do dia (só estatística — aparece no doGet).
 */
function contarUso() {
  var trava = LockService.getScriptLock();
  trava.tryLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    var salvo = {};
    try { salvo = JSON.parse(props.getProperty('usos') || '{}'); } catch (e) {}
    var usos = (salvo.dia === hoje) ? (salvo.usos || 0) : 0;
    props.setProperty('usos', JSON.stringify({ dia: hoje, usos: usos + 1 }));
  } finally {
    trava.releaseLock();
  }
}

// abrir a URL no navegador serve como teste de saúde
function doGet() {
  var props = PropertiesService.getScriptProperties();
  var temChave = !!props.getProperty('AZURE_API_KEY');
  var salvo = {};
  try { salvo = JSON.parse(props.getProperty('usos') || '{}'); } catch (e) {}
  return resposta({
    ok: true,
    servico: 'vire-um-tubarao',
    ia: MODELO + ' (Azure)',
    chaveConfigurada: temChave,
    usosHoje: salvo.usos || 0
  });
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
