# Spec — Fase 1: navegação por nós + olhar 360°

Não altera o visual da sala, por isso pode ser desenvolvida em paralelo ao look dev (ver `docs/noite/runbook.md`). Nós e arestas vêm de `config/room.json`.

## Comportamento

- **Olhar:** arrastar (mouse ou toque, via pointer events) gira yaw/pitch no lugar. Pitch limitado a −60°…+60°. Inércia curta (amortecimento ~0,15 s), sem "flutuar".
- **Zoom:** roda do mouse / pinça ajusta o FOV entre 40° e 70°; nunca move a câmera.
- **Teclado:** setas ←/→ giram, ↑ avança, ↓ volta. W/S também avançam/voltam.
- **Avançar/voltar:** botões de seta na parte de baixo da tela e um marcador clicável no piso (anel discreto, estilo Street View) na direção de cada vizinho. Clicar no marcador vai para aquele nó.
- **Transição:** tween de posição com GSAP, 1,4 s, `power2.inOut`. A orientação faz um tween suave para o yaw/pitch padrão do nó de destino apenas se a diferença for grande (> 60°); senão mantém o olhar do usuário. Entrada bloqueada durante o tween.
- **Movimento reduzido:** com `prefers-reduced-motion`, a transição vira um fade curto (0,3 s).
- **N2:** ao chegar, a câmera se orienta para a estante (yaw do nó) — é o ponto de interação com os livros (Fase 3).
- **URL:** `?node=N1&yaw=10&pitch=-5&fov=55` define o estado inicial (usado pelo `npm run shot`). O estado atual **não** é escrito na URL a cada movimento.

## Código

```
src/navigation/
  nodes.ts           tipos + leitura do room.json (NavNode, NavEdge, getNeighbors)
  useNavigation.ts   store zustand: currentNode, isTransitioning, yaw, pitch, fov, goTo(nodeId), step(dir)
  LookControls.tsx   pointer/teclado/roda → yaw/pitch/fov (sem OrbitControls; controle próprio, leve)
  NodeMarkers.tsx    anéis no piso para os vizinhos (raycast simples, hover com leve brilho)
  NavigationUI.tsx   botões ←/→ de avanço, acessíveis (aria-label, foco visível), escondidos com ?shot=1
```

- Yaw 0 = olhando para −Z (parede do fundo). Graus na API, radianos internamente.
- Nada de movimento livre: a câmera só existe nas posições dos nós ou no tween entre elas.
- Os marcadores não podem aparecer nos screenshots de aprovação (`?shot=1` os esconde).

## Verificação

- Teste Playwright `e2e/navigation.spec.ts` (`npm run e2e`): abre `/?e2e=1` em N0, clica avançar duas vezes, confere `window.__NAV__.currentNode === 'N2'` (o objeto só existe com `?e2e=1`), volta, confere N1. Tira screenshot de cada nó.
- `npm run check` limpo.
- Sem queda de quadros perceptível durante o tween (registrar no relatório os draw calls, que não devem mudar com a navegação).
