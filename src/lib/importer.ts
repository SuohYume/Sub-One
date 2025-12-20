import { extractNodeName } from './utils';
import type { Subscription, Node } from '../types';

// Constants
export const HTTP_REGEX = /^https?:\/\//;
export const NODE_PROTOCOL_REGEX = /^(ss|ssr|vmess|vless|trojan|hysteria2?|hy|hy2|tuic|anytls|socks5):\/\//;

export interface ImportResult {
    subs: Subscription[];
    nodes: Node[];
}

/**
 * Creates a standard Subscription object
 */
export function createSubscription(url: string, name?: string): Subscription {
    return {
        id: crypto.randomUUID(),
        name: name || extractNodeName(url) || '未命名',
        url: url,
        enabled: true,
        status: 'unchecked',
        nodeCount: 0,
        isUpdating: false,
        exclude: ''
    };
}

/**
 * Creates a standard Node object
 */
export function createNode(url: string, name?: string): Node {
    return {
        id: crypto.randomUUID(),
        name: name || extractNodeName(url) || '未命名',
        url: url,
        enabled: true
    };
}

/**
 * Parses raw text into Subscriptions and Nodes
 */
export function parseImportText(importText: string): ImportResult {
    const newSubs: Subscription[] = [];
    const newNodes: Node[] = [];

    if (!importText) {
        return { subs: newSubs, nodes: newNodes };
    }

    // Iterate through lines efficiently
    // We handle splitting manually to avoid creating a massive array of strings if not needed, 
    // but splitting by newline is generally fast enough.
    const lines = importText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (HTTP_REGEX.test(line)) {
            newSubs.push(createSubscription(line));
        } else if (NODE_PROTOCOL_REGEX.test(line)) {
            newNodes.push(createNode(line));
        }
    }

    return { subs: newSubs, nodes: newNodes };
}
