#!/bin/bash
# Script para criar zip de Lambda com estrutura correta

HANDLER_NAME=$1
HANDLER_FOLDER=$2

if [ -z "$HANDLER_NAME" ] || [ -z "$HANDLER_FOLDER" ]; then
  echo "Usage: $0 <handler-name> <handler-folder>"
  exit 1
fi

# Limpar diretório temporário
rm -rf /tmp/lambda-zip
mkdir -p /tmp/lambda-zip/handlers/$HANDLER_FOLDER
mkdir -p /tmp/lambda-zip/lib
mkdir -p /tmp/lambda-zip/types

# Copiar handler
cp backend/dist/handlers/$HANDLER_FOLDER/$HANDLER_NAME.js /tmp/lambda-zip/handlers/$HANDLER_FOLDER/

# Copiar lib e types
cp -r backend/dist/lib/* /tmp/lambda-zip/lib/
cp -r backend/dist/types/* /tmp/lambda-zip/types/

# Criar zip
cd /tmp/lambda-zip
zip -r $HANDLER_NAME.zip .
mv $HANDLER_NAME.zip /tmp/

echo "Zip created at /tmp/$HANDLER_NAME.zip"
