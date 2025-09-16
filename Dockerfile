# --- Estágio 1: Build da Aplicação ---
# Usamos uma imagem completa do Node para instalar e compilar o projeto
FROM node:20-alpine AS builder

# Define o diretório de trabalho
WORKDIR /usr/src/app

# Copia os arquivos de dependência e instala
COPY package*.json ./
RUN npm install

# Copia todo o resto do código
COPY . .

# Gera o cliente do Prisma
RUN npx prisma generate

# Compila o código TypeScript para JavaScript
RUN npm run build

# --- Estágio 2: Imagem Final de Produção ---
# Usamos uma imagem base leve do Node
FROM node:20-alpine

WORKDIR /usr/src/app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala SOMENTE as dependências de produção
RUN npm install --omit=dev

# Copia os arquivos compilados e o schema do Prisma do estágio anterior
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

# --- LINHA ADICIONADA ---
# Copia o cliente Prisma gerado do estágio anterior para o node_modules final
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Expõe a porta que a aplicação vai usar
EXPOSE 3000

# Comando para iniciar a API em produção
CMD [ "node", "dist/server.js" ]