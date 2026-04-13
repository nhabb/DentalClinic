#!/bin/sh
# Generates a self-signed TLS certificate for local/staging use.
# For production, replace cert.pem and key.pem with real certs
# (e.g. from Let's Encrypt / certbot).

DIR="$(cd "$(dirname "$0")" && pwd)"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$DIR/key.pem" \
  -out    "$DIR/cert.pem" \
  -subj   "/C=US/ST=State/L=City/O=BrightSmile Dental/CN=localhost"

echo "Self-signed certificates written to $DIR"
echo "  cert.pem  — certificate"
echo "  key.pem   — private key"
echo ""
echo "For production use Let's Encrypt:"
echo "  certbot certonly --standalone -d yourdomain.com"
echo "  Then copy fullchain.pem → cert.pem and privkey.pem → key.pem"
