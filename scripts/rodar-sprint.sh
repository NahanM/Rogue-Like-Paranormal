#!/usr/bin/env bash
# Roda UMA sprint com os agentes, sem ninguém olhando, e sobe o resultado numa branch nova.
# A main nunca é tocada: o que os agentes fizerem só entra depois de revisado (Pull Request).
#
# Uso, na VPS, dentro da pasta do projeto:
#   bash scripts/rodar-sprint.sh
# Log de cada rodada: ~/logs/sprint-DATA.log

set -euo pipefail

# Até onde a Kimi pode ir numa rodada. Passou disso, o script corta e sobe o que tiver.
LIMITE="${LIMITE:-4h}"

cd "$(dirname "$0")/.."

# Uma rodada por vez: duas ao mesmo tempo mexendo nos mesmos arquivos vira bagunça
exec 9>"$HOME/.rodar-sprint.lock"
if ! flock -n 9; then
  echo "Já tem uma sprint rodando. Pra ver: tmux attach -t sprint" >&2
  exit 1
fi

mkdir -p "$HOME/logs"
STAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH="kimi/sprint-$STAMP"
LOG="$HOME/logs/sprint-$STAMP.log"

# Começa sempre da main atualizada e sem nada pendente
if [ -n "$(git status --porcelain)" ]; then
  echo "Tem mudança sem commit na pasta. Confere com: git status" >&2
  exit 1
fi
git checkout -q main
git pull -q --ff-only
git checkout -q -b "$BRANCH"

PROMPT='Faça a sprint marcada como ATUAL no PLANO.md, seguindo o teu fluxo. Tu está rodando SOZINHO numa VPS: não tem humano pra responder. Dúvida que os docs não resolvem: não invente, anote no resumo e pule aquela tarefa. Quando acabar ou travar, escreva o resumo final (o que mudou, o que ficou pendente, as dúvidas) e pare.'

echo "Começou $(date) na branch $BRANCH (limite $LIMITE)" | tee "$LOG"

# set +e só aqui: se a Kimi travar ou estourar o tempo, o script continua e sobe o que tiver
set +e
timeout "$LIMITE" opencode run --agent orquestrador "$PROMPT" 2>&1 | tee -a "$LOG"
STATUS=${PIPESTATUS[0]}
set -e

if [ "$STATUS" -eq 124 ]; then
  RESULTADO="estourou o limite de $LIMITE"
else
  RESULTADO="opencode saiu com código $STATUS"
fi
echo "$RESULTADO" | tee -a "$LOG"

if [ -z "$(git status --porcelain)" ]; then
  echo "Nada mudou no código, então não tem o que subir." | tee -a "$LOG"
  git checkout -q main
  git branch -q -D "$BRANCH"
  exit 0
fi

# Confere o build antes de subir; o resultado vai na mensagem do commit
if npm run build >>"$LOG" 2>&1; then BUILD="build OK"; else BUILD="BUILD FALHOU"; fi

git add -A
git commit -q -m "Sprint dos agentes ($STAMP): $BUILD" -m "$RESULTADO. Log na VPS: $LOG"
git push -q -u origin "$BRANCH"
git checkout -q main

echo "Subiu na branch $BRANCH ($BUILD). Terminou $(date)" | tee -a "$LOG"
