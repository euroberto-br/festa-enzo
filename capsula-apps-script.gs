/**
 * 🍾 MENSAGEM NA GARRAFA — Cápsula do Tempo do Enzo
 * Backend em Google Apps Script: recebe as mensagens da capsula.html
 * e grava numa planilha do Google Drive.
 *
 * ── PASSO A PASSO (faz uma vez só) ─────────────────────────────────
 * 1. Acesse https://sheets.new e crie uma planilha nova
 *    (sugestão de nome: "Cápsula do Tempo — Enzo 3 anos").
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
 *    da capsula.html. Pronto! 🎉
 *
 * Para testar: abra a URL /exec no navegador — deve aparecer
 * {"ok":true,"servico":"capsula-do-tempo"}.
 *
 * ⚠️ Se editar este código depois, faça "Implantar" →
 * "Gerenciar implantações" → ✏️ → Versão: "Nova versão" → Implantar
 * (a URL continua a mesma).
 * ───────────────────────────────────────────────────────────────────
 */

var ABA = 'Mensagens';

function doPost(e) {
  var trava = LockService.getScriptLock();
  trava.tryLock(10000); // evita duas mensagens gravarem na mesma linha

  try {
    var planilha = SpreadsheetApp.getActiveSpreadsheet();
    var aba = planilha.getSheetByName(ABA) || planilha.insertSheet(ABA);

    // primeira mensagem: cria o cabeçalho
    if (aba.getLastRow() === 0) {
      aba.appendRow(['Enviada em', 'Nome', 'Relação com o Enzo', 'Tipo de mensagem', 'Mensagem']);
      aba.setFrozenRows(1);
      aba.getRange('A1:E1').setFontWeight('bold');
      aba.setColumnWidth(5, 500);
    }

    var dados = JSON.parse(e.postData.contents);
    var limpa = function (v, max) { return String(v || '').trim().slice(0, max); };

    aba.appendRow([
      new Date(),
      limpa(dados.nome, 80),
      limpa(dados.relacao, 80),
      limpa(dados.tipo, 40),
      limpa(dados.mensagem, 4000)
    ]);

    return resposta({ ok: true });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  } finally {
    trava.releaseLock();
  }
}

// abrir a URL no navegador serve como teste de saúde
function doGet() {
  return resposta({ ok: true, servico: 'capsula-do-tempo' });
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
