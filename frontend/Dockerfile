FROM node:20-alpine
WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173
# --host makes Vite listen on 0.0.0.0 so the container is reachable.
CMD ["npm", "run", "dev", "--", "--host"]
