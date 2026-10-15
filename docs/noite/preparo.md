# Preparo antes de dormir (~30 min)

Checklist para o usuário deixar o Claude Code trabalhando a noite toda sem travar.

## 1. Programas

- [ ] **Node.js 22.12+** (`node -v`).
- [ ] **Git** (`git --version`).
- [ ] **Blender 5.2 LTS** instalado. Teste no terminal: `blender --version`. Se não estiver no PATH, anote o caminho completo do executável (passo 3).
- [ ] **KTX-Software 4.4+**: instalador da página de releases em github.com/KhronosGroup/KTX-Software (Windows `.exe`, macOS `.pkg`, Linux `.deb`/`.rpm`). Teste: `ktx --version`. É ele que comprime as texturas; sem ele a noite segue com um formato pior (WebP).
- [ ] **Claude Code atualizado:** `claude update` e depois `claude --version`. Versões recentes trazem o modo auto, o `/goal` e a retomada automática quando o limite de uso reseta.
- [ ] Drivers de vídeo atualizados (o bake usa a GPU se houver).

## 2. Repositório

```bash
mkdir live-book && cd live-book
git init
# descompacte o kit aqui dentro (CLAUDE.md, config/, docs/, assets/, scripts/, .claude/, .gitignore, .env.example)
git add -A && git commit -m "docs: kit inicial do Live Book"
```

Atenção: o zip traz uma pasta `live-book/`. O conteúdo dela é que vai na raiz do repositório (o `CLAUDE.md` precisa ficar na raiz).

## 3. Variáveis locais

Copie `.env.example` para `.env.local` (não vai para o git) e ajuste o caminho:

```
BLENDER_BIN=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe
```

(no macOS: `/Applications/Blender.app/Contents/MacOS/Blender`; no Linux: o caminho do executável, ou só `blender` se estiver no PATH)

## 4. GPU no Blender (uma vez)

Abra o Blender → Edit → Preferences → System → Cycles Render Devices → escolha OptiX (NVIDIA RTX), CUDA, HIP (AMD) ou Metal (Mac) e marque a placa → **Save Preferences**. O script também tenta ativar sozinho, mas isso garante.

## 5. Energia e sistema

- Notebook na tomada e **tampa aberta** (ou configure "fechar a tampa = não fazer nada").
- Desative a suspensão automática (a tela pode apagar, o computador não pode dormir).
  - Windows: Configurações → Sistema → Energia → "Suspender" = Nunca (na tomada). **Pause o Windows Update** (Configurações → Windows Update → Pausar por 1 semana) para ele não reiniciar o computador de madrugada.
  - macOS: rode `caffeinate -dimsu` num terminal separado e deixe aberto.
  - Linux: `systemd-inhibit --what=sleep:idle sleep 12h` num terminal separado.

## 6. Iniciar a sessão

```bash
cd live-book
claude
```

1. Confirme a confiança na pasta quando perguntado.
2. Confira o modo de permissão na barra de status: precisa ser **auto mode** (`Shift+Tab` alterna). Em modo manual ele vai parar esperando aprovação.
3. Rode `/context` e confira que o `CLAUDE.md` foi carregado.
4. Cole o comando abaixo e acompanhe uns 5 a 10 minutos para ver o T0 começar bem (scaffold criado sem apagar o kit).

```text
/goal Execute docs/noite/runbook.md de ponta a ponta, seguindo docs/noite/tarefas.md. A meta está cumprida quando: todas as tarefas de docs/noite/tarefas.md estiverem marcadas [x] com evidência ou [!] com o motivo registrado em docs/noite/bloqueios.md; docs/noite/relatorio.md estiver escrito; tudo commitado na branch noite-01; git status limpo; nenhum push feito. No T0, rode `date` e mostre o horário de início; ao fim de cada tarefa, rode `date` e mostre no chat o horário, o comando de verificação, o resultado e o estado atual do tarefas.md. Se o último `date` mostrado estiver 10 horas ou mais depois do início, escreva o relatório, faça o commit final e considere a meta cumprida.
```

Se o limite de uso da sua conta for atingido no meio da noite, a sessão espera o reset e continua sozinha — não feche o terminal.

## 7. De manhã

1. Leia `docs/noite/relatorio.md`.
2. Abra `shots/latest/compare_N0.png` (referência × resultado).
3. Rode `npm run dev` e navegue pela sala.
4. Traga para cá (claude.ai, projeto Live-book-v2) o relatório e os screenshots: a gente decide junto o que aprovar e prepara a próxima noite.
