## O que será construído

Duas novas ferramentas na aba **Ferramentas** (`/app/tools`), somando às duas já existentes (Validador e Extrator de Grupo).

---

### 1. Extrator de Leads do Google Maps — R$ 5 por busca (até 60 leads)

**Modelo de cobrança**
- Cobrança fixa de **R$ 5,00 por busca** debitada antes de chamar o Maps
- Devolve até 60 leads (limite da Places API)
- Se a busca não retornar nenhum lead com telefone → **reembolso automático**
- Auto-validar no WhatsApp custa **+R$ 0,02 por lead validado** (opcional, toggle)

**Filtros disponíveis**
- **Modo simples**: campo de texto livre + cidade (ex: "pizzaria em Curitiba")
- **Modo avançado**: mapa interativo (Google Maps JS API) — clique pra definir o centro, slider de raio (1-50km), dropdown de categorias prontas (Restaurante, Salão de Beleza, Academia, Clínica, Mercado, Pet Shop, Imobiliária, Advogado, Contador, etc.)
- **Toggle "apenas com telefone"**: filtra antes de cobrar, leads sem telefone são descartados
- **Toggle "validar WhatsApp"**: depois da busca, roda o validador (precisa de um chip conectado escolhido)

**O que cada lead traz**
- Nome do estabelecimento
- Telefone (formatado BR)
- Endereço completo
- Website (quando existe)
- Categoria
- Rating + número de avaliações
- Coordenadas (lat/lng)
- Tem WhatsApp? (se toggle ligado)

**Export**: CSV pronto pra importar em campanhas + botão "Importar como lista de contatos" que cria uma `contact_list` direto.

---

### 2. Identificador de Contatos Não Salvos no WhatsApp — Grátis no plano pago

**Como funciona**
- Cliente escolhe um chip conectado
- Sistema chama `/chat/findContacts` da Evolution + cruza com `crm_conversations` (todas as conversas que o chip teve)
- Identifica "não salvos" pela heurística: contato cujo `name` está vazio ou igual ao próprio número
- Mostra tabela com: número, foto de perfil, pushName (nome que o contato exibe), última mensagem trocada, data do primeiro contato

**Gating de plano**
- **Free/Trial**: vê o **número total** de não salvos com CTA "Faça upgrade pra exportar"
- **Pro/Business**: vê tudo, exporta CSV, pode marcar como "salvar depois" (lista interna)

**Ações disponíveis (apenas plano pago)**
- Exportar CSV completo (nome sugerido, número, última conversa)
- Adicionar todos a uma lista de contatos pra disparo posterior
- Botão "Salvar no WhatsApp" — gera vCard agrupado em arquivo `.vcf` baixável que o cliente importa no celular dele (não dá pra escrever na agenda dele via API, mas o `.vcf` resolve)

**Por que esse é o melhor gatilho de upgrade**: usuário no trial vê "Você tem **347 contatos não salvos** valendo dinheiro perdido" → upgrade pra exportar.

---

## Detalhes técnicos

### Conexão Google Maps
- Linkar o conector **Google Maps Platform** (managed, sem chave do cliente) via `standard_connectors--connect`
- Usar Places API (New) `places:searchText` (modo simples) e `places:searchNearby` (modo avançado com raio)
- Browser key `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` pro mapa interativo
- Server fns chamam via gateway com `Authorization: Bearer LOVABLE_API_KEY` + `X-Connection-Api-Key`

### Novos arquivos
- `src/lib/maps.functions.ts` — `searchMapsLeadsFn` (debita R$ 5, chama Places, opcionalmente valida WhatsApp via `checkWhatsappNumbers`, refund se 0 leads)
- `src/lib/unsaved-contacts.functions.ts` — `listUnsavedContactsFn` (gate por plano via `get_user_plan_limits`), `exportUnsavedContactsFn` (gate Pro+)
- `src/components/tools/MapsExtractorCard.tsx` — UI com tabs simples/avançado + mapa
- `src/components/tools/UnsavedContactsCard.tsx` — tabela + CTA condicional
- `src/routes/_authenticated/app.tools.tsx` — adicionar 2 novas abas
- Migration: tabela `maps_searches` (log de buscas pra evitar duplicar leads e pra histórico)

### Pricing constants em `tools.functions.ts`
```typescript
maps_search_flat_cents: 500,        // R$ 5 por busca
maps_search_max_leads: 60,
maps_whatsapp_check_per_lead_cents: 2,  // mesma do validador
```

### Plano gating (contatos não salvos)
- Free/Trial: `plan_slug !== 'pro'` && `plan_slug !== 'business'` → bloqueia export
- Aproveita helper existente `get_user_plan_limits` no DB

### Sidebar
- Sem mudanças (entram como abas dentro de `/app/tools`)

---

## Fora do escopo (pra não inflar)
- Scraping de Instagram/LinkedIn (TOS hostil, conta a parte)
- Enriquecimento por CNPJ (vira outra feature)
- Agendar buscas recorrentes do Maps (depois, com cron)
- Salvar automaticamente na agenda do celular do cliente (impossível via API; vCard é a solução)
