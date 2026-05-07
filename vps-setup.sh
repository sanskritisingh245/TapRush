#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 22.04/24.04 VPS that will host the TapRush backend.
# Run as root on the VPS:  bash vps-setup.sh

set -euo pipefail

DOMAIN="api.fastdraw.fun"
DEPLOY_USER="taprush"

echo "═══════════════════════════════════════════════════════"
echo "TapRush VPS setup — domain: $DOMAIN"
echo "═══════════════════════════════════════════════════════"

# 1. Update + base packages
echo "[1/7] System update..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ufw curl ca-certificates gnupg lsb-release

# 2. Install Docker + compose plugin
echo "[2/7] Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# 3. Create deploy user (no root SSH)
echo "[3/7] Creating deploy user '$DEPLOY_USER'..."
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
fi

# 4. Install the deploy SSH pubkey (passed in via env DEPLOY_PUBKEY)
echo "[4/7] Authorizing deploy SSH key..."
if [ -z "${DEPLOY_PUBKEY:-}" ]; then
  echo "ERROR: set DEPLOY_PUBKEY env var to the SSH public key string before running."
  exit 1
fi
mkdir -p /home/$DEPLOY_USER/.ssh
echo "$DEPLOY_PUBKEY" > /home/$DEPLOY_USER/.ssh/authorized_keys
chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

# 5. Harden SSH (key only, no root, no password)
echo "[5/7] Hardening SSH..."
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd

# 6. Firewall: only 22, 80, 443
echo "[6/7] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 7. Set up Caddy reverse proxy with auto-TLS
echo "[7/7] Installing Caddy for TLS termination on $DOMAIN..."
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3000
    encode gzip
    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}
EOF

systemctl enable caddy
systemctl restart caddy

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ VPS is ready."
echo ""
echo "Verify:"
echo "  systemctl status caddy --no-pager"
echo "  systemctl status docker --no-pager"
echo "  sudo -u $DEPLOY_USER docker ps"
echo ""
echo "DNS: point an A record for $DOMAIN at this server's public IP."
echo "Caddy will fetch a TLS cert from Let's Encrypt automatically once DNS resolves."
echo "═══════════════════════════════════════════════════════"
