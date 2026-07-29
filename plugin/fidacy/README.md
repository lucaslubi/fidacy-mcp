# Fidacy para Claude Code

O firewall observa toda ação do agente, devolve um relatório no fim da sessão, e
termina num digest que qualquer um recomputa. Comando, caminho e argumento nunca
saem da máquina: viajam contagem e um hash.

## Por que este plugin existe, e não só o servidor MCP

Um servidor MCP só enxerga chamadas às **próprias** ferramentas. Quando o agente
roda um comando ou escreve um arquivo, `@fidacy/mcp` não fica sabendo, e não
existe notificação no protocolo que conte.

Quem enxerga tudo no Claude Code é o sistema de **hooks do host**. É o que este
plugin liga.

O número que motivou: dos 346 installs reais em 28/07/2026, **308 vieram por MCP
e 97% deles nunca viram o produto se manifestar**. O observador nativo tinha
chegado só ao canal com sete installs.

## Instalar

```
/plugin install fidacy
```

Ou, sem plugin, uma entrada em `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "npx -y -p @fidacy/mcp fidacy-hook", "timeout": 5 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "npx -y -p @fidacy/mcp fidacy-hook", "timeout": 30 }] }]
  }
}
```

O caminho do plugin é preferível: ele chama o binário direto, sem resolver pacote
a cada chamada de ferramenta.

## O que custa

Cerca de 45ms por chamada de ferramenta, que é essencialmente a partida do Node.
O caminho quente faz **um append** e nada mais: sem hash, sem rede, sem leitura de
configuração. A cadeia é reconstruída no fim da sessão, onde latência não custa.

Nada é impresso durante a sessão. O relatório aparece uma vez, no fim.
