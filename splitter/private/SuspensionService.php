<?php

namespace Pterodactyl\Services\Servers;

use Webmozart\Assert\Assert;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

class SuspensionService
{
    public const ACTION_SUSPEND   = 'suspend';
    public const ACTION_UNSUSPEND = 'unsuspend';

    public function __construct(
        private DaemonServerRepository $daemonServerRepository
    ) {
    }

    public function toggle(Server $server, string $action = self::ACTION_SUSPEND): void
    {
        Assert::oneOf($action, [self::ACTION_SUSPEND, self::ACTION_UNSUSPEND]);

        $isSuspending = $action === self::ACTION_SUSPEND;

        $targets = collect([$server]);

        if ($server->uuid === $server->split_masteruuid) {
            $children = Server::where('split_masteruuid', $server->uuid)
                ->where('uuid', '!=', $server->uuid)
                ->get();
            $targets = $targets->merge($children);
        }

        $toUpdate = $targets->filter(fn (Server $s) =>
            $isSuspending !== $s->isSuspended() && is_null($s->transfer)
        );

        if ($toUpdate->isEmpty()) {
            return;
        }

        $toUpdate->each(fn (Server $s) =>
            $s->update(['status' => $isSuspending ? Server::STATUS_SUSPENDED : null])
        );

        try {
            $toUpdate->each(fn (Server $s) =>
                $this->daemonServerRepository->setServer($s)->sync()
            );
        } catch (\Exception $e) {
            $toUpdate->each(fn (Server $s) =>
                $s->update(['status' => $isSuspending ? null : Server::STATUS_SUSPENDED])
            );
            throw $e;
        }
    }
}
