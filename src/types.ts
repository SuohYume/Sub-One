export interface Node {
    id: string;
    name: string;
    url: string;
    protocol?: string;
    enabled: boolean;
    type?: string;
    subscriptionName?: string;
    originalProxy?: any;
    [key: string]: any;
}

export interface Subscription {
    id: string;
    name?: string;
    url?: string;
    enabled: boolean;
    nodeCount?: number;
    isUpdating?: boolean;
    userInfo?: any;
    exclude?: string;
    [key: string]: any;
}

export interface Profile {
    id: string;
    name: string;
    enabled: boolean;
    subscriptions: string[];
    manualNodes: string[];
    customId?: string;
    subConverter?: string;
    subConfig?: string;
    expiresAt?: string;
    [key: string]: any;
}

export interface AppConfig {
    profileToken?: string;
    [key: string]: any;
}

export interface InitialData {
    subs?: Subscription[];
    profiles?: Profile[];
    config?: AppConfig;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    results?: T; // 兼容某些API返回 results 字段
}
