<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->string('split_masteruuid', 36)->nullable()->after('external_id')->index();
            $table->unsignedInteger('split_limit')->default(0)->after('backup_limit');
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropIndex(['split_masteruuid']);
            $table->dropColumn(['split_masteruuid', 'split_limit']);
        });
    }
};
