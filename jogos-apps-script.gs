/**
 * 🏆 RANKING DO CARDUME — Salinha de Jogos do Enzo
 * Backend em Google Apps Script: recebe os placares dos desafios
 * da jogos.html, grava numa planilha e devolve o top 10 por jogo
 * + o ranking geral (soma do melhor placar de cada jogo).
 *
 * ── PASSO A PASSO (faz uma vez só — igual ao da cápsula) ───────────
 * 1. Acesse https://sheets.new e crie uma planilha nova
 *    (sugestão de nome: "Ranking dos Jogos — Enzo 3 anos").
 * 2. Na planilha: menu Extensões → Apps Script.
 * 3. Apague o conteúdo do editor e cole ESTE arquivo inteiro. Salve (💾).
 * 4. Clique em "Implantar" → "Nova implantação".
 *    - Tipo (engrenagem ⚙️): "App da Web"
 *    - Executar como: "Eu"
 *    - Quem pode acessar: "Qualquer pessoa"   ← importante!
 * 5. Clique em "Implantar", autorize com sua conta Google
 *    (em "Avisos de segurança", use Avançado → Acessar projeto).
 * 6. Copie a "URL do app da Web" (termina com /exec).
 * 7. Cole essa URL na constante SCRIPT_URL no topo do <script>
 *    da jogos.html E TAMBÉM da ranking.html (o telão). Pronto! 🎉
 *
 * Para testar: abra a URL /exec no navegador — deve aparecer o JSON
 * do ranking: {"ok":true,"servico":"ranking-do-cardume",...}.
 *
 * ⚠️ Se editar este código depois, faça "Implantar" →
 * "Gerenciar implantações" → ✏️ → Versão: "Nova versão" → Implantar
 * (a URL continua a mesma).
 * ───────────────────────────────────────────────────────────────────
 */

var ABA = 'Placares';

// teto de pontos plausível por desafio de 30s — acima disso é trapaça/erro
var JOGOS_VALIDOS = {
  comilanca: 200,
  bolhas: 200,   // as bolhas aceleram ao longo do desafio → mais estouros possíveis
  corrida: 200, // os peixes renascem na hora; um adulto rápido passa fácil de 80
  memoria: 200   // memória: pontos = 100 - segundos (mín. 5s para fechar 6 pares)
};

function doPost(e) {
  var trava = LockService.getScriptLock();
  trava.tryLock(10000); // evita dois placares gravarem na mesma linha

  try {
    var dados = JSON.parse(e.postData.contents);
    var limpa = function (v, max) { return String(v || '').trim().slice(0, max); };

    var nome = limpa(dados.nome, 40);
    var jogo = limpa(dados.jogo, 20);
    var pontos = Math.round(Number(dados.pontos));
    var detalhe = limpa(dados.detalhe, 20);
    var aparelho = limpa(dados.aparelho, 20);

    if (!nome) return resposta({ ok: false, erro: 'sem nome' });
    if (!JOGOS_VALIDOS.hasOwnProperty(jogo)) return resposta({ ok: false, erro: 'jogo desconhecido' });
    if (!(pontos >= 1 && pontos <= JOGOS_VALIDOS[jogo])) {
      return resposta({ ok: false, erro: 'placar fora do plausível' });
    }

    var aba = abaPlacares();
    aba.appendRow([new Date(), nome, jogo, pontos, detalhe, aparelho]);

    // invalida o cache para o ranking refletir o placar novo
    CacheService.getScriptCache().remove('ranking');

    return resposta({ ok: true });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  } finally {
    trava.releaseLock();
  }
}

// GET devolve o ranking (e serve de teste de saúde no navegador)
function doGet() {
  var cache = CacheService.getScriptCache();
  var pronto = cache.get('ranking');
  if (pronto) {
    return ContentService.createTextOutput(pronto).setMimeType(ContentService.MimeType.JSON);
  }

  var aba = abaPlacares();
  var ultima = aba.getLastRow();
  var linhas = ultima > 1 ? aba.getRange(2, 1, ultima - 1, 6).getValues() : [];

  // melhor placar por (pessoa, jogo)
  var melhor = {}; // chave: nomeKey|jogo → {nome, jogo, pontos, detalhe}
  linhas.forEach(function (l) {
    var nome = String(l[1] || '').trim();
    var jogo = String(l[2] || '').trim();
    var pontos = Number(l[3]) || 0;
    var detalhe = String(l[4] || '');
    if (!nome || !JOGOS_VALIDOS.hasOwnProperty(jogo)) return;
    var chave = nome.toLowerCase() + '|' + jogo;
    if (!melhor[chave] || pontos > melhor[chave].pontos) {
      melhor[chave] = { nome: nome, jogo: jogo, pontos: pontos, detalhe: detalhe };
    }
  });

  var porJogo = { comilanca: [], bolhas: [], memoria: [], corrida: [] };
  var porPessoa = {}; // nomeKey → {nome, total, jogos}
  Object.keys(melhor).forEach(function (chave) {
    var m = melhor[chave];
    porJogo[m.jogo].push({ nome: m.nome, pontos: m.pontos, detalhe: m.detalhe });
    var nomeKey = m.nome.toLowerCase();
    if (!porPessoa[nomeKey]) porPessoa[nomeKey] = { nome: m.nome, total: 0, jogos: 0 };
    porPessoa[nomeKey].total += m.pontos;
    porPessoa[nomeKey].jogos++;
  });

  Object.keys(porJogo).forEach(function (jogo) {
    porJogo[jogo].sort(function (a, b) { return b.pontos - a.pontos; });
    porJogo[jogo] = porJogo[jogo].slice(0, 10);
  });

  var geral = Object.keys(porPessoa).map(function (k) { return porPessoa[k]; });
  geral.sort(function (a, b) { return (b.total - a.total) || (b.jogos - a.jogos); });
  geral = geral.slice(0, 10);

  var saida = JSON.stringify({
    ok: true,
    servico: 'ranking-do-cardume',
    porJogo: porJogo,
    geral: geral
  });
  cache.put('ranking', saida, 20); // 20s de cache: alivia a planilha na festa

  return ContentService.createTextOutput(saida).setMimeType(ContentService.MimeType.JSON);
}

function abaPlacares() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(ABA) || planilha.insertSheet(ABA);
  if (aba.getLastRow() === 0) {
    aba.appendRow(['Enviado em', 'Nome', 'Jogo', 'Pontos', 'Detalhe', 'Aparelho']);
    aba.setFrozenRows(1);
    aba.getRange('A1:F1').setFontWeight('bold');
  }
  return aba;
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
