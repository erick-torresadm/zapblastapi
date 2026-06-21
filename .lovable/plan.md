Plano para ajustar o extrator de grupo:

1. Corrigir a resolução do grupo
- Não confiar no `id` retornado por `inviteInfo`, porque ele pode ser só o código interno do convite e causar `404` em `/group/participants`.
- Depois de entrar no grupo, usar obrigatoriamente o `groupJid` retornado por `acceptInviteCode`.
- Se o chip já estiver no grupo ou o retorno vier incompleto, localizar o grupo correto em `fetchAllGroups` comparando convite, nome e tamanho, em vez de consultar um JID errado.

2. Buscar a lista total do jeito que a Evolution realmente permite
- Usar `/group/participants/{instance}?groupJid=...` como fonte principal, porque é o endpoint oficial de membros.
- Manter `findGroupInfos` e `fetchAllGroups?getParticipants=true` como fallbacks.
- Normalizar diferentes formatos de resposta da Evolution (`participants`, `members`, `data.participants`, arrays aninhados), para não perder membros quando a versão do servidor muda.

3. Bloquear cobrança quando não vier a lista completa
- Se o grupo declara 518 membros e só vier 1, 8 ou 10, a ferramenta não deve entregar nem cobrar como se estivesse tudo certo.
- Mostrar erro claro: o WhatsApp/Evolution só libera a lista completa quando o chip é membro real do grupo e a sessão sincronizou; se a API devolver só resumo/admins, não há como extrair os 518 números com segurança.

4. Melhorar diagnóstico para não ficar no escuro
- Retornar/logar contagens por fonte: convite, join, participants, findGroupInfos e fetchAllGroups.
- Incluir no erro a contagem esperada versus recebida, sem expor dados sensíveis.

5. Ajustar exportação/resultado
- Só exibir resultado quando a lista total foi obtida ou quando o grupo realmente tem poucos membros.
- Continuar cobrando apenas por telefone real resolvido; participantes `@lid` sem telefone não serão cobrados.

Observação importante: se o WhatsApp devolver participantes como `@lid`, a Evolution consegue listar o participante, mas nem sempre consegue converter para telefone. Isso depende de metadados/histórico do próprio chip. O primeiro problema aqui é obter os 518 participantes; depois disso, a conversão para telefone será feita quando houver mapeamento disponível.