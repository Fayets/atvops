FROM node:22-alpine AS build

# En producción el frontend habla con /api por el mismo origen (nginx proxy),
# así que la base de la API queda vacía. Para otro destino: --build-arg VITE_API_URL=https://...
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Se comprime una vez acá y no en cada pedido: nginx sirve el .gz tal cual con
# `gzip_static`, sin gastar CPU por visita. Los originales quedan para el navegador
# que no acepte gzip, que a esta altura no existe pero cuesta cero dejarlo.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' \) -exec gzip -9 -k {} \;

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
