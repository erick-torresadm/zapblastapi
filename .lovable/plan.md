**Problema identificado**

O painel fica em “Carregando…” porque a função que busca o QR está retornando `qrcode: null`. Hoje ela chama a Evolution, mas:

- erros da Evolution são engolidos com `.catch(() => null)`, então o painel nunca mostra o motivo real;
- o webhook atual só trata conexão e mensagens, mas ignora o evento `qrcode.updated`, que é um dos formatos oficiais onde a Evolution envia o QR;
- a criação da instância tem suporte a webhook no helper, mas o fluxo atual não passa a URL do webhook ao criar a instância;
- o painel só depende da resposta direta de `/instance/connect/:instanceName`, então se a Evolution gera o QR via evento/webhook, o app não tem de onde puxar;
- falta salvar o último QR recebido para o painel reutilizar enquanto o QR ainda é válido.

**Plano de correção**

1. **Parar de esconder erro da Evolution**
   - Remover o `.catch(() => null)` silencioso no fluxo de QR.
   - Retornar uma mensagem útil para o painel quando a Evolution responder erro, sem expor API key.
   - Adicionar logs sanitizados com o “formato” da resposta, não o base64 inteiro.

2. **Persistir o último QR da instância**
   - Adicionar campos na tabela de chips para armazenar temporariamente:
     - último QR em base64/data URL;
     - data/hora em que foi recebido;
     - último erro de QR, se houver.
   - O QR será sobrescrito a cada atualização e usado apenas para exibição no painel.

3. **Tratar o evento `qrcode.updated` no webhook**
   - Atualizar `/api/public/evolution-webhook/$token` para reconhecer eventos como:
     - `qrcode.updated`
     - `QRCODE_UPDATED`
   - Extrair `qrcode.base64`, `base64`, `qrcode.code` ou `code`.
   - Salvar o QR normalizado na instância correta.

4. **Configurar webhook automaticamente ao criar chip**
   - Ao criar uma instância, montar a URL pública do webhook do servidor cadastrado.
   - Passar essa URL no payload de criação da Evolution.
   - Incluir eventos de QR e conexão no webhook, especialmente `QRCODE_UPDATED` e `CONNECTION_UPDATE`.

5. **Melhorar busca ativa do QR**
   - Quando o usuário abrir “Ver QR”, o app vai:
     - chamar `/instance/connect/:instanceName`;
     - tentar extrair QR da resposta direta;
     - se não vier QR direto, buscar o último QR salvo pelo webhook;
     - continuar fazendo polling por alguns segundos.

6. **Melhorar o painel**
   - Trocar “Carregando…” infinito por estados claros:
     - “Gerando QR…” enquanto tenta;
     - “QR recebido, escaneie agora” quando houver imagem;
     - “Não recebi o QR da Evolution ainda” se não vier após algumas tentativas;
     - botão “Tentar novamente”.

7. **Validar o fluxo**
   - Verificar logs do servidor após uma tentativa real.
   - Confirmar que o painel recebe um `data:image/png;base64,...` válido.
   - Confirmar que o QR aparece tanto quando vem na resposta direta quanto quando vem por webhook.

**Arquivos envolvidos**

- `src/lib/instances.functions.ts`
- `src/lib/evolution.server.ts`
- `src/routes/api/public/evolution-webhook.$token.ts`
- `src/routes/_authenticated/app.instances.tsx`
- nova migração de banco para os campos do último QR

**Resultado esperado**

O QR code deve aparecer no painel assim que a Evolution retornar o base64 direto ou enviar o evento de QR pelo webhook, e o usuário deixa de ficar preso em “Carregando…” sem diagnóstico.