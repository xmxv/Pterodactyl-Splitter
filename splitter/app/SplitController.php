<?php

namespace Pterodactyl\BlueprintFramework\Extensions\{identifier};

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Server;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Services\Servers\ServerDeletionService;
use Pterodactyl\Services\Subusers\SubuserCreationService;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Transformers\Api\Client\ServerTransformer;
use Pterodactyl\Extensions\Spatie\Fractalistic\Fractal;

class SplitController extends ClientApiController
{
    private const MIN_CPU    = 10;
    private const MIN_MEMORY = 128;
    private const MIN_DISK   = 256;

    public function __construct(
        private readonly ServerCreationService $creationService,
        private readonly ServerDeletionService $deletionService,
        private readonly SubuserCreationService $subuserCreationService,
        protected Fractal $fractal
    ) {
        parent::__construct();
    }

    private function requireMaster(Server $server): void
    {
        if (!$this->isMaster($server)) {
            throw new DisplayException('Only master servers can access the split functionality.');
        }
    }

    private function isMaster(Server $server): bool
    {
        return is_null($server->split_masteruuid) || $server->uuid === $server->split_masteruuid;
    }

    private function childrenOf(Server $master): \Illuminate\Database\Eloquent\Collection
    {
        return Server::where('split_masteruuid', $master->uuid)
            ->where('uuid', '!=', $master->uuid)
            ->get();
    }

    private function computeRemaining(Server $master): array
    {
        $children = $this->childrenOf($master);

        $usedCpu    = $children->sum('cpu');
        $usedMemory = $children->sum('memory');
        $usedDisk   = $children->sum('disk');
        $usedSwap   = $children->sum('swap');
        $usedDb     = $children->sum('database_limit');
        $usedAlloc  = $children->sum('allocation_limit');
        $usedBackup = $children->sum('backup_limit');

        return [
            'cpu'         => $master->cpu === 0 ? 0 : max(0, $master->cpu - $usedCpu),
            'memory'      => $master->memory === 0 ? 0 : max(0, $master->memory - $usedMemory),
            'disk'        => $master->disk === 0 ? 0 : max(0, $master->disk - $usedDisk),
            'swap'        => $master->swap === 0 ? 0 : max(0, $master->swap - $usedSwap),
            'databases'   => max(0, ($master->database_limit ?? 0) - $usedDb),
            'allocations' => max(0, ($master->allocation_limit ?? 0) - $usedAlloc),
            'backups'     => max(0, ($master->backup_limit ?? 0) - $usedBackup),
        ];
    }

    public function index(Request $request, Server $server): array
    {
        $this->requireMaster($server);

        $children = $this->childrenOf($server);
        $allServers = $children->prepend($server);

        $remaining = $this->computeRemaining($server);

        return [
            'is_master'          => true,
            'split_limit'        => $server->split_limit,
            'child_count'        => $children->count(),
            'servers'            => $this->fractal
                ->collection($allServers)
                ->transformWith($this->getTransformer(ServerTransformer::class))
                ->toArray()['data'],
            'remaining_resources' => $remaining,
            'original_limits'    => [
                'cpu'    => $server->cpu,
                'memory' => $server->memory,
                'disk'   => $server->disk,
                'swap'   => $server->swap,
            ],
        ];
    }

    public function store(Request $request, Server $server)
    {
        $this->requireMaster($server);

        if ($request->user()->id !== $server->owner_id && !$request->user()->isRootAdmin()) {
            throw new DisplayException('You do not have permission to split this server.');
        }

        $master = $server;

        if ($master->split_limit === 0) {
            throw new DisplayException('Server splitting is disabled for this server.');
        }

        $childCount = $this->childrenOf($master)->count();
        if ($childCount >= $master->split_limit) {
            throw new DisplayException("Split limit of {$master->split_limit} reached.");
        }

        $data = $request->validate([
            'name'             => 'required|string|max:191',
            'description'      => 'nullable|string|max:255',
            'cpu'              => 'required|integer|min:' . self::MIN_CPU,
            'memory'           => 'required|integer|min:' . self::MIN_MEMORY,
            'disk'             => 'required|integer|min:' . self::MIN_DISK,
            'swap'             => 'required|integer|min:0',
            'database_limit'   => 'required|integer|min:0',
            'backup_limit'     => 'required|integer|min:0',
            'allocation_limit' => 'required|integer|min:0',
            'sync_subusers'    => 'sometimes|boolean',
        ]);

        // Validate resources and reserve allocation atomically.
        // creationService->handle() is intentionally called OUTSIDE this
        // transaction — it triggers a Wings API call back to the panel,
        // which would get a 404 RecordNotFoundException if the new server
        // row hasn't been committed yet.
        $creationPayload = DB::transaction(function () use ($master, $data) {
            $master = Server::lockForUpdate()->findOrFail($master->id);

            $remaining = $this->computeRemaining($master);

            if ($master->cpu > 0 && $data['cpu'] > $remaining['cpu']) {
                throw new DisplayException("CPU requested ({$data['cpu']}%) exceeds available ({$remaining['cpu']}%).");
            }
            if ($master->memory > 0 && $data['memory'] > $remaining['memory']) {
                throw new DisplayException("Memory requested ({$data['memory']} MiB) exceeds available ({$remaining['memory']} MiB).");
            }
            if ($master->disk > 0 && $data['disk'] > $remaining['disk']) {
                throw new DisplayException("Disk requested ({$data['disk']} MiB) exceeds available ({$remaining['disk']} MiB).");
            }
            if ($master->swap > 0 && $data['swap'] > $remaining['swap']) {
                throw new DisplayException("Swap requested ({$data['swap']} MiB) exceeds available ({$remaining['swap']} MiB).");
            }
            if ($data['database_limit'] > $remaining['databases']) {
                throw new DisplayException("Database limit ({$data['database_limit']}) exceeds available ({$remaining['databases']}).");
            }
            if ($data['allocation_limit'] > $remaining['allocations']) {
                throw new DisplayException("Allocation limit ({$data['allocation_limit']}) exceeds available ({$remaining['allocations']}).");
            }
            if ($data['backup_limit'] > $remaining['backups']) {
                throw new DisplayException("Backup limit ({$data['backup_limit']}) exceeds available ({$remaining['backups']}).");
            }

            $allocation = DB::table('allocations')
                ->where('node_id', $master->node_id)
                ->whereNull('server_id')
                ->inRandomOrder()
                ->lockForUpdate()
                ->first();

            if (!$allocation) {
                throw new DisplayException('No free allocations available on this node.');
            }

            $egg = DB::table('eggs')->where('id', $master->egg_id)->firstOrFail();

            $environment = [];
            DB::table('egg_variables')->where('egg_id', $master->egg_id)->get()
                ->each(function ($v) use (&$environment) {
                    $environment[$v->env_variable] = $v->default_value;
                });

            return [
                'master'      => $master,
                'allocation'  => $allocation,
                'egg'         => $egg,
                'environment' => $environment,
                'swap'        => $master->swap === 0 ? 0 : $data['swap'],
            ];
        });

        // Outside the transaction — Wings can now find the committed row.
        $master      = $creationPayload['master'];
        $allocation  = $creationPayload['allocation'];
        $egg         = $creationPayload['egg'];
        $environment = $creationPayload['environment'];

        $newServer = $this->creationService->handle([
            'name'             => $data['name'],
            'description'      => $data['description'] ?? '',
            'owner_id'         => $master->owner_id,
            'node_id'          => $master->node_id,
            'allocation_id'    => $allocation->id,
            'database_limit'   => $data['database_limit'],
            'allocation_limit' => $data['allocation_limit'],
            'backup_limit'     => $data['backup_limit'],
            'memory'           => $data['memory'],
            'disk'             => $data['disk'],
            'swap'             => $creationPayload['swap'],
            'io'               => $master->io,
            'cpu'              => $data['cpu'],
            'nest_id'          => $master->nest_id,
            'egg_id'           => $master->egg_id,
            'startup'          => $egg->startup,
            'image'            => $master->image,
            'environment'      => $environment,
            'start_on_completion' => false,
        ]);

        $newServer->split_masteruuid = $master->uuid;
        $newServer->save();

        if (is_null($master->split_masteruuid)) {
            $master->split_masteruuid = $master->uuid;
            $master->save();
        }

        if (!empty($data['sync_subusers'])) {
            foreach ($master->subusers as $subuser) {
                if (!$newServer->subusers()->where('user_id', $subuser->user_id)->exists()) {
                    $this->subuserCreationService->handle($newServer, $subuser->user->email, $subuser->permissions);
                }
            }
        }

        return response('', 204);
    }

    public function update(Request $request, Server $server, string $uuid)
    {
        $this->requireMaster($server);

        if ($request->user()->id !== $server->owner_id && !$request->user()->isRootAdmin()) {
            throw new DisplayException('You do not have permission to update split servers.');
        }

        $master = $server;

        $child = Server::where('uuid', $uuid)
            ->where('split_masteruuid', $master->uuid)
            ->where('uuid', '!=', $master->uuid)
            ->firstOrFail();

        $data = $request->validate([
            'name'             => 'sometimes|string|max:191',
            'description'      => 'sometimes|nullable|string|max:255',
            'cpu'              => 'sometimes|integer|min:' . self::MIN_CPU,
            'memory'           => 'sometimes|integer|min:' . self::MIN_MEMORY,
            'disk'             => 'sometimes|integer|min:' . self::MIN_DISK,
            'swap'             => 'sometimes|integer|min:0',
            'database_limit'   => 'sometimes|integer|min:0',
            'backup_limit'     => 'sometimes|integer|min:0',
            'allocation_limit' => 'sometimes|integer|min:0',
            'sync_subusers'    => 'sometimes|boolean',
        ]);

        DB::transaction(function () use ($master, $child, $data) {
            $master = Server::lockForUpdate()->findOrFail($master->id);
            $child  = Server::lockForUpdate()->findOrFail($child->id);

            $newCpu    = (int) ($data['cpu']              ?? $child->cpu);
            $newMemory = (int) ($data['memory']           ?? $child->memory);
            $newDisk   = (int) ($data['disk']             ?? $child->disk);
            $newSwap   = (int) ($data['swap']             ?? $child->swap);
            $newDb     = (int) ($data['database_limit']   ?? $child->database_limit  ?? 0);
            $newAlloc  = (int) ($data['allocation_limit'] ?? $child->allocation_limit ?? 0);
            $newBackup = (int) ($data['backup_limit']     ?? $child->backup_limit    ?? 0);

            $dCpu    = $newCpu    - (int) $child->cpu;
            $dMemory = $newMemory - (int) $child->memory;
            $dDisk   = $newDisk   - (int) $child->disk;
            $dSwap   = $newSwap   - (int) $child->swap;
            $dDb     = $newDb     - (int) ($child->database_limit  ?? 0);
            $dAlloc  = $newAlloc  - (int) ($child->allocation_limit ?? 0);
            $dBackup = $newBackup - (int) ($child->backup_limit    ?? 0);

            $remaining = $this->computeRemaining($master);

            if ($dCpu > 0 && $master->cpu > 0 && $dCpu > $remaining['cpu']) {
                throw new DisplayException("CPU increase of {$dCpu}% exceeds available {$remaining['cpu']}%.");
            }
            if ($dMemory > 0 && $master->memory > 0 && $dMemory > $remaining['memory']) {
                throw new DisplayException("Memory increase of {$dMemory} MiB exceeds available {$remaining['memory']} MiB.");
            }
            if ($dDisk > 0 && $master->disk > 0 && $dDisk > $remaining['disk']) {
                throw new DisplayException("Disk increase of {$dDisk} MiB exceeds available {$remaining['disk']} MiB.");
            }
            if ($dSwap > 0 && $master->swap > 0 && $dSwap > $remaining['swap']) {
                throw new DisplayException("Swap increase of {$dSwap} MiB exceeds available {$remaining['swap']} MiB.");
            }
            if ($dDb > 0 && $dDb > $remaining['databases']) {
                throw new DisplayException("Database limit increase of {$dDb} exceeds available {$remaining['databases']}.");
            }
            if ($dAlloc > 0 && $dAlloc > $remaining['allocations']) {
                throw new DisplayException("Allocation limit increase of {$dAlloc} exceeds available {$remaining['allocations']}.");
            }
            if ($dBackup > 0 && $dBackup > $remaining['backups']) {
                throw new DisplayException("Backup limit increase of {$dBackup} exceeds available {$remaining['backups']}.");
            }

            $child->cpu              = $newCpu;
            $child->memory           = $newMemory;
            $child->disk             = $newDisk;
            $child->swap             = $master->swap === 0 ? 0 : $newSwap;
            $child->database_limit   = $newDb;
            $child->allocation_limit = $newAlloc;
            $child->backup_limit     = $newBackup;

            if (isset($data['name'])) {
                $child->name = $data['name'];
            }
            if (array_key_exists('description', $data)) {
                $child->description = $data['description'];
            }

            $child->save();

            if (!empty($data['sync_subusers'])) {
                foreach ($master->subusers as $subuser) {
                    if (!$child->subusers()->where('user_id', $subuser->user_id)->exists()) {
                        $this->subuserCreationService->handle($child, $subuser->user->email, $subuser->permissions);
                    }
                }
            }
        });

        return response('', 204);
    }

    public function delete(Request $request, Server $server, string $uuid)
    {
        $this->requireMaster($server);

        if ($request->user()->id !== $server->owner_id && !$request->user()->isRootAdmin()) {
            throw new DisplayException('You do not have permission to delete split servers.');
        }

        $master = $server;

        $child = Server::where('uuid', $uuid)
            ->where('split_masteruuid', $master->uuid)
            ->where('uuid', '!=', $master->uuid)
            ->firstOrFail();

        $this->deletionService->handle($child);

        return response('', 204);
    }
}
