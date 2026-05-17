#!/bin/bash
set -euo pipefail

exec 3>&1
exec 1>/dev/null
exec 2>&3

PANEL="${PTERODACTYL_DIRECTORY}"
EXT="${PANEL}/.blueprint/extensions/{identifier}"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "$*" >&2; }

backup() {
    local src="$1"
    local dst="${src}.{identifier}.bak"
    if [ ! -f "$src" ]; then
        die "Required file not found: $src"
    fi
    if [ -f "$dst" ]; then
        info "Backup already exists: $dst — skipping"
        return 0
    fi
    cp "$src" "$dst" || die "Failed to backup: $src"
    info "Backed up: $src"
}

patch_line_after() {
    local file="$1"
    local needle="$2"
    local fragment="$3"
    local line
    line=$(grep -n "$needle" "$file" | head -1 | cut -d: -f1)
    if [ -z "$line" ]; then
        die "Could not find needle in $file: $needle"
    fi
    local total before after
    total=$(wc -l < "$file")
    before=$(head -n "$line" "$file")
    after=$(tail -n $((total - line)) "$file")
    printf '%s\n%s\n%s\n' "$before" "$fragment" "$after" > "$file"
}

patch_line_before() {
    local file="$1"
    local needle="$2"
    local fragment="$3"
    local line
    line=$(grep -n "$needle" "$file" | head -1 | cut -d: -f1)
    if [ -z "$line" ]; then
        die "Could not find needle in $file: $needle"
    fi
    local before_line=$(( line - 1 ))
    local total before after
    total=$(wc -l < "$file")
    before=$(head -n "$before_line" "$file")
    after=$(tail -n $((total - before_line)) "$file")
    printf '%s\n%s\n%s\n' "$before" "$fragment" "$after" > "$file"
}

# ── Service overrides ─────────────────────────────────────────────────────────

for svc in ServerDeletionService SuspensionService; do
    src="${PANEL}/app/Services/Servers/${svc}.php"
    ext_src="${EXT}/private/${svc}.php"
    [ -f "$ext_src" ] || die "Missing extension service: $ext_src"
    backup "$src"
    cp "$ext_src" "$src"
    info "Installed ${svc}.php"
done

# ── Permission.php ─────────────────────────────────────────────────────────────

PERM_FILE="${PANEL}/app/Models/Permission.php"
if grep -q "'split' => \[" "$PERM_FILE"; then
    info "Split permissions already present in Permission.php — skipping"
else
    backup "$PERM_FILE"
    FRAGMENT="
		'split' => [
			'description' => 'Permissions that control a user\\'s ability to split a server and manage split servers.',
			'keys' => [
				'read'   => 'Allows a user to view all split servers.',
				'create' => 'Allows a user to create a split server.',
				'update' => 'Allows a user to update a split server\\'s resources.',
				'delete' => 'Allows a user to delete a split server.',
			],
		],"
    patch_line_before "$PERM_FILE" "'backup' => \[" "$FRAGMENT"
    info "Added split permissions to Permission.php"
fi

# ── Server.php fillable / validation ──────────────────────────────────────────

SERVER_FILE="${PANEL}/app/Models/Server.php"
if grep -q "'split_limit' => 'present|nullable|integer|min:0'," "$SERVER_FILE"; then
    info "Server.php validation already present — skipping"
else
    backup "$SERVER_FILE"
    sed -z -i \
        "s#'backup_limit' => 'present|nullable|integer|min:0',#'backup_limit' => 'present|nullable|integer|min:0',\n            'split_limit' => 'present|nullable|integer|min:0',#g" \
        "$SERVER_FILE"
    info "Added split_limit validation to Server.php"
fi

# ── ServerCreationService.php ─────────────────────────────────────────────────

CREATION_FILE="${PANEL}/app/Services/Servers/ServerCreationService.php"
if grep -q "'split_limit' => Arr::get(\$data, 'split_limit') ?? 0," "$CREATION_FILE"; then
    info "ServerCreationService.php already patched — skipping"
else
    backup "$CREATION_FILE"
    sed -z -i \
        "s#'backup_limit' => Arr::get(\$data, 'backup_limit') ?? 0,#'backup_limit' => Arr::get(\$data, 'backup_limit') ?? 0,\n            'split_limit' => Arr::get(\$data, 'split_limit') ?? 0,#g" \
        "$CREATION_FILE"
    info "Patched ServerCreationService.php"
fi

# ── BuildModificationService.php ──────────────────────────────────────────────

BUILD_FILE="${PANEL}/app/Services/Servers/BuildModificationService.php"
if grep -q "'split_limit' => Arr::get(\$data, 'split_limit', 0) ?? null," "$BUILD_FILE"; then
    info "BuildModificationService.php already patched — skipping"
else
    backup "$BUILD_FILE"
    sed -z -i \
        "s#'backup_limit' => Arr::get(\$data, 'backup_limit', 0) ?? 0,#'backup_limit' => Arr::get(\$data, 'backup_limit', 0) ?? 0,\n                'split_limit' => Arr::get(\$data, 'split_limit', 0) ?? null,#g" \
        "$BUILD_FILE"
    info "Patched BuildModificationService.php"
fi

# ── StoreServerRequest.php ────────────────────────────────────────────────────

STORE_REQ="${PANEL}/app/Http/Requests/Api/Application/Servers/StoreServerRequest.php"
if grep -q "'feature_limits.split_limit'" "$STORE_REQ"; then
    info "StoreServerRequest.php already patched — skipping"
else
    backup "$STORE_REQ"
    sed -z -i \
        "s#'feature_limits.backups' => \$rules\['backup_limit'\],#'feature_limits.backups' => \$rules\['backup_limit'\],\n            'feature_limits.split_limit' => \$rules\['split_limit'\],#g" \
        "$STORE_REQ"
    sed -z -i \
        "s#'backup_limit' => array_get(\$data, 'feature_limits.backups'),#'backup_limit' => array_get(\$data, 'feature_limits.backups'),\n            'split_limit' => array_get(\$data, 'feature_limits.split_limit'),#g" \
        "$STORE_REQ"
    info "Patched StoreServerRequest.php"
fi

# ── ServersController.php (admin) ─────────────────────────────────────────────

CTRL_FILE="${PANEL}/app/Http/Controllers/Admin/ServersController.php"
if grep -q "'split_limit'" "$CTRL_FILE"; then
    info "ServersController.php already patched — skipping"
else
    backup "$CTRL_FILE"
    sed -z -i \
        "s#'oom_disabled'#'oom_disabled',\n\t\t'split_limit'#g" \
        "$CTRL_FILE"
    info "Patched ServersController.php"
fi

# ── ServerTransformer.php ─────────────────────────────────────────────────────

TRANSFORMER="${PANEL}/app/Transformers/Api/Client/ServerTransformer.php"
if grep -q "'is_master' =>" "$TRANSFORMER"; then
    info "ServerTransformer.php already patched — skipping"
else
    backup "$TRANSFORMER"
    sed -z -i \
        "s#'is_node_under_maintenance' => \$server->node->isUnderMaintenance(),#'is_node_under_maintenance' => \$server->node->isUnderMaintenance(),\n\t\t'is_master' => is_null(\$server->split_masteruuid) || \$server->uuid === \$server->split_masteruuid,#g" \
        "$TRANSFORMER"
    info "Patched ServerTransformer.php"
fi

# ── Admin blade views ─────────────────────────────────────────────────────────

NEW_BLADE="${PANEL}/resources/views/admin/servers/new.blade.php"
if grep -q "pSplitLimit" "$NEW_BLADE"; then
    info "new.blade.php already patched — skipping"
else
    backup "$NEW_BLADE"
    FRAGMENT='
                    <div class="form-group col-xs-6">
                        <label for="pSplitLimit" class="control-label">Split Limit</label>
                        <div>
                            <input type="text" id="pSplitLimit" name="split_limit" class="form-control" value="{{ old('"'"'split_limit'"'"', 0) }}"/>
                        </div>
                        <p class="text-muted small">Maximum number of split child servers allowed. Set to 0 to disable.</p>
                    </div>'
    patch_line_after "$NEW_BLADE" "The total number of backups that can be created for this server." "$FRAGMENT"
    info "Patched new.blade.php"
fi

BUILD_BLADE="${PANEL}/resources/views/admin/servers/view/build.blade.php"
if grep -q "split_limit" "$BUILD_BLADE"; then
    info "build.blade.php already patched — skipping"
else
    backup "$BUILD_BLADE"
    FRAGMENT='
                                <div class="form-group col-xs-6">
                                    <label for="split_limit" class="control-label">Split Limit</label>
                                    <div>
                                        <input type="text" name="split_limit" class="form-control" value="{{ old('"'"'split_limit'"'"', $server->split_limit) }}"/>
                                    </div>
                                    <p class="text-muted small">Maximum number of split child servers allowed. Set to 0 to disable.</p>
                                </div>'
    patch_line_after "$BUILD_BLADE" "The total number of backups that can be created for this server." "$FRAGMENT"
    info "Patched build.blade.php"
fi

info "Installation complete."
