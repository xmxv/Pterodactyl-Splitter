import http from '@/api/http';

export const deleteSplitServer = async (serverUuid: string, splitUuid: string): Promise<void> => {
    await http.delete(`/api/client/extensions/{identifier}/servers/${serverUuid}/split/${splitUuid}`);
};
