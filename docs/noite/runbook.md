# Runbook — execução autônoma noturna

Você (Claude Code) vai trabalhar sozinho por várias horas. O usuário está dormindo e **não vai responder perguntas**. O objetivo da noite é deixar pronto, de manhã, o máximo de trabalho verificável: a sala candidata à aprovação da Fase 0 e, em paralelo, a navegação (Fase 1) e o livro em cena isolada (Fase 2).

A lista de tarefas com critérios de pronto está em `docs/noite/tarefas.md`. Esse arquivo é o seu estado: atualize-o sempre.

## Regras de autonomia

1. **Nunca pare para perguntar.** Diante de uma dúvida, escolha a opção mais razoável segundo a direção de arte e as specs, registre em `docs/decisoes.md` (contexto, escolha, alternativa descartada, como reverter) e siga.
2. **Fontes de verdade, nesta ordem:** `docs/direcao-de-arte.md` + `docs/referencia.jpg` → `config/room.json` → `docs/specs/*.md` → este runbook. Mudanças em `room.json` são permitidas durante o look dev, sempre registradas em `docs/decisoes.md`.
3. **Git:** trabalhe na branch `noite-01`. Commit ao concluir cada tarefa e a cada marco dentro de tarefas longas. **Nunca** faça push, rebase ou reescrita de histórico. Não versione `assets/source/`, `blender/out/` nem `shots/` (exceto `shots/latest/`), via `.gitignore`.
4. **Estado:** marque no `tarefas.md` `[x]` (feita, com a evidência ao lado) ou `[!]` (bloqueada, com link para `docs/noite/bloqueios.md`). **Depois de qualquer compactação de contexto, releia este runbook e o `tarefas.md` antes de continuar.**
5. **Evidência no chat:** ao terminar cada tarefa, rode `date` e escreva no chat o horário, o comando de verificação, o resultado e o resumo atual do `tarefas.md`. O avaliador do `/goal` só enxerga a conversa — inclusive para saber quanto tempo passou desde o início anotado no T0.
6. **Timebox:** se uma tarefa ficar 45 minutos sem progresso real, registre em `docs/noite/bloqueios.md` o que tentou e o erro, deixe o melhor estado funcional commitado e passe para a próxima tarefa independente. Volte a ela no fim, se sobrar tempo.
7. **Processos longos** (bake `final`, renders) rodam em background. Enquanto rodam, avance na Trilha B. Nunca fique ocioso esperando.
8. **Sistema:** não instale software global, não use `sudo`, não altere configurações do sistema. Dependências só via `npm` no projeto. Se faltar algo do sistema (Blender, GPU, `ktx`), registre e siga com o fallback documentado ou com o que for possível.
9. **Gate da Fase 0:** você não aprova a Fase 0. Você deixa **candidatos** prontos para aprovação. O livro **não** entra na sala nesta noite.
10. **Placeholders** só para não travar uma tarefa, sempre com `// PLACEHOLDER` no código e uma linha em `docs/placeholders.md` (o quê, por quê, como substituir).
11. **Contexto:** use subagentes para leituras extensas e pesquisa. Não despeje logs inteiros no chat (use `tail`, filtre erros). Logs completos vão para `logs/`.
12. **Revisão independente:** a avaliação visual é feita pelo subagente `art-reviewer`, não por você. Siga as divergências que ele aponta, em ordem de impacto.
13. **Scaffold:** nunca rode geradores que apagam a pasta (`--overwrite`, `rm -rf` na raiz). O kit (`CLAUDE.md`, `docs/`, `config/`, `assets/manifest.json`, `scripts/`, `.claude/`) é intocável, exceto as edições previstas nas specs.

## Trilhas e ordem

**Trilha A — look dev (prioridade):** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7.
**Trilha B — sem dependência visual:** T8 (navegação) e T9 (livro isolado). Comece a Trilha B sempre que a Trilha A estiver esperando um processo longo, e obrigatoriamente depois que T7 atingir o critério ou esgotar as iterações.

## Laço de look dev (T7)

1. `npm run pipeline -- --quality draft` (ou só a etapa que mudou) → `npm run shot`.
2. Subagente `art-reviewer` avalia `shots/latest/compare_N0.png` e os shots de N1/N2.
3. Registre a iteração em `docs/look-dev/iteracoes.md`: número, o que mudou, notas por critério, divergências.
4. Corrija a divergência de maior impacto (uma ou duas por iteração, não tudo de uma vez) e repita.
5. Quando todas as notas forem ≥ 4, faça um bake `final`, um último shot e uma última revisão.
6. Limite: 8 iterações em `draft`. Se não chegar lá, faça o `final` com a melhor versão e registre o que falta.

## Relatório final

Antes de encerrar (ou ao chegar a 10 horas desde o início anotado no T0), escreva `docs/noite/relatorio.md`:

- Resumo em 5 linhas do que ficou pronto.
- Como ver: comandos exatos (`npm install`, `npm run dev`, URLs com `?node=` e `?dev=book`).
- Screenshots: caminhos de `shots/latest/` (compare N0, N1, N2, livros).
- Última avaliação do `art-reviewer` com as notas por critério.
- Orçamento: draw calls por nó, tamanho do download, tamanho de cada lightmap, GPU usada no screenshot.
- **Decisões que precisam do usuário** (lista curta, cada uma com a recomendação).
- Bloqueios e placeholders pendentes.
- Próximos passos sugeridos para a próxima noite.

Commit final com o relatório. `git status` limpo.
