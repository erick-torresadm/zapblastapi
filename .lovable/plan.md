## Objetivo
Mostrar o número de telefone ao lado do nome do chip (ex.: `chip-01 · +55 11 98765-4321`) em todos os lugares onde a instância aparece, para facilitar a identificação.

## Helper compartilhado
Criar `src/lib/format-instance.ts`:
- `formatPhone(raw?: string | null)` → normaliza JID/dígitos e devolve `+55 (11) 98765-4321`; se vazio, retorna `"sem número"`.
- `formatInstanceLabel(name, phone)` → `"<name> · <phone formatado>"` (sem número → `"<name> · sem número"`).
- `InstanceLabel` (componente leve) que renderiza o nome em destaque e o telefone em `text-muted-foreground text-xs`, para uso fora de `<SelectItem>`.

## Locais a atualizar
Todos passam a usar o helper. Onde a query atual não traz `phone_number`, incluir no `.select(...)`.

1. `src/routes/_authenticated/app.instances.tsx` (l.158) — já mostra, padronizar formatação via helper.
2. `src/routes/_authenticated/app.inbox.tsx`
   - tipo do `useQuery` (l.178) e select do `<SelectItem>` (l.861): incluir `phone_number`.
   - Cabeçalho do chat onde aparece o chip ativo (mesmo arquivo): mostrar número também.
3. `src/routes/_authenticated/app.keywords.tsx`
   - Badge "Chip:" (l.188) e badge da regra (l.282): incluir número.
   - Tipo `instance` (l.32) + select de instâncias (l.398): adicionar `phone_number` no fetch e no label.
4. `src/routes/_authenticated/app.warmup.tsx` (l.34, l.99) — já busca `phone_number`; renderizar via `InstanceLabel`.
5. `src/routes/_authenticated/app.campaigns.new.tsx` (l.40, l.195) — incluir `phone_number` no select e no label.
6. `src/routes/_authenticated/app.lists.$id.tsx` (l.38, l.77) — idem.
7. `src/routes/_authenticated/app.tools.tsx` (l.218, l.342) — idem (verificar query origem para incluir `phone_number`).
8. `src/components/tools/UnsavedContactsCard.tsx` (l.101) — idem.
9. `src/components/tools/MapsExtractorCard.tsx` (l.221) — idem.
10. `src/components/AppTopbar.tsx` / `AppSidebar.tsx` — se exibirem chip ativo, aplicar mesma formatação (verificar e ajustar se houver).

## Fora de escopo
- Mudanças de schema, lógica de envio, ou backend.
- Telas que não listam instâncias.
- Redesenho visual além de acrescentar o telefone próximo ao nome.

## Validação
- Build limpo.
- Conferir visualmente Inbox, Warmup, Keywords, Campanhas, Listas, Ferramentas e Instâncias mostrando `nome · número`.
