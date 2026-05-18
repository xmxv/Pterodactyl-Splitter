import http from '@/api/http';
import { rawDataToServerObject } from '@/api/server/getServer';

export interface ServerSplit {
    is_master: boolean;
    split_limit: number;
    child_count: number;
    servers: any[];
    remaining_resources: {
        cpu: number;
        memory: number;
        disk: number;
        swap: number;
        databases: number;
        allocations: number;
        backups: number;
    };
    original_limits: {
        cpu: number;
        memory: number;
        disk: number;
        swap: number;
        databases?: number;
        allocations?: number;
        backups?: number;
    };
}

export const getServerSplit = async (uuid: string): Promise<ServerSplit> => {
    const { data } = await http.get(`/api/client/extensions/{identifier}/servers/${uuid}/split`);
    return {
        ...data,
        servers: (data.servers ?? []).map(rawDataToServerObject),
    };
};