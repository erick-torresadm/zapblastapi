# Anti-abuso do trial de 10 dias

Hoje só checamos IP (máx. 2 contas/IP em 30 dias). É trivial driblar com 4G, VPN ou navegador anônimo. O usuário pode exportar os fluxos como JSON e re-subir numa conta nova quantas vezes quiser. Abaixo o plano em camadas — cada uma já corta uma parte grande dos abusadores.

## 1. Identidade dura no cadastro

Sem isso o resto é decoração.

- **CPF/CNPJ obrigatório, único e validado** (dígito + Receita pública). Salva como hash `sha256(cpf+pepper)` em `signup_identity_log`. Bloqueia se já houve trial nesse documento.
- **Telefone + OTP** (SMS/WhatsApp) obrigatório. Hash do telefone normalizado (E.164) também na blocklist.
- **E-mail normalizado**: remove `.` e `+tag` do Gmail, lowercase, hashea. Bloqueia variações do mesmo e-mail (`fulano.silva+1@gmail`).
- **Bloqueia domínios descartáveis** (mailinator, tempmail, 10minutemail, guerrillamail). Lista mantida no DB.

## 2. Device fingerprint

- Coleta no signup um hash estável: UA + idioma + timezone + resolução + canvas + fontes (lib `@fingerprintjs/fingerprintjs` open source).
- Grava em `signup_device_log`. Mesmo fingerprint → bloqueio com a mesma mensagem do IP.
- Não é à prova de balas (incógnito limpa), mas pega 70% dos casos "abro outro navegador".

## 3. IP endurecido

- Janela passa de 30 → 90 dias.
- Limita também por **/24 (IPv4)** e **/64 (IPv6)** com peso menor (3 contas).
- Loga ASN/país (ipinfo ou cf-ipcountry header) para revisão manual.
- Sinaliza (não bloqueia) faixas conhecidas de VPN/Tor — flag para revisão.

## 4. Cartão ou Pix de garantia no trial

Esse é o filtro definitivo. Sem custo real pro cliente legítimo, mas mata o ciclo "criar conta → 10 dias grátis → repetir".

Opções (escolher uma):
- **(A) Cartão obrigatório com pré-autorização R$ 1**: a Efí faz o tokenize; sem cobrar nada o cartão fica vinculado. Hash do `card_fingerprint` (BIN + últimos 4 + nome) entra na blocklist.
- **(B) Pix de R$ 1 reembolsado**: chato pro usuário, mas amarra CPF + chave Pix.
- **(C) Trial só com plano contratado** (cobrança após 10 dias, com cancelamento livre) — é o que Netflix, Spotify e quase todo SaaS sério faz.

Recomendo **(A)** para manter atrito baixo e funil de conversão alto.

## 5. Blocklist unificada

Tabela única `trial_abuse_blocklist` com colunas `kind` (`cpf|phone|email_norm|fingerprint|ip|card_fp|asn`) + `value_hash` + `reason` + `expires_at`. A função `checkSignupFn` consulta todas as camadas numa só ida ao banco.

Quando uma conta é encerrada por inadimplência/abuso, admin marca "queimar identidade" → joga CPF/telefone/fingerprint/cartão na blocklist permanente.

## 6. Reduzir o valor do "backup de fluxo"

O export do JSON em `app.flows.$id.tsx` (botão "Exportar") é o que viabiliza a migração entre contas. Não dá pra remover (legítimos usam pra versionar), mas:

- **Exportar exige conta paga** (plano ativo, não trial). Reduz a transferência entre contas grátis.
- **Marca d'água no JSON**: campo `__origin: { user_id_hash, exported_at }`. Se aparecer o mesmo hash em outra conta nova importando, levanta flag.
- **Importar fluxo de mesma origem em conta nova com <7 dias** → exige aprovação manual.

## 7. Sinais comportamentais (passivos, só logam)

Não bloqueiam sozinhos, mas viram dashboard pro admin revisar:

- Várias contas com mesmo `Accept-Language` + fuso + range de horário de uso.
- Conta nova que importa fluxo enorme nos primeiros 10 minutos.
- CPF/telefone com padrão sequencial.
- Mesmo número de WhatsApp conectado anteriormente em outra conta (já temos `whatsapp_instances.phone_number` — fácil cruzar).

## 8. UX honesto

Na tela de cadastro deixar claro: "Detectamos tentativa de criar nova conta para reutilizar o trial. Fale com o suporte." — não revela qual sinal disparou (para não ensinar a contornar).

## Detalhes técnicos

### Migrações
- `trial_abuse_blocklist(id, kind, value_hash, reason, expires_at, created_at)` + índice `(kind, value_hash)`.
- `signup_identity_log(user_id, cpf_hash, phone_hash, email_norm_hash, created_at)`.
- `signup_device_log(user_id, fingerprint_hash, ip, asn, country, ua, created_at)`.
- `disposable_email_domains(domain primary key)`.
- Adicionar `card_fingerprint_hash` em `subscriptions` (vindo da Efí).

### Server functions
- `preSignupCheckFn(input: { email, phone, cpf, fingerprint })` → consulta tudo, retorna `{ ok, reason? }`.
- `recordSignupFn` (extensão da atual) → grava nas 3 tabelas e roda blocklist insert se houver hit suave.
- `requestSignupOtpFn` / `confirmSignupOtpFn` → Twilio Verify ou Evolution (PTT/SMS gateway que já temos).
- Webhook Efí: ao receber `card_fingerprint`, gravar e re-checar blocklist.

### Frontend
- `/auth` ganha passos: e-mail → OTP → CPF + telefone → fingerprint silencioso → cartão (Efí tokenizer iframe).
- Botão "Exportar fluxo" desabilitado para `status = 'trialing'`.

### Ordem sugerida de execução
1. Migrações + blocklist unificada + e-mail normalizado + domínios descartáveis (rápido, ganho imediato).
2. Fingerprint do device (1 lib, baixo risco).
3. CPF + OTP de telefone (mais trabalho, maior impacto).
4. Cartão na Efí no trial (o golpe final).
5. Restrições de export + marca d'água.
6. Dashboard admin com os sinais comportamentais.

### O que NÃO recomendo
- Banir por IP puro com janela longa — mata cliente legítimo em coworking/casa compartilhada.
- KYC com selfie/documento foto — atrito gigante, derruba conversão.
- Encurtar trial — não resolve o problema, só piora UX do cliente honesto.
