FROM nginx:alpine
RUN apk add --no-cache openssl
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf    /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r//' /entrypoint.sh && chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
