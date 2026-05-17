#!/bin/bash
set -euo pipefail

exec 3>&1
exec 1>/dev/null
exec 2>&3

PANEL="${PTERODACTYL_DIRECTORY}"

info() { echo "$*" >&2; }
die()  { echo "ERROR: $*" >&2; exit 1; }

restore() {
    local src="$1"
    local bak="${src}.{identifier}.bak"
    if [ -f "$bak" ]; then
        cp "$bak" "$src" && rm "$bak"
        info "Restored: $src"
    else
        info "No backup found for $src — skipping restore"
    fi
}

for svc in ServerDeletionService SuspensionService; do
    restore "${PANEL}/app/Services/Servers/${svc}.php"
done

restore "${PANEL}/app/Models/Permission.php"
restore "${PANEL}/app/Models/Server.php"
restore "${PANEL}/app/Services/Servers/ServerCreationService.php"
restore "${PANEL}/app/Services/Servers/BuildModificationService.php"
restore "${PANEL}/app/Http/Requests/Api/Application/Servers/StoreServerRequest.php"
restore "${PANEL}/app/Http/Controllers/Admin/ServersController.php"
restore "${PANEL}/app/Transformers/Api/Client/ServerTransformer.php"
restore "${PANEL}/resources/views/admin/servers/new.blade.php"
restore "${PANEL}/resources/views/admin/servers/view/build.blade.php"

info "Uninstall complete."
