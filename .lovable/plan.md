## Objetivo
Adicionar botão **"Verificar WhatsApp"** na página de detalhe da lista de contatos. Usuário escolhe um chip, o sistema consulta a Evolution API em lote, e **remove os contatos que não têm WhatsApp**.

## Mudanças

### 1. Backend — `src/lib/evolution.server.ts`
Adicionar helper `checkWhatsappNumbers(server, instanceName, phones[])` que chama `POST /chat/whatsappNumbers/{instance}` da Evolution e retorna `[{ jid, exists, number }]`.

### 2. Server function — `src/lib/contacts.functions.ts` (novo)
`verifyContactsWhatsappFn({ list_id, instance_id })`:
- Valida que a lista e o chip pertencem ao usuário (RLS)
- Busca os contatos da lista (apenas `id, phone`)
- Chama `checkWhatsappNumbers` em chunks de 50 (limite seguro da Evolution)
- Coleta os IDs dos contatos cujo telefone retornou `exists: false`
- **Deleta** esses contatos
- Atualiza `total_count` da `contact_lists`
- Retorna `{ checked, valid, removed }`

### 3. UI — `src/routes/_authenticated/app.lists.$id.tsx`
- Botão **"Verificar WhatsApp"** no topo da tabela de contatos
- Ao clicar, abre dialog com `Select` de chips conectados
- Confirma → roda mutation → toast: "X contatos sem WhatsApp removidos (Y válidos)"
- Refetch da lista de contatos após sucesso

## Detalhes técnicos
- Endpoint Evolution: `POST {base_url}/chat/whatsappNumbers/{instance}` body `{ numbers: ["5511..."] }`
- Chunks de 50 para evitar timeout; total log via console
- Chip precisa estar `status='connected'` (filtrado no select)
- Se a Evolution retornar erro num chunk, aborta e mostra mensagem (não remove nada parcial)
- Sem nova tabela; sem migration