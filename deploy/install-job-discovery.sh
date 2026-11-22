#!/usr/bin/env bash
# Install the Relay job discovery + verification + preparation + notification
# systemd timers on the VPS. Run as the deploy user (sudo allowed for systemctl).
set -euo pipefail

units=(
  deploy/job-discovery.service deploy/job-discovery.timer
  deploy/job-inventory.service deploy/job-inventory.timer
  deploy/job-verification.service deploy/job-verification.timer
  deploy/job-preparation.service deploy/job-preparation.timer
  deploy/job-notifications.service deploy/job-notifications.timer
)
for unit in "${units[@]}"; do
  sudo cp "$unit" "/etc/systemd/system/$(basename "$unit")"
done

sudo systemctl daemon-reload
sudo systemctl enable --now \
  job-discovery.timer job-inventory.timer job-verification.timer \
  job-preparation.timer job-notifications.timer

echo "Installed. Next runs:"
systemctl list-timers job-discovery.timer job-inventory.timer job-verification.timer job-preparation.timer job-notifications.timer --no-pager
echo
echo "Manual runs:"
for name in discovery inventory verification preparation notifications; do
  echo "  sudo systemctl start job-${name}.service"
done
echo "Logs:"
for name in discovery inventory verification preparation notifications; do
  echo "  journalctl -u job-${name}.service -e"
done
echo "Remove:"
echo "  sudo systemctl disable --now job-discovery.timer job-inventory.timer job-verification.timer job-preparation.timer job-notifications.timer"
echo "  sudo rm /etc/systemd/system/job-discovery.{service,timer} /etc/systemd/system/job-inventory.{service,timer} /etc/systemd/system/job-verification.{service,timer} /etc/systemd/system/job-preparation.{service,timer} /etc/systemd/system/job-notifications.{service,timer}"
echo "  sudo systemctl daemon-reload"
