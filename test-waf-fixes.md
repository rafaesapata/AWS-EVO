# Script de Teste - WAF Fixes

## ✅ Checklist de Validação

### Teste 1: Filtro de Clique nos Cards (5 minutos)

**Pré-requisitos:**
- Acesso a https://evo.ai.udstec.io
- Conta AWS conectada com WAF ativo
- Eventos WAF disponíveis

**Passos:**

1. **Acessar WAF Monitoring**
   ```
   Menu lateral → WAF Monitoring
   ```
   - [ ] Página carrega sem erros
   - [ ] Cards de métricas são exibidos

2. **Testar filtro "Critical Threats"**
   ```
   Clicar no card "Critical Threats" (vermelho)
   ```
   - [ ] Muda automaticamente para aba "Eventos"
   - [ ] Lista de eventos é exibida (não vazia se houver eventos críticos)
   - [ ] Eventos mostrados têm badge "Critical" vermelho
   - [ ] Console do navegador NÃO mostra logs "Filtering:"

3. **Testar filtro "Blocked Requests"**
   ```
   Voltar para aba "Visão Geral"
   Clicar no card "Blocked Requests" (vermelho)
   ```
   - [ ] Muda para aba "Eventos"
   - [ ] Eventos mostrados têm ícone de bloqueio (Ban) vermelho
   - [ ] Todos eventos têm action "BLOCK"

4. **Testar filtro "Active Campaigns"**
   ```
   Voltar para aba "Visão Geral"
   Clicar no card "Active Campaigns" (roxo)
   ```
   - [ ] Muda para aba "Eventos"
   - [ ] Eventos mostrados têm badge "Campaign" roxo
   - [ ] Se não houver campanhas, lista pode estar vazia (OK)

5. **Verificar console do navegador**
   ```
   F12 → Console
   ```
   - [ ] NÃO deve haver logs "Filtering:" repetidos
   - [ ] Console deve estar limpo

---

### Teste 2: Barra de Progresso da Análise de IA (2 minutos)

**Pré-requisitos:**
- Acesso a https://evo.ai.udstec.io
- Conta AWS conectada com WAF ativo

**Passos:**

1. **Acessar aba de Análise**
   ```
   WAF Monitoring → aba "Visão Geral"
   Rolar até seção "Análise Inteligente de Tráfego"
   ```
   - [ ] Card de análise é exibido

2. **Iniciar análise**
   ```
   Clicar em "Executar Análise com IA" (ou "Atualizar Análise")
   ```
   - [ ] Layout de progresso aparece IMEDIATAMENTE
   - [ ] Toast "Análise em Processamento" é exibido
   - [ ] Barra de progresso é visível

3. **Observar progresso (30-45 segundos)**
   ```
   Aguardar sem interagir
   ```
   - [ ] Percentual incrementa de 0% até ~95%
   - [ ] Tempo elapsed incrementa (0s, 1s, 2s...)
   - [ ] 4 etapas mudam de estado:
     - [ ] Etapa 1: Coletando Métricas (completa primeiro)
     - [ ] Etapa 2: Analisando Padrões (completa segundo)
     - [ ] Etapa 3: Gerando Insights (completa terceiro)
     - [ ] Etapa 4: Salvando Análise (completa por último)
   - [ ] Barra de progresso NÃO desaparece durante o processo

4. **Verificar conclusão**
   ```
   Após 30-45 segundos
   ```
   - [ ] Progresso vai para 100%
   - [ ] Toast "Análise Concluída" é exibido
   - [ ] Layout de progresso desaparece
   - [ ] Resultado da análise é exibido com:
     - [ ] Quick Stats (Total Requisições, Bloqueadas, etc.)
     - [ ] Nível de Risco (badge colorido)
     - [ ] Tipos de Ameaças Detectadas
     - [ ] Análise da IA (texto em markdown)

5. **Verificar timestamp**
   ```
   Rolar até o final da análise
   ```
   - [ ] "Gerado em: [data/hora]" é exibido
   - [ ] Data/hora é recente (últimos minutos)

---

## 🐛 Problemas Conhecidos (Esperados)

### Filtro de Eventos
- Se não houver eventos com o filtro aplicado, lista ficará vazia (comportamento correto)
- Exemplo: Se não houver eventos "Critical", clicar no card mostrará lista vazia

### Análise de IA
- Se análise demorar mais de 60 segundos, polling para e mostra mensagem informativa
- Usuário pode clicar em "Atualizar Análise" novamente após alguns instantes

---

## ❌ Problemas que NÃO devem ocorrer

### Filtro de Eventos
- ❌ Lista de eventos vazia quando há eventos disponíveis
- ❌ Console poluído com logs "Filtering:"
- ❌ Filtros não sendo aplicados ao clicar nos cards

### Análise de IA
- ❌ Barra de progresso desaparecendo após toast
- ❌ Layout de progresso sumindo rapidamente
- ❌ Análise não sendo salva no banco

---

## 📊 Métricas de Sucesso

### Filtro de Eventos
- ✅ 100% dos cliques em cards devem filtrar eventos corretamente
- ✅ 0 logs de debug no console
- ✅ Tempo de resposta < 100ms para aplicar filtro

### Análise de IA
- ✅ Barra de progresso visível por 30-45 segundos
- ✅ Progresso incrementa suavemente (sem saltos)
- ✅ Análise salva no banco e exibida corretamente
- ✅ Timestamp correto (últimos minutos)

---

## 🔧 Troubleshooting

### Filtro não funciona
1. Verificar se há eventos disponíveis (aba "Eventos" sem filtro)
2. Verificar console do navegador por erros
3. Limpar cache do navegador (Ctrl+Shift+R)
4. Verificar se CloudFront invalidation completou (aguardar 2-3 minutos)

### Barra de progresso não aparece
1. Verificar console do navegador por erros
2. Verificar se backend está respondendo (Network tab)
3. Limpar cache do navegador
4. Verificar se Lambda `waf-dashboard-api` está funcionando

### Análise não completa
1. Verificar logs da Lambda `waf-dashboard-api` no CloudWatch
2. Verificar se há eventos WAF disponíveis
3. Verificar se Bedrock está acessível
4. Aguardar 60 segundos e tentar novamente

---

**Criado em:** 2026-01-17  
**Versão:** 1.0  
**Tempo estimado:** 7 minutos

