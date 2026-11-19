#!/usr/bin/env bash
# Install the Relay job discovery + notification systemd timers on the VPS.
# Run as the deploy user (sudo allowed for systemctl).
set -euo pipefail

for unit in deploy/job-discovery.service deploy/job-discovery.timer deploy/job-notifications.service deploy/job-notifications.timer; do
  sudo cp "$unit" "/etc/systemd/system/$(basename "$unit")"
done

sudo systemctl daemon-reload
sudo systemctl enable --now job-discovery.timer job-notifications.timer

echo "Installed. Next runs:"
systemctl list-timers job-discovery.timer job-notifications.timer --no-pager
echo
echo "Manual runs:"
echo "  sudo systemctl start job-discovery.service"
echo "  sudo systemctl start job-notifications.service"
echo "Logs:"
echo "  journalctl -u job-discovery.service -e"
echo "  journalctl -u job-notifications.service -e"
echo "Remove:"
echo "  sudo systemctl disable --now job-discovery.timer job-notifications.timer"
echo "  sudo rm /etc/systemd/system/job-discovery.{service,timer} /etc/systemd/system/job-notifications.{service,timer}"
echo "  sudo systemctl daemon-reload"
