## Build Stage 1: TS Compilation ##

FROM node:lts-alpine as build
WORKDIR /app

# Install dependencies
COPY ["package.json", "./"]
RUN npm install && npm cache clean --force && npm install -g typescript

# Copy source files
ADD src/ src/
COPY ["tsconfig.json", "*.ts", "./"]

# Compile source files
RUN npm run build


## Build Stage 2: Production build ##

FROM node:lts-alpine

WORKDIR /app

# Copy package.json
COPY ["package.json", "./"]

# Copy built files
COPY --from=build /app/dist ./dist

# Install production dependencies
RUN npm install --omit=dev && npm cache clean --force

# Run server
CMD ["node", "."]
