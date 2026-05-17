import http from '@/api/http';

export interface UpdateSplitPayload {
    name?: string;
    description?: string;
    cpu?: number;
    memory?: number;
    disk?: number;
    swap?: number;
    database_limit?: number;
    allocation_limit?: number;
    backup_limit?: number;
    sync_subusers?: boolean;
}

export const updateSplitServer = async (
    serverUuid: string,
    splitUuid: string,
    values: UpdateSplitPayload
): Promise<void> => {
    await http.put(
        `/api/client/extensions/{identifier}/servers/${serverUuid}/split/${splitUuid}`,
        values
    );
};
