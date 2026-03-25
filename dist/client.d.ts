interface ApiResult<T = unknown> {
    data: T;
    error?: undefined;
}
interface ApiError {
    data?: undefined;
    error: string;
}
type ApiResponse<T = unknown> = ApiResult<T> | ApiError;
export declare class RemindUserClient {
    private baseUrl;
    private apiKey;
    constructor(baseUrl: string, apiKey: string);
    createReminder(params: Record<string, unknown>): Promise<ApiResponse>;
    listReminders(params: Record<string, unknown>): Promise<ApiResponse<{
        data: Record<string, unknown>[];
        count: number;
    }>>;
    updateReminder(id: string, updates: Record<string, unknown>): Promise<ApiResponse>;
    cancelReminder(id: string): Promise<ApiResponse>;
    private request;
}
export {};
