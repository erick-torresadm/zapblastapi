## Diagnóstico encontrado

O problema não é a tela do fluxo em si. O gargalo está no pipeline de mensagens da Evolution:

- O webhook atual recebe `messages.upsert`, mas resolve contatos `@lid` de forma frágil.
- Nos dados reais, várias mensagens chegam com `remoteJid` como `...@lid` e o campo de topo `sender` aponta para o próprio chip (`5511948333534@s.whatsapp.net`), não para o contato.
- Isso fez o sistema salvar o contato errado em alguns casos e disparar fluxo para o número do próprio chip ou para um LID não enviável.
- A Evolution/WhatsApp Web tem um problema conhecido com `@lid`: enviar para `@lid` pode retornar `400 Bad Request / jidOptions.exists false`. A recomendação atual é usar `remoteJidAlt`/`senderPn` quando existir, atualizar Evolution/WhatsApp Web, e manter fallback/controladoria para quando não der para resolver.
- O disparo da palavra-chave acontece em alguns testes, mas falha na entrega quando o alvo resolvido está errado. Em outros casos, mensagens enviadas pelo próprio chip também estão acionando gatilhos quando `allow_from_me` está ligado.

## Plano de implementação

### 1. Criar um backend dedicado de ingestão de mensagens da Evolution

Vou separar o webhook atual em uma camada robusta de ingestão:

```text
Evolution webhook
  -> normalizador de evento
  -> idempotência por message_id
  -> resolução correta do contato
  -> grava mensagem recebida/enviada
  -> motor de gatilhos
  -> execução do fluxo
```

Esse backend vai:

- Aceitar `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE`, `CONNECTION_UPDATE` e eventos úteis de presença/status.
- Processar mensagem recebida e enviada de forma diferente.
- Ignorar grupos/broadcast/status por padrão para bot 1:1.
- Responder rápido para a Evolution e evitar reprocessamento duplicado.
- Salvar auditoria mínima do evento para diagnóstico.

### 2. Corrigir definitivamente resolução de contato/JID

Vou criar uma função única para resolver o contato da mensagem, usando prioridade:

1. `data.key.remoteJidAlt`, se existir e for `@s.whatsapp.net`.
2. `data.key.senderPn`, `participantPn`, `data.senderPn`, `data.participantPn`, se existir.
3. `remoteJid` quando já for `@s.whatsapp.net`.
4. `remoteJid @lid` apenas como identificador interno, não como alvo principal de envio.
5. Variações brasileiras com/sem nono dígito via `/chat/whatsappNumbers`.
6. Fallback controlado: se não resolver alvo enviável, marcar o gatilho como detectado mas com erro claro de resolução, sem tentar mandar para o chip errado.

Também vou parar de usar o `payload.sender` de topo como contato, porque nos dados reais ele é o número do chip.

### 3. Ajustar configuração da Evolution para melhor leitura em tempo real

Vou melhorar o `setWebhook/createInstance` para configurar eventos completos e compatíveis:

- `MESSAGES_UPSERT`
- `MESSAGES_UPDATE`
- `SEND_MESSAGE`
- `CONNECTION_UPDATE`
- `PRESENCE_UPDATE`

E adicionar uma função de “reparar webhook” para reaplicar a configuração em chips antigos.

### 4. Tornar o disparo por palavra-chave mais confiável

Vou refatorar o matcher de palavra-chave para:

- Normalizar acentos, caixa, espaços invisíveis e quebras de linha.
- Suportar múltiplos grupos de palavras por gatilho.
- Permitir modos: contém, exato, começa com, regex simples/segura.
- Impedir duplicidade por `evolution_message_id`.
- Adicionar cooldown por contato + gatilho, não apenas global.
- Por padrão, disparar somente mensagens recebidas; `fromMe` só dispara se o usuário ativar explicitamente.

### 5. Evoluir a página do Bot para múltiplas variantes e vários fluxos

Na página Bot, vou trocar o modelo visual “um campo de palavras” por um construtor mais avançado:

- Cada regra pode apontar para um fluxo diferente.
- Cada regra pode ter várias variantes/sinônimos.
- Exemplo:

```text
Regra: Interesse em preço
Fluxo: Bem-vindo
Variantes:
- teste10
- preço
- tabela
- valores
- quanto custa
Modo: contém
Chip: chip1 ou qualquer chip
```

- Exibir status claro: ativo/inativo, chip, fluxo, último disparo, últimos erros.
- Adicionar uma aba/área de “Diagnóstico em tempo real” com últimas mensagens lidas e se bateram ou não em algum gatilho.

### 6. Criar tabela/log de auditoria de gatilhos

Vou adicionar um registro de diagnóstico para cada mensagem avaliada:

- mensagem recebida
- contato resolvido
- JID original e JID final
- gatilhos avaliados
- qual gatilho bateu
- fluxo disparado
- erro de envio, se houver

Isso vai permitir saber exatamente se o problema foi:

- webhook não chegou
- mensagem chegou sem texto
- palavra-chave não bateu
- contato/JID não resolveu
- fluxo criou run mas falhou no envio
- worker não avançou o fluxo

### 7. Validar com dados reais e endpoint de teste

Vou criar/ajustar um endpoint interno de simulação que recebe um payload parecido com o da Evolution e executa o mesmo caminho do webhook, sem usar atalho artificial. Assim o teste manual passa pelo mesmo motor real.

Validações finais:

- Enviar `teste10` como mensagem recebida deve criar log de avaliação, criar run e responder para o contato correto.
- Mensagem enviada pelo próprio chip não deve disparar, a menos que ativado.
- Mensagem `@lid` sem telefone resolvido não deve responder para o próprio chip.
- A página Bot deve permitir várias variantes para vários fluxos.

## Observação importante

Se a sua Evolution estiver em uma versão afetada pelo bug `@lid`, o app pode detectar o gatilho corretamente, mas a entrega pode falhar quando a Evolution não fornece `remoteJidAlt` ou `senderPn`. Mesmo assim, vou deixar o sistema preparado para diagnosticar e não mascarar esse caso: ele vai mostrar claramente “palavra-chave detectada, mas contato não resolvido para envio”.

## Arquivos/áreas que serão alterados

- Webhook público da Evolution.
- Cliente server-side da Evolution.
- Motor de fluxo/gatilhos.
- Funções server-side do Bot.
- Página Bot.
- Migração de banco para logs/regras avançadas, com RLS e permissões corretas.
- Possivelmente reparo de webhook para chips existentes.