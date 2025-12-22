#!/bin/bash

# Script para migrar console.* para logger.*
# Executar na raiz do projeto

echo "🔄 Migrando console.* para logger.*..."

# Backend handlers
cd backend/src/handlers

# Encontrar todos os arquivos .ts
for file in $(find . -name "*.ts" -type f); do
  echo "Processando: $file"
  
  # Verificar se já tem import do logger
  if ! grep -q "import.*logger.*from" "$file"; then
    # Adicionar import no início
    sed -i '1i import { logger } from "../../lib/logging.js";' "$file"
  fi
  
  # Substituir console.log
  sed -i "s/console\.log(\(.*\));/logger.info(\1);/g" "$file"
  
  # Substituir console.warn
  sed -i "s/console\.warn(\(.*\));/logger.warn(\1);/g" "$file"
  
  # Substituir console.error (mantendo o erro)
  sed -i "s/console\.error('\(.*\)', \(.*\));/logger.error('\1', \2);/g" "$file"

done

echo "✅ Migração concluída!"

# Verificar resultado
echo ""
echo "📊 Console restantes:"
grep -rn "console\." --include="*.ts" | wc -l