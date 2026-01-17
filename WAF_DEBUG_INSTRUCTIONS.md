# 🔍 WAF Debug Instructions

**Data:** 2026-01-17  
**Objetivo:** Diagnosticar por que análise não atualiza após conclusão

---

## ✅ Progresso Atual

### O que está funcionando:
- ✅ Loader aparece e permanece visível por 30-45 segundos
- ✅ Barra de progresso incrementa corretamente
- ✅ 4 etapas mudam de estado
- ✅ Análise é salva no banco (aparece no histórico)
- ✅ Toast "Análise Concluída" aparece

### ❌ O que NÃO está funcionando:
- ❌ Dados antigos permanecem na tela após conclusão
- ❌ Timestamp mostra data antiga (9:53 AM) em vez da nova análise

---

## 🔍 Debug Deploy

**Deploy realizado com logs de debug:**
- ✅ Build: 3.73s
- ✅ S3: Arquivos atualizados
- ✅ CloudFront: Invalidation I2KY9S2PSVCRW7A9YL245412QV
- ✅ **Aguardar 2-3 minutos**

---

## 📋 Instruções de Teste

### Passo 1: Aguardar CloudFront (2-3 minutos)

### Passo 2: Abrir Console do Navegador
```
F12 → Console tab
```

### Passo 3: Hard Refresh
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

### Passo 4: Executar Análise
1. WAF Monitoring → aba "Visão Geral"
2. Clicar em "Executar Análise com IA"
3. **Aguardar 30-45 segundos** (não fechar console!)

### Passo 5: Observar Logs no Console

Você verá logs como:
```
🔄 Polling attempt 1 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 2 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 3 : { hasAnalysis: true, processing: false, ... }
✅ Analysis completed! Updating UI...
📊 Setting analysis data: { ... }
```

### Passo 6: Copiar e Enviar Logs

**Me envie TODOS os logs que aparecerem**, especialmente:
- Quantas tentativas de polling foram feitas
- Quando `processing` mudou de `true` para `false`
- Se apareceu "✅ Analysis completed!"
- Se apareceu "📊 Setting analysis data"
- O conteúdo completo do objeto em "Setting analysis data"

---

## 🎯 O que estamos investigando

### Hipóteses:

1. **Polling não detecta conclusão**
   - `hasAnalysis` ou `processing` não estão corretos
   - Condição `if (pollResponse.data?.hasAnalysis && !pollResponse.data.processing)` nunca é true

2. **setAnalysis não atualiza UI**
   - Dados estão sendo setados mas React não re-renderiza
   - Estrutura de dados está diferente do esperado

3. **Timeout antes de completar**
   - Análise demora mais de 60 segundos
   - Polling para antes de detectar conclusão

---

## 📊 Logs Esperados (Sucesso)

```
🔄 Polling attempt 1 : {
  hasAnalysis: true,
  processing: true,
  hasData: true,
  generatedAt: "2026-01-17T14:53:56.000Z"
}

🔄 Polling attempt 2 : {
  hasAnalysis: true,
  processing: true,
  hasData: true,
  generatedAt: "2026-01-17T14:53:56.000Z"
}

🔄 Polling attempt 3 : {
  hasAnalysis: true,
  processing: false,  ← MUDOU AQUI!
  hasData: true,
  generatedAt: "2026-01-17T15:24:30.000Z"  ← NOVA DATA!
}

✅ Analysis completed! Updating UI...

📊 Setting analysis data: {
  hasAnalysis: true,
  processing: false,
  analysis: "...",
  context: { ... },
  generatedAt: "2026-01-17T15:24:30.000Z"
}
```

---

## 📊 Logs Esperados (Problema)

### Cenário A: Polling não detecta conclusão
```
🔄 Polling attempt 1 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 2 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 3 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 4 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 5 : { hasAnalysis: true, processing: true, ... }
🔄 Polling attempt 6 : { hasAnalysis: true, processing: true, ... }
⏱️ Polling timeout reached
```
**Problema:** `processing` nunca muda para `false`

### Cenário B: hasAnalysis é false
```
🔄 Polling attempt 1 : { hasAnalysis: false, processing: undefined, ... }
🔄 Polling attempt 2 : { hasAnalysis: false, processing: undefined, ... }
```
**Problema:** Backend não está retornando `hasAnalysis: true`

### Cenário C: Dados não atualizam
```
🔄 Polling attempt 3 : { hasAnalysis: true, processing: false, ... }
✅ Analysis completed! Updating UI...
📊 Setting analysis data: { ... }
```
**Problema:** Logs aparecem mas UI não atualiza

---

## 🔧 Próximos Passos

Baseado nos logs que você enviar, vou:

1. **Se polling não detecta:** Corrigir condição ou backend
2. **Se hasAnalysis é false:** Corrigir backend para retornar dados corretos
3. **Se dados não atualizam:** Forçar re-render ou corrigir estrutura de dados

---

## ⚠️ Importante

- **NÃO feche o console** durante o teste
- **Aguarde os 30-45 segundos completos**
- **Copie TODOS os logs**, não apenas alguns
- Se possível, tire um **screenshot do console**

---

**Deploy:** ✅ LIVE (aguardar 2-3 min)  
**Invalidation:** I2KY9S2PSVCRW7A9YL245412QV  
**Próximo passo:** Executar teste e enviar logs

