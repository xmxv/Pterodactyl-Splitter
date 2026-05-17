import http from '@/api/http';

export interface SplitPayload {
    name: string;
    description?: string;
    cpu: number;
    memory: number;
    disk: number;
    swap: number;
    database_limit: number;
    backup_limit: number;
    allocation_limit: number;
    sync_subusers?: boolean;
}

export const splitServer = async (uuid: string, values: SplitPayload): Promise<void> => {
    await http.post(`/api/client/extensions/{identifier}/servers/${uuid}/split`, values);
};
