Plano para resolver o número do cliente quando a Evolution envia apenas `@lid`:

1. Centralizar a resolução de contato
   - Criar um helper server-only para extrair telefone real do payload do webhook.
   - Ordem de resolução:
     1. `remoteJid`/`remoteJidAlt` quando algum deles já vier como `@s.whatsapp.net`.
     2. `senderPn`, `participantPn`, `pn` em `key`, `data` e campos aninhados.
     3. Cache histórico no banco: se o mesmo `@lid` já apareceu antes junto com um telefone real, reutilizar esse mapeamento.
     4. Fallback por `pushName` somente se houver correspondência única e recente para evitar enviar para a pessoa errada.
     5. Se continuar impossível, manter o bloqueio seguro e registrar o diagnóstico.

2. Aplicar no webhook
   - Trocar a lógica atual de `realPhone` por esse helper.
   - Quando o `@lid` for resolvido, gravar `contact_phone` com o número real e `contact_jid` como `5511...@s.whatsapp.net`.
   - Passar `unresolved_lid=false` para o motor de fluxo quando houver resolução por histórico/cache.

3. Melhorar o envio do fluxo
   - Fazer o motor de envio considerar também o histórico `remoteJidAlt -> remoteJid` ao montar os alvos.
   - Manter variantes brasileiras com/sem nono dígito e validação por `/chat/whatsappNumbers` antes de tentar enviar.

4. Melhorar o diagnóstico em tempo real
   - Exibir estados mais úteis: `LID resolvido por histórico`, `LID resolvido por campo do payload`, `LID sem telefone`.
   - Mostrar qual número foi resolvido quando houver resolução, para facilitar conferência.

5. Testes que vou executar
   - Reprocessar em ambiente controlado um payload real LID-only como `212695856971820@lid` e confirmar que resolve para o número já visto no histórico.
   - Testar payload com `remoteJid=5511930070320@s.whatsapp.net` e `remoteJidAlt=212695856971820@lid` para garantir que alimenta o cache.
   - Testar payload sem nenhum mapeamento conhecido para confirmar que continua bloqueando com diagnóstico seguro.
   - Validar nos logs/auditoria que `teste10` passa de `LID sem telefone` para execução de fluxo quando o mapeamento existir.

Detalhe importante: no seu banco já existe evidência para resolver este caso. Às 03:01 chegou uma mensagem com `remoteJid=5511930070320@s.whatsapp.net` e `remoteJidAlt=212695856971820@lid`; depois, às 03:13, a Evolution mandou só `212695856971820@lid`. A correção vai usar esse vínculo histórico para recuperar o número real.