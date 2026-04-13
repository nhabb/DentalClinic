#!/bin/sh
set -e

CERT=/etc/nginx/ssl/cert.pem
KEY=/etc/nginx/ssl/key.pem

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[nginx] No TLS certificates found — generating self-signed certificate..."
    mkdir -p /etc/nginx/ssl

    # Include both brightsmile.com and localhost as Subject Alternative Names
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY" \
        -out    "$CERT" \
        -subj   "/C=US/ST=State/L=City/O=BrightSmile Dental/CN=brightsmile.com" \
        -addext "subjectAltName=DNS:brightsmile.com,DNS:localhost,IP:127.0.0.1" \
        2>/dev/null
else
    echo "[nginx] TLS certificates found — skipping generation."
fi

exec nginx -g "daemon off;"
