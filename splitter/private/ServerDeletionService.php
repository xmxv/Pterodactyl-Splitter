<?php

namespace Pterodactyl\Services\Servers;

use Illuminate\Http\Response;
use Pterodactyl\Models\Server;
use Illuminate\Support\Facades\Log;
use Illuminate\Database\ConnectionInterface;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Services\Databases\DatabaseManagementService;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

class ServerDeletionService
{
    protected bool $force = false;

    public function __construct(
        private ConnectionInterface $connection,
        private DaemonServerRepository $daemonServerRepository,
        private DatabaseManagementService $databaseManagementService
    ) {
    }

    public function withForce(bool $bool = true): self
    {
        $this->force = $bool;
        return $this;
    }

    public function handle(Server $server): void
    {
        $targets = collect([$server]);

        if ($server->uuid === $server->split_masteruuid) {
            $children = Server::where('split_masteruuid', $server->uuid)
                ->where('uuid', '!=', $server->uuid)
                ->get();
            $targets = $targets->merge($children);
        }

        foreach ($targets as $target) {
            try {
                $this->daemonServerRepository->setServer($target)->delete();
            } catch (DaemonConnectionException $e) {
                if (!$this->force && $e->getStatusCode() !== Response::HTTP_NOT_FOUND) {
                    throw $e;
                }
                Log::warning($e);
            }

            $this->connection->transaction(function () use ($target) {
                foreach ($target->databases as $database) {
                    try {
                        $this->databaseManagementService->delete($database);
                    } catch (\Exception $e) {
                        if (!$this->force) {
                            throw $e;
                        }
                        $database->delete();
                        Log::warning($e);
                    }
                }
                $target->delete();
            });
        }
    }
}
