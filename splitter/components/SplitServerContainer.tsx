import React, { useCallback, useEffect, useState, memo } from 'react';
import tw from 'twin.macro';
import styled from 'styled-components/macro';
import { ServerContext } from '@/state/server';
import { getServerSplit, ServerSplit } from './api/getServerSplit';
import { splitServer } from './api/splitServer';
import { updateSplitServer } from './api/updateSplitServer';
import { deleteSplitServer } from './api/deleteSplitServer';
import getServerResourceUsage, { ServerPowerState } from '@/api/server/getServerResourceUsage';
import Spinner from '@/components/elements/Spinner';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import useFlash from '@/plugins/useFlash';
import FlashMessageRender from '@/components/FlashMessageRender';
import SplitServerDialog from './SplitServerDialog';
import { Button } from '@/components/elements/button/index';
import Can from '@/components/elements/Can';

const fmtMiB = (mb: number): string => {
    if (mb <= 0) return '∞';
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
};

const fmtCpu = (cpu: number): string => (cpu === 0 ? '∞' : `${cpu}%`);

const StatusBorder = styled.div<{ $status: ServerPowerState | null }>`
    ${tw`bg-gray-700 border-l-4 p-4 rounded-md transition-colors duration-150 hover:bg-gray-600`}
    ${({ $status }) =>
        $status === 'running'
            ? tw`border-green-500`
            : $status === 'offline'
            ? tw`border-red-500`
            : tw`border-yellow-500`}
`;

const Card = styled.div`
    ${tw`bg-gray-700 border-l-4 border-blue-400 p-4 rounded-md`}
`;

const CardTitle = styled.h3`
    ${tw`text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3`}
`;

const ResourceRow = styled.div`
    ${tw`flex justify-between items-center py-1.5 border-b border-gray-600 last:border-0 text-sm`}
`;

interface ServerRowProps {
    server: any;
    isMaster: boolean;
    remainingResources?: { cpu: number; memory: number; disk: number; swap: number };
    originalLimits?: { cpu: number; memory: number; disk: number; swap: number };
    onEdit: (uuid: string) => void;
    onOpen: (id: string) => void;
}

const ServerRow = memo(({ server, isMaster, remainingResources, originalLimits, onEdit, onOpen }: ServerRowProps) => {
    const [status, setStatus] = useState<ServerPowerState | null>(null);

    useEffect(() => {
        getServerResourceUsage(server.uuid)
            .then((d) => setStatus(d.status))
            .catch(() => setStatus(null));
    }, [server.uuid]);

    return (
        <StatusBorder
            $status={status}
            css={tw`cursor-pointer`}
            onClick={() => isMaster ? onOpen(server.id) : onEdit(server.uuid)}
        >
            <div css={tw`flex items-center justify-between`}>
                <div css={tw`flex items-center gap-3`}>
                    <svg xmlns='http://www.w3.org/2000/svg' css={tw`w-8 h-8 text-neutral-400 flex-shrink-0`} fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2' />
                    </svg>
                    <div>
                        <div css={tw`flex items-center gap-2`}>
                            <span css={tw`font-medium text-sm text-neutral-100`}>{server.name}</span>
                            {isMaster && (
                                <span css={tw`px-2 py-0.5 text-xs font-semibold bg-purple-600 text-white rounded-full`}>
                                    Master
                                </span>
                            )}
                        </div>
                        {server.description && (
                            <p css={tw`text-xs text-neutral-400 mt-0.5 line-clamp-1`}>{server.description}</p>
                        )}
                        <div css={tw`flex flex-wrap gap-3 mt-1.5`}>
                            <span css={tw`text-xs text-neutral-400`}>
                                CPU{isMaster && remainingResources && originalLimits ? (
                                    <span css={tw`text-neutral-200`}> {fmtCpu(remainingResources.cpu)} <span css={tw`text-neutral-500`}>/ {fmtCpu(originalLimits.cpu)}</span></span>
                                ) : (
                                    <span css={tw`text-neutral-200`}> {fmtCpu(server.limits.cpu)}</span>
                                )}
                            </span>
                            <span css={tw`text-xs text-neutral-400`}>
                                RAM{isMaster && remainingResources && originalLimits ? (
                                    <span css={tw`text-neutral-200`}> {fmtMiB(remainingResources.memory)} <span css={tw`text-neutral-500`}>/ {fmtMiB(originalLimits.memory)}</span></span>
                                ) : (
                                    <span css={tw`text-neutral-200`}> {fmtMiB(server.limits.memory)}</span>
                                )}
                            </span>
                            <span css={tw`text-xs text-neutral-400`}>
                                Disk{isMaster && remainingResources && originalLimits ? (
                                    <span css={tw`text-neutral-200`}> {fmtMiB(remainingResources.disk)} <span css={tw`text-neutral-500`}>/ {fmtMiB(originalLimits.disk)}</span></span>
                                ) : (
                                    <span css={tw`text-neutral-200`}> {fmtMiB(server.limits.disk)}</span>
                                )}
                            </span>
                            {server.limits.swap > 0 && (
                                <span css={tw`text-xs text-neutral-400`}>
                                    Swap{isMaster && remainingResources && originalLimits ? (
                                        <span css={tw`text-neutral-200`}> {fmtMiB(remainingResources.swap)} <span css={tw`text-neutral-500`}>/ {fmtMiB(originalLimits.swap)}</span></span>
                                    ) : (
                                        <span css={tw`text-neutral-200`}> {fmtMiB(server.limits.swap)}</span>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <svg xmlns='http://www.w3.org/2000/svg' css={tw`w-4 h-4 text-neutral-500 flex-shrink-0`} fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                </svg>
            </div>
        </StatusBorder>
    );
});
ServerRow.displayName = 'ServerRow';

const SplitServerContainer = () => {
    const server = ServerContext.useStoreState((s) => s.server.data!);
    const uuid = server.uuid;

    const [splitData, setSplitData] = useState<ServerSplit | null>(null);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [editUuid, setEditUuid] = useState<string | null>(null);

    const { addError, clearFlashes, addFlash } = useFlash();

    const load = useCallback(() => {
        setLoading(true);
        clearFlashes('server:split');
        getServerSplit(uuid)
            .then((d) => {
                setSplitData(d);
                setLoading(false);
            })
            .catch(() => {
                addError({ key: 'server:split', message: 'Failed to load split data.' });
                setLoading(false);
            });
    }, [uuid]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = useCallback(async (values: any) => {
        await splitServer(uuid, values);
        addFlash({ type: 'success', key: 'server:split', message: 'Server split successfully.' });
        load();
        setCreateOpen(false);
    }, [uuid, load]);

    const handleUpdate = useCallback(async (values: any) => {
        if (!editUuid) return;
        await updateSplitServer(uuid, editUuid, values);
        addFlash({ type: 'success', key: 'server:split', message: 'Split server updated.' });
        setEditUuid(null);
        load();
    }, [uuid, editUuid, load]);

    const handleDelete = useCallback(async (splitUuid: string) => {
        await deleteSplitServer(uuid, splitUuid);
        addFlash({ type: 'success', key: 'server:split', message: 'Split server deleted.' });
        setEditUuid(null);
        load();
    }, [uuid, load]);

    if (loading || !splitData) {
        return <Spinner size='large' centered />;
    }

    if (!splitData.is_master) {
        return (
            <ServerContentBlock title='Server Splitter'>
                <div css={tw`bg-red-900/20 border-l-4 border-red-500 rounded p-6 text-center`}>
                    <p css={tw`text-neutral-300 font-medium mb-1`}>Access Denied</p>
                    <p css={tw`text-neutral-400 text-sm`}>
                        This is a split child server. Only master servers can manage splits.
                    </p>
                </div>
            </ServerContentBlock>
        );
    }

    const { remaining_resources: rem, original_limits: orig } = splitData;

    const canCreate =
        splitData.split_limit !== 0 &&
        splitData.child_count < splitData.split_limit &&
        (orig.cpu === 0 || rem.cpu >= 10) &&
        (orig.memory === 0 || rem.memory >= 128) &&
        (orig.disk === 0 || rem.disk >= 256) &&
        rem.allocations >= 1;

    const children = splitData.servers.filter((s) => s.uuid !== uuid);
    const masterData = splitData.servers.find((s) => s.uuid === uuid) ?? splitData.servers[0];
    const editingServer = editUuid ? splitData.servers.find((s) => s.uuid === editUuid) : undefined;

    const slotsLeft = splitData.split_limit === 0 ? 0 : Math.max(0, splitData.split_limit - splitData.child_count);

    return (
        <ServerContentBlock title='Server Splitter'>
            <FlashMessageRender byKey='server:split' css={tw`mb-4`} />

            <SplitServerDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                server={server}
                remainingResources={rem}
                onSplit={handleCreate}
            />

            <SplitServerDialog
                open={!!editUuid}
                onClose={() => setEditUuid(null)}
                server={server}
                remainingResources={rem}
                isEdit
                editServer={editingServer}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onOpenServer={(id) => window.open(`/server/${id}`, '_blank')}
            />

            <div css={tw`grid grid-cols-1 lg:grid-cols-12 gap-6`}>
                <aside css={tw`lg:col-span-4 space-y-4`}>
                    <Can action='split.create'>
                        <Button
                            css={tw`w-full`}
                            disabled={!canCreate}
                            onClick={() => setCreateOpen(true)}
                        >
                            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' css={tw`mr-2`}>
                                <path d='M12 6v12m-6-6h12' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
                            </svg>
                            Create Split Server
                        </Button>
                        {!canCreate && splitData.split_limit !== 0 && (
                            <p css={tw`text-xs text-red-400 text-center -mt-2`}>
                                {splitData.child_count >= splitData.split_limit
                                    ? 'Split limit reached.'
                                    : 'Insufficient resources to split.'}
                            </p>
                        )}
                        {splitData.split_limit === 0 && (
                            <p css={tw`text-xs text-red-400 text-center -mt-2`}>Splitting is disabled for this server.</p>
                        )}
                    </Can>

                    <Card>
                        <CardTitle>Available Resources</CardTitle>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>CPU</span>
                            <span css={tw`text-neutral-100 font-medium`}>{fmtCpu(orig.cpu === 0 ? 0 : rem.cpu)}</span>
                        </ResourceRow>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Memory</span>
                            <span css={tw`text-neutral-100 font-medium`}>{fmtMiB(orig.memory === 0 ? 0 : rem.memory)}</span>
                        </ResourceRow>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Disk</span>
                            <span css={tw`text-neutral-100 font-medium`}>{fmtMiB(orig.disk === 0 ? 0 : rem.disk)}</span>
                        </ResourceRow>
                        {orig.swap > 0 && (
                            <ResourceRow>
                                <span css={tw`text-neutral-400`}>Swap</span>
                                <span css={tw`text-neutral-100 font-medium`}>{fmtMiB(rem.swap)}</span>
                            </ResourceRow>
                        )}
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Databases</span>
                            <span css={tw`text-neutral-100 font-medium`}>{rem.databases}</span>
                        </ResourceRow>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Allocations</span>
                            <span css={tw`text-neutral-100 font-medium`}>{rem.allocations}</span>
                        </ResourceRow>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Backups</span>
                            <span css={tw`text-neutral-100 font-medium`}>{rem.backups}</span>
                        </ResourceRow>
                    </Card>

                    <Card>
                        <CardTitle>Split Info</CardTitle>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Children</span>
                            <span css={tw`text-neutral-100 font-medium`}>{splitData.child_count}</span>
                        </ResourceRow>
                        <ResourceRow>
                            <span css={tw`text-neutral-400`}>Slots Left</span>
                            <span css={tw`text-neutral-100 font-medium`}>
                                {splitData.split_limit === 0 ? 'Disabled' : slotsLeft}
                            </span>
                        </ResourceRow>
                    </Card>
                </aside>

                <div css={tw`lg:col-span-8 space-y-3`}>
                    {masterData && (
                        <ServerRow
                            server={masterData}
                            isMaster
                            remainingResources={rem}
                            originalLimits={orig}
                            onEdit={() => {}}
                            onOpen={(id) => window.open(`/server/${id}`, '_blank')}
                        />
                    )}

                    {children.length === 0 ? (
                        <div css={tw`bg-gray-700 border border-gray-600 rounded-md p-10 text-center`}>
                            <svg width='40' height='40' viewBox='0 0 24 24' fill='none' css={tw`mx-auto mb-3 text-neutral-500`}>
                                <path d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z' stroke='currentColor' strokeWidth='1.5' fill='none' />
                            </svg>
                            <p css={tw`text-neutral-400 text-sm mb-4`}>No split servers yet.</p>
                            <Can action='split.create'>
                                <Button disabled={!canCreate} onClick={() => setCreateOpen(true)}>
                                    Create Your First Split
                                </Button>
                            </Can>
                        </div>
                    ) : (
                        children.map((s) => (
                            <ServerRow
                                key={s.uuid}
                                server={s}
                                isMaster={false}
                                onEdit={setEditUuid}
                                onOpen={(id) => window.open(`/server/${id}`, '_blank')}
                            />
                        ))
                    )}
                </div>
            </div>
        </ServerContentBlock>
    );
};

export default SplitServerContainer;
